/**
 * Ejemplos de uso del OutboxEventBus y OutboxDispatcher
 */

import { createPostgresPool } from '../persistence/postgres/createPostgresPool.js';
import { PostgresUnitOfWork } from '../persistence/postgres/PostgresUnitOfWork.js';
import { OutboxEventBus } from './OutBoxEventBus.js';
import { OutboxDispatcher } from './OutboxDispatcher.js';
import { databaseConfig, outboxConfig } from '@composition/config.js';
import { Order } from '@domain/entities/order.js';
import { SKU } from '@domain/value-objects/sku.js';
import { Quantity } from '@domain/value-objects/quantity.js';
import { Money } from '@domain/value-objects/money.js';

// =================================================================
// Ejemplo 1: Usar OutboxEventBus dentro de una transacción con UoW
// =================================================================
async function example1_PublishEventsWithUnitOfWork() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const result = await uow.run(async ({ orders }) => {
        // 1. Generar ID
        const idResult = await orders.nextId();
        if (!idResult.ok) throw idResult.error;

        // 2. Crear orden y añadir líneas (genera eventos de dominio)
        const order = Order.create(idResult.value, 'EUR');
        order.addLine(SKU.create('PROD001'), Quantity.create(2), Money.create(19.99, 'EUR'));
        order.addLine(SKU.create('PROD002'), Quantity.create(1), Money.create(49.99, 'EUR'));

        // 3. Guardar orden
        const saveResult = await orders.save(order);
        if (!saveResult.ok) throw saveResult.error;

        // 4. Obtener eventos del agregado
        const events = order.getEvents();
        console.log(`📋 Generated ${events.length} domain events`);

        // 5. Publicar eventos al outbox (parte de la misma transacción)
        // IMPORTANTE: Pasar el mismo client para mantener la transacción
        const eventBus = new OutboxEventBus(pool, 'Order');
        const publishResult = await eventBus.publish(events);
        if (!publishResult.ok) throw publishResult.error;

        console.log('✅ Events published to outbox');

        // 6. Limpiar eventos del agregado
        order.clearEvents();

        return order.getId();
    });

    if (result.ok) {
        console.log('✅ Order created and events persisted:', result.value);
    } else {
        console.error('❌ Error:', result.error.message);
    }

    await uow.close();
}

// =================================================================
// Ejemplo 2: Iniciar el Dispatcher para procesar eventos
// =================================================================
async function example2_StartDispatcher() {
    const pool = createPostgresPool(databaseConfig);

    // Publisher personalizado (ejemplo con logging)
    const customPublisher = async (events: any[]) => {
        for (const event of events) {
            console.log('📤 Publishing to external system:', {
                eventType: event.event_type,
                aggregateId: event.aggregate_id,
                data: event.event_data
            });

            // Aquí podrías integrar con:
            // - RabbitMQ: await channel.publish('exchange', 'routing.key', Buffer.from(JSON.stringify(event)))
            // - Kafka: await producer.send({ topic: 'orders', messages: [{ value: JSON.stringify(event) }] })
            // - HTTP Webhook: await fetch('https://webhook.site/...', { method: 'POST', body: JSON.stringify(event) })
        }
    };

    // Crear y configurar dispatcher
    const dispatcher = new OutboxDispatcher(pool, outboxConfig, customPublisher);

    // Iniciar dispatcher
    dispatcher.start();

    console.log('✅ Dispatcher started');

    // Mostrar estadísticas cada 10 segundos
    const statsInterval = setInterval(async () => {
        const stats = dispatcher.getStats();
        const outboxStats = await dispatcher.getOutboxStats();

        console.log('\n📊 Stats:', {
            processed: stats.totalProcessed,
            published: stats.totalPublished,
            failed: stats.totalFailed,
            unpublished: outboxStats.unpublished
        });
    }, 10000);

    // Detener después de 60 segundos (ejemplo)
    setTimeout(async () => {
        clearInterval(statsInterval);
        await dispatcher.shutdown();
        await pool.end();
        console.log('✅ Example completed');
    }, 60000);
}

// =================================================================
// Ejemplo 3: Flujo completo - Crear orden y procesar eventos
// =================================================================
async function example3_CompleteFlow() {
    const pool = createPostgresPool(databaseConfig);

    // 1. Crear UnitOfWork
    const uow = new PostgresUnitOfWork(pool);

    // 2. Crear dispatcher
    const dispatcher = new OutboxDispatcher(pool, outboxConfig);

    console.log('🚀 Starting complete outbox pattern flow...\n');

    // 3. Crear orden con eventos
    console.log('1️⃣  Creating order with events...');
    const orderResult = await uow.run(async ({ orders }) => {
        const idResult = await orders.nextId();
        if (!idResult.ok) throw idResult.error;

        const order = Order.create(idResult.value, 'EUR');
        order.addLine(SKU.create('LAPTOP'), Quantity.create(1), Money.create(999.99, 'EUR'));
        order.addLine(SKU.create('MOUSE'), Quantity.create(2), Money.create(29.99, 'EUR'));

        const saveResult = await orders.save(order);
        if (!saveResult.ok) throw saveResult.error;

        // Publicar eventos al outbox
        const eventBus = new OutboxEventBus(pool, 'Order');
        const events = order.getEvents();
        const publishResult = await eventBus.publish(events);
        if (!publishResult.ok) throw publishResult.error;

        order.clearEvents();

        return order.getId();
    });

    if (!orderResult.ok) {
        console.error('❌ Failed to create order:', orderResult.error.message);
        await pool.end();
        return;
    }

    console.log('✅ Order created:', orderResult.value);

    // 4. Verificar eventos en outbox
    console.log('\n2️⃣  Checking unpublished events...');
    const outboxStats = await dispatcher.getOutboxStats();
    console.log('📊 Outbox stats:', outboxStats);

    // 5. Procesar eventos manualmente (una vez)
    console.log('\n3️⃣  Processing outbox events...');
    await dispatcher.processOutbox();

    // 6. Verificar que se publicaron
    console.log('\n4️⃣  Verifying events were published...');
    const finalStats = await dispatcher.getOutboxStats();
    console.log('📊 Final stats:', finalStats);

    // Cleanup
    await uow.close();
    console.log('\n✅ Complete flow finished successfully!');
}

// =================================================================
// Ejemplo 4: Mantenimiento del Outbox
// =================================================================
async function example4_OutboxMaintenance() {
    const pool = createPostgresPool(databaseConfig);
    const dispatcher = new OutboxDispatcher(pool, outboxConfig);

    console.log('🧹 Running outbox maintenance...\n');

    // 1. Reintentar eventos atascados (más de 5 minutos sin publicar)
    console.log('1️⃣  Retrying failed events...');
    const retriedCount = await dispatcher.retryFailedEvents(300000); // 5 minutos
    console.log(`✅ Retried ${retriedCount} events`);

    // 2. Limpiar eventos publicados antiguos (más de 30 días)
    console.log('\n2️⃣  Cleaning up old published events...');
    const cleanedCount = await dispatcher.cleanupPublishedEvents(30);
    console.log(`✅ Cleaned ${cleanedCount} old events`);

    // 3. Mostrar estadísticas finales
    console.log('\n3️⃣  Final statistics...');
    const stats = await dispatcher.getOutboxStats();
    console.log('📊 Outbox stats:', stats);

    await pool.end();
    console.log('\n✅ Maintenance completed');
}

// =================================================================
// Ejemplo 5: Múltiples workers (simulación)
// =================================================================
async function example5_MultipleWorkers() {
    const pool1 = createPostgresPool(databaseConfig);
    const pool2 = createPostgresPool(databaseConfig);

    const dispatcher1 = new OutboxDispatcher(pool1, outboxConfig);
    const dispatcher2 = new OutboxDispatcher(pool2, outboxConfig);

    console.log('🚀 Starting multiple dispatcher workers...\n');

    // Worker 1
    console.log('👷 Starting Worker 1...');
    dispatcher1.start();

    // Worker 2 (simulando otro proceso)
    console.log('👷 Starting Worker 2...');
    dispatcher2.start();

    console.log('\n✅ Both workers running');
    console.log('💡 FOR UPDATE SKIP LOCKED prevents lock conflicts');
    console.log('💡 Each worker processes different events\n');

    // Mostrar stats de ambos
    setInterval(async () => {
        const stats1 = dispatcher1.getStats();
        const stats2 = dispatcher2.getStats();

        console.log('📊 Worker 1:', {
            processed: stats1.totalProcessed,
            published: stats1.totalPublished
        });
        console.log('📊 Worker 2:', {
            processed: stats2.totalProcessed,
            published: stats2.totalPublished
        });
        console.log('---');
    }, 10000);

    // Detener después de 30 segundos
    setTimeout(async () => {
        await dispatcher1.shutdown();
        await dispatcher2.shutdown();
        await pool1.end();
        await pool2.end();
        console.log('✅ All workers stopped');
    }, 30000);
}

// Exportar ejemplos
export {
    example1_PublishEventsWithUnitOfWork,
    example2_StartDispatcher,
    example3_CompleteFlow,
    example4_OutboxMaintenance,
    example5_MultipleWorkers
};

// Ejecutar ejemplo si se llama directamente
if (import.meta.url === `file://${process.argv[1]}`) {
    const exampleToRun = process.argv[2] || '3';

    switch (exampleToRun) {
        case '1':
            example1_PublishEventsWithUnitOfWork();
            break;
        case '2':
            example2_StartDispatcher();
            break;
        case '3':
            example3_CompleteFlow();
            break;
        case '4':
            example4_OutboxMaintenance();
            break;
        case '5':
            example5_MultipleWorkers();
            break;
        default:
            console.log('Usage: tsx examples-outbox.ts [1-5]');
    }
}
