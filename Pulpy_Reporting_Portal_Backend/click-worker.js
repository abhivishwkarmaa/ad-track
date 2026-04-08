#!/usr/bin/env node

/**
 * Click Worker Entry Point
 *
 * This worker handles Redis Stream consumption and bulk MySQL inserts for clicks.
 * It runs as a separate process with its own event loop.
 *
 * Usage:
 *   node click-worker.js
 *   # or with PM2:
 *   pm2 start click-worker.js --name click-worker -i 1
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import runWorker from './src/workers/redisWorker.js';
import startBackfillWorker from './src/workers/clickBackfillWorker.js';

// Load environment variables
dotenv.config();

async function main() {
    try {
        logger.info('🚀 Starting Click Worker...');
        logger.info('👷 Redis Stream Consumer for click processing');

        // ✅ CRITICAL: Start Redis stream worker (processes clicks from stream)
        await runWorker();

        // ✅ CRITICAL: Start backfill worker (safety net for unflushed clicks)
        startBackfillWorker().catch(err => {
            logger.error('❌ Click backfill worker failed:', err);
        });

        // Keep the process alive
        process.on('SIGTERM', () => {
            logger.info('👷 Click Worker received SIGTERM, shutting down gracefully...');
            process.exit(0);
        });

        process.on('SIGINT', () => {
            logger.info('👷 Click Worker received SIGINT, shutting down gracefully...');
            process.exit(0);
        });

    } catch (error) {
        logger.error('❌ Failed to start Click Worker:', error);
        process.exit(1);
    }
}

// Start the worker
main();