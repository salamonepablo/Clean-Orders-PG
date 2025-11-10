import { Result } from "../../shared/result.js";
import { AppError } from "../errors.js";
import { OrderRepository } from "./order-repository.js";

export interface UnitOfWork {
    run<T>(fn: (repos: Repositories) => Promise<T>): Promise<Result<T, AppError>>;
}

export interface Repositories {
    orderRepository: OrderRepository;
}