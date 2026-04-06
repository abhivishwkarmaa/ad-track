#!/usr/bin/env node

/**
 * Stats Worker Entry Point
 *
 * This worker handles periodic flushing of Redis stats to MySQL.
 * It runs as a separate process with its own event loop.
 *
 * Usage:
 *   node stats-worker.js
 *   # or with PM2:
 *   pm2 start stats-worker.js --name stats-worker -i 1
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import startStatsWorker from './src/workers/statsWorker.js';

// Load environment variables
dotenv.config();

async function main() {
    try {
        logger.info('🚀 Starting Stats Worker...');
        logger.info('📊 Stats flushing interval: 10 seconds');

        // Start the stats worker
        await startStatsWorker();

        // Reporting rollup lives in reporting-stats-worker.js → daily_reporting_rollup (not started here).

        // Start Redis hygiene worker (runs every hour) - moved from server.js to run as singleton here
        if (process.env.ENABLE_REDIS_HYGIENE !== 'false') {
            try {
                const redisHygieneWorker = (await import('./src/workers/redisHygieneWorker.js')).default;
                redisHygieneWorker.start(3600000); // 1 hour
                logger.info('✅ Redis hygiene worker started');
            } catch (error) {
                logger.warn('Failed to start Redis hygiene worker:', error);
            }
        }

        // Keep the process alive
        process.on('SIGTERM', () => {
            logger.info('📉 Stats Worker received SIGTERM, shutting down gracefully...');
            process.exit(0);
        });

        process.on('SIGINT', () => {
            logger.info('📉 Stats Worker received SIGINT, shutting down gracefully...');
            process.exit(0);
        });

    } catch (error) {
        logger.error('❌ Failed to start Stats Worker:', error);
        process.exit(1);
    }
}

// Start the worker
main();