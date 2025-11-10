//import { Order } from '@domain/entities/order';
import { SKU } from '@domain/value-objects/sku.js';
import { Quantity } from '@domain/value-objects/quantity.js';
import { Result, fail, ok } from '../../shared/result.js';
import { AppError, NotFoundError, ValidationError } from '../errors.js';
import { AddItemOrderDto, AddItemOrderResponseDto } from '../dto/add-item-order.dto.js';
import { EventBus } from '../ports/event-bus.js';
import { OrderRepository } from '../ports/order-repository.js';
import { PricingService } from '../ports/pricing-service.js';

export class AddItemOrderUseCase {
    constructor(
        private readonly orderRepository: OrderRepository,
        private readonly pricingService: PricingService,
        private readonly eventBus: EventBus
    ) {}

    async execute(dto: AddItemOrderDto): Promise<Result<AddItemOrderResponseDto, AppError>> {
        // Validar DTO
        let sku: SKU;
        let quantity: Quantity;
        
        try {
            sku = SKU.create(dto.sku);
            quantity = Quantity.create(dto.quantity);
        } catch (error) {
            return fail(new ValidationError(error instanceof Error ? error.message : 'Invalid input data'));
        }

        // Buscar orden
        const orderResult = await this.orderRepository.findById(dto.orderId);
        if (!orderResult.ok) return fail(orderResult.error);
        
        const order = orderResult.value;
        if (!order) {
            return fail(new NotFoundError(`Order ${dto.orderId} not found`));
        }

        // Obtener precio actual en la moneda de la orden
        const priceResult = await this.pricingService.getCurrentPrice(sku, order.getCurrency());
        if (!priceResult.ok) return fail(priceResult.error);

        try {
            // Añadir línea
            order.addLine(sku, quantity, priceResult.value);

            // Persistir cambios
            const saveResult = await this.orderRepository.save(order);
            if (!saveResult.ok) return fail(saveResult.error);

            // Publicar eventos
            const publishResult = await this.eventBus.publish([...order.getEvents()]);
            if (!publishResult.ok) return fail(publishResult.error);

            // Preparar respuesta
            const total = order.getTotal();
            order.clearEvents();

            return ok({
                orderId: order.getId(),
                sku: sku.toString(),
                quantity: quantity.toNumber(),
                unitPrice: {
                    amount: priceResult.value.getAmount(),
                    currency: priceResult.value.getCurrency()
                },
                total: {
                    amount: total.getAmount(),
                    currency: total.getCurrency()
                }
            });

        } catch (error) {
            return fail(AppError.validation(error instanceof Error ? error.message : 'Invalid operation'));
        }
    }
}