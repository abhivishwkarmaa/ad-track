/**
 * Orchestrates DB migrations (Single Responsibility: migration execution only).
 * Persistence rules live here; callers supply a mysql2 pool.
 */
import fs from 'fs';
import path from 'path';
import { splitSqlStatements } from './sqlStatements.js';
import {
  MIGRATIONS_DIR,
  INITIAL_SCHEMA_FILE,
  SKIP_INCREMENTAL_ON_FRESH,
  isInitialSchemaFile,
} from './migrationConfig.js';

const CORE_TABLE_CHECK = "SHOW TABLES LIKE 'conversions'";

export class MigrationRunner {
  constructor({ pool, logger = console }) {
    this.pool = pool;
    this.logger = logger;
  }

  async run() {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();

      const [tables] = await connection.query(CORE_TABLE_CHECK);
      const isFreshDatabase = tables.length === 0;

      if (isFreshDatabase) {
        await this._runInitialSchema(connection);
        this.logger.log('✅ Initial schema applied');
        if (!SKIP_INCREMENTAL_ON_FRESH) {
          await this._runIncrementalMigrations(connection);
        }
      } else {
        this.logger.log('Database already exists, applying incremental migrations...');
        await this._runIncrementalMigrations(connection);
      }

      await connection.commit();
      this.logger.log('\n🎉 All migrations completed successfully!');
    } catch (error) {
      await connection.rollback();
      this.logger.error('❌ Migration failed:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async _runInitialSchema(connection) {
    this.logger.log('Setting up fresh database with baseline schema...');
    const filePath = path.join(MIGRATIONS_DIR, INITIAL_SCHEMA_FILE);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Missing ${INITIAL_SCHEMA_FILE} at ${filePath}`);
    }
    const sql = fs.readFileSync(filePath, 'utf8');
    await this._executeStatements(connection, sql, INITIAL_SCHEMA_FILE);
  }

  async _runIncrementalMigrations(connection) {
    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql') && !isInitialSchemaFile(f))
      .sort();

    if (files.length === 0) {
      this.logger.log('No incremental migration files.');
      return;
    }

    this.logger.log(`Found ${files.length} incremental migration files: ${files.join(', ')}`);

    for (const file of files) {
      const migrationFile = path.join(MIGRATIONS_DIR, file);
      this.logger.log(`Running migration: ${file}`);
      const sql = fs.readFileSync(migrationFile, 'utf8');
      await this._executeStatements(connection, sql, file);
      this.logger.log(`✅ Completed migration: ${file}`);
    }
  }

  async _executeStatements(connection, sql, label) {
    const statements = splitSqlStatements(sql);
    for (const statement of statements) {
      try {
        await connection.query(statement);
      } catch (err) {
        if (this._isBenignDuplicateError(err)) {
          this.logger.log(`⚠️  Skipping [${label}]: ${err.message}`);
        } else if (
          err.code === 'ER_DUP_ENTRY' &&
          err.message &&
          err.message.includes('uniq_click_uuid')
        ) {
          this.logger.log(
            `⚠️  Warning: Cannot add unique constraint on click_uuid — duplicates exist. Skipping.`
          );
        } else {
          throw err;
        }
      }
    }
  }

  _isBenignDuplicateError(err) {
    return (
      err.code === 'ER_DUP_FIELDNAME' ||
      err.code === 'ER_DUP_KEYNAME' ||
      err.code === 'ER_CANT_DROP_FIELD_OR_KEY' ||
      err.code === 'ER_BAD_FIELD_ERROR'
    );
  }
}
