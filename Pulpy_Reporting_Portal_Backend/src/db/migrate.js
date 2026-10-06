import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, 'migrations');

async function runMigrations() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 DATABASE MIGRATION RUNNER');
  console.log('='.repeat(70));

  try {
    // 1. Ensure schema_migrations history table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS \`schema_migrations\` (
        \`id\` int unsigned NOT NULL AUTO_INCREMENT,
        \`filename\` varchar(255) NOT NULL,
        \`executed_at\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uniq_filename\` (\`filename\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Fetch list of already executed migrations
    const [rows] = await pool.query('SELECT filename FROM `schema_migrations`');
    const executedFiles = new Set(rows.map(r => r.filename));

    // 3. Read all .sql files in migrations directory in ascending order
    if (!fs.existsSync(migrationsDir)) {
      console.log(`⚠️ Migrations directory not found: ${migrationsDir}`);
      process.exit(0);
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('ℹ️ No migration files found to execute.');
      process.exit(0);
    }

    console.log(`📦 Found ${migrationFiles.length} migration file(s) in src/db/migrations/\n`);

    let appliedCount = 0;
    let skippedCount = 0;

    for (const file of migrationFiles) {
      if (executedFiles.has(file)) {
        console.log(`⏭️  [SKIP] ${file} — (already executed, no changes made)`);
        skippedCount++;
        continue;
      }

      console.log(`⏳ [RUNNING] ${file}...`);
      const filePath = path.join(migrationsDir, file);
      const sqlContent = fs.readFileSync(filePath, 'utf-8');

      // Execute SQL migration script (multipleStatements is enabled on pool)
      await pool.query(sqlContent);

      // Record in schema_migrations so it NEVER runs again
      await pool.query('INSERT INTO `schema_migrations` (`filename`) VALUES (?)', [file]);

      console.log(`✅ [APPLIED] ${file}`);
      appliedCount++;
    }

    console.log('\n' + '-'.repeat(70));
    console.log(`🎉 Migration Run Complete: ${appliedCount} applied, ${skippedCount} skipped.`);
    if (appliedCount === 0) {
      console.log('✨ All migrations are already up to date. ZERO changes were made to the database.');
    } else {
      console.log('✨ New migrations successfully recorded in schema_migrations.');
    }
    console.log('='.repeat(70) + '\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ MIGRATION FAILED:', error.message);
    console.error(error);
    process.exit(1);
  }
}

runMigrations();
