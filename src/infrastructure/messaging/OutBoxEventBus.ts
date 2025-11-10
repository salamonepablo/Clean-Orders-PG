import { Pool, PoolClient } from 'pg';
import { EventBus } from '@application/ports/event-bus.js';
import { DomainEvent } from '@domain/events/order-events.js';
import { Result, ok, fail } from '@shared/result.js';
import { AppError, InfraError } from '@application/errors.js';
import { randomUUID } from 'crypto';

interface OutboxRecord {
    id: string;
    aggregate_id: string;
    aggregate_type: string;
    event_type: string;
    event_data: any;
    event_version: number;
    created_at: Date;
    published_at: Date | null;
}

/**
 * EventBus que implementa el patrón Transactional Outbox
 * Persiste eventos en la tabla outbox para publicación posterior
 */
export class OutboxEventBus implements EventBus {
    constructor(
        private readonly connectionOrPool: Pool | PoolClient,
        private readonly aggregateType: string = 'Order'
    ) {}

    /**
     * Publica eventos persistiéndolos en la tabla outbox
     * Los eventos se almacenan como parte de la transacción actual
     */
    async publish(events: DomainEvent[]): Promise<Result<void, AppError>> {
        if (events.length === 0) {
            return ok(undefined);
        }

        const client = await this.getClient();

        try {
            // Preparar registros del outbox
            const values: any[] = [];
            const placeholders: string[] = [];
            let paramIndex = 1;

            for (let i = 0; i < events.length; i++) {
                const event = events[i];
                const aggregateId = this.extractAggregateId(event);
                const eventType = event.constructor.name;
                const eventData = this.serializeEvent(event);

                placeholders.push(
                    `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 
                      $${paramIndex + 4}, $${paramIndex + 5})`
                );

                values.push(
                    randomUUID(),           // id
                    aggregateId,            // aggregate_id
                    this.aggregateType,     // aggregate_type
                    eventType,              // event_type
                    eventData,              // event_data (JSONB)
                    1                       // event_version
                );

                paramIndex += 6;
            }

            // Insertar todos los eventos en batch
            const insertQuery = `
                INSERT INTO outbox 
                    (id, aggregate_id, aggregate_type, event_type, event_data, event_version)
                VALUES ${placeholders.join(', ')}
            `;

            await client.query(insertQuery, values);

            return ok(undefined);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unknown error';
            return fail(new InfraError(`Failed to publish events to outbox: ${message}`));
        } finally {
            this.releaseClient(client);
        }
    }

    /**
     * Obtiene un client del pool o usa el PoolClient existente
     */
    private async getClient(): Promise<PoolClient> {
        if (this.isPoolClient(this.connectionOrPool)) {
            return this.connectionOrPool;
        }
        return await this.connectionOrPool.connect();
    }

    /**
     * Libera el client solo si fue obtenido del pool
     */
    private releaseClient(client: PoolClient): void {
        if (!this.isPoolClient(this.connectionOrPool)) {
            client.release();
        }
    }

    /**
     * Type guard para verificar si es un PoolClient
     */
    private isPoolClient(conn: Pool | PoolClient): conn is PoolClient {
        return 'release' in conn && typeof conn.release === 'function';
    }

    /**
     * Extrae el aggregate_id del evento
     */
    private extractAggregateId(event: DomainEvent): string {
        // Asumiendo que todos los eventos de Order tienen orderId
        if ('orderId' in event) {
            return (event as any).orderId;
        }
        throw new Error(`Cannot extract aggregate ID from event: ${event.constructor.name}`);
    }

    /**
     * Serializa el evento a JSON para almacenar en JSONB
     */
    private serializeEvent(event: DomainEvent): string {
        // Convertir el evento a un objeto plano
        const plainObject: any = {};

        // Copiar todas las propiedades del evento
        for (const key in event) {
            if (event.hasOwnProperty(key)) {
                const value = (event as any)[key];

                // Manejar diferentes tipos de valores
                if (value instanceof Date) {
                    plainObject[key] = value.toISOString();
                } else if (value && typeof value === 'object' && 'toJSON' in value) {
                    plainObject[key] = value.toJSON();
                } else if (value && typeof value === 'object') {
                    // Para objetos complejos como OrderLine, Money, etc.
                    plainObject[key] = this.serializeComplexObject(value);
                } else {
                    plainObject[key] = value;
                }
            }
        }

        // Añadir metadatos
        plainObject._eventType = event.constructor.name;
        plainObject._occurredOn = event.occurredOn.toISOString();

        return JSON.stringify(plainObject);
    }

    /**
     * Serializa objetos complejos del dominio
     */
    private serializeComplexObject(obj: any): any {
        if (obj === null || obj === undefined) {
            return obj;
        }

        // Si tiene un método de serialización personalizado
        if (typeof obj.toJSON === 'function') {
            return obj.toJSON();
        }

        // Para value objects con métodos getter
        const serialized: any = {};
        
        // Intentar obtener valores a través de getters
        if (typeof obj.getAmount === 'function' && typeof obj.getCurrency === 'function') {
            // Es un Money
            return {
                amount: obj.getAmount(),
                currency: obj.getCurrency()
            };
        }

        if (typeof obj.getSku === 'function' && typeof obj.getQuantity === 'function') {
            // Es un OrderLine
            return {
                sku: obj.getSku().toString(),
                quantity: obj.getQuantity().toNumber(),
                unitPrice: this.serializeComplexObject(obj.getUnitPrice()),
                subtotal: this.serializeComplexObject(obj.getSubtotal())
            };
        }

        // Fallback: copiar propiedades enumerables
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                serialized[key] = obj[key];
            }
        }

        return serialized;
    }
}