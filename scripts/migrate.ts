#!/usr/bin/env node

import { readdir, readFile } from 'fs/promises';
import { join, extname } from 'path';
import { Client } from 'pg';
import { config } from 'dotenv';

// Load environment variables
config();

interface Migration {
  filename: string;
  order: number;
  content: string;
}

class MigrationRunner {
  private client: Client;
  private migrationsDir: string;

  constructor() {
    this.migrationsDir = join(process.cwd(), 'db', 'migrations');
    this.client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'clean_orders_db',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });
  }

  async connect(): Promise<void> {
    try {
      console.log('🔌 Connecting to database...');
      console.log(`   Host: ${process.env.DB_HOST || 'localhost'}`);
      console.log(`   Port: ${process.env.DB_PORT || '5432'}`);
      console.log(`   Database: ${process.env.DB_NAME || 'clean_orders_db'}`);
      console.log(`   User: ${process.env.DB_USER || 'postgres'}`);
      await this.client.connect();
      console.log('✅ Connected to PostgreSQL database');
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await this.client.end();
    console.log('🔌 Disconnected from database');
  }

  async createMigrationsTable(): Promise<void> {
    const query = `
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
        checksum VARCHAR(255),
        
        CONSTRAINT chk_migrations_filename_not_empty CHECK (LENGTH(TRIM(filename)) > 0)
      );
      
      CREATE INDEX IF NOT EXISTS idx_migrations_filename ON migrations(filename);
      CREATE INDEX IF NOT EXISTS idx_migrations_executed_at ON migrations(executed_at);
    `;

    try {
      await this.client.query(query);
      console.log('📋 Migrations table ready');
    } catch (error) {
      console.error('❌ Failed to create migrations table:', error);
      throw error;
    }
  }

  async getExecutedMigrations(): Promise<Set<string>> {
    try {
      const result = await this.client.query(
        'SELECT filename FROM migrations ORDER BY executed_at'
      );
      return new Set(result.rows.map(row => row.filename));
    } catch (error) {
      console.error('❌ Failed to get executed migrations:', error);
      throw error;
    }
  }

  async loadMigrations(): Promise<Migration[]> {
    try {
      console.log(`📂 Loading migrations from: ${this.migrationsDir}`);
      const files = await readdir(this.migrationsDir);
      console.log(`📄 Files found: ${files.join(', ')}`);
      
      const sqlFiles = files
        .filter(file => extname(file).toLowerCase() === '.sql')
        .sort(); // Natural alphabetical sort (001_init.sql, 002_users.sql, etc.)

      console.log(`📝 SQL files: ${sqlFiles.join(', ')}`);

      const migrations: Migration[] = [];

      for (const filename of sqlFiles) {
        const filePath = join(this.migrationsDir, filename);
        const content = await readFile(filePath, 'utf-8');
        
        // Extract order number from filename (e.g., 001_init.sql -> 1)
        const orderMatch = filename.match(/^(\d+)/);
        const order = orderMatch ? parseInt(orderMatch[1]) : 0;

        migrations.push({
          filename,
          order,
          content: content.trim()
        });
      }

      // Sort by order number to ensure correct execution sequence
      return migrations.sort((a, b) => a.order - b.order);
    } catch (error) {
      console.error('❌ Failed to load migrations:', error);
      console.error('   Error details:', error);
      throw error;
    }
  }

  async executeMigration(migration: Migration): Promise<void> {
    console.log(`🚀 Executing migration: ${migration.filename}`);
    
    try {
      // Start transaction
      await this.client.query('BEGIN');

      // Execute migration SQL
      await this.client.query(migration.content);

      // Record migration as executed
      await this.client.query(
        'INSERT INTO migrations (filename) VALUES ($1)',
        [migration.filename]
      );

      // Commit transaction
      await this.client.query('COMMIT');

      console.log(`✅ Migration completed: ${migration.filename}`);
    } catch (error) {
      // Rollback on error
      await this.client.query('ROLLBACK');
      console.error(`❌ Migration failed: ${migration.filename}`, error);
      throw error;
    }
  }

  async run(): Promise<void> {
    try {
      console.log('🔄 Starting database migration...\n');

      await this.connect();
      await this.createMigrationsTable();

      const executedMigrations = await this.getExecutedMigrations();
      const allMigrations = await this.loadMigrations();

      console.log(`📁 Found ${allMigrations.length} migration files`);
      console.log(`📋 ${executedMigrations.size} migrations already executed\n`);

      const pendingMigrations = allMigrations.filter(
        migration => !executedMigrations.has(migration.filename)
      );

      if (pendingMigrations.length === 0) {
        console.log('✨ No pending migrations to execute');
        return;
      }

      console.log(`🎯 Executing ${pendingMigrations.length} pending migrations:\n`);

      for (const migration of pendingMigrations) {
        await this.executeMigration(migration);
      }

      console.log(`\n🎉 All migrations completed successfully!`);
      console.log(`📊 Total executed: ${pendingMigrations.length} migrations`);

    } catch (error) {
      console.error('\n💥 Migration process failed:', error);
      process.exit(1);
    } finally {
      await this.disconnect();
    }
  }
}

// Run migrations when this script is executed
const runner = new MigrationRunner();
runner.run().catch((error) => {
  console.error('💥 Unhandled migration error:', error);
  process.exit(1);
});

export { MigrationRunner };
