#!/usr/bin/env node

/**
 * Redis Flushed-Click Cleanup Worker
 *
 * Standalone process. On connect, scans and deletes Redis keys every 2 minutes
 * matching click:* where HGET key 'flushed' == 'true'. Does not block the main server.
 *
 * Usage: node worker.js
 * PM2:   pm2 start worker.js --name redis-cleanup-worker
 */

import Redis from 'ioredis';
import dotenv from 'dotenv';
import logger from './src/utils/logger.js';

dotenv.config();

const LUA_CLEANUP = `
local cursor='0'
local deleted=0
repeat
  local r=redis.call('SCAN',cursor,'MATCH','click:*','COUNT',500)
  cursor=r[1]
  for _,k in ipairs(r[2]) do
    if redis.call('HGET',k,'flushed')=='true' then
      redis.call('UNLINK',k)
      deleted=deleted+1
    end
  end
until cursor=='0'
return deleted
`;

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
};

let redis = null;
let intervalId = null;
const CLEANUP_INTERVAL_MS = parseInt(process.env.REDIS_FLUSHED_CLEANUP_INTERVAL_MS || '120000', 10);

async function runCleanup() {
  if (!redis || redis.status !== 'ready') {
    logger.warn('Redis not ready, skipping cleanup run');
    return;
  }
  try {
    const deleted = await redis.eval(LUA_CLEANUP, 0);
    const count = Number(deleted);
    logger.info(`Redis cleanup: deleted ${count} flushed click key(s)`);
  } catch (err) {
    logger.error('Redis cleanup failed:', err.message);
  }
}

function start() {
  redis = new Redis(redisConfig);

  redis.on('connect', () => {
    logger.debug('Redis socket connected');
  });

  redis.on('ready', () => {
    logger.info('Redis cleanup worker: Redis ready');
    runCleanup();
    intervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
    logger.info(`Redis cleanup worker scheduled (every ${CLEANUP_INTERVAL_MS}ms)`);
  });

  redis.on('error', (err) => {
    logger.error('Redis error:', err.message);
  });

  redis.on('close', () => {
    logger.warn('Redis connection closed');
  });

  logger.info('Redis cleanup worker started');
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Redis cleanup interval stopped');
  }
  if (redis) {
    redis.disconnect();
    redis = null;
    logger.info('Redis connection closed');
  }
}

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);
  stop();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

start();
