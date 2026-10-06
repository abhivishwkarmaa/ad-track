import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend directory
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'track_myads',
  timezone: '+00:00',
};

// Helper to parse CLI flags like --email=... or --email ...
function parseArgs() {
  const args = process.argv.slice(2);
  const params = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key.includes('=')) {
        const [k, v] = key.split('=');
        params[k] = v;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        params[key] = args[i + 1];
        i++;
      } else {
        params[key] = true;
      }
    }
  }
  return params;
}

// Helper to prompt user via terminal if arguments are not provided
function promptInput(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const q = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(q, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

async function createOrUpdateSuperAdmin() {
  console.log('\n=============================================================');
  console.log('👑 SUPER ADMIN CREATION / RESET TOOL');
  console.log('=============================================================');
  console.log(`Database: ${dbConfig.database} on ${dbConfig.host}:${dbConfig.port}`);
  console.log('Purpose:  Creates a Global Super Admin (tenant_id = NULL)');
  console.log('          Required for creating & managing multi-tenants.');
  console.log('-------------------------------------------------------------\n');

  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);

    const args = parseArgs();

    let name = args.name;
    let email = args.email;
    let password = args.password;

    // Interactive fallback if not passed via command line
    if (!email) {
      email = await promptInput('Enter Super Admin Email', 'admin@tickhigh.com');
    }
    if (!name) {
      name = await promptInput('Enter Admin Full Name', 'Super Admin');
    }
    if (!password) {
      password = await promptInput('Enter Password', 'Admin@123456');
    }

    if (!email || !email.includes('@')) {
      throw new Error('A valid email address is required.');
    }
    if (!password || password.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    // Check if table admin_users exists
    const [tableCheck] = await connection.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = ? AND table_name = 'admin_users'`,
      [dbConfig.database]
    );

    if (tableCheck.length === 0) {
      throw new Error("Table 'admin_users' does not exist yet. Please run 'npm run migrate' first.");
    }

    // Hash password using bcrypt (10 rounds)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Check if user already exists
    const [existingUsers] = await connection.query(
      'SELECT id, email, name, role, tenant_id FROM admin_users WHERE email = ?',
      [email]
    );

    if (existingUsers.length > 0) {
      const user = existingUsers[0];
      console.log(`\nℹ️  User '${email}' already exists (ID: ${user.id}).`);
      console.log('🔄 Updating password and elevating to Super Admin (tenant_id = NULL)...');

      await connection.query(
        `UPDATE admin_users 
         SET password_hash = ?, 
             name = ?, 
             role = 'superadmin', 
             tenant_id = NULL, 
             must_change_password = 0, 
             updated_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [passwordHash, name, user.id]
      );

      console.log('\n=============================================================');
      console.log('✅ SUPER ADMIN CREDENTIALS UPDATED SUCCESSFULLY!');
      console.log('=============================================================');
      console.log(`👤 Name:         ${name}`);
      console.log(`📧 Email:        ${email}`);
      console.log(`🔑 Password:     ${password}`);
      console.log(`🛡️  Role:         superadmin`);
      console.log(`🌐 Tenant ID:    NULL (Global Super Admin)`);
      console.log('-------------------------------------------------------------');
      console.log('🔗 Login Portal: https://admin.yourdomain.com (or http://localhost:3000)');
      console.log('=============================================================\n');
    } else {
      console.log(`\n➕ Creating new Super Admin account for '${email}'...`);

      const [result] = await connection.query(
        `INSERT INTO admin_users (email, name, password_hash, role, tenant_id, must_change_password) 
         VALUES (?, ?, ?, 'superadmin', NULL, 0)`,
        [email, name, passwordHash]
      );

      console.log('\n=============================================================');
      console.log('🎉 SUPER ADMIN CREATED SUCCESSFULLY!');
      console.log('=============================================================');
      console.log(`🆔 User ID:      ${result.insertId}`);
      console.log(`👤 Name:         ${name}`);
      console.log(`📧 Email:        ${email}`);
      console.log(`🔑 Password:     ${password}`);
      console.log(`🛡️  Role:         superadmin`);
      console.log(`🌐 Tenant ID:    NULL (Global Super Admin Access)`);
      console.log('-------------------------------------------------------------');
      console.log('🔗 Login Portal: https://admin.yourdomain.com (or http://localhost:3000)');
      console.log('💡 Note: You can now log in and add new Tenants from the Admin Dashboard.');
      console.log('=============================================================\n');
    }
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exitCode = 1;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

createOrUpdateSuperAdmin();
