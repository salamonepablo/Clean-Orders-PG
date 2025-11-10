import { FastifyInstance } from 'fastify';
import fastify from 'fastify';
import { buildContainer, Container } from './composition/container.js';
import { config, serverConfig, appConfig } from './composition/config.js';

// Variable global para el contenedor y el servidor
let container: Container | null = null;
let server: FastifyInstance | null = null;

async function createServer(): Promise<FastifyInstance> {
    const app = fastify({
        logger: {
            level: serverConfig.logLevel,
            transport: serverConfig.prettyLogs ? {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'HH:MM:ss Z',
                    ignore: 'pid,hostname'
                }
            } : undefined
        }
    });

    // Error handler global
    app.setErrorHandler((error, _request, reply) => {
        app.log.error(error);
        reply.status(500).send({ error: 'Internal Server Error' });
    });

    return app;
}

async function startServer(app: FastifyInstance, container: Container): Promise<void> {
    try {
        // Registrar rutas
        await container.orderControllers.registerRoutes(app);

        // Iniciar servidor
        await app.listen({ 
            port: serverConfig.port, 
            host: serverConfig.host 
        });
        
        console.log(`
🚀 Server ready!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Configuration:
   Environment: ${appConfig.environment}
   Host: ${serverConfig.host}
   Port: ${serverConfig.port}
   Persistence: ${appConfig.usePostgres ? 'PostgreSQL' : 'In-Memory'}
   Outbox: ${config.outbox.enabled && appConfig.usePostgres ? 'Enabled' : 'Disabled'}

📝 Available endpoints:
   POST   http://${serverConfig.host}:${serverConfig.port}/orders
   POST   http://${serverConfig.host}:${serverConfig.port}/orders/:orderId/items

💡 Press Ctrl+C to stop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        `);
    } catch (err) {
        console.error('❌ Failed to start server:', err);
        throw err;
    }
}

/**
 * Maneja el cierre graceful de la aplicación
 */
async function shutdown(signal: string): Promise<void> {
    console.log(`\n⚠️  Received ${signal} signal`);
    console.log('🔄 Starting graceful shutdown...\n');

    const shutdownTimeout = setTimeout(() => {
        console.error('⏱️  Shutdown timeout exceeded, forcing exit');
        process.exit(1);
    }, appConfig.gracefulShutdownTimeout);

    try {
        // 1. Cerrar servidor HTTP (no aceptar más conexiones)
        if (server) {
            console.log('🛑 Closing HTTP server...');
            await server.close();
            console.log('✅ HTTP server closed');
        }

        // 2. Limpiar recursos del contenedor (DB pools, dispatchers, etc.)
        if (container) {
            await container.cleanup();
        }

        clearTimeout(shutdownTimeout);
        console.log('\n✅ Graceful shutdown complete');
        process.exit(0);
    } catch (error) {
        clearTimeout(shutdownTimeout);
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
}

/**
 * Maneja errores no capturados
 */
function handleError(error: Error): void {
    console.error('💥 Unhandled error:', error);
    shutdown('ERROR').catch(() => {
        process.exit(1);
    });
}

async function main(): Promise<void> {
    try {
        console.log('🚀 Starting Clean Orders Application...\n');

        // Construir contenedor de dependencias
        container = await buildContainer();

        // Crear servidor
        server = await createServer();

        // Iniciar servidor
        await startServer(server, container);

    } catch (error) {
        console.error('❌ Fatal error during startup:', error);
        
        // Intentar limpiar recursos si el contenedor se creó
        if (container) {
            await container.cleanup();
        }
        
        process.exit(1);
    }
}

// Registrar manejadores de señales para cierre graceful
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Manejo de errores no capturados
process.on('unhandledRejection', (reason) => {
    handleError(new Error(`Unhandled rejection: ${reason}`));
});

process.on('uncaughtException', (error) => {
    handleError(error);
});

// Ejecutar el servidor
main().catch((err) => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});