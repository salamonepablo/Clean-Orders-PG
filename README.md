# Clean Orders - Microservicio de Pedidos

Sistema de gestión de pedidos implementado con **Clean Architecture** y **Domain-Driven Design**.

## 🎯 Características

- ✅ **Clean Architecture**: Separación clara entre dominio, aplicación e infraestructura
- ✅ **Domain-Driven Design**: Agregados, Value Objects y Domain Events
- ✅ **Persistencia Intercambiable**: Alterna entre In-Memory y PostgreSQL
- ✅ **Transactional Outbox Pattern**: Publicación confiable de eventos
- ✅ **Unit of Work**: Gestión transaccional con PostgreSQL
- ✅ **Type Safety**: TypeScript completo con validación Zod
- ✅ **Graceful Shutdown**: Cierre limpio de recursos
- ✅ **Testing**: Tests de dominio y aceptación

## 🚀 Inicio Rápido

### Opción 1: Desarrollo con In-Memory

```bash
npm install
npm run dev
```

### Opción 2: Desarrollo con PostgreSQL

```bash
# 1. Instalar dependencias
npm install

# 2. Verificar entorno
npm run verify

# 3. Levantar PostgreSQL
npm run db:up

# 4. Ejecutar migraciones
npm run db:migrate

# 5. Configurar .env
USE_POSTGRES=true

# 6. Verificar setup nuevamente
npm run verify

# 7. Iniciar servidor
npm run dev

# 8. (Opcional) Iniciar worker del outbox en otra terminal
npm run worker:outbox:dev
```

## 📋 Dominio

### Entidades
- **Order**: Agregado raíz con líneas de pedido y total

### Value Objects
- **Money**: Cantidad monetaria con currency
- **SKU**: Stock Keeping Unit
- **Quantity**: Cantidad de items
- **OrderLine**: Línea de pedido con SKU, cantidad y precio

### Domain Events
- **OrderCreated**: Pedido creado
- **OrderLineAdded**: Línea agregada al pedido

## 🔌 API Endpoints

### Crear Pedido
```http
POST /orders
Content-Type: application/json

{
  "currency": "EUR"
}

Response: 201 Created
{
  "orderId": "uuid",
  "currency": "EUR",
  "total": 0,
  "lines": []
}
```

### Agregar Item al Pedido
```http
POST /orders/:orderId/items
Content-Type: application/json

{
  "sku": "LAPTOP",
  "quantity": 2
}

Response: 200 OK
{
  "orderId": "uuid",
  "total": 1999.98,
  "lines": [
    {
      "sku": "LAPTOP",
      "quantity": 2,
      "unitPrice": 999.99,
      "subtotal": 1999.98
    }
  ]
}
```

## ⚙️ Configuración

Ver [CONFIGURATION.md](./docs/CONFIGURATION.md) para documentación completa.

### Variables Principales

```env
# Alternar persistencia
USE_POSTGRES=false              # true = PostgreSQL, false = In-Memory

# Outbox Pattern (solo con PostgreSQL)
OUTBOX_ENABLED=true

# Servidor
SERVER_PORT=3000
LOG_LEVEL=info
```

## 📦 Scripts NPM

```bash
# Verificación
npm run verify              # Verificar configuración y conexiones

# Desarrollo
npm run dev                 # Iniciar servidor en modo desarrollo

# Base de Datos
npm run db:up              # Levantar PostgreSQL con Docker
npm run db:down            # Bajar PostgreSQL
npm run db:migrate         # Ejecutar migraciones

# Outbox Worker
npm run worker:outbox      # Iniciar worker del outbox
npm run worker:outbox:dev  # Worker en modo desarrollo

# Testing
npm test                   # Ejecutar tests
npm run test:watch         # Tests en modo watch

# Build
npm run build              # Compilar TypeScript
npm start                  # Iniciar servidor (producción)
```

## 🏗️ Arquitectura

```
┌─────────────────────────────────────────────────────────┐
│                     HTTP Layer                          │
│  Fastify + Controllers                                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                 Application Layer                       │
│  Use Cases + Ports (interfaces)                         │
│  - CreateOrderUseCase                                   │
│  - AddItemOrderUseCase                                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│                   Domain Layer                          │
│  Entities + Value Objects + Domain Events               │
│  - Order (aggregate)                                    │
│  - Money, SKU, Quantity, OrderLine                      │
└─────────────────────────────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────────┐
│              Infrastructure Layer                       │
│                                                          │
│  In-Memory              PostgreSQL                      │
│  ├─ Repository          ├─ Repository                   │
│  └─ EventBus            ├─ UnitOfWork                   │
│                         ├─ OutboxEventBus               │
│                         └─ OutboxDispatcher             │
└─────────────────────────────────────────────────────────┘
```

## 📚 Documentación

- [Configuración Completa](./docs/CONFIGURATION.md)
- [PostgreSQL Unit of Work](./docs/POSTGRES_UNIT_OF_WORK.md)
- [Outbox Pattern](./docs/OUTBOX_PATTERN.md)
- [Guía Rápida Outbox](./docs/OUTBOX_QUICKSTART.md)

## 🧪 Testing

```bash
# Ejecutar todos los tests
npm test

# Tests en modo watch
npm run test:watch

# Tests con PostgreSQL
USE_POSTGRES=true npm test
```

## 🛑 Cierre Graceful

La aplicación maneja correctamente el cierre limpio de recursos:

- **SIGINT (Ctrl+C)** / **SIGTERM**: Inicia cierre graceful
- Cierra el servidor HTTP
- Detiene el OutboxDispatcher
- Cierra pools de PostgreSQL
- Timeout configurable (10s por defecto)

## 📊 Monitoreo

```bash
# Ver estadísticas del outbox
npm run worker:outbox

# Conectar a PostgreSQL
docker exec -it clean-orders-postgres psql -U postgres -d clean_orders_db

# Ver eventos
SELECT * FROM outbox WHERE published_at IS NULL;
```

## 🔧 Stack Tecnológico

- **TypeScript**: Type safety completo
- **Fastify**: Framework HTTP rápido
- **PostgreSQL 16**: Base de datos relacional
- **node-postgres**: Cliente PostgreSQL
- **Zod**: Validación de esquemas
- **Pino**: Logging estructurado
- **Vitest**: Testing framework

## 📁 Estructura del Proyecto

```
/src
  /domain                    # Domain Layer
    /entities                # Order (aggregate)
    /value-objects          # Money, SKU, Quantity, OrderLine
    /events                 # Domain Events
    /errors                 # Domain Errors
  /application              # Application Layer
    /use-cases              # CreateOrder, AddItemOrder
    /ports                  # Interfaces (Repository, EventBus, etc.)
    /dto                    # Data Transfer Objects
    /errors.ts              # Application Errors
  /infrastructure           # Infrastructure Layer
    /persistence
      /in-memory           # In-Memory implementations
      /postgres            # PostgreSQL implementations
    /messaging             # Event Bus & Outbox
    /http                  # Controllers & Server
    /clock                 # Time services
  /composition             # Composition Root
    container.ts           # Dependency Injection
    config.ts              # Configuration
  /shared                  # Shared utilities
/tests
  /domain                  # Domain tests
  /acceptance              # Acceptance tests
/scripts
  migrate.ts              # Migration script
  verify-setup.ts         # Setup verification
/docs                     # Documentation
```

## 🤝 Patrones Implementados

- **Clean Architecture**: Separación en capas con inversión de dependencias
- **Domain-Driven Design**: Agregados, Value Objects, Domain Events
- **Unit of Work**: Gestión transaccional
- **Repository Pattern**: Abstracción de persistencia
- **Transactional Outbox**: Publicación confiable de eventos
- **Dependency Injection**: Composition Root manual
- **Result Type**: Manejo funcional de errores

## 🚀 Próximos Pasos

1. Ver la [Guía de Configuración](./docs/CONFIGURATION.md)
2. Ejecutar `npm run verify` para verificar el setup
3. Iniciar el servidor con `npm run dev`
4. Explorar los endpoints con tu cliente HTTP favorito

## 📄 Licencia

ISC