import { Money } from '../value-objects/money.js';
import { OrderLine } from '../value-objects/order-line.js';

export interface DomainEvent {
    occurredOn: Date;
}

export class OrderCreated implements DomainEvent {
    constructor(
        public readonly orderId: string,
        public readonly currency: string,
        public readonly occurredOn: Date = new Date()
    ) {}
}

export class OrderLineAdded implements DomainEvent {
    constructor(
        public readonly orderId: string,
        public readonly line: OrderLine,
        public readonly newTotal: Money,
        public readonly occurredOn: Date = new Date()
    ) {}
}