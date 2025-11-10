import { CreateOrderUseCase } from '@application/use-cases/create-order.use-case.js';
import { AddItemOrderUseCase } from '@application/use-cases/add-item-order.use-case.js';
import { InMemoryOrderRepository } from '@infrastructure/persistence/in-memory/in-memory-order-repository.js';
import { PostgresOrderRepository } from '@infrastructure/persistence/postgres/PostgresOrderRepository.js';
import { PostgresUnitOfWork } from '@infrastructure/persistence/postgres/PostgresUnitOfWork.js';
import { createPostgresPool, checkPostgresConnection } from '@infrastructure/persistence/postgres/createPostgresPool.js';
import { StaticPricingService } from '@infrastructure/http/StaticPricingService.js';
import { InMemoryEventBus } from '@infrastructure/messaging/in-memory-event-bus.js';
import { OutboxEventBus } from '@infrastructure/messaging/OutBoxEventBus.js';
import { OutboxDispatcher } from '@infrastructure/messaging/OutboxDispatcher.js';
import { RealClock } from '@infrastructure/clock/real-clock.js';
import { ConsoleLogger } from '@infrastructure/logging/console-logger.js';
import { OrderControllers } from '@infrastructure/http/controllers/OrderControllers.js';
import { OrderRepository } from '@application/ports/order-repository.js';
import { PricingService } from '@application/ports/pricing-service.js';
import { EventBus } from '@application/ports/event-bus.js';
import { Clock } from '@application/ports/clock.js';
import { Logger } from '@application/ports/logger.js';
import { config, databaseConfig, outboxConfig } from './config.js';
import { Pool } from 'pg';

export interface Container {
    // Casos de uso
    createOrderUseCase: CreateOrderUseCase;
    addItemOrderUseCase: AddItemOrderUseCase;
    
    // Controladores
    orderControllers: OrderControllers;
    
    // Puertos (para testing/reconfiguración)
    orderRepository: OrderRepository;
    pricingService: PricingService;
    eventBus: EventBus;
    clock: Clock;
    logger: Logger;
    
    // Recursos que necesitan limpieza
    postgresPool?: Pool;
    unitOfWork?: PostgresUnitOfWork;
    outboxDispatcher?: OutboxDispatcher;
    
    // Método de limpieza
    cleanup(): Promise<void>;
}

/**
 * Construye el contenedor de dependencias
 * Alterna entre implementaciones in-memory y PostgreSQL según configuración
 */
export async function buildContainer(): Promise<Container> {
    const usePostgres = config.app.usePostgres;
    
    console.log(`🔧 Building container with ${usePostgres ? 'PostgreSQL' : 'In-Memory'} persistence`);

    let orderRepository: OrderRepository;
    let eventBus: EventBus;
    let postgresPool: Pool | undefined;
    let unitOfWork: PostgresUnitOfWork | undefined;
    let outboxDispatcher: OutboxDispatcher | undefined;

    // Configurar persistencia según variable de entorno
    if (usePostgres) {
        // ===== PostgreSQL Implementation =====
        console.log('📦 Initializing PostgreSQL connection pool...');
        
        postgresPool = createPostgresPool(databaseConfig);
        
        // Verificar conexión
        const isConnected = await checkPostgresConnection(postgresPool);
        if (!isConnected) {
            throw new Error('Failed to connect to PostgreSQL database');
        }
        
        // Crear UnitOfWork
        unitOfWork = new PostgresUnitOfWork(postgresPool);
        
        // Crear repositorio PostgreSQL
        orderRepository = new PostgresOrderRepository(postgresPool);
        
        // Crear EventBus con Outbox
        eventBus = new OutboxEventBus(postgresPool, 'Order');
        
        // Iniciar OutboxDispatcher si está habilitado
        if (outboxConfig.enabled) {
            console.log('🚀 Starting OutboxDispatcher...');
            outboxDispatcher = new OutboxDispatcher(postgresPool, outboxConfig);
            outboxDispatcher.start();
        }
        
        console.log('✅ PostgreSQL infrastructure initialized');
    } else {
        // ===== In-Memory Implementation =====
        console.log('📦 Initializing in-memory infrastructure...');
        orderRepository = new InMemoryOrderRepository();
        eventBus = new InMemoryEventBus();
        console.log('✅ In-memory infrastructure initialized');
    }

    // Instanciar servicios compartidos
    const pricingService = new StaticPricingService();
    const clock = new RealClock();
    const logger = new ConsoleLogger();

    // Instanciar casos de uso
    const createOrderUseCase = new CreateOrderUseCase(
        orderRepository,
        eventBus
    );

    const addItemOrderUseCase = new AddItemOrderUseCase(
        orderRepository,
        pricingService,
        eventBus
    );

    // Instanciar controladores
    const orderControllers = new OrderControllers(
        createOrderUseCase,
        addItemOrderUseCase,
        logger
    );

    // Función de limpieza para cerrar recursos
    const cleanup = async (): Promise<void> => {
        console.log('🧹 Cleaning up resources...');
        
        if (outboxDispatcher) {
            console.log('🛑 Stopping OutboxDispatcher...');
            await outboxDispatcher.shutdown();
        }
        
        if (unitOfWork) {
            console.log('🔌 Closing Unit of Work...');
            await unitOfWork.close();
        }
        
        if (postgresPool) {
            console.log('🔌 Closing PostgreSQL pool...');
            await postgresPool.end();
        }
        
        console.log('✅ Cleanup complete');
    };

    // Devolver contenedor
    return {
        createOrderUseCase,
        addItemOrderUseCase,
        orderControllers,
        orderRepository,
        pricingService,
        eventBus,
        clock,
        logger,
        postgresPool,
        unitOfWork,
        outboxDispatcher,
        cleanup
    };
}
