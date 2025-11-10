import { EventBus } from '../../application/ports/event-bus.js'
import { OutboxEventBus } from './outbox-event-bus.js'
import { NoopEventBus } from './NoopEventBus.js'
import { OutboxDispatcher } from './outbox-dispatcher.js'
import { DatabaseFactory } from '../database/database-factory.js'

export class MessagingFactory {
  static createEventBus(type: 'outbox' | 'noop' = 'outbox'): EventBus {
    if (type === 'noop') {
      return new NoopEventBus()
    }

    const pool = DatabaseFactory.createPool()
    return new OutboxEventBus(pool)
  }

  static createOutboxDispatcher(batchSize = 100, intervalMs = 5000): OutboxDispatcher {
    return new OutboxDispatcher(batchSize, intervalMs)
  }
}