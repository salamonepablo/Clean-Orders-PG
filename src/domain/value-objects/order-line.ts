import { Money } from './money.js';
import { Quantity } from './quantity.js';
import { SKU } from './sku.js';

export class OrderLine {
    private constructor(
        private readonly sku: SKU,
        private readonly quantity: Quantity,
        private readonly unitPrice: Money
    ) {}

    static create(sku: SKU, quantity: Quantity, unitPrice: Money): OrderLine {
        if (!sku || !quantity || !unitPrice) {
            throw new Error('OrderLine requires SKU, quantity and unit price');
        }
        return new OrderLine(sku, quantity, unitPrice);
    }

    getSku(): SKU {
        return this.sku;
    }

    getQuantity(): Quantity {
        return this.quantity;
    }

    getUnitPrice(): Money {
        return this.unitPrice;
    }

    getSubtotal(): Money {
        return this.unitPrice.multiply(this.quantity.toNumber());
    }

    equals(other: OrderLine): boolean {
        return this.sku.equals(other.sku);
    }
}