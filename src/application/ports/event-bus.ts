import { DomainEvent } from '@domain/events/order-events.js';
import { Result } from '@shared/result.js';
import { AppError } from '../errors.js';

export interface EventBus {
    publish(events: DomainEvent[]): Promise<Result<void, AppError>>;
}