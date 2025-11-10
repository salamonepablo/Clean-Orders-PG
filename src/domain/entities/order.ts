import { OrderCreated, OrderLineAdded } from '../events/order-events.js';
import { Money } from '../value-objects/money.js';
import { OrderLine } from '../value-objects/order-line.js';
import { Quantity } from '../value-objects/quantity.js';
import { SKU } from '../value-objects/sku.js';

export class Order {
    private readonly lines: OrderLine[] = [];
    private total: Money;
    private readonly events: any[] = [];

    private constructor(
        private readonly id: string,
        private readonly currency: string
    ) {
        this.total = Money.zero(currency);
    }

    static create(id: string, currency: string): Order {
        if (!id || id.trim().length === 0) {
            throw new Error('Order ID cannot be empty');
        }
        if (!currency || currency.trim().length === 0) {
            throw new Error('Currency cannot be empty');
        }

        const order = new Order(id, currency);
        order.addEvent(new OrderCreated(id, currency));
        return order;
    }

    addLine(sku: SKU, quantity: Quantity, unitPrice: Money): void {
        // Validar que el precio use la misma moneda del pedido
        if (unitPrice.getCurrency() !== this.currency) {
            throw new Error('Unit price currency must match order currency');
        }

        // Validar si el SKU ya existe
        if (this.lines.some(line => line.getSku().equals(sku))) {
            throw new Error('Cannot add duplicate SKU to order');
        }

        // Crear y añadir la nueva línea
        const newLine = OrderLine.create(sku, quantity, unitPrice);
        this.lines.push(newLine);

        // Actualizar el total
        this.total = this.total.add(newLine.getSubtotal());

        // Registrar el evento
        this.addEvent(new OrderLineAdded(
            this.id,
            newLine,
            this.total
        ));
    }

    getId(): string {
        return this.id;
    }

    getLines(): ReadonlyArray<OrderLine> {
        return [...this.lines];
    }

    getTotal(): Money {
        return this.total;
    }

    getCurrency(): string {
        return this.currency;
    }

    getLinesCount(): number {
        return this.lines.length;
    }

    private addEvent(event: any): void {
        this.events.push(event);
    }

    getEvents(): ReadonlyArray<any> {
        return [...this.events];
    }

    clearEvents(): void {
        this.events.length = 0;
    }
}