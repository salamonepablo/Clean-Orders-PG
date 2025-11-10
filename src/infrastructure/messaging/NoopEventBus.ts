import { DomainEvent } from "@domain/events/order-events";
import {Result, ok} from "@shared/result";
import {AppError} from "../../application/errors";
import {EventBus} from "../../application/ports/event-bus";

export class NoopEventBus implements EventBus {
    async publish(_events: DomainEvent[]): Promise<Result<void, AppError>> {
        // Noop implementation
        return ok(undefined);
    }
}