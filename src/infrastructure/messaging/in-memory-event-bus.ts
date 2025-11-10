import { DomainEvent } from '@domain/events/order-events.js';
import { EventBus } from '@application/ports/event-bus.js';
import { Result, ok } from '@shared/result.js';
import { AppError } from '@application/errors.js';

export class InMemoryEventBus implements EventBus {
    private events: DomainEvent[] = [];

    async publish(events: DomainEvent[]): Promise<Result<void, AppError>> {
        this.events.push(...events);
        return ok(undefined);
    }

    // Métodos auxiliares para testing
    getPublishedEvents(): DomainEvent[] {
        return [...this.events];
    }

    clear(): void {
        this.events = [];
    }
}
