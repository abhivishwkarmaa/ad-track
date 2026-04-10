import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function req(name) {
  const v = process.env[name];
  if (v === undefined || v === '') {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function int(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new Error(`Invalid integer: ${name}`);
  return n;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 3000),
  db: {
    host: req('DB_HOST'),
    port: int('DB_PORT', 3306),
    user: req('DB_USER'),
    password: req('DB_PASSWORD'),
    database: req('DB_NAME'),
    connectionLimit: int('DB_CONNECTION_LIMIT', 15),
    queueLimit: int('DB_QUEUE_LIMIT', 0),
    waitForConnections: true,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    namedPlaceholders: false,
    timezone: '+00:00',
  },
};
