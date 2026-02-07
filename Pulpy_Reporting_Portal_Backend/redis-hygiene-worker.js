#!/usr/bin/env node

/**
 * Redis Hygiene & Capacity Worker Entry Point
 *
 * This worker handles periodic Redis cleaning and emergency capacity management.
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import redisHygieneWorker from './src/workers/redisHygieneWorker.js';
import redisCapacityWorker from './src/workers/redisCapacityWorker.js';

// Load environment variables
dotenv.config();

async function main() {
    try {
        logger.info('🚀 Starting Redis Hygiene & Capacity Worker...');

        // Start Hygiene Worker (Runs every hour by default)
        const hygieneInterval = parseInt(process.env.REDIS_HYGIENE_INTERVAL_MS || '3600000');
        redisHygieneWorker.start(hygieneInterval);
        logger.info(`✅ Redis hygiene worker started (Interval: ${hygieneInterval}ms)`);

        // Start Capacity Worker (Runs every 2 minutes by default)
        const capacityInterval = parseInt(process.env.REDIS_CAPACITY_CHECK_INTERVAL_MS || '120000');
        redisCapacityWorker.start(capacityInterval);
        logger.info(`✅ Redis capacity worker started (Interval: ${capacityInterval}ms)`);

        // Handle graceful shutdowns
        const shutdown = () => {
            logger.info('👷 Redis Hygiene Worker shutting down gracefully...');
            redisHygieneWorker.stop();
            redisCapacityWorker.stop();
            process.exit(0);
        };

        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

    } catch (error) {
        logger.error('❌ Failed to start Redis Hygiene Worker:', error);
        process.exit(1);
    }
}

// Start the worker
main();
