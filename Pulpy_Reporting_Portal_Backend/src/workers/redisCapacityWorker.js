import redisHygiene from '../config/redisHygiene.js';
import logger from '../utils/logger.js';

/**
 * Redis Capacity Worker
 * Monitors Redis memory usage and runs emergency cleanup if capacity exceeds 80%
 * 
 * Schedule: Run every 2 minutes by default
 */
export class RedisCapacityWorker {
    constructor() {
        this.intervalId = null;
        this.isRunning = false;
        this.lastRun = null;
    }

    /**
     * Start the capacity worker
     * @param {number} intervalMs - Interval in milliseconds (default: 2 minutes)
     */
    start(intervalMs = 120000) {
        if (this.isRunning) {
            logger.warn('Redis capacity worker is already running');
            return;
        }

        // Load from environment if available
        const threshold = parseFloat(process.env.REDIS_CAPACITY_THRESHOLD || '0.8');

        logger.info(`Starting Redis capacity worker (interval: ${intervalMs}ms, threshold: ${threshold * 100}%)`);

        // Run immediately on start
        this.checkCapacity(threshold);

        // Then run on schedule
        this.intervalId = setInterval(() => {
            this.checkCapacity(threshold);
        }, intervalMs);

        this.isRunning = true;
    }

    /**
     * Stop the capacity worker
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.isRunning = false;
            logger.info('Redis capacity worker stopped');
        }
    }

    /**
     * Check capacity and cleanup if needed
     */
    async checkCapacity(threshold = 0.8) {
        try {
            this.lastRun = new Date();

            const flushedDeleted = await redisHygiene.cleanupFlushedClicks();
            if (flushedDeleted > 0) {
                logger.info(`Redis flushed click cleanup: ${flushedDeleted} key(s) removed`);
            }

            const result = await redisHygiene.checkCapacityAndCleanup(threshold);

            if (result.status === 'cleaned') {
                logger.info(`Redis capacity cleanup successful: ${result.deleted} keys removed at ${result.usagePercent}% usage`);
            } else if (result.status === 'ok') {
                // Use debug to avoid spamming logs unless it's cleaning
                logger.debug(`Redis capacity check: OK (${result.usagePercent}%)`);
            }

            return result;
        } catch (error) {
            logger.error('Redis capacity worker error:', error);
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
export default new RedisCapacityWorker();
