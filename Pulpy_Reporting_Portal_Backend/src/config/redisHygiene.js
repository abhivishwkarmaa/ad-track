import redis from './redis.js';
import logger from '../utils/logger.js';

/**
 * Redis Hygiene Service
 * Ensures proper TTLs, stream trimming, and queue management
 */
export class RedisHygieneService {
  /**
   * Enforce TTLs on click data
   * Click data should expire after 30 minutes (1800 seconds)
   */
  async enforceClickTTLs() {
    try {
      const keys = await redis.keys('click:*');
      let expired = 0;
      let setTTL = 0;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // No TTL set, set it to 30 minutes
          await redis.expire(key, 1800);
          setTTL++;
        } else if (ttl === -2) {
          // Key doesn't exist (already expired)
          expired++;
        }
      }

      logger.info(`Redis hygiene: Click TTLs enforced`, {
        totalKeys: keys.length,
        ttlSet: setTTL,
        expired: expired,
      });

      return { total: keys.length, ttlSet: setTTL, expired };
    } catch (error) {
      logger.error('RedisHygieneService.enforceClickTTLs error:', error);
      throw error;
    }
  }

  /**
   * Enforce TTLs on conversion data
   * Conversion data should expire after 1 hour (3600 seconds)
   */
  async enforceConversionTTLs() {
    try {
      const keys = await redis.keys('conversion:*');
      let expired = 0;
      let setTTL = 0;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -1) {
          // No TTL set, set it to 1 hour
          await redis.expire(key, 3600);
          setTTL++;
        } else if (ttl === -2) {
          expired++;
        }
      }

      logger.info(`Redis hygiene: Conversion TTLs enforced`, {
        totalKeys: keys.length,
        ttlSet: setTTL,
        expired: expired,
      });

      return { total: keys.length, ttlSet: setTTL, expired };
    } catch (error) {
      logger.error('RedisHygieneService.enforceConversionTTLs error:', error);
      throw error;
    }
  }

  /**
   * Trim click stream to prevent unbounded growth
   * Keeps last N entries (default: 5,000; override with STREAM_CLICKS_MAX_LEN)
   */
  async trimClickStream(maxLength = parseInt(process.env.STREAM_CLICKS_MAX_LEN || '5000', 10)) {
    try {
      const streamLength = await redis.xlen('stream:clicks');

      if (streamLength > maxLength) {
        const trimCount = streamLength - maxLength;
        const trimmed = await redis.xtrim('stream:clicks', 'MAXLEN', '~', maxLength);

        logger.info(`Redis hygiene: Click stream trimmed`, {
          beforeLength: streamLength,
          afterLength: maxLength,
          trimmed: trimmed || trimCount,
        });

        return { before: streamLength, after: maxLength, trimmed: trimmed || trimCount };
      }

      return { before: streamLength, after: streamLength, trimmed: 0 };
    } catch (error) {
      logger.error('RedisHygieneService.trimClickStream error:', error);
      throw error;
    }
  }

  /**
   * Clean up expired deduplication keys
   * These should auto-expire, but clean up any that don't
   */
  async cleanupDedupeKeys() {
    try {
      const keys = await redis.keys('dedupe:*');
      let cleaned = 0;

      for (const key of keys) {
        const ttl = await redis.ttl(key);
        if (ttl === -2) {
          // Key doesn't exist
          cleaned++;
        } else if (ttl === -1) {
          // No TTL, set to 5 seconds (should be 3, but 5 is safe)
          await redis.expire(key, 5);
        }
      }

      logger.debug(`Redis hygiene: Dedupe keys cleaned`, {
        totalKeys: keys.length,
        cleaned: cleaned,
      });

      return { total: keys.length, cleaned };
    } catch (error) {
      logger.error('RedisHygieneService.cleanupDedupeKeys error:', error);
      throw error;
    }
  }

  /**
   * Run all hygiene tasks
   */
  async runAllHygieneTasks() {
    try {
      logger.info('Starting Redis hygiene tasks...');

      const results = {
        clicks: await this.enforceClickTTLs(),
        conversions: await this.enforceConversionTTLs(),
        stream: await this.trimClickStream(),
        dedupe: await this.cleanupDedupeKeys(),
        flushedClicks: await this.cleanupFlushedClicks(),
      };

      logger.info('Redis hygiene tasks completed', results);
      return results;
    } catch (error) {
      logger.error('RedisHygieneService.runAllHygieneTasks error:', error);
      throw error;
    }
  }

  /**
   * Get Redis memory statistics
   * @returns {Promise<{used: number, max: number, ratio: number}>}
   */
  async getMemoryStats() {
    try {
      const info = await redis.info('memory');
      const usedMatch = info.match(/used_memory:(\d+)/);
      const maxMatch = info.match(/maxmemory:(\d+)/);

      const used = usedMatch ? parseInt(usedMatch[1]) : 0;
      const max = maxMatch ? parseInt(maxMatch[1]) : 0;

      // If maxmemory is 0 (unlimited), ratio is 0
      const ratio = max > 0 ? used / max : 0;

      return { used, max, ratio };
    } catch (error) {
      logger.error('RedisHygieneService.getMemoryStats error:', error);
      throw error;
    }
  }

  /**
   * Cleanup flushed click data using Lua script for atomicity and performance
   * Matches 'click:*' keys and unlinks them if they have 'flushed'=='true'
   */
  async cleanupFlushedClicks() {
    try {
      const luaScript = `local cursor='0'; local deleted=0; repeat local r=redis.call('SCAN',cursor,'MATCH','click:*','COUNT',500); cursor=r[1]; for _,k in ipairs(r[2]) do if redis.call('HGET',k,'flushed')=='true' then redis.call('UNLINK',k); deleted=deleted+1; end end until cursor=='0'; return deleted`;

      const deletedCount = await redis.eval(luaScript, 0);

      if (deletedCount > 0) {
        logger.info(`Redis hygiene: Removed flushed click key(s)`, { deletedCount });
      }

      return deletedCount;
    } catch (error) {
      logger.error('RedisHygieneService.cleanupFlushedClicks error:', error);
      throw error;
    }
  }

  /**
   * Check if Redis is nearing capacity and run emergency cleanup if needed
   * @param {number} threshold - Memory usage ratio threshold (default: 0.8)
   */
  async checkCapacityAndCleanup(threshold = 0.8) {
    try {
      const stats = await this.getMemoryStats();

      // Only proceed if maxmemory is set
      if (stats.max > 0) {
        const usagePercent = (stats.ratio * 100).toFixed(2);

        if (stats.ratio >= threshold) {
          logger.warn(`🚨 Redis memory warning: Capacity at ${usagePercent}% (Threshold: ${threshold * 100}%)`);
          const deleted = await this.cleanupFlushedClicks();
          return { status: 'cleaned', usagePercent, deleted };
        }

        return { status: 'ok', usagePercent, deleted: 0 };
      }

      return { status: 'skipped', message: 'maxmemory not set' };
    } catch (error) {
      logger.error('RedisHygieneService.checkCapacityAndCleanup error:', error);
      throw error;
    }
  }

  /**
   * Get Redis queue statistics
   */
  async getQueueStats() {
    try {
      const streamLength = await redis.xlen('stream:clicks');
      const clickKeys = await redis.keys('click:*');
      const conversionKeys = await redis.keys('conversion:*');
      const dedupeKeys = await redis.keys('dedupe:*');
      const memory = await this.getMemoryStats();

      return {
        click_stream_length: streamLength,
        click_keys_count: clickKeys.length,
        conversion_keys_count: conversionKeys.length,
        dedupe_keys_count: dedupeKeys.length,
        memory_usage_percent: memory.max > 0 ? (memory.ratio * 100).toFixed(2) : 'N/A',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('RedisHygieneService.getQueueStats error:', error);
      throw error;
    }
  }
}

export default new RedisHygieneService();
