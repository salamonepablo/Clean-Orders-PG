import { describe, it, expect, beforeEach } from 'vitest';
import { Order } from '@domain/entities/order';
import { SKU } from '@domain/value-objects/sku';
import { Quantity } from '@domain/value-objects/quantity';
import { Money } from '@domain/value-objects/money';

describe('Order', () => {
    describe('create', () => {
        it('should create an order with valid id and currency', () => {
            const order = Order.create('ORD-001', 'EUR');
            
            expect(order.getId()).toBe('ORD-001');
            expect(order.getCurrency()).toBe('EUR');
            expect(order.getLinesCount()).toBe(0);
            expect(order.getTotal().getAmount()).toBe(0);
        });

        it('should throw error for empty id', () => {
            expect(() => Order.create('', 'EUR')).toThrow('Order ID cannot be empty');
            expect(() => Order.create('   ', 'EUR')).toThrow('Order ID cannot be empty');
        });

        it('should throw error for empty currency', () => {
            expect(() => Order.create('ORD-001', '')).toThrow('Currency cannot be empty');
        });

        it('should emit OrderCreated event', () => {
            const order = Order.create('ORD-001', 'EUR');
            const events = order.getEvents();
            
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                orderId: 'ORD-001',
                currency: 'EUR'
            });
        });
    });

    describe('addLine', () => {
        let order: Order;
        let sku: SKU;
        let quantity: Quantity;
        let price: Money;

        beforeEach(() => {
            order = Order.create('ORD-001', 'EUR');
            order.clearEvents(); // Limpiar evento de creación
            sku = SKU.create('BOOK001');
            quantity = Quantity.create(2);
            price = Money.create(29.99, 'EUR');
        });

        it('should add a line to the order', () => {
            order.addLine(sku, quantity, price);
            
            expect(order.getLinesCount()).toBe(1);
            const lines = order.getLines();
            expect(lines[0].getSku().toString()).toBe('BOOK001');
            expect(lines[0].getQuantity().toNumber()).toBe(2);
        });

        it('should calculate total correctly', () => {
            order.addLine(sku, quantity, price);
            
            const total = order.getTotal();
            expect(total.getAmount()).toBe(59.98);
            expect(total.getCurrency()).toBe('EUR');
        });

        it('should accumulate total with multiple lines', () => {
            const sku2 = SKU.create('BOOK002');
            const price2 = Money.create(39.99, 'EUR');
            
            order.addLine(sku, quantity, price);
            order.addLine(sku2, quantity, price2);
            
            const total = order.getTotal();
            expect(total.getAmount()).toBe(139.96); // (29.99 * 2) + (39.99 * 2)
            expect(order.getLinesCount()).toBe(2);
        });

        it('should throw error when adding duplicate SKU', () => {
            order.addLine(sku, quantity, price);
            
            expect(() => order.addLine(sku, quantity, price))
                .toThrow('Cannot add duplicate SKU to order');
        });

        it('should throw error when price currency does not match order currency', () => {
            const wrongPrice = Money.create(29.99, 'USD');
            
            expect(() => order.addLine(sku, quantity, wrongPrice))
                .toThrow('Unit price currency must match order currency');
        });

        it('should emit OrderLineAdded event', () => {
            order.addLine(sku, quantity, price);
            
            const events = order.getEvents();
            expect(events).toHaveLength(1);
            expect(events[0]).toMatchObject({
                orderId: 'ORD-001'
            });
        });
    });

    describe('getLines', () => {
        it('should return immutable copy of lines', () => {
            const order = Order.create('ORD-001', 'EUR');
            const sku = SKU.create('BOOK001');
            const quantity = Quantity.create(2);
            const price = Money.create(29.99, 'EUR');
            
            order.addLine(sku, quantity, price);
            const lines1 = order.getLines();
            const lines2 = order.getLines();
            
            expect(lines1).not.toBe(lines2); // Different array instances
            expect(lines1).toEqual(lines2); // But same content
        });
    });

    describe('events management', () => {
        it('should clear events', () => {
            const order = Order.create('ORD-001', 'EUR');
            expect(order.getEvents()).toHaveLength(1);
            
            order.clearEvents();
            
            expect(order.getEvents()).toHaveLength(0);
        });

        it('should return immutable copy of events', () => {
            const order = Order.create('ORD-001', 'EUR');
            const events1 = order.getEvents();
            const events2 = order.getEvents();
            
            expect(events1).not.toBe(events2); // Different array instances
            expect(events1).toEqual(events2); // But same content
        });
    });
});