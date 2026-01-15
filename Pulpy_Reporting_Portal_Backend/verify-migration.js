/**
 * Verify Multi-Tenant Migration
 * Quick script to check if migration was successful
 */

import pool from './src/db/connection.js';

async function verifyMigration() {
  try {
    console.log('\n🔍 Verifying Multi-Tenant Migration...\n');

    // Check tenants table
    const [tenants] = await pool.query('SHOW TABLES LIKE "tenants"');
    if (tenants.length > 0) {
      console.log('✅ tenants table exists');
    } else {
      console.log('❌ tenants table NOT found');
      await pool.end();
      return;
    }

    // Check tenant_id in key tables
    const tables = [
      'admin_users',
      'advertisers',
      'offers',
      'publishers',
      'clicks',
      'conversions',
      'impressions',
      'publisher_offers',
      'daily_offer_stats',
      'affiliate_postback_logs'
    ];

    console.log('\n📋 Checking tenant_id columns:');
    let allGood = true;

    for (const table of tables) {
      try {
        const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE 'tenant_id'`);
        if (columns.length > 0) {
          console.log(`   ✅ ${table}.tenant_id exists`);
        } else {
          console.log(`   ❌ ${table}.tenant_id NOT found`);
          allGood = false;
        }
      } catch (err) {
        if (err.code === 'ER_NO_SUCH_TABLE') {
          console.log(`   ⚠️  Table '${table}' doesn't exist (may be normal)`);
        } else {
          console.log(`   ❌ Error checking ${table}: ${err.message}`);
          allGood = false;
        }
      }
    }

    // Check foreign keys
    console.log('\n📋 Checking foreign keys:');
    try {
      const [fks] = await pool.query(`
        SELECT 
          TABLE_NAME,
          CONSTRAINT_NAME,
          REFERENCED_TABLE_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE REFERENCED_TABLE_NAME = 'tenants'
        AND TABLE_SCHEMA = DATABASE()
      `);
      
      if (fks.length > 0) {
        console.log(`   ✅ Found ${fks.length} foreign keys to tenants table`);
        fks.slice(0, 5).forEach(fk => {
          console.log(`      - ${fk.TABLE_NAME}.${fk.CONSTRAINT_NAME}`);
        });
        if (fks.length > 5) {
          console.log(`      ... and ${fks.length - 5} more`);
        }
      } else {
        console.log(`   ⚠️  No foreign keys found (may need to run migration)`);
      }
    } catch (err) {
      console.log(`   ⚠️  Could not check foreign keys: ${err.message}`);
    }

    console.log('\n' + '='.repeat(60));
    if (allGood) {
      console.log('✅ Migration verification: SUCCESS');
      console.log('   All tenant_id columns exist!');
    } else {
      console.log('⚠️  Migration verification: PARTIAL');
      console.log('   Some columns may be missing. Re-run migration if needed.');
    }
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('❌ Verification error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyMigration();
