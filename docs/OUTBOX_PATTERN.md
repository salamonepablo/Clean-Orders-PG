# Transactional Outbox Pattern - Documentación

## 📋 Descripción General

Implementación completa del patrón **Transactional Outbox** para garantizar la consistencia entre la base de datos y la publicación de eventos de dominio.

## 🎯 Problema que Resuelve

En arquitecturas de microservicios, necesitamos:
1. Guardar datos en la base de datos
2. Publicar eventos a otros servicios

**El problema**: Si guardamos en BD pero falla la publicación del evento, quedamos en estado inconsistente.

**La solución**: Guardar eventos y datos en la misma transacción de BD, luego publicar eventos de forma asíncrona.

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                     Application Layer                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Use Case: CreateOrder                                │  │
│  │  1. Create Order (generates domain events)            │  │
│  │  2. Save Order to DB                                  │  │
│  │  3. Publish Events to Outbox                          │  │
│  │     ↓ (same transaction)                              │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────────────────────┬─────────────────────────────┘
                                │
                ┌───────────────▼───────────────┐
                │   PostgresUnitOfWork          │
                │   BEGIN                       │
                │   ├─> Save Order              │
                │   ├─> Insert Events to Outbox │
                │   └─> COMMIT                  │
                └───────────────┬───────────────┘
                                │
        ┌───────────────────────┴──────────────────────┐
        │                                               │
┌───────▼────────┐                          ┌──────────▼─────────┐
│  orders table  │                          │   outbox table     │
│  - id          │                          │   - id             │
│  - customer_id │                          │   - aggregate_id   │
│  - total       │                          │   - event_type     │
│  - status      │                          │   - event_data     │
└────────────────┘                          │   - published_at   │
                                            └──────────┬─────────┘
                                                       │
                        ┌──────────────────────────────┘
                        │
                ┌───────▼────────────────┐
                │  OutboxDispatcher      │
                │  (Background Worker)   │
                │                        │
                │  SELECT ... WHERE      │
                │    published_at IS NULL│
                │  FOR UPDATE            │
                │  SKIP LOCKED           │
                │                        │
                │  ├─> Publish Events    │
                │  └─> UPDATE published_at│
                └───────┬────────────────┘
                        │
        ┌───────────────┴────────────────────┐
        │                                    │
┌───────▼─────────┐              ┌──────────▼──────────┐
│  RabbitMQ       │              │  Kafka / HTTP       │
│  Event Bus      │              │  Webhooks           │
└─────────────────┘              └─────────────────────┘
```

## 📦 Componentes

### 1. OutboxEventBus

Implementa el patrón de persistencia de eventos en la tabla outbox.

**Características:**
- ✅ Acepta `Pool` o `PoolClient` (soporte para transacciones externas)
- ✅ Inserción batch de eventos
- ✅ Serialización automática de eventos de dominio
- ✅ Manejo de value objects complejos (Money, OrderLine, etc.)

**Uso:**
```typescript
const eventBus = new OutboxEventBus(pool, 'Order');
await eventBus.publish(order.getEvents());
```

### 2. OutboxDispatcher

Worker en background que procesa eventos no publicados.

**Características:**
- ✅ Polling periódico configurable
- ✅ `FOR UPDATE SKIP LOCKED` para concurrencia segura
- ✅ Batch processing
- ✅ Reintentos automáticos
- ✅ Limpieza de eventos antiguos
- ✅ Estadísticas en tiempo real
- ✅ Graceful shutdown

**Uso:**
```typescript
const dispatcher = new OutboxDispatcher(pool, outboxConfig, customPublisher);
dispatcher.start();
```

## 🔑 FOR UPDATE SKIP LOCKED

Esta es la **técnica clave** que permite múltiples workers sin conflictos:

```sql
SELECT * FROM outbox
WHERE published_at IS NULL
ORDER BY created_at ASC
LIMIT 50
FOR UPDATE SKIP LOCKED
```

**¿Qué hace?**
- `FOR UPDATE`: Bloquea las filas seleccionadas
- `SKIP LOCKED`: Salta filas ya bloqueadas por otros workers

**Ventajas:**
- ✅ Múltiples workers pueden procesar eventos simultáneamente
- ✅ No hay deadlocks ni conflictos
- ✅ Cada worker procesa eventos diferentes
- ✅ Alta concurrencia sin problemas

## 📊 Esquema de Base de Datos

```sql
CREATE TABLE outbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(100) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    event_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    published_at TIMESTAMP WITH TIME ZONE NULL,
    
    CONSTRAINT chk_outbox_aggregate_type_not_empty 
        CHECK (LENGTH(TRIM(aggregate_type)) > 0),
    CONSTRAINT chk_outbox_event_type_not_empty 
        CHECK (LENGTH(TRIM(event_type)) > 0),
    CONSTRAINT chk_outbox_event_version_positive 
        CHECK (event_version > 0)
);

-- Índices críticos para rendimiento
CREATE INDEX idx_outbox_unpublished 
    ON outbox(created_at) 
    WHERE published_at IS NULL;

CREATE INDEX idx_outbox_unpublished_composite 
    ON outbox(aggregate_type, event_type, created_at) 
    WHERE published_at IS NULL;
```

## 🚀 Flujo Completo

### 1. Crear Orden y Persistir Eventos

```typescript
const result = await uow.run(async ({ orders }) => {
    // Crear orden (genera eventos)
    const order = Order.create(id, 'EUR');
    order.addLine(sku, quantity, price);
    
    // Guardar orden
    await orders.save(order);
    
    // Publicar eventos al outbox (misma transacción)
    const eventBus = new OutboxEventBus(pool, 'Order');
    await eventBus.publish(order.getEvents());
    
    order.clearEvents();
    return order;
});
```

### 2. Dispatcher Procesa Eventos

```typescript
// En background o worker separado
const dispatcher = new OutboxDispatcher(pool, config, publisher);
dispatcher.start();

// El dispatcher automáticamente:
// 1. Busca eventos no publicados (published_at IS NULL)
// 2. Los bloquea con FOR UPDATE SKIP LOCKED
// 3. Los publica al sistema externo
// 4. Marca published_at = NOW()
```

## ⚙️ Configuración

### Variables de Entorno

```env
# Outbox Configuration
OUTBOX_ENABLED=true
OUTBOX_BATCH_SIZE=50
OUTBOX_POLL_INTERVAL=5000
OUTBOX_MAX_RETRIES=3
OUTBOX_RETRY_DELAY=1000
```

### Configuración TypeScript

```typescript
const outboxConfig = {
    enabled: true,
    batchSize: 50,          // Eventos por lote
    pollInterval: 5000,     // Milisegundos entre polls
    maxRetries: 3,          // Reintentos en caso de fallo
    retryDelay: 1000        // Delay entre reintentos
};
```

## 🔧 Scripts NPM

Añade estos scripts a `package.json`:

```json
{
  "scripts": {
    "worker:outbox": "tsx src/infrastructure/messaging/outbox-dispatcher-worker.ts",
    "worker:outbox:dev": "tsx watch src/infrastructure/messaging/outbox-dispatcher-worker.ts"
  }
}
```

## 🧪 Testing

### Test de Transacción con Rollback

```typescript
it('should rollback events if order save fails', async () => {
    const result = await uow.run(async ({ orders }) => {
        const order = Order.create('test-id', 'EUR');
        order.addLine(sku, quantity, price);
        
        await orders.save(order);
        
        const eventBus = new OutboxEventBus(pool, 'Order');
        await eventBus.publish(order.getEvents());
        
        // Forzar error
        throw new Error('Force rollback');
    });
    
    expect(result.ok).toBe(false);
    
    // Verificar que no hay eventos en outbox
    const stats = await dispatcher.getOutboxStats();
    expect(stats.unpublished).toBe(0);
});
```

## 📈 Monitoreo y Estadísticas

### Obtener Estadísticas

```typescript
// Estadísticas del dispatcher
const stats = dispatcher.getStats();
console.log({
    totalProcessed: stats.totalProcessed,
    totalPublished: stats.totalPublished,
    totalFailed: stats.totalFailed,
    lastRun: stats.lastRun,
    isRunning: stats.isRunning
});

// Estadísticas del outbox
const outboxStats = await dispatcher.getOutboxStats();
console.log({
    unpublished: outboxStats.unpublished,
    published: outboxStats.published,
    total: outboxStats.total
});
```

## 🧹 Mantenimiento

### Reintentar Eventos Atascados

```typescript
// Reintentar eventos no publicados después de 5 minutos
await dispatcher.retryFailedEvents(300000);
```

### Limpiar Eventos Antiguos

```typescript
// Eliminar eventos publicados de más de 30 días
await dispatcher.cleanupPublishedEvents(30);
```

## 🔄 Múltiples Workers

Puedes ejecutar múltiples instancias del dispatcher de forma segura:

```bash
# Terminal 1
npm run worker:outbox

# Terminal 2
npm run worker:outbox

# Terminal 3
npm run worker:outbox
```

Gracias a `FOR UPDATE SKIP LOCKED`, cada worker procesará eventos diferentes sin conflictos.

## 🎯 Ventajas del Patrón

1. **Consistencia Garantizada**: Datos y eventos se guardan en la misma transacción
2. **At-Least-Once Delivery**: Los eventos se publican eventualmente
3. **Tolerancia a Fallos**: Si falla la publicación, se reintenta automáticamente
4. **Escalabilidad**: Múltiples workers pueden procesar eventos
5. **Observabilidad**: Estadísticas y monitoreo completo
6. **Auditoría**: Historial completo de eventos en la BD

## ⚠️ Consideraciones

1. **Idempotencia**: Los consumidores de eventos deben ser idempotentes
2. **Orden**: Los eventos se procesan en orden de creación (FIFO)
3. **Limpieza**: Establecer una política de limpieza de eventos antiguos
4. **Monitoreo**: Vigilar eventos que no se publican (posibles problemas)

## 📚 Referencias

- [Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html)
- [PostgreSQL FOR UPDATE SKIP LOCKED](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE)
- [Domain Events Pattern](https://martinfowler.com/eaaDev/DomainEvent.html)

## ✅ Checklist de Implementación

- [x] Tabla outbox con índices optimizados
- [x] OutboxEventBus con soporte transaccional
- [x] OutboxDispatcher con FOR UPDATE SKIP LOCKED
- [x] Serialización de eventos de dominio
- [x] Polling configurable
- [x] Manejo de errores y reintentos
- [x] Graceful shutdown
- [x] Estadísticas y monitoreo
- [x] Limpieza de eventos antiguos
- [x] Soporte para múltiples workers
- [x] Ejemplos de uso completos
- [x] Documentación detallada
