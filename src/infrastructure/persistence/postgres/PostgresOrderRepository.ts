import { Pool, PoolClient } from 'pg';
import { OrderRepository } from '@application/ports/order-repository.js';
import { Order } from '@domain/entities/order.js';
import { Result, ok, fail } from '@shared/result.js';
import { AppError, InfraError } from '@application/errors.js';
import { Money } from '@domain/value-objects/money.js';
import { SKU } from '@domain/value-objects/sku.js';
import { Quantity } from '@domain/value-objects/quantity.js';
import { randomUUID } from 'crypto';

interface OrderRow {
    id: string;
    customer_id: string;
    status: string;
    total_amount_value: string;
    total_amount_currency: string;
    created_at: Date;
    updated_at: Date;
}

interface OrderItemRow {
    id: string;
    order_id: string;
    sku: string;
    quantity: number;
    unit_price_value: string;
    unit_price_currency: string;
    line_total_value: string;
    line_total_currency: string;
    created_at: Date;
}

/**
 * Type guard para verificar si es un PoolClient
 */
function isPoolClient(conn: Pool | PoolClient): conn is PoolClient {
    return 'release' in conn && typeof conn.release === 'function';
}

export class PostgresOrderRepository implements OrderRepository {
    constructor(private readonly connectionOrPool: Pool | PoolClient) {}

    /**
     * Guarda una orden usando transacciones con UPSERT para orders y DELETE + INSERT para order_items
     */
    async save(order: Order): Promise<Result<void, AppError>> {
        // Si es un PoolClient, ya estamos en una transacción manejada externamente
        if (isPoolClient(this.connectionOrPool)) {
            try {
                await this.upsertOrder(this.connectionOrPool, order);
                await this.replaceOrderItems(this.connectionOrPool, order);
                return ok(undefined);
            } catch (error) {
                const message = error instanceof Error ? error.message : 'Unknown database error';
                return fail(new InfraError(`Failed to save order: ${message}`));
            }
        }

        // Si es un Pool, manejamos nuestra propia transacción
        const client = await this.connectionOrPool.connect();

        try {
            // Iniciar transacción
            await client.query('BEGIN');

            // 1. UPSERT de la orden (INSERT ... ON CONFLICT ... UPDATE)
            await this.upsertOrder(client, order);

            // 2. DELETE + INSERT de los items de la orden
            await this.replaceOrderItems(client, order);

            // Confirmar transacción
            await client.query('COMMIT');

            return ok(undefined);
        } catch (error) {
            // Revertir transacción en caso de error
            await client.query('ROLLBACK');

            const message = error instanceof Error ? error.message : 'Unknown database error';
            return fail(new InfraError(`Failed to save order: ${message}`));
        } finally {
            // Liberar la conexión del pool
            client.release();
        }
    }

    /**
     * Busca una orden por ID incluyendo todos sus items
     */
    async findById(id: string): Promise<Result<Order | null, AppError>> {
        const client = await this.getClient();

        try {
            // Buscar la orden
            const orderResult = await client.query<OrderRow>(
                `SELECT id, customer_id, status, total_amount_value, total_amount_currency, 
                        created_at, updated_at
                 FROM orders 
                 WHERE id = $1`,
                [id]
            );

            if (orderResult.rows.length === 0) {
                return ok(null);
            }

            const orderRow = orderResult.rows[0];

            // Buscar los items de la orden
            const itemsResult = await client.query<OrderItemRow>(
                `SELECT id, order_id, sku, quantity, unit_price_value, unit_price_currency,
                        line_total_value, line_total_currency, created_at
                 FROM order_items 
                 WHERE order_id = $1
                 ORDER BY created_at ASC`,
                [id]
            );

            // Reconstruir el agregado Order
            const order = this.mapToOrder(orderRow, itemsResult.rows);

            return ok(order);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown database error';
            return fail(new InfraError(`Failed to find order: ${message}`));
        } finally {
            this.releaseClient(client);
        }
    }

    /**
     * Genera un nuevo ID único para una orden
     */
    async nextId(): Promise<Result<string, AppError>> {
        try {
            const id = randomUUID();
            return ok(id);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return fail(new InfraError(`Failed to generate ID: ${message}`));
        }
    }

    /**
     * Obtiene un client del pool o usa el PoolClient existente
     */
    private async getClient(): Promise<PoolClient> {
        if (isPoolClient(this.connectionOrPool)) {
            return this.connectionOrPool;
        }
        return await this.connectionOrPool.connect();
    }

    /**
     * Libera el client solo si fue obtenido del pool
     */
    private releaseClient(client: PoolClient): void {
        // Solo liberar si no es el PoolClient original inyectado
        if (!isPoolClient(this.connectionOrPool)) {
            client.release();
        }
    }

    /**
     * Realiza un UPSERT de la orden principal
     * INSERT ... ON CONFLICT (id) DO UPDATE
     */
    private async upsertOrder(client: PoolClient, order: Order): Promise<void> {
        const total = order.getTotal();

        await client.query(
            `INSERT INTO orders (id, customer_id, status, total_amount_value, total_amount_currency)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (id) 
             DO UPDATE SET
                status = EXCLUDED.status,
                total_amount_value = EXCLUDED.total_amount_value,
                total_amount_currency = EXCLUDED.total_amount_currency,
                updated_at = NOW()`,
            [
                order.getId(),
                order.getId(), // Usando order ID como customer_id por ahora
                'PENDING',
                total.getAmount(),
                total.getCurrency()
            ]
        );
    }

    /**
     * Reemplaza los items de la orden usando DELETE + INSERT
     * Esta estrategia es más simple y evita problemas de sincronización
     */
    private async replaceOrderItems(client: PoolClient, order: Order): Promise<void> {
        const orderId = order.getId();
        const lines = order.getLines();

        // 1. DELETE: Eliminar todos los items existentes de la orden
        await client.query(
            'DELETE FROM order_items WHERE order_id = $1',
            [orderId]
        );

        // 2. INSERT: Insertar todos los items actuales
        if (lines.length > 0) {
            // Construir query con múltiples valores para inserción batch
            const values: any[] = [];
            const placeholders: string[] = [];
            let paramIndex = 1;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                const unitPrice = line.getUnitPrice();
                const subtotal = line.getSubtotal();

                placeholders.push(
                    `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 
                      $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`
                );

                values.push(
                    randomUUID(),                       // id
                    orderId,                            // order_id
                    line.getSku().toString(),           // sku
                    line.getQuantity().toNumber(),      // quantity
                    unitPrice.getAmount(),              // unit_price_value
                    unitPrice.getCurrency(),            // unit_price_currency
                    subtotal.getAmount(),               // line_total_value
                    subtotal.getCurrency()              // line_total_currency
                );

                paramIndex += 8;
            }

            const insertQuery = `
                INSERT INTO order_items 
                    (id, order_id, sku, quantity, unit_price_value, unit_price_currency, 
                     line_total_value, line_total_currency)
                VALUES ${placeholders.join(', ')}
            `;

            await client.query(insertQuery, values);
        }
    }

    /**
     * Mapea las filas de la base de datos a un agregado Order
     */
    private mapToOrder(orderRow: OrderRow, itemRows: OrderItemRow[]): Order {
        // Crear la orden con el currency almacenado
        const order = Order.create(orderRow.id, orderRow.total_amount_currency);

        // Añadir todas las líneas
        for (const itemRow of itemRows) {
            const sku = SKU.create(itemRow.sku);
            const quantity = Quantity.create(itemRow.quantity);
            const unitPrice = Money.create(
                parseFloat(itemRow.unit_price_value),
                itemRow.unit_price_currency
            );

            order.addLine(sku, quantity, unitPrice);
        }

        // Limpiar eventos del dominio ya que es una reconstrucción desde BD
        order.clearEvents();

        return order;
    }

    /**
     * Método auxiliar para verificar la salud de la conexión
     */
    async healthCheck(): Promise<boolean> {
        if (isPoolClient(this.connectionOrPool)) {
            try {
                await this.connectionOrPool.query('SELECT 1');
                return true;
            } catch {
                return false;
            }
        }

        const client = await this.connectionOrPool.connect();
        try {
            await client.query('SELECT 1');
            return true;
        } catch {
            return false;
        } finally {
            client.release();
        }
    }

    /**
     * Cierra el pool de conexiones (solo si es un Pool)
     */
    async close(): Promise<void> {
        if (!isPoolClient(this.connectionOrPool)) {
            await this.connectionOrPool.end();
        }
    }
}