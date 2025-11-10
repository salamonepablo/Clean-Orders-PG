# 🚀 Guía Rápida - Outbox Pattern

## Inicio Rápido

### 1. Levantar la Base de Datos

```bash
npm run db:up
```

### 2. Ejecutar Migraciones

```bash
npm run db:migrate
```

### 3. Iniciar el Worker del Outbox

```bash
npm run worker:outbox
```

En desarrollo con auto-reload:
```bash
npm run worker:outbox:dev
```

## Uso en el Código

### Publicar Eventos en una Transacción

```typescript
import { PostgresUnitOfWork } from './infrastructure/persistence/postgres/PostgresUnitOfWork.js';
import { OutboxEventBus } from './infrastructure/messaging/OutBoxEventBus.js';

const uow = new PostgresUnitOfWork(pool);

await uow.run(async ({ orders }) => {
    // 1. Crear y modificar agregado
    const order = Order.create(id, 'EUR');
    order.addLine(sku, quantity, price);
    
    // 2. Guardar en BD
    await orders.save(order);
    
    // 3. Publicar eventos al outbox (misma transacción!)
    const eventBus = new OutboxEventBus(pool, 'Order');
    await eventBus.publish(order.getEvents());
    
    // 4. Limpiar eventos
    order.clearEvents();
});
```

### Iniciar Dispatcher Programáticamente

```typescript
import { OutboxDispatcher } from './infrastructure/messaging/OutboxDispatcher.js';

const dispatcher = new OutboxDispatcher(pool, outboxConfig, customPublisher);

// Iniciar
dispatcher.start();

// Ver estadísticas
const stats = await dispatcher.getOutboxStats();
console.log(stats); // { unpublished: 0, published: 15, total: 15 }

// Detener
await dispatcher.shutdown();
```

## Configuración

Archivo `.env`:

```env
# Outbox Configuration
OUTBOX_ENABLED=true
OUTBOX_BATCH_SIZE=50
OUTBOX_POLL_INTERVAL=5000
OUTBOX_MAX_RETRIES=3
OUTBOX_RETRY_DELAY=1000
```

## Arquitectura

```
Order Created → Save to DB + Outbox (same transaction)
                      ↓
                 Outbox Table
                 (published_at = NULL)
                      ↓
              OutboxDispatcher (background)
              SELECT ... FOR UPDATE SKIP LOCKED
                      ↓
              Publish to External System
                      ↓
              UPDATE published_at = NOW()
```

## Características Clave

✅ **Consistencia Garantizada**: Datos y eventos en la misma transacción  
✅ **FOR UPDATE SKIP LOCKED**: Múltiples workers sin conflictos  
✅ **At-Least-Once Delivery**: Los eventos se publican eventualmente  
✅ **Reintentos Automáticos**: Fallos se manejan automáticamente  
✅ **Estadísticas en Tiempo Real**: Monitoreo completo  

## Comandos Útiles

```bash
# Levantar base de datos
npm run db:up

# Ejecutar migraciones
npm run db:migrate

# Iniciar worker del outbox
npm run worker:outbox

# Desarrollo con auto-reload
npm run worker:outbox:dev

# Ver logs del contenedor
docker compose logs -f postgres

# Bajar base de datos
npm run db:down
```

## Verificar en PostgreSQL

```bash
# Conectar a PostgreSQL
docker exec -it clean-orders-postgres psql -U postgres -d clean_orders_db

# Ver eventos en outbox
SELECT * FROM outbox;

# Ver eventos no publicados
SELECT * FROM outbox WHERE published_at IS NULL;

# Ver eventos publicados
SELECT * FROM outbox WHERE published_at IS NOT NULL;

# Estadísticas
SELECT 
    COUNT(*) FILTER (WHERE published_at IS NULL) as unpublished,
    COUNT(*) FILTER (WHERE published_at IS NOT NULL) as published,
    COUNT(*) as total
FROM outbox;
```

## Múltiples Workers

Puedes ejecutar múltiples workers de forma segura:

```bash
# Terminal 1
npm run worker:outbox

# Terminal 2
npm run worker:outbox

# Terminal 3
npm run worker:outbox
```

Cada worker procesará eventos diferentes gracias a `FOR UPDATE SKIP LOCKED`.

## Mantenimiento

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

## Documentación Completa

Ver [OUTBOX_PATTERN.md](./OUTBOX_PATTERN.md) para documentación detallada.

## Ejemplos

Ver ejemplos completos en:
- `src/infrastructure/messaging/examples-outbox.ts`
- `src/infrastructure/persistence/postgres/examples.ts`

Ejecutar ejemplos:
```bash
tsx src/infrastructure/messaging/examples-outbox.ts 3
```

## Troubleshooting

### El dispatcher no procesa eventos

1. Verificar que el worker esté ejecutándose: `npm run worker:outbox`
2. Verificar la configuración: `OUTBOX_ENABLED=true`
3. Revisar logs para errores
4. Verificar eventos en BD: `SELECT * FROM outbox WHERE published_at IS NULL`

### Eventos duplicados

Los consumidores deben ser **idempotentes**. El patrón outbox garantiza **at-least-once delivery**.

### Performance

- Ajustar `OUTBOX_BATCH_SIZE` según carga
- Ajustar `OUTBOX_POLL_INTERVAL` según latencia requerida
- Ejecutar múltiples workers para mayor throughput
- Limpiar eventos antiguos regularmente

## Stack Tecnológico

- **PostgreSQL 16**: Base de datos con soporte completo para `FOR UPDATE SKIP LOCKED`
- **node-postgres (pg)**: Cliente PostgreSQL para Node.js
- **TypeScript**: Type safety completo
- **Zod**: Validación de configuración
