# PostgreSQL Unit of Work - Guía de Uso

## 📋 Descripción

El `PostgresUnitOfWork` implementa el patrón Unit of Work para PostgreSQL, gestionando automáticamente transacciones y exponiendo repositorios que comparten la misma conexión de base de datos.

## 🎯 Características

- ✅ **Gestión automática de transacciones**: BEGIN, COMMIT, ROLLBACK
- ✅ **Repositorios transaccionales**: Todos comparten la misma conexión
- ✅ **Type-safe**: Completamente tipado con TypeScript
- ✅ **Manejo robusto de errores**: Rollback automático en caso de fallo
- ✅ **Pool de conexiones**: Reutilización eficiente de conexiones
- ✅ **Soporte para Pool y PoolClient**: Flexibilidad en el uso

## 🚀 Instalación y Configuración

```bash
npm install pg
npm install --save-dev @types/pg
```

## 📖 Uso Básico

### 1. Crear el Pool y UnitOfWork

```typescript
import { createPostgresPool } from './createPostgresPool.js';
import { PostgresUnitOfWork } from './PostgresUnitOfWork.js';
import { databaseConfig } from '@composition/config.js';

const pool = createPostgresPool(databaseConfig);
const uow = new PostgresUnitOfWork(pool);
```

### 2. Ejecutar Transacción con `run()`

```typescript
const result = await uow.run(async ({ orders }) => {
    // Todas las operaciones aquí están en la misma transacción
    
    const idResult = await orders.nextId();
    if (!idResult.ok) throw idResult.error;

    const order = Order.create(idResult.value, 'EUR');
    order.addLine(SKU.create('PROD001'), Quantity.create(2), Money.create(19.99, 'EUR'));

    const saveResult = await orders.save(order);
    if (!saveResult.ok) throw saveResult.error;

    return order;
});

if (result.ok) {
    console.log('✅ Orden guardada:', result.value.getId());
} else {
    console.error('❌ Error:', result.error.message);
}
```

### 3. Consultas sin Transacción con `query()`

Para operaciones de solo lectura que no requieren atomicidad:

```typescript
const result = await uow.query(async ({ orders }) => {
    const findResult = await orders.findById('order-id');
    if (!findResult.ok) throw findResult.error;
    return findResult.value;
});
```

## 🔄 Cómo Funciona

### Arquitectura

```
┌─────────────────────────────────────┐
│      PostgresUnitOfWork             │
├─────────────────────────────────────┤
│  run(work)                          │
│   ├── pool.connect()                │
│   ├── BEGIN                         │
│   ├── work({ orders, ... })         │
│   ├── COMMIT (si éxito)             │
│   └── ROLLBACK (si error)           │
└─────────────────────────────────────┘
         │
         ├─────────────────────────────┐
         │                             │
┌────────▼─────────┐         ┌────────▼─────────┐
│ PostgresOrder    │         │ Otros            │
│ Repository       │         │ Repositorios     │
│ (mismo client)   │         │ (mismo client)   │
└──────────────────┘         └──────────────────┘
```

### Flujo de Transacción

1. **Obtener conexión** del pool
2. **BEGIN** - Iniciar transacción
3. **Crear repositorios** con el mismo PoolClient
4. **Ejecutar lógica** de negocio
5. **COMMIT** - Si todo es exitoso
6. **ROLLBACK** - Si hay algún error
7. **Liberar conexión** al pool

## 🏗️ PostgresOrderRepository

El repositorio soporta dos modos de operación:

### Modo 1: Con Pool (maneja su propia transacción)

```typescript
const pool = createPostgresPool(config);
const repository = new PostgresOrderRepository(pool);

// Internamente manejará BEGIN/COMMIT/ROLLBACK
await repository.save(order);
```

### Modo 2: Con PoolClient (transacción externa)

```typescript
const client = await pool.connect();
await client.query('BEGIN');

const repository = new PostgresOrderRepository(client);

// Usa el cliente existente, NO inicia nueva transacción
await repository.save(order1);
await repository.save(order2);

await client.query('COMMIT');
client.release();
```

## 💾 Operaciones de Base de Datos

### UPSERT de Orders

```sql
INSERT INTO orders (id, customer_id, status, total_amount_value, total_amount_currency)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (id) 
DO UPDATE SET
    status = EXCLUDED.status,
    total_amount_value = EXCLUDED.total_amount_value,
    total_amount_currency = EXCLUDED.total_amount_currency,
    updated_at = NOW()
```

### DELETE + INSERT de Order Items

```typescript
// 1. Eliminar items existentes
DELETE FROM order_items WHERE order_id = $1

// 2. Insertar todos los items actuales (batch)
INSERT INTO order_items (id, order_id, sku, quantity, ...) 
VALUES ($1, $2, ...), ($9, $10, ...), ...
```

## ⚠️ Manejo de Errores

El UnitOfWork captura y maneja automáticamente los errores:

```typescript
const result = await uow.run(async ({ orders }) => {
    // Si cualquier operación falla...
    await orders.save(order1);
    throw new Error('¡Error!'); // <- ROLLBACK automático
    await orders.save(order2);  // <- Nunca se ejecuta
});

// result.ok === false
// La base de datos está en estado consistente (ROLLBACK)
```

## 🎯 Ventajas del Unit of Work

1. **Atomicidad**: Todas las operaciones se confirman o revierten juntas
2. **Consistencia**: Mismo estado de conexión para todos los repositorios
3. **Simplicidad**: No gestionar transacciones manualmente
4. **Seguridad**: Rollback automático en errores
5. **Rendimiento**: Reutilización de conexiones del pool

## 🧪 Testing

```typescript
describe('PostgresUnitOfWork', () => {
    let pool: Pool;
    let uow: PostgresUnitOfWork;

    beforeAll(async () => {
        pool = createPostgresPool(testConfig);
        uow = new PostgresUnitOfWork(pool);
    });

    afterAll(async () => {
        await uow.close();
    });

    it('should rollback on error', async () => {
        const result = await uow.run(async ({ orders }) => {
            const order = Order.create('test-id', 'EUR');
            await orders.save(order);
            throw new Error('Force rollback');
        });

        expect(result.ok).toBe(false);
        
        // Verificar que no se guardó
        const checkResult = await uow.query(async ({ orders }) => {
            return await orders.findById('test-id');
        });
        
        expect(checkResult.value).toBeNull();
    });
});
```

## 📚 Referencias

- [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html)
- [Unit of Work Pattern](https://martinfowler.com/eaaCatalog/unitOfWork.html)
- [node-postgres Documentation](https://node-postgres.com/)

## 🔧 Configuración Avanzada

### Variables de Entorno

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clean_orders_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_SSL=false
```

### Pool Configuration

```typescript
const pool = new Pool({
    host: 'localhost',
    port: 5432,
    database: 'clean_orders_db',
    user: 'postgres',
    password: 'postgres',
    max: 20,                      // Máximo de conexiones
    connectionTimeoutMillis: 30000, // Timeout de conexión
    idleTimeoutMillis: 30000,      // Timeout de inactividad
});
```

## ✅ Checklist de Implementación

- [x] PostgresOrderRepository con Pool/PoolClient
- [x] PostgresUnitOfWork con run() y query()
- [x] Manejo automático de transacciones (BEGIN/COMMIT/ROLLBACK)
- [x] UPSERT de orders
- [x] DELETE + INSERT de order_items
- [x] Type guards para Pool vs PoolClient
- [x] Manejo robusto de errores
- [x] Health checks
- [x] Ejemplos de uso
- [x] Documentación completa
