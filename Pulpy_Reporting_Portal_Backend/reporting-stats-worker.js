#!/usr/bin/env node
/**
 * Entry point: only runs reporting rollup (daily_reporting_rollup).
 * Keeps this separate from stats-worker.js (Redis flush / legacy paths).
 *
 * pm2 start reporting-stats-worker.js --name reporting-stats-worker -i 1
 *
 * Env:
 *   ENABLE_REPORTING_ROLLUP_WORKER=false  — skip start (default: run)
 *   REPORTING_ROLLUP_TABLE=daily_reporting_rollup
 */
import dotenv from 'dotenv';
import logger from './src/utils/logger.js';

dotenv.config();

async function main() {
  if (process.env.ENABLE_REPORTING_ROLLUP_WORKER === 'false') {
    logger.info('[reporting-stats-worker] Disabled via ENABLE_REPORTING_ROLLUP_WORKER=false');
    return;
  }
  try {
    const { startReportingStatsAggregationWorker } = await import(
      './src/workers/reportingStatsAggregationWorker.js'
    );
    await startReportingStatsAggregationWorker();
    logger.info('✅ reporting-stats-worker running');
  } catch (e) {
    logger.error('❌ reporting-stats-worker failed:', e);
    process.exit(1);
  }

  process.on('SIGTERM', () => process.exit(0));
  process.on('SIGINT', () => process.exit(0));
}

main();
