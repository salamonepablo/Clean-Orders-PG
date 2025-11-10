import { Order } from '@domain/entities/order.js';
import { OrderRepository } from '@application/ports/order-repository.js';
import { Result, ok } from '@shared/result.js';
import { AppError } from '@application/errors.js';

export class InMemoryOrderRepository implements OrderRepository {
    private orders: Map<string, Order> = new Map();
    private sequence: number = 1;

    async save(order: Order): Promise<Result<void, AppError>> {
        this.orders.set(order.getId(), order);
        return ok(undefined);
    }

    async findById(id: string): Promise<Result<Order | null, AppError>> {
        const order = this.orders.get(id);
        return ok(order || null);
    }

    async nextId(): Promise<Result<string, AppError>> {
        // Formato: ORD-00001
        const id = `ORD-${String(this.sequence).padStart(5, '0')}`;
        this.sequence += 1;
        return ok(id);
    }

    // Métodos auxiliares para testing
    reset(): void {
        this.orders.clear();
        this.sequence = 1;
    }

    get orderCount(): number {
        return this.orders.size;
    }
}