#!/usr/bin/env node

/**
 * Event Worker Entry Point
 *
 * Handles Redis stream consumption for events and persists to DB.
 * Payable events are forwarded to conversion stream.
 */

import dotenv from 'dotenv';
import logger from './src/utils/logger.js';
import runEventWorker from './src/workers/eventWorker.js';

dotenv.config();

async function main() {
  try {
    logger.info('🚀 Starting Event Worker...');
    logger.info('👷 Redis Stream Consumer for event processing');

    await runEventWorker();

    process.on('SIGTERM', () => {
      logger.info('👷 Event Worker received SIGTERM, shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGINT', () => {
      logger.info('👷 Event Worker received SIGINT, shutting down gracefully...');
      process.exit(0);
    });
  } catch (error) {
    logger.error('❌ Failed to start Event Worker:', error);
    process.exit(1);
  }
}

main();
