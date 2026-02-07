import redisHygiene from '../config/redisHygiene.js';
import logger from '../utils/logger.js';

/**
 * Redis Hygiene Worker
 * Runs periodically to maintain Redis health
 * 
 * Schedule: Run every hour
 */
export class RedisHygieneWorker {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastRun = null;
  }

  /**
   * Start the hygiene worker
   * @param {number} intervalMs - Interval in milliseconds (default: 1 hour)
   */
  start(intervalMs = 3600000) {
    if (this.isRunning) {
      logger.warn('Redis hygiene worker is already running');
      return;
    }

    logger.info(`Starting Redis hygiene worker (interval: ${intervalMs}ms)`);

    // Run immediately on start
    this.runHygieneTasks();

    // Then run on schedule
    this.intervalId = setInterval(() => {
      this.runHygieneTasks();
    }, intervalMs);

    this.isRunning = true;
  }

  /**
   * Stop the hygiene worker
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      logger.info('Redis hygiene worker stopped');
    }
  }

  /**
   * Run all hygiene tasks
   */
  async runHygieneTasks() {
    try {
      this.lastRun = new Date();
      logger.info('Running Redis hygiene tasks...');
      const results = await redisHygiene.runAllHygieneTasks();
      logger.info('Redis hygiene tasks completed', results);
      return results;
    } catch (error) {
      logger.error('Redis hygiene worker error:', error);
    }
  }

  /**
   * Get worker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    };
  }
}

// Export singleton instance
export default new RedisHygieneWorker();
