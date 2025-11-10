import { Order } from '@domain/entities/order.js';
import { Result, fail, ok } from '@shared/result.js';
import { AppError, ValidationError } from '../errors.js';
import { CreateOrderDto, CreateOrderResponseDto } from '../dto/create-order.dto.js';
import { EventBus } from '../ports/event-bus.js';
import { OrderRepository } from '../ports/order-repository.js';

export class CreateOrderUseCase {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly eventBus: EventBus
    ) {}

    async execute(dto: CreateOrderDto): Promise<Result<CreateOrderResponseDto, AppError>> {
        // Validar DTO
        if (!dto.currency || !/^[A-Z]{3}$/.test(dto.currency)) {
            return fail(new ValidationError('Invalid currency format'));
        }

        // Obtener nuevo ID
        const idResult = await this.orderRepository.nextId();
        if (!idResult.ok) return fail(idResult.error);

        try {
            // Crear orden
            const order = Order.create(idResult.value, dto.currency);

            // Persistir
            const saveResult = await this.orderRepository.save(order);
            if (!saveResult.ok) return fail(saveResult.error);

            // Publicar eventos
            const publishResult = await this.eventBus.publish([...order.getEvents()]);
            if (!publishResult.ok) return fail(publishResult.error);

            // Limpiar eventos y retornar respuesta
            order.clearEvents();
            return ok({
                orderId: order.getId(),
                currency: order.getCurrency()
            });

        } catch (error) {
            return fail(AppError.validation(error instanceof Error ? error.message : 'Invalid order data'));
        }
    }
}