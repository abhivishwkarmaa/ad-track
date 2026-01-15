/**
 * Setup Test Admin User
 * Creates a super admin user for testing
 */

import pool from '../db/connection.js';
import bcrypt from 'bcrypt';

const TEST_ADMIN = {
  email: 'test-admin@example.com',
  name: 'Test Admin',
  password: 'testpass123',
  role: 'admin',
  tenant_id: null // Super admin
};

async function setupTestAdmin() {
  try {
    console.log('🔧 Setting up test admin user...');
    
    // Check if admin already exists
    const [existing] = await pool.query(
      'SELECT id FROM admin_users WHERE email = ?',
      [TEST_ADMIN.email]
    );

    if (existing && existing.length > 0) {
      console.log('✅ Test admin already exists');
      console.log(`   Email: ${TEST_ADMIN.email}`);
      console.log(`   Password: ${TEST_ADMIN.password}`);
      await pool.end();
      return;
    }

    // Check if tenant_id column exists
    let hasTenantIdColumn = false;
    try {
      const [columns] = await pool.query(
        "SHOW COLUMNS FROM admin_users LIKE 'tenant_id'"
      );
      hasTenantIdColumn = columns && columns.length > 0;
    } catch (e) {
      // Column doesn't exist
      hasTenantIdColumn = false;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(TEST_ADMIN.password, 10);

    // Create admin user (with or without tenant_id)
    if (hasTenantIdColumn) {
      await pool.query(
        'INSERT INTO admin_users (email, name, password_hash, role, tenant_id) VALUES (?, ?, ?, ?, ?)',
        [TEST_ADMIN.email, TEST_ADMIN.name, passwordHash, TEST_ADMIN.role, TEST_ADMIN.tenant_id]
      );
    } else {
      await pool.query(
        'INSERT INTO admin_users (email, name, password_hash, role) VALUES (?, ?, ?, ?)',
        [TEST_ADMIN.email, TEST_ADMIN.name, passwordHash, TEST_ADMIN.role]
      );
    }

    console.log('✅ Test admin created successfully!');
    console.log(`   Email: ${TEST_ADMIN.email}`);
    console.log(`   Password: ${TEST_ADMIN.password}`);
    console.log(`   Role: ${TEST_ADMIN.role}`);
    if (hasTenantIdColumn) {
      console.log(`   Tenant ID: ${TEST_ADMIN.tenant_id} (Super Admin)`);
    } else {
      console.log(`   Note: tenant_id column not found (migration may not be run yet)`);
    }
    
  } catch (error) {
    console.error('❌ Error setting up test admin:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

setupTestAdmin();
