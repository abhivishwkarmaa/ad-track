#!/usr/bin/env node

/**
 * Conversion Worker Entry Point
 *
 * Handles independent processing of conversions from Redis Stream.
 * Decoupled from Click Worker.
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import runConversionWorker from './src/workers/conversionWorker.js';

// Load environment variables
dotenv.config();

async function main() {
    try {
        logger.info('🚀 Starting Conversion Worker...');
        logger.info('👷 Redis Stream Consumer for conversions');

        await runConversionWorker();

        // Keep the process alive
        process.on('SIGTERM', () => {
            logger.info('👷 Conversion Worker received SIGTERM, shutting down gracefully...');
            process.exit(0);
        });

        process.on('SIGINT', () => {
            logger.info('👷 Conversion Worker received SIGINT, shutting down gracefully...');
            process.exit(0);
        });

    } catch (error) {
        logger.error('❌ Failed to start Conversion Worker:', error);
        process.exit(1);
    }
}

// Start the worker
main();
