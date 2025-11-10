# Clean Orders - Guía de Configuración

## 🚀 Inicio Rápido

### Opción 1: Usando In-Memory (Desarrollo Rápido)

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar .env (por defecto usa in-memory)
USE_POSTGRES=false

# 3. Iniciar servidor
npm run dev
```

### Opción 2: Usando PostgreSQL (Producción)

```bash
# 1. Instalar dependencias
npm install

# 2. Levantar PostgreSQL con Docker
npm run db:up

# 3. Ejecutar migraciones
npm run db:migrate

# 4. Configurar .env para usar PostgreSQL
USE_POSTGRES=true
OUTBOX_ENABLED=true

# 5. Iniciar servidor
npm run dev

# 6. (Opcional) Iniciar worker del outbox en otra terminal
npm run worker:outbox:dev
```

## ⚙️ Configuración de Persistencia

La aplicación puede alternar entre dos implementaciones de persistencia mediante la variable de entorno `USE_POSTGRES`:

### In-Memory (por defecto)

```env
USE_POSTGRES=false
```

**Características:**
- ✅ Sin dependencias externas
- ✅ Ideal para desarrollo y testing
- ✅ Arranque instantáneo
- ⚠️ Los datos se pierden al reiniciar
- ⚠️ No soporta outbox pattern

### PostgreSQL

```env
USE_POSTGRES=true
```

**Características:**
- ✅ Persistencia real en base de datos
- ✅ Transacciones ACID
- ✅ Soporte para Outbox Pattern
- ✅ Múltiples workers concurrentes
- ⚠️ Requiere PostgreSQL corriendo
- ⚠️ Requiere ejecutar migraciones

## 🔧 Variables de Entorno

### Variables Principales

```env
# Application
USE_POSTGRES=false              # true = PostgreSQL, false = In-Memory
NODE_ENV=development            # development, test, production
GRACEFUL_SHUTDOWN_TIMEOUT=10000 # Tiempo para cierre graceful (ms)

# Server
SERVER_PORT=3000
SERVER_HOST=0.0.0.0
LOG_LEVEL=info                  # fatal, error, warn, info, debug, trace
PRETTY_LOGS=true
```

### Variables de PostgreSQL (solo si USE_POSTGRES=true)

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=clean_orders_db
DB_USER=postgres
DB_PASSWORD=postgres
DB_MAX_CONNECTIONS=20
DB_CONNECTION_TIMEOUT=30000
DB_SSL=false
```

### Variables del Outbox (solo si USE_POSTGRES=true)

```env
# Outbox Pattern
OUTBOX_ENABLED=true           # Habilitar/deshabilitar dispatcher
OUTBOX_BATCH_SIZE=50          # Eventos por batch
OUTBOX_POLL_INTERVAL=5000     # Milisegundos entre polls
OUTBOX_MAX_RETRIES=3          # Reintentos en caso de fallo
OUTBOX_RETRY_DELAY=1000       # Delay entre reintentos (ms)
```

## 📦 Comandos NPM

```bash
# Desarrollo
npm run dev                     # Iniciar servidor en modo desarrollo

# Base de Datos
npm run db:up                   # Levantar PostgreSQL con Docker
npm run db:down                 # Bajar PostgreSQL
npm run db:migrate              # Ejecutar migraciones

# Outbox Worker
npm run worker:outbox           # Iniciar worker del outbox
npm run worker:outbox:dev       # Iniciar worker en modo desarrollo

# Build y Producción
npm run build                   # Compilar TypeScript
npm start                       # Iniciar servidor (producción)

# Testing
npm test                        # Ejecutar tests
npm run test:watch              # Tests en modo watch
```

## 🔄 Flujo de Trabajo

### Desarrollo con In-Memory

```bash
# Terminal 1
npm run dev
```

### Desarrollo con PostgreSQL

```bash
# Terminal 1 - Base de datos
npm run db:up

# Terminal 2 - Migraciones (solo la primera vez)
npm run db:migrate

# Terminal 3 - Servidor
npm run dev

# Terminal 4 - Worker del Outbox (opcional)
npm run worker:outbox:dev
```

## 🛑 Cierre Graceful

La aplicación maneja el cierre limpio de recursos:

1. **SIGINT (Ctrl+C)** o **SIGTERM**: Inicia cierre graceful
2. Cierra el servidor HTTP (no acepta más conexiones)
3. Detiene el OutboxDispatcher (si está activo)
4. Cierra el pool de PostgreSQL (si está activo)
5. Sale con código 0

**Timeout de cierre**: 10 segundos (configurable con `GRACEFUL_SHUTDOWN_TIMEOUT`)

Si el cierre no se completa en el tiempo configurado, la aplicación fuerza la salida.

## 📊 Monitoreo

### Logs del Servidor

El servidor usa Pino para logging con niveles configurables:

```env
LOG_LEVEL=info      # fatal, error, warn, info, debug, trace
PRETTY_LOGS=true    # Pretty printing en desarrollo
```

### Estadísticas del Outbox

Cuando usas PostgreSQL con outbox habilitado:

```bash
# Ver estadísticas en tiempo real
# El worker muestra estadísticas cada 30 segundos
npm run worker:outbox
```

### Verificar en PostgreSQL

```bash
# Conectar a la BD
docker exec -it clean-orders-postgres psql -U postgres -d clean_orders_db

# Ver eventos
SELECT * FROM outbox;

# Ver eventos no publicados
SELECT COUNT(*) FROM outbox WHERE published_at IS NULL;
```

## 🧪 Testing

### Tests con In-Memory

```bash
# Los tests usan in-memory por defecto
npm test
```

### Tests con PostgreSQL

```bash
# Configurar test environment
NODE_ENV=test USE_POSTGRES=true npm test
```

## 🚀 Despliegue

### Variables de Producción

```env
NODE_ENV=production
USE_POSTGRES=true
OUTBOX_ENABLED=true
LOG_LEVEL=warn
PRETTY_LOGS=false
GRACEFUL_SHUTDOWN_TIMEOUT=30000
```

### Docker Compose (Producción)

```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - USE_POSTGRES=true
      - DB_HOST=postgres
    depends_on:
      - postgres
  
  postgres:
    image: postgres:16
    # ... configuración
  
  outbox-worker:
    build: .
    command: npm run worker:outbox
    environment:
      - USE_POSTGRES=true
      - DB_HOST=postgres
    depends_on:
      - postgres
```

## 📚 Documentación Adicional

- [PostgreSQL Unit of Work](./docs/POSTGRES_UNIT_OF_WORK.md)
- [Outbox Pattern](./docs/OUTBOX_PATTERN.md)
- [Quick Start Guide](./docs/OUTBOX_QUICKSTART.md)

## ⚠️ Troubleshooting

### Error: Cannot connect to database

```bash
# Verificar que PostgreSQL está corriendo
docker ps

# Revisar logs
docker compose logs postgres

# Reiniciar
npm run db:down
npm run db:up
```

### Error: Tables do not exist

```bash
# Ejecutar migraciones
npm run db:migrate
```

### El outbox no procesa eventos

1. Verificar `USE_POSTGRES=true`
2. Verificar `OUTBOX_ENABLED=true`
3. Asegurarse que el worker está corriendo: `npm run worker:outbox`

### Logs no aparecen

```bash
# Habilitar logs
LOG_LEVEL=debug
PRETTY_LOGS=true
```
