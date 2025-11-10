import { Order } from '@domain/entities/order.js';
import { Result } from '@shared/result.js';
import { AppError } from '../errors.js';

export interface OrderRepository {
    save(order: Order): Promise<Result<void, AppError>>;
    findById(id: string): Promise<Result<Order | null, AppError>>;
    nextId(): Promise<Result<string, AppError>>;
}