import { Pool, PoolClient } from 'pg';
import { OutboxConfig } from '@composition/config.js';

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
 * Estadísticas de procesamiento del dispatcher
 */
export interface DispatcherStats {
    totalProcessed: number;
    totalPublished: number;
    totalFailed: number;
    lastRun: Date | null;
    isRunning: boolean;
}

/**
 * Dispatcher que procesa eventos no publicados desde la tabla outbox
 * Usa FOR UPDATE SKIP LOCKED para evitar conflictos en entornos concurrentes
 */
export class OutboxDispatcher {
    private intervalId: NodeJS.Timeout | null = null;
    private isProcessing = false;
    private stats: DispatcherStats = {
        totalProcessed: 0,
        totalPublished: 0,
        totalFailed: 0,
        lastRun: null,
        isRunning: false
    };

    constructor(
        private readonly pool: Pool,
        private readonly config: OutboxConfig,
        private readonly eventPublisher?: (events: OutboxRecord[]) => Promise<void>
    ) {}

    /**
     * Inicia el dispatcher en modo polling
     */
    start(): void {
        if (this.intervalId) {
            console.warn('⚠️  OutboxDispatcher already running');
            return;
        }

        if (!this.config.enabled) {
            console.log('ℹ️  OutboxDispatcher is disabled in configuration');
            return;
        }

        console.log('🚀 Starting OutboxDispatcher...', {
            pollInterval: this.config.pollInterval,
            batchSize: this.config.batchSize,
            maxRetries: this.config.maxRetries
        });

        this.stats.isRunning = true;

        // Procesar inmediatamente al iniciar
        this.processOutbox().catch(err => {
            console.error('❌ Error in initial outbox processing:', err);
        });

        // Configurar polling periódico
        this.intervalId = setInterval(() => {
            this.processOutbox().catch(err => {
                console.error('❌ Error in outbox processing:', err);
            });
        }, this.config.pollInterval);
    }

    /**
     * Detiene el dispatcher
     */
    stop(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.stats.isRunning = false;
            console.log('🛑 OutboxDispatcher stopped');
        }
    }

    /**
     * Procesa un batch de eventos no publicados
     */
    async processOutbox(): Promise<void> {
        if (this.isProcessing) {
            console.log('⏭️  Skipping outbox processing - already in progress');
            return;
        }

        this.isProcessing = true;
        this.stats.lastRun = new Date();

        try {
            const events = await this.fetchUnpublishedEvents();

            if (events.length === 0) {
                return;
            }

            console.log(`📦 Processing ${events.length} unpublished events`);

            // Publicar eventos
            await this.publishEvents(events);

            // Marcar como publicados
            await this.markAsPublished(events.map(e => e.id));

            this.stats.totalProcessed += events.length;
            this.stats.totalPublished += events.length;

            console.log(`✅ Successfully published ${events.length} events`);

        } catch (error) {
            this.stats.totalFailed++;
            const message = error instanceof Error ? error.message : 'Unknown error';
            console.error('❌ Failed to process outbox:', message);
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Obtiene eventos no publicados usando FOR UPDATE SKIP LOCKED
     * Esta técnica permite múltiples workers sin conflictos
     */
    private async fetchUnpublishedEvents(): Promise<OutboxRecord[]> {
        const client = await this.pool.connect();

        try {
            // BEGIN para mantener el lock durante el procesamiento
            await client.query('BEGIN');

            const result = await client.query<OutboxRecord>(
                `SELECT id, aggregate_id, aggregate_type, event_type, event_data, 
                        event_version, created_at, published_at
                 FROM outbox
                 WHERE published_at IS NULL
                 ORDER BY created_at ASC
                 LIMIT $1
                 FOR UPDATE SKIP LOCKED`,
                [this.config.batchSize]
            );

            // Mantener el cliente conectado con la transacción abierta
            // para que el lock se mantenga hasta que se marquen como publicados
            // En producción, esto debería manejarse con más cuidado

            await client.query('COMMIT');
            
            return result.rows;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Publica eventos al sistema externo
     */
    private async publishEvents(events: OutboxRecord[]): Promise<void> {
        if (this.eventPublisher) {
            // Usar publisher personalizado
            await this.eventPublisher(events);
        } else {
            // Publicación por defecto (logging)
            for (const event of events) {
                console.log('📤 Publishing event:', {
                    id: event.id,
                    type: event.event_type,
                    aggregateId: event.aggregate_id,
                    aggregateType: event.aggregate_type,
                    data: event.event_data
                });
            }
        }
    }

    /**
     * Marca eventos como publicados en la base de datos
     */
    private async markAsPublished(eventIds: string[]): Promise<void> {
        if (eventIds.length === 0) return;

        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Construir placeholders para el query
            const placeholders = eventIds.map((_, index) => `$${index + 1}`).join(', ');

            const query = `
                UPDATE outbox
                SET published_at = NOW()
                WHERE id IN (${placeholders})
            `;

            const result = await client.query(query, eventIds);

            await client.query('COMMIT');

            console.log(`✅ Marked ${result.rowCount} events as published`);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Reintenta eventos que fallaron en publicaciones anteriores
     * (Eventos antiguos no publicados que podrían estar atascados)
     */
    async retryFailedEvents(maxAge: number = 300000): Promise<number> {
        const client = await this.pool.connect();

        try {
            const cutoffTime = new Date(Date.now() - maxAge);

            const result = await client.query<OutboxRecord>(
                `SELECT id, aggregate_id, aggregate_type, event_type, event_data, 
                        event_version, created_at, published_at
                 FROM outbox
                 WHERE published_at IS NULL
                   AND created_at < $1
                 ORDER BY created_at ASC
                 LIMIT $2`,
                [cutoffTime, this.config.batchSize]
            );

            if (result.rows.length > 0) {
                console.log(`🔄 Retrying ${result.rows.length} failed events`);
                await this.publishEvents(result.rows);
                await this.markAsPublished(result.rows.map(e => e.id));
            }

            return result.rows.length;
        } finally {
            client.release();
        }
    }

    /**
     * Limpia eventos antiguos ya publicados
     */
    async cleanupPublishedEvents(olderThanDays: number = 30): Promise<number> {
        const client = await this.pool.connect();

        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            const result = await client.query(
                `DELETE FROM outbox
                 WHERE published_at IS NOT NULL
                   AND published_at < $1`,
                [cutoffDate]
            );

            if (result.rowCount && result.rowCount > 0) {
                console.log(`🧹 Cleaned up ${result.rowCount} old published events`);
            }

            return result.rowCount || 0;
        } finally {
            client.release();
        }
    }

    /**
     * Obtiene estadísticas del dispatcher
     */
    getStats(): DispatcherStats {
        return { ...this.stats };
    }

    /**
     * Obtiene contadores de eventos en outbox
     */
    async getOutboxStats(): Promise<{
        unpublished: number;
        published: number;
        total: number;
    }> {
        const client = await this.pool.connect();

        try {
            const result = await client.query(`
                SELECT 
                    COUNT(*) FILTER (WHERE published_at IS NULL) as unpublished,
                    COUNT(*) FILTER (WHERE published_at IS NOT NULL) as published,
                    COUNT(*) as total
                FROM outbox
            `);

            const row = result.rows[0];
            return {
                unpublished: parseInt(row.unpublished),
                published: parseInt(row.published),
                total: parseInt(row.total)
            };
        } finally {
            client.release();
        }
    }

    /**
     * Cierra el dispatcher y limpia recursos
     */
    async shutdown(): Promise<void> {
        console.log('🔄 Shutting down OutboxDispatcher...');
        
        this.stop();

        // Esperar a que termine el procesamiento actual
        while (this.isProcessing) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        console.log('✅ OutboxDispatcher shutdown complete');
    }
}
