import { z } from 'zod';
import { config as loadEnv } from 'dotenv';

// Load environment variables from .env file
loadEnv();

// Environment validation schema
const environmentSchema = z.enum(['development', 'test', 'production']).default('development');

// Database configuration schema
const databaseSchema = z.object({
  host: z.string().min(1, 'Database host is required').default('localhost'),
  port: z.coerce.number().int().min(1).max(65535).default(5432),
  name: z.string().min(1, 'Database name is required').default('clean_orders_db'),
  user: z.string().min(1, 'Database user is required').default('postgres'),
  password: z.string().min(1, 'Database password is required').default('postgres'),
  maxConnections: z.coerce.number().int().min(1).max(100).default(20),
  connectionTimeout: z.coerce.number().int().min(1000).default(30000),
  ssl: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
});

// Server configuration schema
const serverSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  host: z.string().default('0.0.0.0'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  prettyLogs: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
});

// Outbox configuration schema
const outboxSchema = z.object({
  batchSize: z.coerce.number().int().min(1).max(1000).default(50),
  pollInterval: z.coerce.number().int().min(100).default(5000),
  maxRetries: z.coerce.number().int().min(0).default(3),
  retryDelay: z.coerce.number().int().min(100).default(1000),
  enabled: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
});

// Application configuration schema
const appConfigSchema = z.object({
  name: z.string().default('clean-orders'),
  version: z.string().default('1.0.0'),
  environment: environmentSchema,
  gracefulShutdownTimeout: z.coerce.number().int().min(1000).default(10000),
  usePostgres: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false), // Nueva opción para alternar persistencia
});

// Complete configuration schema
const configSchema = z.object({
  app: appConfigSchema,
  server: serverSchema,
  database: databaseSchema,
  outbox: outboxSchema,
});

// Type inference from schema
export type Config = z.infer<typeof configSchema>;
export type DatabaseConfig = z.infer<typeof databaseSchema>;
export type ServerConfig = z.infer<typeof serverSchema>;
export type OutboxConfig = z.infer<typeof outboxSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;

/**
 * Validates and parses environment variables into a typed configuration object
 * @throws {Error} If validation fails with detailed error messages
 */
function createConfig(): Config {
  try {
    const rawConfig = {
      app: {
        name: process.env.APP_NAME,
        version: process.env.APP_VERSION,
        environment: process.env.NODE_ENV,
        gracefulShutdownTimeout: process.env.GRACEFUL_SHUTDOWN_TIMEOUT,
        usePostgres: process.env.USE_POSTGRES,
      },
      server: {
        port: process.env.SERVER_PORT || process.env.PORT,
        host: process.env.SERVER_HOST,
        logLevel: process.env.LOG_LEVEL,
        prettyLogs: process.env.PRETTY_LOGS,
      },
      database: {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        name: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        maxConnections: process.env.DB_MAX_CONNECTIONS,
        connectionTimeout: process.env.DB_CONNECTION_TIMEOUT,
        ssl: process.env.DB_SSL,
      },
      outbox: {
        batchSize: process.env.OUTBOX_BATCH_SIZE,
        pollInterval: process.env.OUTBOX_POLL_INTERVAL,
        maxRetries: process.env.OUTBOX_MAX_RETRIES,
        retryDelay: process.env.OUTBOX_RETRY_DELAY,
        enabled: process.env.OUTBOX_ENABLED,
      },
    };

    // Validate configuration
    const validatedConfig = configSchema.parse(rawConfig);

    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(err => {
        const path = err.path.join('.');
        return `${path}: ${err.message}`;
      }).join('\n');

      throw new Error(`Configuration validation failed:\n${errorMessages}`);
    }
    throw error;
  }
}

/**
 * Gets the database connection string for PostgreSQL
 */
export function getDatabaseUrl(config: DatabaseConfig): string {
  const { host, port, name, user, password, ssl } = config;
  const sslParam = ssl ? '?sslmode=require' : '';
  return `postgresql://${user}:${password}@${host}:${port}/${name}${sslParam}`;
}

/**
 * Checks if the application is running in production environment
 */
export function isProduction(config: AppConfig): boolean {
  return config.environment === 'production';
}

/**
 * Checks if the application is running in development environment
 */
export function isDevelopment(config: AppConfig): boolean {
  return config.environment === 'development';
}

/**
 * Checks if the application is running in test environment
 */
export function isTest(config: AppConfig): boolean {
  return config.environment === 'test';
}

// Create and validate configuration
export const config = createConfig();

// Export individual configuration sections for convenience
export const { app: appConfig, server: serverConfig, database: databaseConfig, outbox: outboxConfig } = config;

// Log configuration on startup (excluding sensitive data)
if (!isTest(config.app)) {
  console.log('📋 Configuration loaded:', {
    app: {
      name: config.app.name,
      version: config.app.version,
      environment: config.app.environment,
    },
    server: {
      port: config.server.port,
      host: config.server.host,
      logLevel: config.server.logLevel,
    },
    database: {
      host: config.database.host,
      port: config.database.port,
      name: config.database.name,
      user: config.database.user,
      maxConnections: config.database.maxConnections,
      ssl: config.database.ssl,
    },
    outbox: {
      enabled: config.outbox.enabled,
      batchSize: config.outbox.batchSize,
      pollInterval: config.outbox.pollInterval,
    },
  });
}