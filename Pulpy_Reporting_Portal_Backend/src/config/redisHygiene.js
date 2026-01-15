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
   * Keeps last N entries (default: 10,000)
   */
  async trimClickStream(maxLength = 10000) {
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
      };

      logger.info('Redis hygiene tasks completed', results);
      return results;
    } catch (error) {
      logger.error('RedisHygieneService.runAllHygieneTasks error:', error);
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

      return {
        click_stream_length: streamLength,
        click_keys_count: clickKeys.length,
        conversion_keys_count: conversionKeys.length,
        dedupe_keys_count: dedupeKeys.length,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('RedisHygieneService.getQueueStats error:', error);
      throw error;
    }
  }
}

export default new RedisHygieneService();
