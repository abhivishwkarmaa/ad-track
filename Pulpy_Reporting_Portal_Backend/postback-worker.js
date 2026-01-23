/**
 * 🔄 POSTBACK WORKER — Redis-First Architecture
 *
 * Consumes Redis Streams for async postback processing:
 * - stream:postback_processing (Redis miss cases)
 * - stream:conversion_processing (Redis hit cases)
 *
 * Handles all DB operations that were removed from HTTP path.
 */

import redis from './src/config/redis.js';
import pool from './src/db/connection.js';
import logger from './src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from './src/utils/ipExtractor.js';
import assignmentService from './src/services/assignmentService.js';
import offerService from './src/services/offer.service.js';
import publisherService from './src/services/publisherService.js';
import { replaceMacros } from './src/utils/urlGenerator.js';

class PostbackWorker {
  constructor() {
    this.isRunning = false;
    this.consumerGroup = 'postback_workers';
    this.consumerName = `worker_${process.pid}_${Date.now()}`;
    this.streams = ['stream:postback_processing', 'stream:conversion_processing'];

    // Metrics
    this.metrics = {
      processed: 0,
      errors: 0,
      redis_hits_processed: 0,
      redis_misses_processed: 0,
      duplicates_found: 0,
      start_time: Date.now()
    };

    // Redis metrics keys
    this.metricsKeys = {
      postback_processed: 'metrics:postback:processed',
      postback_errors: 'metrics:postback:errors',
      redis_hits: 'metrics:postback:redis_hits',
      redis_misses: 'metrics:postback:redis_misses',
      duplicates: 'metrics:postback:duplicates',
      postback_success: 'metrics:postback:success',
      postback_failure: 'metrics:postback:failure',
      queue_depth_postback: 'metrics:queue:postback_processing:depth',
      queue_depth_conversion: 'metrics:queue:conversion_processing:depth',
      processing_lag: 'metrics:postback:processing_lag'
    };
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Postback worker already running');
      return;
    }

    this.isRunning = true;
    logger.info(`🚀 Starting postback worker: ${this.consumerName}`);

    // Create consumer groups if they don't exist
    await this.ensureConsumerGroups();

    // Start processing loop
    this.processLoop();
  }

  async stop() {
    this.isRunning = false;
    logger.info('🛑 Stopping postback worker');
  }

  async ensureConsumerGroups() {
    for (const stream of this.streams) {
      try {
        await redis.xgroup('CREATE', stream, this.consumerGroup, '0', 'MKSTREAM');
        logger.info(`Created consumer group for stream: ${stream}`);
      } catch (error) {
        if (error.message.includes('BUSYGROUP')) {
          // Group already exists
          logger.debug(`Consumer group already exists for: ${stream}`);
        } else {
          logger.error(`Failed to create consumer group for ${stream}:`, error);
        }
      }
    }
  }

  async processLoop() {
    let metricsUpdateCounter = 0;

    while (this.isRunning) {
      try {
        // Read from both streams
        const result = await redis.xreadgroup(
          'GROUP', this.consumerGroup, this.consumerName,
          'COUNT', 10,  // Process up to 10 messages at a time
          'BLOCK', 5000, // Block for 5 seconds if no messages
          'STREAMS', ...this.streams, '>', '>'
        );

        if (!result || result.length === 0) {
          // Update queue depth metrics periodically even when idle
          metricsUpdateCounter++;
          if (metricsUpdateCounter >= 60) { // Every ~5 minutes (60 * 5s blocks)
            await this.updateQueueDepthMetrics();
            metricsUpdateCounter = 0;
          }
          continue; // No messages, continue loop
        }

        // Process messages from each stream
        for (const [streamName, messages] of result) {
          for (const [messageId, messageData] of messages) {
            await this.processMessage(streamName, messageId, messageData);
          }
        }

        // Update queue depth metrics after processing batch
        await this.updateQueueDepthMetrics();

      } catch (error) {
        logger.error('Error in postback worker loop:', error);
        this.metrics.errors++;
        await this.updateMetrics('errors', 1);

        // Back off on errors
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  async processMessage(streamName, messageId, messageData) {
    try {
      const data = JSON.parse(messageData[1]); // messageData is [field1, value1, field2, value2...]

      if (streamName === 'stream:postback_processing') {
        // Redis miss case - need to resolve attribution from DB
        await this.processBufferedPostback(data, messageId);
      } else if (streamName === 'stream:conversion_processing') {
        // Redis hit case - conversion data ready, just write to DB
        await this.processConversion(data, messageId);
      }

      // Acknowledge message
      await redis.xack(streamName, this.consumerGroup, messageId);
      this.metrics.processed++;
      await this.updateMetrics('processed', 1);

    } catch (error) {
      logger.error(`Failed to process message ${messageId} from ${streamName}:`, error);
      this.metrics.errors++;
      await this.updateMetrics('errors', 1);

      // TODO: Implement dead letter queue for persistent failures
      // For now, just acknowledge to prevent infinite retries
      try {
        await redis.xack(streamName, this.consumerGroup, messageId);
      } catch (ackError) {
        logger.error(`Failed to ack failed message ${messageId}:`, ackError);
      }
    }
  }

  /**
   * Process Redis miss case: Resolve attribution and create conversion
   */
  async processBufferedPostback(postbackData, messageId) {
    const { click_id, rcid, amount, status, tenant_id, ip, timestamp, postback_payload, retry_count = 0 } = postbackData;

    logger.info(`🔍 Processing buffered postback: ${click_id || rcid}`);

    try {
      // 1. Deduplication check - FIRST (before any DB work)
      if (rcid) {
        // Check Redis deduplication cache (fast check)
        const dedupeKey = `dedupe:rcid:${tenant_id}:${rcid}`;
        const existingConversionId = await redis.get(dedupeKey);

        if (existingConversionId) {
          logger.info(`🔄 Redis dedupe hit: ${rcid} -> conversion ${existingConversionId}`);
          this.metrics.duplicates_found++;
          return;
        }

        // Check DB for existing conversion
        const [existing] = await pool.query(
          'SELECT id FROM conversions WHERE rcid = ? AND tenant_id = ? LIMIT 1',
          [rcid, tenant_id]
        );
        if (existing.length > 0) {
          // Cache in Redis for future fast lookups
          await redis.setex(dedupeKey, 86400, existing[0].id.toString()); // 24h TTL
          logger.info(`🔄 DB dedupe hit: ${rcid} -> conversion ${existing[0].id}`);
          this.metrics.duplicates_found++;
          return;
        }
      }

      // 2. Click validation - ensure click exists and belongs to tenant
      let click = null;
      if (click_id) {
        const [clickRows] = await pool.query(
          'SELECT * FROM clicks WHERE click_uuid = ? AND tenant_id = ?',
          [click_id, tenant_id]
        );
        click = clickRows[0];

        if (!click) {
          logger.warn(`❌ Click not found or wrong tenant: ${click_id} (tenant: ${tenant_id})`);
          return;
        }
      }

      // 3. If no click found, try resolving via rcid (for cases where rcid exists in other conversions)
      if (!click && rcid) {
        const [clickRows] = await pool.query(
          'SELECT c.* FROM clicks c INNER JOIN conversions conv ON c.click_uuid = conv.click_uuid WHERE conv.rcid = ? AND c.tenant_id = ? LIMIT 1',
          [rcid, tenant_id]
        );
        click = clickRows[0];
      }

      if (!click && !rcid) {
        logger.warn(`❌ Cannot process postback without click or rcid: ${click_id || rcid}`);
        return;
      }

      // 4. Get offer and perform all validation logic
      let offerId = click?.offer_id;
      let publisherId = click?.publisher_id;
      let publisherOfferId = click?.publisher_offer_id;

      if (!offerId && rcid) {
        // Try to find offer from existing conversions
        const [convRows] = await pool.query(
          'SELECT offer_id, publisher_id, publisher_offer_id FROM conversions WHERE rcid = ? AND tenant_id = ? LIMIT 1',
          [rcid, tenant_id]
        );
        if (convRows.length > 0) {
          offerId = convRows[0].offer_id;
          publisherId = convRows[0].publisher_id;
          publisherOfferId = convRows[0].publisher_offer_id;
        }
      }

      if (!offerId) {
        logger.warn(`❌ Cannot determine offer_id for postback: ${click_id || rcid}`);
        return;
      }

      // 5. Get offer and validate
      const offer = await offerService.getOfferById(offerId, tenant_id);
      if (!offer) {
        logger.warn(`❌ Offer not found: ${offerId}`);
        return;
      }

      // 6. Perform all the complex business logic
      const conversionData = await this.buildConversionData({
        click,
        offer,
        rcid,
        amount: amount || offer.affiliate_amount,
        status: status || 'approved',
        tenant_id,
        ip,
        postback_payload
      });

      // 7. Check caps and create conversion
      await this.createConversion(conversionData);

      this.metrics.redis_misses_processed++;
      await this.updateMetrics('redis_misses', 1);
      logger.info(`✅ Processed buffered postback: ${click_id || rcid}`);

    } catch (error) {
      logger.error(`Failed to process buffered postback:`, error);

      // Implement retry logic with exponential backoff
      if (retry_count < 3) {
        const backoffMs = Math.pow(2, retry_count) * 1000; // 1s, 2s, 4s
        setTimeout(async () => {
          await this.retryPostback(postbackData, retry_count + 1);
        }, backoffMs);
      } else {
        logger.error(`❌ Giving up on postback after ${retry_count} retries: ${click_id || rcid}`);
      }
    }
  }

  /**
   * Process Redis hit case: Write conversion to DB
   */
  async processConversion(conversionData, messageId) {
    try {
      await this.createConversion(conversionData);
      this.metrics.redis_hits_processed++;
      await this.updateMetrics('redis_hits', 1);
      logger.info(`✅ Processed Redis-hit conversion: ${conversionData.click_uuid}`);
    } catch (error) {
      logger.error(`Failed to process Redis-hit conversion:`, error);
      throw error;
    }
  }

  /**
   * Build complete conversion data with all business logic
   */
  async buildConversionData({ click, offer, rcid, amount, status, tenant_id, ip, postback_payload }) {
    const publisherId = click?.publisher_id;
    const publisherOfferId = click?.publisher_offer_id;

    // Get assignment
    let assignment = null;
    if (publisherOfferId) {
      assignment = await assignmentService.findById(publisherOfferId, tenant_id);
    }

    // Calculate payout
    let payout = parseFloat(offer.affiliate_amount);
    if (assignment?.payout_override) {
      payout = parseFloat(assignment.payout_override);
    }

    // Determine status based on assignment approval percentage
    let finalStatus = status;
    if (assignment?.conversion_approval_percentage) {
      const randomValue = Math.random() * 100;
      finalStatus = randomValue <= parseFloat(assignment.conversion_approval_percentage) ? 'approved' : 'pending';
    }

    return {
      conversion_uuid: uuidv4(),
      click_uuid: click?.click_uuid || null,
      offer_id: offer.id,
      publisher_id: publisherId,
      publisher_offer_id: publisherOfferId,
      tenant_id,
      rcid: rcid || click?.rcid || uuidv4(),
      status: finalStatus,
      amount: parseFloat(amount),
      payout,
      ip,
      postback_payload: JSON.stringify(postback_payload),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Create conversion in DB with all validations and side effects
   */
  async createConversion(conversionData) {
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // 1. FINAL deduplication check (in case of race conditions)
      if (conversionData.rcid) {
        const [existing] = await connection.query(
          'SELECT id FROM conversions WHERE rcid = ? AND tenant_id = ? LIMIT 1',
          [conversionData.rcid, conversionData.tenant_id]
        );
        if (existing.length > 0) {
          logger.info(`🔄 Race condition dedupe: ${conversionData.rcid} already exists`);
          await connection.rollback();
          this.metrics.duplicates_found++;
          return;
        }
      }

      // 2. Check caps
      const capExceeded = await this.checkCaps(conversionData, connection);
      if (capExceeded) {
        conversionData.status = 'rejected_cap';
        conversionData.amount = 0;
        conversionData.payout = 0;
      }

      // 3. Insert conversion with IGNORE to handle any remaining duplicates
      const [insertResult] = await connection.query(
        `INSERT IGNORE INTO conversions (
          conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
          rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          conversionData.conversion_uuid,
          conversionData.click_uuid,
          conversionData.offer_id,
          conversionData.publisher_id,
          conversionData.publisher_offer_id,
          conversionData.tenant_id,
          conversionData.rcid,
          conversionData.status,
          conversionData.amount,
          conversionData.payout,
          conversionData.ip,
          conversionData.postback_payload,
          conversionData.timestamp
        ]
      );

      // Check if insert was successful (not ignored due to duplicate)
      if (insertResult.affectedRows === 0) {
        logger.info(`🔄 Insert ignored (duplicate): ${conversionData.rcid}`);
        await connection.rollback();
        this.metrics.duplicates_found++;
        return;
      }

      // 4. Update daily stats (only for non-rejected conversions)
      if (conversionData.status !== 'rejected_cap') {
        await this.updateDailyStats(conversionData.offer_id, conversionData.amount, conversionData.payout, connection);
      }

      // 5. Send publisher postback
      await this.sendPublisherPostbackIfNeeded(conversionData, connection);

      await connection.commit();

      // 6. Cache deduplication key in Redis (for fast future lookups)
      if (conversionData.rcid) {
        const dedupeKey = `dedupe:rcid:${conversionData.tenant_id}:${conversionData.rcid}`;
        await redis.setex(dedupeKey, 86400, insertResult.insertId.toString()); // 24h TTL
      }

      logger.info(`💾 Created conversion: ${conversionData.conversion_uuid}`);

    } catch (error) {
      await connection.rollback();

      // Handle duplicate key errors gracefully
      if (error.code === 'ER_DUP_ENTRY') {
        logger.info(`🔄 Duplicate key error handled: ${conversionData.rcid}`);
        this.metrics.duplicates_found++;
        return;
      }

      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Check various cap limits
   */
  async checkCaps(conversionData, connection) {
    const { offer_id, publisher_id, tenant_id } = conversionData;

    // Offer-level caps
    const offer = await offerService.getOfferById(offer_id, tenant_id);
    if (await this.isCapExceeded(offer, tenant_id, connection)) {
      return true;
    }

    // Assignment-level caps
    if (conversionData.publisher_offer_id) {
      const assignment = await assignmentService.findById(conversionData.publisher_offer_id, tenant_id);
      if (assignment) {
        if (await this.isAssignmentBudgetCapHit(assignment, offer_id, publisher_id, tenant_id, connection)) {
          return true;
        }
        if (await this.isAssignmentConversionCapHit(assignment, offer_id, publisher_id, tenant_id, connection)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Update daily stats
   */
  async updateDailyStats(offerId, revenue, payout, connection = pool) {
    const today = new Date().toISOString().split('T')[0];
    const profit = revenue - payout;

    await connection.query(
      `INSERT INTO daily_offer_stats (offer_id, day, conversions, revenue, payout, profit, created_at, updated_at)
       VALUES (?, ?, 1, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         conversions = daily_offer_stats.conversions + 1,
         revenue = daily_offer_stats.revenue + VALUES(revenue),
         payout = daily_offer_stats.payout + VALUES(payout),
         profit = daily_offer_stats.profit + VALUES(profit),
         updated_at = UTC_TIMESTAMP()`,
      [offerId, today, revenue, payout, profit]
    );
  }

  /**
   * Send postback to publisher if configured
   */
  async sendPublisherPostbackIfNeeded(conversionData, connection) {
    try {
      const postbackResults = [];

      // 1. Send to assignment-specific callback URL (highest priority)
      if (conversionData.publisher_offer_id) {
        try {
          const assignment = await assignmentService.findById(conversionData.publisher_offer_id, conversionData.tenant_id);
          if (assignment?.callback_url) {
            logger.info(`📤 Sending assignment postback for conversion ${conversionData.conversion_uuid}`);
            const result = await this.sendPublisherPostback(assignment.callback_url, conversionData, null, {
              ip: conversionData.ip,
              tenantId: conversionData.tenant_id
            });
            postbackResults.push({
              type: 'assignment',
              url: assignment.callback_url,
              success: result.success,
              http_status: result.http_status,
              response_body: result.response_body,
              execution_time_ms: result.execution_time_ms,
              assignment_id: conversionData.publisher_offer_id,
              publisher_id: conversionData.publisher_id
            });
          }
        } catch (error) {
          logger.error(`❌ Assignment postback failed for conversion ${conversionData.conversion_uuid}:`, error.message);
          postbackResults.push({
            type: 'assignment',
            url: assignment?.callback_url || null,
            success: false,
            error: error.message,
            execution_time_ms: Date.now() - Date.now(), // Minimal time
            assignment_id: conversionData.publisher_offer_id,
            publisher_id: conversionData.publisher_id
          });
        }
      }

      // 2. Send to publisher's global postback URL (fallback/secondary)
      if (conversionData.publisher_id) {
        try {
          const publisher = await publisherService.findById(conversionData.publisher_id, conversionData.tenant_id);
          if (publisher?.global_postback_url) {
            // Only send if we haven't already sent to assignment callback, or if global is different
            const alreadySentToAssignment = postbackResults.some(r =>
              r.type === 'assignment' && r.url === publisher.global_postback_url
            );

            if (!alreadySentToAssignment) {
              logger.info(`📤 Sending global postback for conversion ${conversionData.conversion_uuid}`);
              const result = await this.sendPublisherPostback(publisher.global_postback_url, conversionData, null, {
                ip: conversionData.ip,
                tenantId: conversionData.tenant_id
              });
              postbackResults.push({
                type: 'global',
                url: publisher.global_postback_url,
                success: result.success,
                http_status: result.http_status,
                response_body: result.response_body,
                execution_time_ms: result.execution_time_ms,
                publisher_id: conversionData.publisher_id
              });
            }
          }
        } catch (error) {
          logger.error(`❌ Global postback failed for conversion ${conversionData.conversion_uuid}:`, error.message);
          postbackResults.push({
            type: 'global',
            url: publisher?.global_postback_url || null,
            success: false,
            error: error.message,
            execution_time_ms: Date.now() - Date.now(), // Minimal time
            publisher_id: conversionData.publisher_id
          });
        }
      }

      // 3. Log results and update metrics
      if (postbackResults.length > 0) {
        const successCount = postbackResults.filter(r => r.success).length;
        const failureCount = postbackResults.length - successCount;

        logger.info(`📊 Postback results for conversion ${conversionData.conversion_uuid}: ${successCount} success, ${failureCount} failed`);

        // Update Redis metrics
        if (successCount > 0) {
          await this.updateMetrics('postback_success', successCount);
        }
        if (failureCount > 0) {
          await this.updateMetrics('postback_failure', failureCount);
        }
      }

      // 4. Store postback results in database for tracking
      if (postbackResults.length > 0) {
        await this.logPostbackResults(conversionData, postbackResults, connection);
      }

    } catch (error) {
      logger.error('Failed to send publisher postback:', error);
      // Don't fail the conversion for postback errors
    }
  }

  /**
   * Retry failed postback
   */
  async retryPostback(postbackData, retryCount) {
    try {
      postbackData.retry_count = retryCount;
      await redis.xadd('stream:postback_processing', '*',
        'postback_data', JSON.stringify(postbackData),
        'timestamp', new Date().toISOString()
      );
      logger.info(`🔄 Retrying postback (attempt ${retryCount}): ${postbackData.click_id}`);
    } catch (error) {
      logger.error('Failed to retry postback:', error);
    }
  }

  // ============================================
  // CAP CHECK METHODS (moved from postbackService)
  // ============================================

  async isCapExceeded(offer, tenantId, connection = pool) {
    if (offer.total_cap && offer.total_cap > 0) {
      const [rows] = await connection.query(
        'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND tenant_id = ?',
        [offer.id, tenantId]
      );
      const totalCount = parseInt(rows[0].cnt || 0);
      if (totalCount >= offer.total_cap) return true;
    }

    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    const tz = '+05:30';

    if (capType === 'daily' && offer.daily_cap && offer.daily_cap > 0) {
      const [rows] = await connection.query(
        `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND tenant_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`,
        [offer.id, tenantId]
      );
      const count = parseInt(rows[0].cnt || 0);
      if (count >= offer.daily_cap) return true;
    }

    return false;
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId, tenantId, connection = pool) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    const [rows] = await connection.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue FROM conversions WHERE offer_id = ? AND publisher_id = ? AND tenant_id = ? AND ${dateCondition}`,
      [offerId, publisherId, tenantId]
    );

    const totalRevenue = parseFloat(rows[0].total_revenue || 0);
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId, tenantId, connection = pool) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    const tz = '+05:30';

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND HOUR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = HOUR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'day') {
      dateCondition = `DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else if (duration === 'week') {
      dateCondition = `YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`;
    } else if (duration === 'month') {
      dateCondition = `YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
    } else {
      return false;
    }

    const [rows] = await connection.query(
      `SELECT COUNT(*) as conversion_count FROM conversions WHERE offer_id = ? AND publisher_id = ? AND tenant_id = ? AND ${dateCondition}`,
      [offerId, publisherId, tenantId]
    );

    const count = parseInt(rows[0].conversion_count || 0);
    return count >= capCount;
  }

  // ============================================
  // PUBLISHER POSTBACK METHODS
  // ============================================

  async sendPublisherPostback(callbackUrl, conversion, click, mockRequest = null) {
    const startTime = Date.now();
    let finalUrl = callbackUrl;
    let httpStatus = 0;
    let responseBody = '';
    let errorMessage = null;
    let executionTime = 0;

    return new Promise((resolve) => {
      try {
        // Correct Macro Mapping:
        // {affiliate_click_id} -> click.tid (The ID affiliate provided)
        // {click_id} -> click.tid (Standard mapping for affiliates who expect their ID back in click_id param)
        const affiliateClickId = click?.tid || '';

        // Replace macros in callback URL using replaceMacros function
        const url = this.replaceMacros(callbackUrl, {
          click_id: affiliateClickId, // Map standard click_id macro to affiliate's ID
          affiliate_click_id: affiliateClickId, // Specific macro
          conversion_id: conversion.conversion_uuid || '',
          rcid: conversion.rcid || '',
          payout: conversion.payout?.toString() || '0',
          amount: conversion.amount?.toString() || '0',
          status: conversion.status || 'pending',
        });

        // Also replace additional macros that might be used manually
        finalUrl = url
          .replace(/{affiliate_click_id}/gi, affiliateClickId)
          .replace(/{conversion_id}/gi, conversion.conversion_uuid || '')
          .replace(/{CONVERSION_ID}/gi, conversion.conversion_uuid || '')
          .replace(/{payout}/gi, conversion.payout?.toString() || '0')
          .replace(/{PAYOUT}/gi, conversion.payout?.toString() || '0')
          .replace(/{amount}/gi, conversion.amount?.toString() || '0')
          .replace(/{AMOUNT}/gi, conversion.amount?.toString() || '0')
          .replace(/{status}/gi, conversion.status || 'pending')
          .replace(/{STATUS}/gi, conversion.status || 'pending');

        // Send GET request to publisher callback URL
        const urlObj = new URL(finalUrl);
        const client = urlObj.protocol === 'https:' ? https : http;

        const req = client.get(finalUrl, { timeout: 5000 }, async (res) => {
          httpStatus = res.statusCode;

          // Consume response
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', async () => {
            responseBody = data.substring(0, 1000); // Truncate if too long
            executionTime = Date.now() - startTime;
            logger.info(`Postback sent to publisher: ${finalUrl} - Status: ${res.statusCode}`);

            resolve({
              success: httpStatus >= 200 && httpStatus < 300,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody,
              execution_time_ms: executionTime
            });
          });
        });

        req.on('error', async (err) => {
          errorMessage = err.message;
          executionTime = Date.now() - startTime;
          logger.error(`PostbackService.sendPublisherPostback error for ${finalUrl}:`, err.message);

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: errorMessage,
            execution_time_ms: executionTime
          });
        });

        req.on('timeout', () => {
          req.destroy();
          errorMessage = 'Timeout';
          executionTime = Date.now() - startTime;
          logger.warn(`PostbackService.sendPublisherPostback timeout for ${finalUrl}`);

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: 'Timeout',
            execution_time_ms: executionTime
          });
        });

        req.setTimeout(5000);
      } catch (error) {
        errorMessage = error.message;
        executionTime = Date.now() - startTime;
        logger.error('PostbackService.sendPublisherPostback error:', error);

        resolve({
          success: false,
          fired_url: finalUrl,
          http_status: 0,
          error: errorMessage,
          execution_time_ms: executionTime
        });
      }
    });
  }

  /**
   * Simple macro replacement function
   */
  replaceMacros(url, macros) {
    let result = url;
    for (const [key, value] of Object.entries(macros)) {
      result = result.replace(new RegExp(`{${key}}`, 'gi'), value);
    }
    return result;
  }

  /**
   * Log postback results to database for tracking and auditing
   */
  async logPostbackResults(conversionData, postbackResults, connection) {
    try {
      for (const result of postbackResults) {
        // Log postback type in error_message field for tracking
        const errorMessage = result.error ?
          `${result.type}: ${result.error}` :
          `${result.type}: ${result.success ? 'success' : 'failed'}`;

        await connection.query(
          `INSERT INTO affiliate_postback_logs (
            publisher_id, tenant_id, conversion_id, affiliate_click_id, fired_url,
            http_status, response_body, error_message, execution_time_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            result.publisher_id || result.assignment_id || 0, // Use publisher_id or assignment_id as fallback
            conversionData.tenant_id,
            conversionData.id || null, // conversion ID from database
            conversionData.click_uuid || '', // Use click_uuid as affiliate_click_id
            result.url || '',
            result.http_status || (result.success ? 200 : 0),
            result.response_body || null,
            errorMessage,
            result.execution_time_ms || 0
          ]
        );
      }
    } catch (error) {
      logger.error('Failed to log postback results:', error);
      // Don't fail the conversion for logging errors
    }
  }

  // ============================================
  // METRICS & MONITORING
  // ============================================

  async updateMetrics(metricType, increment = 1) {
    try {
      const key = this.metricsKeys[metricType];
      if (key) {
        await redis.incrby(key, increment);
        // Set expiry to prevent metric keys from growing indefinitely (30 days)
        await redis.expire(key, 30 * 24 * 60 * 60);
      }
    } catch (error) {
      // Don't fail processing for metrics errors
      logger.debug('Failed to update metrics:', error.message);
    }
  }

  async updateQueueDepthMetrics() {
    try {
      // Get pending messages count for each stream
      const [postbackInfo] = await redis.xinfo('STREAM', 'stream:postback_processing');
      const [conversionInfo] = await redis.xinfo('STREAM', 'stream:conversion_processing');

      const postbackDepth = postbackInfo ? postbackInfo.length : 0;
      const conversionDepth = conversionInfo ? conversionInfo.length : 0;

      await redis.setex(this.metricsKeys.queue_depth_postback, 300, postbackDepth.toString());
      await redis.setex(this.metricsKeys.queue_depth_conversion, 300, conversionDepth.toString());

    } catch (error) {
      logger.debug('Failed to update queue depth metrics:', error.message);
    }
  }

  getMetrics() {
    const uptime = Date.now() - this.metrics.start_time;
    return {
      ...this.metrics,
      uptime_seconds: Math.floor(uptime / 1000),
      processing_rate: this.metrics.processed / (uptime / 1000),
      error_rate: this.metrics.errors / (uptime / 1000)
    };
  }

  async getRedisMetrics() {
    try {
      const keys = Object.values(this.metricsKeys);
      const values = await redis.mget(...keys);

      return Object.keys(this.metricsKeys).reduce((acc, key, index) => {
        acc[key] = parseInt(values[index]) || 0;
        return acc;
      }, {});
    } catch (error) {
      logger.error('Failed to get Redis metrics:', error);
      return {};
    }
  }

  logMetrics() {
    const localMetrics = this.getMetrics();
    logger.info('📊 Postback Worker Local Metrics:', localMetrics);
  }
}

// Export singleton instance
const worker = new PostbackWorker();

export default worker;

// Start worker if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  worker.start().catch(error => {
    logger.error('Failed to start postback worker:', error);
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await worker.stop();
    process.exit(0);
  });

  // Log metrics every 5 minutes
  setInterval(() => worker.logMetrics(), 5 * 60 * 1000);
}