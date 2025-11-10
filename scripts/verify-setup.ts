#!/usr/bin/env node

/**
 * Script de verificación del entorno
 * Verifica que la configuración esté correcta antes de iniciar
 */

import { config } from '../src/composition/config.js';
import { createPostgresPool, checkPostgresConnection } from '../src/infrastructure/persistence/postgres/createPostgresPool.js';

async function verifyEnvironment(): Promise<void> {
    console.log('🔍 Verificando entorno...\n');

    // 1. Mostrar configuración
    console.log('📋 Configuración actual:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Entorno:         ${config.app.environment}`);
    console.log(`Persistencia:    ${config.app.usePostgres ? 'PostgreSQL' : 'In-Memory'}`);
    console.log(`Puerto:          ${config.server.port}`);
    console.log(`Host:            ${config.server.host}`);
    console.log(`Log Level:       ${config.server.logLevel}`);
    
    if (config.app.usePostgres) {
        console.log(`\n📦 Configuración PostgreSQL:`);
        console.log(`Host:            ${config.database.host}`);
        console.log(`Puerto:          ${config.database.port}`);
        console.log(`Base de datos:   ${config.database.name}`);
        console.log(`Usuario:         ${config.database.user}`);
        console.log(`SSL:             ${config.database.ssl}`);
        
        console.log(`\n📤 Configuración Outbox:`);
        console.log(`Habilitado:      ${config.outbox.enabled}`);
        console.log(`Batch Size:      ${config.outbox.batchSize}`);
        console.log(`Poll Interval:   ${config.outbox.pollInterval}ms`);
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // 2. Verificar PostgreSQL si está configurado
    if (config.app.usePostgres) {
        console.log('🔌 Verificando conexión a PostgreSQL...');
        
        const pool = createPostgresPool(config.database);
        
        try {
            const isConnected = await checkPostgresConnection(pool);
            
            if (isConnected) {
                console.log('✅ Conexión a PostgreSQL exitosa\n');
                
                // Verificar tablas
                console.log('🔍 Verificando tablas...');
                const client = await pool.connect();
                try {
                    const result = await client.query<{ table_name: string }>(`
                        SELECT table_name 
                        FROM information_schema.tables 
                        WHERE table_schema = 'public'
                        AND table_name IN ('orders', 'order_items', 'outbox', 'migrations')
                    `);
                    
                    const tables = result.rows.map((r) => r.table_name);
                    const requiredTables = ['orders', 'order_items', 'outbox', 'migrations'];
                    const missingTables = requiredTables.filter(t => !tables.includes(t));
                    
                    if (missingTables.length === 0) {
                        console.log('✅ Todas las tablas requeridas existen');
                        console.log(`   Tablas encontradas: ${tables.join(', ')}\n`);
                    } else {
                        console.log('⚠️  Faltan tablas:');
                        missingTables.forEach(t => console.log(`   - ${t}`));
                        console.log('\n💡 Ejecuta: npm run db:migrate\n');
                    }
                } finally {
                    client.release();
                }
            } else {
                console.log('❌ No se pudo conectar a PostgreSQL');
                console.log('💡 Verifica que PostgreSQL esté corriendo: npm run db:up\n');
            }
            
            await pool.end();
        } catch (error) {
            console.error('❌ Error al verificar PostgreSQL:', error);
            console.log('💡 Verifica la configuración en .env\n');
            await pool.end();
        }
    } else {
        console.log('ℹ️  Usando persistencia In-Memory');
        console.log('💡 Para usar PostgreSQL, configura: USE_POSTGRES=true\n');
    }

    // 3. Resumen
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Verificación completada\n');
    
    if (config.app.usePostgres) {
        console.log('🚀 Para iniciar la aplicación:');
        console.log('   Terminal 1: npm run dev');
        if (config.outbox.enabled) {
            console.log('   Terminal 2: npm run worker:outbox:dev');
        }
    } else {
        console.log('🚀 Para iniciar la aplicación:');
        console.log('   npm run dev');
    }
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

// Ejecutar verificación
verifyEnvironment().catch((error) => {
    console.error('💥 Error durante verificación:', error);
    process.exit(1);
});
