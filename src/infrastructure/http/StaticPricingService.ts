import { Money } from '@domain/value-objects/money.js';
import { SKU } from '@domain/value-objects/sku.js';
import { PricingService } from '@application/ports/pricing-service.js';
import { Result, ok, fail } from '@shared/result.js';
import { AppError, NotFoundError } from '@application/errors.js';

export class StaticPricingService implements PricingService {
    private readonly prices: Map<string, number>;

    constructor() {
        this.prices = new Map([
            ['BOOK001', 29.99],
            ['BOOK002', 39.99],
            ['GAME001', 59.99],
            ['GAME002', 69.99],
            ['FOOD001', 9.99],
            ['FOOD002', 14.99],
        ]);
    }

    async getCurrentPrice(sku: SKU, currency: string = 'EUR'): Promise<Result<Money, AppError>> {
        const price = this.prices.get(sku.toString());
        
        if (price === undefined) {
            return fail(new NotFoundError(`Price not found for SKU: ${sku.toString()}`));
        }

        try {
            return ok(Money.create(price, currency));
        } catch (error) {
            return fail(AppError.validation(error instanceof Error ? error.message : 'Invalid price data'));
        }
    }

    // Métodos auxiliares para testing y configuración
    setPriceForSku(sku: string, price: number): void {
        this.prices.set(sku, price);
    }

    clearPrices(): void {
        this.prices.clear();
    }

    get availableSkus(): string[] {
        return Array.from(this.prices.keys());
    }
}