import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { CreateOrderUseCase } from '@application/use-cases/create-order.use-case.js';
import { AddItemOrderUseCase } from '@application/use-cases/add-item-order.use-case.js';
import { CreateOrderDto } from '@application/dto/create-order.dto.js';
import { AddItemOrderDto } from '@application/dto/add-item-order.dto.js';
import { AppError } from '@application/errors.js';
import { Logger } from '@application/ports/logger.js';

interface CreateOrderRequest {
    currency: string;
}

interface AddItemRequest {
    sku: string;
    quantity: number;
}

interface AddItemParams {
    orderId: string;
}

export class OrderControllers {
    constructor(
        private readonly createOrderUseCase: CreateOrderUseCase,
        private readonly addItemOrderUseCase: AddItemOrderUseCase,
        private readonly logger: Logger
    ) {}

    async registerRoutes(fastify: FastifyInstance): Promise<void> {
        fastify.post('/orders', this.createOrder.bind(this));
        fastify.post('/orders/:orderId/items', this.addItem.bind(this));
    }

    private async createOrder(
        request: FastifyRequest<{ Body: CreateOrderRequest }>,
        reply: FastifyReply
    ): Promise<void> {
        const requestId = randomUUID();
        const logger = this.logger.child({ 
            requestId,
         });
        
        logger.info(`Creating order with currency: ${request.body.currency}`);
        
        const dto: CreateOrderDto = {
            currency: request.body.currency
        };

        const result = await this.createOrderUseCase.execute(dto);

        if (!result.ok) {
            logger.error(`Failed to create order: ${result.error.message}`, result.error);
            const statusCode = this.mapErrorToStatusCode(result.error);
            reply.code(statusCode).send({
                error: result.error.type,
                message: result.error.message
            });
            return;
        }

        logger.info(`Order created successfully: ${result.value.orderId}`);
        reply.code(201).send(result.value);
    }

    private async addItem(
        request: FastifyRequest<{
            Params: AddItemParams;
            Body: AddItemRequest;
        }>,
        reply: FastifyReply
    ): Promise<void> {
        const requestId = randomUUID();
        const logger = this.logger.child({ 
            requestId,
            orderId: request.params.orderId
         });
        
        logger.info(`Adding item to order: SKU=${request.body.sku}, quantity=${request.body.quantity}`);
        
        const dto: AddItemOrderDto = {
            orderId: request.params.orderId,
            sku: request.body.sku,
            quantity: request.body.quantity
        };

        const result = await this.addItemOrderUseCase.execute(dto);

        if (!result.ok) {
            logger.error(`Failed to add item: ${result.error.message}`, result.error);
            const statusCode = this.mapErrorToStatusCode(result.error);
            reply.code(statusCode).send({
                error: result.error.type,
                message: result.error.message
            });
            return;
        }

        logger.info(`Item added successfully: SKU=${result.value.sku}`);
        reply.code(200).send(result.value);
    }

    private mapErrorToStatusCode(error: AppError): number {
        switch (error.type) {
            case 'validation':
                return 400;
            case 'notFound':
                return 404;
            case 'conflict':
                return 409;
            case 'infra':
                return 503;
            default:
                return 500;
        }
    }
}
