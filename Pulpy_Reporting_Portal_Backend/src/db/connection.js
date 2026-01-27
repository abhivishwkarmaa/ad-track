import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'pulpy_reporting',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD ? '***' : '***', // Hide password in logs
  timezone: '+00:00', // UTC ENFORCEMENT: Force UTC timezone for all connections
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true, // needed for running migration files with multiple SQL statements
};

// Log database configuration (without password)

console.log('\n' + '='.repeat(80));
console.log('🗄️  DATABASE CONNECTION INITIALIZATION');
console.log('   ┌─ Configuration ────────────────────────────────────────────────────');
console.log(`   │ Host: ${dbConfig.host}`);
console.log(`   │ Port: ${dbConfig.port}`);
console.log(`   │ Database: ${dbConfig.database}`);
console.log(`   │ User: ${dbConfig.user}`);
console.log(`   │ Password: ${dbConfig.password}`);
console.log(`   │ Max Connections: ${dbConfig.connectionLimit}`);
console.log(`   │ Wait For Connections: ${dbConfig.waitForConnections}`);
console.log(`   └────────────────────────────────────────────────────────────────────`);

// ... (imports remain the same)

// ... (dbConfig remains the same)

// ... (console logs remain the same)

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'pulpy_reporting',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  timezone: '+00:00', // UTC ENFORCEMENT
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  multipleStatements: true,
});

// --- FAULT TOLERANCE & HEALTH CHECK ---

const dbState = {
  isAvailable: true, // Optimistic start
  lastError: null,
  consecutiveFailures: 0,
  checkInterval: null
};

// Error codes that are considered transient network issues
const NETWORK_ERRORS = ['ENETUNREACH', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'PROTOCOL_CONNECTION_LOST'];

async function checkConnection() {
  try {
    // Use a dedicated connection for health check to avoid pool queue issues
    // But for simplicity/robustness with pool, getting a connection is enough
    // We use pool.query with a very short timeout if possible, but mysql2 doesn't support query timeout easily without wrapper.
    // Simple 'SELECT 1' is enough.
    await pool.query('SELECT 1');

    if (!dbState.isAvailable) {
      console.log('\n✅ DATABASE CONNECTION RECOVERED');
      dbState.isAvailable = true;
      dbState.consecutiveFailures = 0;
      dbState.lastError = null;
    }
  } catch (err) {
    dbState.lastError = err;
    // Only mark as unavailable for network/connection errors
    if (NETWORK_ERRORS.includes(err.code) || err.code === 'ECONNRESET') {
      if (dbState.isAvailable) {
        console.error(`\n❌ DATABASE CONNECTION LOST: ${err.message} (${err.code})`);
        dbState.isAvailable = false;
      }
      dbState.consecutiveFailures++;
    }
  }
}

function startHealthCheck() {
  // Initial check
  checkConnection();

  // Periodic check
  // We use a dynamic interval: fast if healthy (30s), backoff if unhealthy
  const scheduleNext = () => {
    const baseDelay = 10000; // 10s normal interval
    let delay = baseDelay;

    if (!dbState.isAvailable) {
      // Exponential backoff: 2s, 4s, 8s, 16s... max 60s
      // We want to check MORE frequently if we think it's down but want to recover fast?
      // Actually, usually you backoff to avoid hammering.
      // But for "recovery", we might want to know ASAP.
      // Let's stick to user request: "Exponential backoff ... for reconnect"
      delay = Math.min(Math.pow(2, dbState.consecutiveFailures) * 1000, 60000);
    }

    setTimeout(async () => {
      await checkConnection();
      scheduleNext();
    }, delay);
  };

  scheduleNext();
}

// Start monitoring
startHealthCheck();

// Handle pool errors (emitted for idle client errors)
pool.on('error', (err) => {
  console.error('❌ DATABASE POOL ERROR:', err.message);
  if (NETWORK_ERRORS.includes(err.code)) {
    dbState.isAvailable = false;
    checkConnection(); // Trigger immediate check
  }
});

pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const dbHealth = {
  isAvailable: () => dbState.isAvailable,
  getLastError: () => dbState.lastError,
  checkNow: checkConnection
};

// ✅ QUERY TIMEOUT WRAPPER: Prevent queries from hanging under high load
export const queryWithTimeout = async (query, params = [], timeoutMs = 10000) => {
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Query timeout after ${timeoutMs}ms: ${query.substring(0, 100)}...`));
    }, timeoutMs);

    try {
      const result = await pool.query(query, params);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
};

// Original connection test with side effect of setting initial state
pool.query('SELECT NOW(), UTC_TIMESTAMP(), VERSION()')
  .then(([rows]) => {
    const result = Array.isArray(rows) ? rows[0] : rows;
    console.log('   ┌─ Connection Test ────────────────────────────────────────────────────');
    console.log('   │ Status: ✅ SUCCESS');
    console.log(`   │ MySQL Version: ${result['VERSION()']}`);
    console.log('   └────────────────────────────────────────────────────────────────────\n');
    dbState.isAvailable = true;
  })
  .catch((err) => {
    console.error('   ┌─ Connection Test ────────────────────────────────────────────────────');
    console.error('   │ Status: ❌ FAILED');
    console.error(`   │ Error: ${err.message}`);
    console.error('   └────────────────────────────────────────────────────────────────────\n');
    // If initial connection fails, we set available = false immediately
    if (NETWORK_ERRORS.includes(err.code)) {
      dbState.isAvailable = false;
    }
  });

export default pool;

