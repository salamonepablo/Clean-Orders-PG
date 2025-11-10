import { Money } from '@domain/value-objects/money.js';
import { SKU } from '@domain/value-objects/sku.js';
import { Result } from '@shared/result.js';
import { AppError } from '../errors.js';

export interface PricingService {
    getCurrentPrice(sku: SKU, currency?: string): Promise<Result<Money, AppError>>;
}