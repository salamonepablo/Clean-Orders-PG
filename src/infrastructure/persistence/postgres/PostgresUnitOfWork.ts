import { Pool, PoolClient } from 'pg';
import { Result, ok, fail } from '@shared/result.js';
import { AppError, InfraError } from '@application/errors.js';
import { PostgresOrderRepository } from './PostgresOrderRepository.js';

/**
 * Interfaz que expone los repositorios disponibles dentro de una transacción
 */
export interface TransactionRepositories {
    orders: PostgresOrderRepository;
    // Aquí se pueden añadir más repositorios en el futuro
    // products: PostgresProductRepository;
    // customers: PostgresCustomerRepository;
}

/**
 * Unit of Work para PostgreSQL que maneja transacciones y expone repositorios
 * Garantiza que todas las operaciones dentro de una transacción usen el mismo client
 */
export class PostgresUnitOfWork {
    constructor(private readonly pool: Pool) {}

    /**
     * Ejecuta una función dentro de una transacción
     * Maneja automáticamente BEGIN, COMMIT y ROLLBACK
     * 
     * @param work - Función que recibe los repositorios transaccionales y ejecuta la lógica de negocio
     * @returns Result con el valor retornado por la función work o un error
     * 
     * @example
     * ```typescript
     * const result = await uow.run(async ({ orders }) => {
     *   const order = Order.create(id, 'EUR');
     *   await orders.save(order);
     *   return order;
     * });
     * ```
     */
    async run<T>(
        work: (repositories: TransactionRepositories) => Promise<T>
    ): Promise<Result<T, AppError>> {
        const client = await this.pool.connect();

        try {
            // Iniciar transacción
            await client.query('BEGIN');

            // Crear repositorios transaccionales usando el mismo client
            const repositories = this.createRepositories(client);

            // Ejecutar la lógica de negocio
            const result = await work(repositories);

            // Confirmar transacción si todo fue exitoso
            await client.query('COMMIT');

            return ok(result);
        } catch (error) {
            // Revertir transacción en caso de error
            await client.query('ROLLBACK');

            // Manejar diferentes tipos de errores
            if (error instanceof AppError) {
                return fail(error);
            }

            const message = error instanceof Error ? error.message : 'Unknown transaction error';
            return fail(new InfraError(`Transaction failed: ${message}`));
        } finally {
            // Siempre liberar el client al pool
            client.release();
        }
    }

    /**
     * Ejecuta una función fuera de una transacción (solo lectura recomendada)
     * Útil para operaciones que no requieren atomicidad
     * 
     * @param work - Función que recibe los repositorios y ejecuta consultas
     * @returns Result con el valor retornado
     */
    async query<T>(
        work: (repositories: TransactionRepositories) => Promise<T>
    ): Promise<Result<T, AppError>> {
        const client = await this.pool.connect();

        try {
            // Crear repositorios sin transacción explícita
            const repositories = this.createRepositories(client);

            // Ejecutar la lógica
            const result = await work(repositories);

            return ok(result);
        } catch (error) {
            if (error instanceof AppError) {
                return fail(error);
            }

            const message = error instanceof Error ? error.message : 'Unknown query error';
            return fail(new InfraError(`Query failed: ${message}`));
        } finally {
            client.release();
        }
    }

    /**
     * Crea instancias de los repositorios usando un client específico
     * Esto garantiza que todos usen la misma conexión/transacción
     */
    private createRepositories(client: PoolClient): TransactionRepositories {
        return {
            orders: new PostgresOrderRepository(client),
            // Añadir más repositorios aquí según se necesiten
        };
    }

    /**
     * Verifica la salud de la conexión al pool
     */
    async healthCheck(): Promise<boolean> {
        const client = await this.pool.connect();
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
     * Cierra el pool de conexiones
     * Debe llamarse al cerrar la aplicación
     */
    async close(): Promise<void> {
        await this.pool.end();
    }
}
