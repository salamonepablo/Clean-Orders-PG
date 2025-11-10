import fastify from 'fastify'
import { ServerDependencies } from '../../application/ports/server-dependencies.js'
import { OrderControllers } from './controllers/OrderControllers.js'

export async function buildServer(dependencies: ServerDependencies) {
  const server = fastify({ 
    logger: false 
  })

  // Presentation layer (Controllers)
  const orderController = new OrderControllers(
    dependencies.createOrderUseCase,
    dependencies.addItemToOrderUseCase,
    dependencies.logger
  )

  // Register routes
  await orderController.registerRoutes(server)

  // Health check endpoint
  server.get('/health', async () => {
    dependencies.logger.info('Health check requested')
    return { status: 'ok', timestamp: new Date().toISOString() }
  })

  return server
}

