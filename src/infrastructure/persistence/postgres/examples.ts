/**
 * Ejemplos de uso del PostgresUnitOfWork
 */

import { createPostgresPool } from './createPostgresPool.js';
import { PostgresUnitOfWork } from './PostgresUnitOfWork.js';
import { databaseConfig } from '@composition/config.js';
import { Order } from '@domain/entities/order.js';
import { SKU } from '@domain/value-objects/sku.js';
import { Quantity } from '@domain/value-objects/quantity.js';
import { Money } from '@domain/value-objects/money.js';

// ==============================================
// Ejemplo 1: Crear y guardar una orden completa
// ==============================================
async function example1_CreateOrder() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const result = await uow.run(async ({ orders }) => {
        // Generar ID
        const idResult = await orders.nextId();
        if (!idResult.ok) throw idResult.error;

        // Crear orden
        const order = Order.create(idResult.value, 'EUR');

        // Añadir líneas
        order.addLine(
            SKU.create('PROD001'),
            Quantity.create(2),
            Money.create(19.99, 'EUR')
        );

        order.addLine(
            SKU.create('PROD002'),
            Quantity.create(1),
            Money.create(49.99, 'EUR')
        );

        // Guardar
        const saveResult = await orders.save(order);
        if (!saveResult.ok) throw saveResult.error;

        return order.getId();
    });

    if (result.ok) {
        console.log('✅ Orden creada:', result.value);
    } else {
        console.error('❌ Error:', result.error.message);
    }

    await uow.close();
}

// =======================================================
// Ejemplo 2: Modificar una orden existente (agregar item)
// =======================================================
async function example2_AddItemToOrder() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const orderId = 'existing-order-id';

    const result = await uow.run(async ({ orders }) => {
        // Buscar orden
        const findResult = await orders.findById(orderId);
        if (!findResult.ok) throw findResult.error;
        if (!findResult.value) throw new Error('Order not found');

        const order = findResult.value;

        // Agregar nuevo item
        order.addLine(
            SKU.create('PROD003'),
            Quantity.create(3),
            Money.create(9.99, 'EUR')
        );

        // Guardar (UPSERT + DELETE/INSERT de items)
        const saveResult = await orders.save(order);
        if (!saveResult.ok) throw saveResult.error;

        return order;
    });

    if (result.ok) {
        console.log('✅ Orden actualizada. Total:', result.value.getTotal());
    } else {
        console.error('❌ Error:', result.error.message);
    }

    await uow.close();
}

// ========================================================
// Ejemplo 3: Operación de solo lectura (sin transacción)
// ========================================================
async function example3_ReadOrder() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const orderId = 'existing-order-id';

    // Usar query() para operaciones de solo lectura
    const result = await uow.query(async ({ orders }) => {
        const findResult = await orders.findById(orderId);
        if (!findResult.ok) throw findResult.error;
        return findResult.value;
    });

    if (result.ok && result.value) {
        console.log('✅ Orden encontrada:', {
            id: result.value.getId(),
            items: result.value.getLinesCount(),
            total: result.value.getTotal().getAmount(),
        });
    } else if (result.ok && !result.value) {
        console.log('⚠️  Orden no encontrada');
    } else {
        console.error('❌ Error:', result.error.message);
    }

    await uow.close();
}

// ==================================================================
// Ejemplo 4: Transacción compleja con múltiples operaciones
// ==================================================================
async function example4_ComplexTransaction() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const result = await uow.run(async ({ orders }) => {
        // Crear primera orden
        const id1Result = await orders.nextId();
        if (!id1Result.ok) throw id1Result.error;

        const order1 = Order.create(id1Result.value, 'EUR');
        order1.addLine(SKU.create('PROD001'), Quantity.create(1), Money.create(100, 'EUR'));

        const save1 = await orders.save(order1);
        if (!save1.ok) throw save1.error;

        // Crear segunda orden
        const id2Result = await orders.nextId();
        if (!id2Result.ok) throw id2Result.error;

        const order2 = Order.create(id2Result.value, 'EUR');
        order2.addLine(SKU.create('PROD002'), Quantity.create(2), Money.create(50, 'EUR'));

        const save2 = await orders.save(order2);
        if (!save2.ok) throw save2.error;

        // Si algo falla aquí, ambas órdenes se revierten (ROLLBACK)
        return [order1.getId(), order2.getId()];
    });

    if (result.ok) {
        console.log('✅ Órdenes creadas:', result.value);
    } else {
        console.error('❌ Error - Transacción revertida:', result.error.message);
    }

    await uow.close();
}

// ==================================================================
// Ejemplo 5: Manejo de errores con rollback automático
// ==================================================================
async function example5_ErrorHandling() {
    const pool = createPostgresPool(databaseConfig);
    const uow = new PostgresUnitOfWork(pool);

    const result = await uow.run(async ({ orders }) => {
        const idResult = await orders.nextId();
        if (!idResult.ok) throw idResult.error;

        const order = Order.create(idResult.value, 'EUR');
        order.addLine(SKU.create('PROD001'), Quantity.create(1), Money.create(100, 'EUR'));

        const saveResult = await orders.save(order);
        if (!saveResult.ok) throw saveResult.error;

        // Simular un error después de guardar
        throw new Error('¡Algo salió mal!');

        // Esta línea nunca se ejecuta, y el ROLLBACK revierte todo
        return order.getId();
    });

    if (!result.ok) {
        console.log('✅ Error capturado correctamente:', result.error.message);
        console.log('✅ La transacción fue revertida (ROLLBACK)');
    }

    await uow.close();
}

// Exportar ejemplos
export {
    example1_CreateOrder,
    example2_AddItemToOrder,
    example3_ReadOrder,
    example4_ComplexTransaction,
    example5_ErrorHandling,
};
