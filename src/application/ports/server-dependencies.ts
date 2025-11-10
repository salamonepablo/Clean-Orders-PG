import { CreateOrderUseCase } from '../use-cases/create-order.use-case.js'
import { AddItemToOrder } from '../use-cases/add-item-order.use-case.js'
import { Logger } from '../ports/logger.js'

export interface ServerDependencies {
  createOrderUseCase: CreateOrderUseCase
  addItemToOrderUseCase: AddItemToOrder
  logger: Logger
}