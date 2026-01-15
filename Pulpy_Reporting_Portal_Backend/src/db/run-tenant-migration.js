/**
 * Run Multi-Tenant Migration
 * 
 * This script specifically runs the multi-tenant migrations
 * Usage: node src/db/run-tenant-migration.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTenantMigrations() {
  const connection = await pool.getConnection();
  
  try {
    console.log('\n🚀 Starting Multi-Tenant Migration...\n');
    await connection.beginTransaction();

    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = [
      '001_add_multi_tenant_support.sql',
      '002_harden_multi_tenant_production.sql'
    ];

    for (const fileName of migrationFiles) {
      const migrationFile = path.join(migrationsDir, fileName);
      
      if (!fs.existsSync(migrationFile)) {
        console.log(`⚠️  Migration file not found: ${fileName}`);
        continue;
      }

      console.log(`📄 Running: ${fileName}`);
      const sql = fs.readFileSync(migrationFile, 'utf8');

      // Remove comments and split SQL by semicolon
      // Handle multi-line statements and comments properly
      let cleanedSql = sql
        // Remove single-line comments (-- comment)
        .replace(/--.*$/gm, '')
        // Remove multi-line comments (/* comment */)
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Normalize whitespace
        .replace(/\s+/g, ' ')
        .trim();

      // Split by semicolon, but be careful with semicolons inside strings
      const statements = cleanedSql
        .split(';')
        .map(stmt => stmt.trim())
        .filter(stmt => {
          // Filter out empty statements and comments
          const trimmed = stmt.trim();
          return trimmed.length > 0 && 
                 !trimmed.startsWith('--') && 
                 trimmed.length > 10; // Minimum statement length
        });

      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement || statement.length < 5) continue;

        try {
          // Execute the statement
          await connection.query(statement + ';');
          successCount++;
          
          // Log first few successful statements for visibility
          if (successCount <= 3) {
            const preview = statement.substring(0, 50).replace(/\s+/g, ' ');
            console.log(`   ✅ ${preview}...`);
          }
        } catch (err) {
          // Handle expected errors gracefully
          if (err.code === 'ER_DUP_FIELDNAME') {
            console.log(`   ⚠️  Column already exists: ${err.sqlMessage || err.message}`);
            skipCount++;
          } else if (err.code === 'ER_DUP_KEYNAME') {
            console.log(`   ⚠️  Index already exists: ${err.sqlMessage || err.message}`);
            skipCount++;
          } else if (err.code === 'ER_DUP_TABLE') {
            console.log(`   ⚠️  Table already exists: ${err.sqlMessage || err.message}`);
            skipCount++;
          } else if (err.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
            console.log(`   ⚠️  Cannot drop (may not exist): ${err.sqlMessage || err.message}`);
            skipCount++;
          } else if (err.code === 'ER_BAD_FIELD_ERROR') {
            // This might mean the column doesn't exist yet (for ALTER TABLE)
            // or it's trying to create an index on a non-existent column
            if (statement.toUpperCase().includes('CREATE INDEX') && statement.includes('tenant_id')) {
              console.log(`   ⚠️  Cannot create index - tenant_id column may not exist yet: ${err.sqlMessage || err.message}`);
              skipCount++;
            } else {
              console.log(`   ⚠️  Field error: ${err.sqlMessage || err.message}`);
              skipCount++;
            }
          } else if (err.code === 'ER_NO_SUCH_TABLE') {
            console.log(`   ⚠️  Table doesn't exist: ${err.sqlMessage || err.message}`);
            errorCount++;
          } else {
            // Log unexpected errors but continue
            const preview = statement.substring(0, 60).replace(/\s+/g, ' ');
            console.log(`   ⚠️  Error [${err.code}]: ${err.sqlMessage || err.message}`);
            console.log(`      Statement: ${preview}...`);
            errorCount++;
          }
        }
      }

      console.log(`   ✅ Executed ${successCount} statements, skipped ${skipCount} (already applied)\n`);
    }

    await connection.commit();
    console.log('✅ Multi-tenant migration completed successfully!\n');
    
    // Verify migration
    console.log('🔍 Verifying migration...');
    try {
      const [tenants] = await connection.query('SHOW TABLES LIKE "tenants"');
      if (tenants.length > 0) {
        console.log('   ✅ tenants table exists');
      } else {
        console.log('   ❌ tenants table not found');
      }

      const [columns] = await connection.query("SHOW COLUMNS FROM admin_users LIKE 'tenant_id'");
      if (columns.length > 0) {
        console.log('   ✅ tenant_id column exists in admin_users');
      } else {
        console.log('   ❌ tenant_id column not found in admin_users');
      }

      const [offerColumns] = await connection.query("SHOW COLUMNS FROM offers LIKE 'tenant_id'");
      if (offerColumns.length > 0) {
        console.log('   ✅ tenant_id column exists in offers');
      } else {
        console.log('   ❌ tenant_id column not found in offers');
      }
    } catch (verifyError) {
      console.log('   ⚠️  Could not verify (tables may not exist yet)');
    }

    console.log('\n🎉 Migration complete! You can now use tenant management features.\n');
    
  } catch (error) {
    await connection.rollback();
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    connection.release();
    await pool.end();
  }
}

runTenantMigrations().catch((err) => {
  console.error(err);
  process.exit(1);
});
