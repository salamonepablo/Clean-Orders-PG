#!/usr/bin/env node

/**
 * Script standalone para ejecutar el OutboxDispatcher
 * Puede ejecutarse como un worker independiente
 */

import { createPostgresPool } from '../persistence/postgres/createPostgresPool.js';
import { OutboxDispatcher, DispatcherStats } from './OutboxDispatcher.js';
import { outboxConfig, databaseConfig } from '@composition/config.js';

// Variables globales
let dispatcher: OutboxDispatcher | null = null;
let pool: any = null;

/**
 * Publisher personalizado para eventos
 * Aquí puedes integrar con sistemas de mensajería como RabbitMQ, Kafka, etc.
 */
async function publishToExternalSystem(events: any[]): Promise<void> {
    for (const event of events) {
        // Ejemplo: Publicar a un sistema de mensajería
        console.log('📤 Publishing event to external system:', {
            id: event.id,
            type: event.event_type,
            aggregateId: event.aggregate_id,
            data: event.event_data
        });

        // Aquí podrías hacer:
        // - await rabbitMQ.publish(event)
        // - await kafka.send(event)
        // - await httpClient.post('/webhooks', event)
        // etc.
    }
}

/**
 * Inicia el dispatcher
 */
async function startDispatcher(): Promise<void> {
    console.log('🚀 Initializing Outbox Dispatcher...\n');

    // Crear pool de conexiones
    pool = createPostgresPool(databaseConfig);

    // Verificar conexión
    const client = await pool.connect();
    try {
        await client.query('SELECT 1');
        console.log('✅ Database connection verified\n');
    } catch (error) {
        console.error('❌ Failed to connect to database:', error);
        process.exit(1);
    } finally {
        client.release();
    }

    // Crear y configurar dispatcher
    dispatcher = new OutboxDispatcher(
        pool,
        outboxConfig,
        publishToExternalSystem // Publisher personalizado
    );

    // Iniciar dispatcher
    dispatcher.start();

    // Mostrar estadísticas periódicamente
    setInterval(() => {
        showStats();
    }, 30000); // Cada 30 segundos

    console.log('✅ Outbox Dispatcher started successfully\n');
    console.log('Configuration:', {
        batchSize: outboxConfig.batchSize,
        pollInterval: `${outboxConfig.pollInterval}ms`,
        maxRetries: outboxConfig.maxRetries,
        retryDelay: `${outboxConfig.retryDelay}ms`
    });
    console.log('\n📊 Press Ctrl+C to stop\n');
}

/**
 * Muestra estadísticas del dispatcher
 */
async function showStats(): Promise<void> {
    if (!dispatcher) return;

    const stats = dispatcher.getStats();
    const outboxStats = await dispatcher.getOutboxStats();

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 Dispatcher Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Status:', stats.isRunning ? '🟢 Running' : '🔴 Stopped');
    console.log('Last Run:', stats.lastRun?.toLocaleString() || 'Never');
    console.log('Total Processed:', stats.totalProcessed);
    console.log('Total Published:', stats.totalPublished);
    console.log('Total Failed:', stats.totalFailed);
    console.log('\n📦 Outbox Statistics');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Unpublished Events:', outboxStats.unpublished);
    console.log('Published Events:', outboxStats.published);
    console.log('Total Events:', outboxStats.total);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

/**
 * Maneja el cierre graceful
 */
async function shutdown(signal: string): Promise<void> {
    console.log(`\n\n⚠️  Received ${signal} signal`);
    console.log('🔄 Starting graceful shutdown...\n');

    if (dispatcher) {
        await dispatcher.shutdown();
    }

    if (pool) {
        await pool.end();
        console.log('✅ Database pool closed');
    }

    console.log('✅ Graceful shutdown complete');
    process.exit(0);
}

/**
 * Maneja errores no capturados
 */
function handleError(error: Error): void {
    console.error('💥 Unhandled error:', error);
    shutdown('ERROR').catch(() => {
        process.exit(1);
    });
}

// Registrar manejadores de señales
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', handleError);
process.on('unhandledRejection', (reason) => {
    handleError(new Error(String(reason)));
});

// Iniciar si se ejecuta directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    startDispatcher().catch((error) => {
        console.error('💥 Failed to start dispatcher:', error);
        process.exit(1);
    });
}

export { startDispatcher, shutdown };
