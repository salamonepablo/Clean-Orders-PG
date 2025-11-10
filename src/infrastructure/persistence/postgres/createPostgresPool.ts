import { Pool, PoolConfig } from 'pg';
import { DatabaseConfig } from '@composition/config.js';

/**
 * Crea un pool de conexiones a PostgreSQL con la configuración proporcionada
 */
export function createPostgresPool(config: DatabaseConfig): Pool {
    const poolConfig: PoolConfig = {
        host: config.host,
        port: config.port,
        database: config.name,
        user: config.user,
        password: config.password,
        max: config.maxConnections,
        connectionTimeoutMillis: config.connectionTimeout,
        idleTimeoutMillis: 30000,
    };

    // Solo configurar SSL si está explícitamente habilitado
    if (config.ssl) {
        poolConfig.ssl = { rejectUnauthorized: false };
    }

    const pool = new Pool(poolConfig);

    // Event handlers para monitoreo
    pool.on('connect', () => {
        console.log('🔌 New PostgreSQL connection established');
    });

    pool.on('error', (err) => {
        console.error('❌ Unexpected error on idle PostgreSQL client:', err);
    });

    pool.on('remove', () => {
        console.log('🔌 PostgreSQL connection removed from pool');
    });

    return pool;
}

/**
 * Verifica la conexión al pool de PostgreSQL
 */
export async function checkPostgresConnection(pool: Pool): Promise<boolean> {
    try {
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        console.log('✅ PostgreSQL connection verified');
        return true;
    } catch (error) {
        console.error('❌ PostgreSQL connection failed:', error);
        return false;
    }
}
