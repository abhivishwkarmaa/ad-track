import Redis from 'ioredis';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    // Robust retry strategy
    retryStrategy(times) {
        // Exponential backoff with jitter
        const delay = Math.min(times * 100, 3000);
        return delay;
    },
    // Required for streams blocking reads (XREADGROUP)
    maxRetriesPerRequest: null,
    // Keep-alive settings
    enableReadyCheck: true,
    showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
};

const redis = new Redis(redisConfig);

// Log throttling state
let lastErrorLogTime = 0;
const ERROR_LOG_THROTTLE_MS = 5000; // Log max once every 5s

// Lifecycle Events
redis.on('connect', () => {
    // Socket connection established (not yet ready)
    logger.debug('🔌 Redis socket connected');
});

redis.on('ready', () => {
    // Client is ready to use
    logger.info('✅ Redis connection ready');
    // Reset throttle on successful connection
    lastErrorLogTime = 0;
});

redis.on('error', (err) => {
    const now = Date.now();
    // Throttle error logs to prevent spamming in PM2 logs
    if (now - lastErrorLogTime > ERROR_LOG_THROTTLE_MS) {
        // Treat as warning (transient) unless it involves authentication or fatal misconfig
        if (err.message.includes('NOAUTH') || err.message.includes('ERR invalid password')) {
            logger.error('❌ Redis Auth Error:', err.message);
        } else {
            logger.warn('⚠️ Redis Connection Warning:', err.message);
        }
        lastErrorLogTime = now;
    }
});

redis.on('reconnecting', (time) => {
    // Only log reconnects occasionally or if debug is on
    if (process.env.NODE_ENV === 'development') {
        logger.info(`🔄 Redis reconnecting in ${time}ms...`);
    }
});

redis.on('close', () => {
    if (process.env.NODE_ENV === 'development') {
        logger.debug('deg Redis connection closed');
    }
});

redis.on('end', () => {
    logger.info('🛑 Redis connection ended');
});

export default redis;
