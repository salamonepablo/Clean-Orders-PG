import { describe, it, expect, beforeEach } from 'vitest';
import { AddItemOrderUseCase } from '@application/use-cases/add-item-order.use-case';
import { CreateOrderUseCase } from '@application/use-cases/create-order.use-case';
import { InMemoryOrderRepository } from '@infrastructure/persistence/in-memory/in-memory-order-repository';
import { StaticPricingService } from '@infrastructure/http/StaticPricingService';
import { InMemoryEventBus } from '@infrastructure/messaging/in-memory-event-bus';

describe('AddItemToOrder - Acceptance Test', () => {
    let orderRepository: InMemoryOrderRepository;
    let pricingService: StaticPricingService;
    let eventBus: InMemoryEventBus;
    let createOrderUseCase: CreateOrderUseCase;
    let addItemOrderUseCase: AddItemOrderUseCase;

    beforeEach(() => {
        // Setup adaptadores en memoria
        orderRepository = new InMemoryOrderRepository();
        pricingService = new StaticPricingService('EUR');
        eventBus = new InMemoryEventBus();

        // Setup casos de uso
        createOrderUseCase = new CreateOrderUseCase(orderRepository, eventBus);
        addItemOrderUseCase = new AddItemOrderUseCase(
            orderRepository,
            pricingService,
            eventBus
        );
    });

    describe('Happy Path', () => {
        it('should add item to order successfully', async () => {
            // Crear orden primero
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const orderId = createResult.value.orderId;

            // Añadir item
            const addResult = await addItemOrderUseCase.execute({
                orderId,
                sku: 'BOOK001',
                quantity: 2
            });

            expect(addResult.ok).toBe(true);
            if (!addResult.ok) return;

            // Verificar respuesta
            expect(addResult.value).toMatchObject({
                orderId,
                sku: 'BOOK001',
                quantity: 2,
                unitPrice: {
                    amount: 29.99,
                    currency: 'EUR'
                },
                total: {
                    amount: 59.98,
                    currency: 'EUR'
                }
            });
        });

        it('should add multiple items and calculate total correctly', async () => {
            // Crear orden
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const orderId = createResult.value.orderId;

            // Añadir primer item
            const addResult1 = await addItemOrderUseCase.execute({
                orderId,
                sku: 'BOOK001',
                quantity: 2
            });

            expect(addResult1.ok).toBe(true);
            if (!addResult1.ok) return;
            expect(addResult1.value.total.amount).toBe(59.98);

            // Añadir segundo item
            const addResult2 = await addItemOrderUseCase.execute({
                orderId,
                sku: 'GAME001',
                quantity: 1
            });

            expect(addResult2.ok).toBe(true);
            if (!addResult2.ok) return;
            expect(addResult2.value.total.amount).toBe(119.97); // 59.98 + 59.99
        });

        it('should publish domain events', async () => {
            // Limpiar eventos previos
            eventBus.clear();

            // Crear orden
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            // Añadir item
            const addResult = await addItemOrderUseCase.execute({
                orderId: createResult.value.orderId,
                sku: 'BOOK001',
                quantity: 2
            });

            expect(addResult.ok).toBe(true);

            // Verificar eventos publicados
            const events = eventBus.getPublishedEvents();
            expect(events.length).toBeGreaterThan(0);
        });
    });

    describe('Validation Errors', () => {
        it('should fail with invalid SKU format', async () => {
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const addResult = await addItemOrderUseCase.execute({
                orderId: createResult.value.orderId,
                sku: 'invalid',
                quantity: 2
            });

            expect(addResult.ok).toBe(false);
            if (addResult.ok) return;
            expect(addResult.error.type).toBe('validation');
        });

        it('should fail with invalid quantity', async () => {
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const addResult = await addItemOrderUseCase.execute({
                orderId: createResult.value.orderId,
                sku: 'BOOK001',
                quantity: 0
            });

            expect(addResult.ok).toBe(false);
            if (addResult.ok) return;
            expect(addResult.error.type).toBe('validation');
        });

        it('should fail when adding duplicate SKU', async () => {
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const orderId = createResult.value.orderId;

            // Añadir primer item
            await addItemOrderUseCase.execute({
                orderId,
                sku: 'BOOK001',
                quantity: 2
            });

            // Intentar añadir mismo SKU
            const addResult2 = await addItemOrderUseCase.execute({
                orderId,
                sku: 'BOOK001',
                quantity: 3
            });

            expect(addResult2.ok).toBe(false);
            if (addResult2.ok) return;
            expect(addResult2.error.type).toBe('validation');
            expect(addResult2.error.message).toContain('duplicate');
        });
    });

    describe('Not Found Errors', () => {
        it('should fail when order does not exist', async () => {
            const addResult = await addItemOrderUseCase.execute({
                orderId: 'NON-EXISTENT',
                sku: 'BOOK001',
                quantity: 2
            });

            expect(addResult.ok).toBe(false);
            if (addResult.ok) return;
            expect(addResult.error.type).toBe('notFound');
            expect(addResult.error.message).toContain('not found');
        });

        it('should fail when SKU price is not found', async () => {
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const addResult = await addItemOrderUseCase.execute({
                orderId: createResult.value.orderId,
                sku: 'UNKNOWN999',
                quantity: 2
            });

            expect(addResult.ok).toBe(false);
            if (addResult.ok) return;
            expect(addResult.error.type).toBe('notFound');
        });
    });

    describe('Integration with repository', () => {
        it('should persist order with added items', async () => {
            // Crear orden
            const createResult = await createOrderUseCase.execute({
                currency: 'EUR'
            });

            expect(createResult.ok).toBe(true);
            if (!createResult.ok) return;

            const orderId = createResult.value.orderId;

            // Añadir items
            await addItemOrderUseCase.execute({
                orderId,
                sku: 'BOOK001',
                quantity: 2
            });

            // Verificar que se guardó en el repositorio
            const orderResult = await orderRepository.findById(orderId);
            expect(orderResult.ok).toBe(true);
            if (!orderResult.ok) return;

            const order = orderResult.value;
            expect(order).not.toBeNull();
            expect(order?.getLinesCount()).toBe(1);
            expect(order?.getTotal().getAmount()).toBe(59.98);
        });
    });
});