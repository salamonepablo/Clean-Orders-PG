import Fastify from 'fastify';
import { buildContainer } from './composition/container.js';

async function main() {
    // Crear servidor Fastify
    const server = Fastify({
        logger: true
    });

    // Construir el contenedor de dependencias
    const container = buildContainer();

    // Registrar rutas
    await container.orderControllers.registerRoutes(server);

    try {
        // Iniciar el servidor
        await server.listen({ port: 3000 });
        console.log('Server running at http://localhost:3000');
    } catch (err) {
        server.log.error(err);
        process.exit(1);
    }
}

main().catch(console.error);
