import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import assignmentService from './assignmentService.js';
import offerService from './offer.service.js';
import publisherService from './publisherService.js';
import { replaceMacros } from '../utils/urlGenerator.js';
import { getTenantIdFromRequest } from '../utils/tenantScope.js';
import https from 'https';
import http from 'http';

import { clickQueue } from '../workers/clickQueue.js';
import redis from '../config/redis.js';

export class PostbackService {
  async processPostback(query, request) {
    try {
      console.log('🔍 Postback request received - basic check');
      console.log('Query object:', JSON.stringify(query));
      console.log('Headers host:', request.headers?.host);

      const { click_id, rcid, amount, status = 'approved' } = query;

      if (!click_id && !rcid) {
        throw new Error('Either click_id or rcid is required');
      }

      console.log('🔍 Starting Redis-first processing...');

      // ============================================
      // REDIS-FIRST ARCHITECTURE — NO DB QUERIES IN HTTP PATH
      // ============================================

      // ✅ CRITICAL: Get tenant_id from request (for Redis key construction)
      console.log('🔍 About to get tenant ID from request...');
      const tenantId = getTenantIdFromRequest(request);
      console.log('🔍 Got tenant ID:', tenantId);

      if (!tenantId) {
        console.log('❌ No tenant ID found');
        logger.error('❌ Postback rejected: No tenant subdomain', {
          host: request.headers.host,
          click_id: click_id,
          rcid: rcid
        });
        throw new Error('Tenant identity required from subdomain. Access via tenant subdomain (e.g., tenant1.domain.com/postback).');
      }

      console.log('[POSTBACK] Processing for tenant', {
        tenant_id: tenantId,
        click_id: click_id,
        rcid: rcid
      });

      // FAST PATH: Check Redis for click data (no DB queries here!)
      console.log('🔍 Checking Redis for click data...');
      let redisClick = null;
      let redisKey = null;

      if (click_id) {
        console.log(`🔍 Trying Redis key: click:${tenantId}:${click_id}`);
        // Strategy 1: Try new tenant-scoped format first
        redisKey = `click:${tenantId}:${click_id}`;
        redisClick = await redis.hgetall(redisKey);
        console.log(`🔍 Redis result for ${redisKey}:`, redisClick ? 'HIT' : 'MISS');
        if (redisClick) {
          console.log(`🔍 Redis data:`, JSON.stringify(redisClick));
          console.log(`🔍 Has offer_id:`, !!redisClick.offer_id);
        }

        // Strategy 2: If not found, try old format (backwards compatibility)
        if (!redisClick || !redisClick.offer_id) {
          console.log(`🔍 Trying fallback Redis key: click:${click_id}`);
          redisKey = `click:${click_id}`;
          redisClick = await redis.hgetall(redisKey);
          console.log(`🔍 Redis result for ${redisKey}:`, redisClick ? 'HIT' : 'MISS');
        }

        // Strategy 3: Pattern scan as last resort (DISABLED for now - causing issues)
        // TODO: Re-enable SCAN with better error handling
        if ((!redisClick || !redisClick.offer_id) && tenantId) {
          console.log('🔍 Skipping Redis SCAN (disabled)');
        }
      }

      console.log('🔍 Redis check complete, result:', redisClick && redisClick.offer_id ? 'HIT' : 'MISS');

      // REDIS HIT: Process conversion immediately, enqueue DB write
      if (redisClick && redisClick.offer_id) {
        logger.info(`✅ Redis hit for click: ${click_id}`);

        // 1. Rehydrate click data object
        const clickData = {
          ...redisClick,
          offer_id: parseInt(redisClick.offer_id),
          publisher_id: parseInt(redisClick.publisher_id),
          publisher_offer_id: parseInt(redisClick.publisher_offer_id || 0)
        };

        // 2. Create conversion data (all Redis-based, no DB queries!)
        const conversionData = {
          conversion_uuid: uuidv4(), // Generate UUID for conversion
          click_uuid: click_id,
          offer_id: clickData.offer_id,
          publisher_id: clickData.publisher_id,
          publisher_offer_id: clickData.publisher_offer_id,
          tenant_id: tenantId,
          rcid: rcid || redisClick.rcid || uuidv4(),
          amount: amount ? parseFloat(amount) : parseFloat(redisClick.payout || 0),
          payout: parseFloat(redisClick.payout || 0), // Add payout field
          status: status,
          ip: extractIP(request),
          timestamp: new Date().toISOString(),
          postback_payload: JSON.stringify({ query, headers: request.headers }),
          source: 'redis_hit' // Track processing path
        };

        // 3. Try synchronous postback sending (we have all data from Redis)
        let affiliatePostbackResult = null;
        try {
          affiliatePostbackResult = await this.sendPostbackFromRedisData(conversionData, clickData);
        } catch (postbackError) {
          logger.warn(`Postback sending failed for Redis hit ${click_id}:`, postbackError.message);
        }

        // 4. Enqueue for async DB processing (regardless of postback result)
        await this.enqueueConversionForProcessing(conversionData);

        logger.info(`✅ Conversion queued for click: ${click_id}`);

        return {
          success: true,
          message: 'Conversion processed and queued',
          duplicate: false,
          affiliate_postback: affiliatePostbackResult,
          processing_path: 'redis_hit'
        };
      }

      // ============================================
      // REDIS MISS: Try synchronous processing or buffer for async
      // ============================================

      logger.info(`⚠️ Redis miss for click: ${click_id}, attempting synchronous processing`);

      try {
        // Try to process synchronously (limited DB queries)
        const syncResult = await this.processPostbackSynchronously(query, request, tenantId, click_id, rcid, amount, status);

        if (syncResult.processed && syncResult.affiliate_postback) {
          logger.info(`✅ Synchronous postback processed for ${click_id}`);
          return {
            success: true,
            message: 'Postback processed synchronously',
            duplicate: syncResult.duplicate || false,
            affiliate_postback: syncResult.affiliate_postback,
            processing_path: 'redis_miss_sync'
          };
        }
      } catch (syncError) {
        logger.warn(`Synchronous processing failed for ${click_id}:`, syncError.message);
      }

      // Fallback: Buffer for async processing
      logger.info(`📦 Buffering postback for async processing: ${click_id}`);

      const bufferedPostback = {
        click_id,
        rcid,
        amount: amount ? parseFloat(amount) : null,
        status,
        tenant_id: tenantId,
        ip: extractIP(request),
        timestamp: new Date().toISOString(),
        postback_payload: JSON.stringify({ query, headers: request.headers }),
        source: 'redis_miss_buffered',
        retry_count: 0
      };

      await this.bufferPostbackForProcessing(bufferedPostback);

      return {
        success: true,
        message: 'Postback buffered for async processing',
        buffered: true,
        affiliate_postback: null, // Will be processed asynchronously
        processing_path: 'redis_miss_buffered'
      };
    } catch (error) {
      // Handle any remaining errors (Redis failures, etc.)
      logger.error('PostbackService.processPostback error:', {
        message: error.message,
        stack: error.stack,
        click_id,
        tenant_id
      });
      throw error;
    }
  }

  /**
   * Attempt synchronous postback processing for Redis misses
   * This tries to process the postback immediately using limited DB queries
   */
  async processPostbackSynchronously(query, request, tenantId, click_id, rcid, amount, status) {
    try {
      // 1. Try to find click in DB (limited retry)
      let click = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const [clickRows] = await pool.query(
            'SELECT * FROM clicks WHERE click_uuid = ? AND tenant_id = ?',
            [click_id, tenantId]
          );
          click = clickRows[0];
          if (click) break;
        } catch (dbError) {
          // DB connection issue, don't retry
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 100)); // Short delay
      }

      if (!click && rcid) {
        // Try to find via rcid
        try {
          const [clickRows] = await pool.query(
            'SELECT * FROM clicks WHERE rcid = ? AND tenant_id = ? LIMIT 1',
            [rcid, tenantId]
          );
          click = clickRows[0];
        } catch (dbError) {
          // Ignore DB errors
        }
      }

      if (!click && !rcid) {
        throw new Error('Cannot process postback without click or rcid');
      }

      // 2. Get offer and publisher info
      let offerId = click?.offer_id;
      let publisherId = click?.publisher_id;

      if (!offerId && rcid) {
        // Try to resolve from existing conversions
        try {
          const [convRows] = await pool.query(
            'SELECT offer_id, publisher_id FROM conversions WHERE rcid = ? AND tenant_id = ? LIMIT 1',
            [rcid, tenantId]
          );
          if (convRows.length > 0) {
            offerId = convRows[0].offer_id;
            publisherId = convRows[0].publisher_id;
          }
        } catch (dbError) {
          // Ignore DB errors
        }
      }

      if (!offerId) {
        throw new Error('Cannot determine offer for postback');
      }

      // 3. Get offer details
      let offer = null;
      try {
        const [offerRows] = await pool.query(
          'SELECT * FROM offers WHERE id = ? AND tenant_id = ?',
          [offerId, tenantId]
        );
        offer = offerRows[0];
      } catch (dbError) {
        // Ignore DB errors
      }

      if (!offer) {
        throw new Error('Offer not found');
      }

      // 4. Try to send postback immediately
      let affiliatePostbackResult = null;

      // Check for assignment-specific URL
      if (click?.publisher_offer_id) {
        try {
          const [assignmentRows] = await pool.query(
            'SELECT callback_url FROM assignments WHERE id = ? AND tenant_id = ?',
            [click.publisher_offer_id, tenantId]
          );
          if (assignmentRows.length > 0 && assignmentRows[0].callback_url) {
            const callbackUrl = assignmentRows[0].callback_url;
            console.log('📤 Found assignment callback URL:', callbackUrl);
            
            // Validate URL format
            const urlLower = callbackUrl.toLowerCase();
            if (urlLower.includes('/click') || urlLower.includes('/click?')) {
              console.log('⚠️ WARNING: Assignment callback_url appears to be a click URL!');
              console.log('⚠️ Expected: Postback URL (e.g., /postback, /conversion, /pixel)');
              console.log('⚠️ Found: Click URL (e.g., /click)');
              console.log('⚠️ This will likely fail - please update the callback_url in the assignments table');
            }
            
            affiliatePostbackResult = await this.sendImmediatePostback(
              callbackUrl,
              { click_uuid: click_id, conversion_uuid: `temp_${Date.now()}`, rcid, amount, status: status || 'approved' },
              click
            );
            console.log('📊 Assignment postback result:', affiliatePostbackResult);
          } else {
            console.log('❌ No assignment callback URL found for assignment:', click.publisher_offer_id);
          }
        } catch (dbError) {
          console.log('❌ DB error checking assignment callback:', dbError.message);
        }
      }

      // Fallback to global postback URL
      if (!affiliatePostbackResult && publisherId) {
        try {
          const [publisherRows] = await pool.query(
            'SELECT global_postback_url FROM publishers WHERE id = ? AND tenant_id = ?',
            [publisherId, tenantId]
          );
          if (publisherRows.length > 0 && publisherRows[0].global_postback_url) {
            const globalPostbackUrl = publisherRows[0].global_postback_url;
            console.log('📤 Found global postback URL:', globalPostbackUrl);
            
            // Validate URL format
            const urlLower = globalPostbackUrl.toLowerCase();
            if (urlLower.includes('/click') || urlLower.includes('/click?')) {
              console.log('⚠️ WARNING: Global postback_url appears to be a click URL!');
              console.log('⚠️ Expected: Postback URL (e.g., /postback, /conversion, /pixel)');
              console.log('⚠️ Found: Click URL (e.g., /click)');
              console.log('⚠️ This will likely fail - please update the global_postback_url in the publishers table');
            }
            
            affiliatePostbackResult = await this.sendImmediatePostback(
              globalPostbackUrl,
              { click_uuid: click_id, conversion_uuid: `temp_${Date.now()}`, rcid, amount, status: status || 'approved' },
              click
            );
            console.log('📊 Global postback result:', affiliatePostbackResult);
          } else {
            console.log('❌ No global postback URL found for publisher:', publisherId);
          }
        } catch (dbError) {
          console.log('❌ DB error checking global postback:', dbError.message);
        }
      }

      if (!affiliatePostbackResult) {
        console.log('⚠️ No postback URL found - neither assignment nor global');
      }

      // Store conversion in Redis for visibility (even if processed synchronously)
      try {
        const conversionId = click_id || rcid || `sync_${Date.now()}`;
        const conversionKey = `conversion:${tenantId}:${conversionId}`;
        const conversionHash = {
          conversion_uuid: `sync_${Date.now()}`,
          click_uuid: click_id || '',
          offer_id: offerId?.toString() || '',
          publisher_id: publisherId?.toString() || '',
          publisher_offer_id: click?.publisher_offer_id?.toString() || '',
          tenant_id: tenantId?.toString() || '',
          rcid: rcid || '',
          amount: amount ? parseFloat(amount).toString() : '0',
          status: status || 'approved',
          ip: extractIP(request),
          timestamp: new Date().toISOString(),
          source: 'sync_processing',
          processed: 'true' // Already processed synchronously
        };

        await redis.hset(conversionKey, conversionHash);
        await redis.expire(conversionKey, 3600); // 1 hour TTL
        console.log(`✅ Conversion hash stored (sync): ${conversionKey}`);
      } catch (redisError) {
        console.log('⚠️ Failed to store conversion hash:', redisError.message);
      }

      return {
        processed: true,
        affiliate_postback: affiliatePostbackResult,
        duplicate: false
      };

    } catch (error) {
      logger.debug('Synchronous postback processing failed:', error.message);
      return { processed: false };
    }
  }

  /**
   * Send postback immediately (synchronous path)
   */
  async sendImmediatePostback(callbackUrl, conversion, click) {
    try {
      const startTime = Date.now();

      // Validate URL - warn if it looks like a click URL instead of postback URL
      const urlLower = callbackUrl.toLowerCase();
      if (urlLower.includes('/click') || urlLower.includes('/click?')) {
        console.log('⚠️ WARNING: URL appears to be a click tracking URL, not a postback URL!');
        console.log('⚠️ URL:', callbackUrl);
        console.log('⚠️ Postback URLs should typically contain: /postback, /conversion, /pixel, /track, /notify');
      }

      // Get affiliate click ID (tid from click data)
      const affiliateClickId = click?.tid || conversion.click_uuid || '';

      // Comprehensive macro replacement
      let finalUrl = callbackUrl
        .replace(/{click_id}/gi, conversion.click_uuid || '')
        .replace(/{affiliate_click_id}/gi, affiliateClickId)
        .replace(/{conversion_id}/gi, conversion.conversion_uuid || '')
        .replace(/{rcid}/gi, conversion.rcid || '')
        .replace(/{amount}/gi, (conversion.amount || 0).toString())
        .replace(/{payout}/gi, (conversion.payout || 0).toString())
        .replace(/{status}/gi, conversion.status || 'pending');

      console.log('🔗 Starting immediate postback to:', callbackUrl);
      console.log('🔑 Affiliate click ID (tid):', affiliateClickId);
      console.log('🔗 Final URL after macro replacement:', finalUrl);

      const urlObj = new URL(finalUrl);
      const client = urlObj.protocol === 'https:' ? https : http;
      console.log('🌐 Making HTTP request to:', urlObj.hostname + urlObj.pathname);
      console.log('⏱️  Timeout set to: 10000ms (10 seconds)');

      // Increased timeout for postback requests (10 seconds instead of 3)
      const POSTBACK_TIMEOUT = 10000;

      return new Promise((resolve) => {
        const options = {
          timeout: POSTBACK_TIMEOUT,
          headers: {
            'User-Agent': 'Pulpy-Postback-Service/1.0',
            'Accept': '*/*',
            'Connection': 'close'
          }
        };

        const req = client.get(finalUrl, options, (res) => {
          let responseBody = '';
          
          // Collect response body for error analysis
          res.on('data', (chunk) => {
            responseBody += chunk.toString();
          });

          res.on('end', () => {
            const executionTime = Date.now() - startTime;
            const isSuccess = res.statusCode >= 200 && res.statusCode < 300;
            
            if (!isSuccess) {
              console.log(`❌ HTTP ${res.statusCode} response from postback URL`);
              console.log(`❌ Response headers:`, JSON.stringify(res.headers));
              console.log(`❌ Response body (first 500 chars):`, responseBody.substring(0, 500));
            } else {
              console.log(`✅ HTTP ${res.statusCode} - Postback successful`);
              console.log(`✅ Response time: ${executionTime}ms`);
              if (responseBody) {
                console.log(`✅ Response body (first 200 chars):`, responseBody.substring(0, 200));
              }
            }

            resolve({
              success: isSuccess,
              fired_url: finalUrl,
              http_status: res.statusCode,
              response_body: responseBody.substring(0, 1000), // Include more response for debugging
              response_headers: res.headers,
              execution_time_ms: executionTime
            });
          });
        });

        req.on('error', (err) => {
          const executionTime = Date.now() - startTime;
          console.log('❌ HTTP request error:', err.message);
          console.log('❌ Error code:', err.code);
          console.log('❌ Error details:', {
            code: err.code,
            errno: err.errno,
            syscall: err.syscall,
            address: err.address,
            port: err.port
          });
          
          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: err.message,
            error_code: err.code,
            error_details: {
              code: err.code,
              errno: err.errno,
              syscall: err.syscall
            },
            execution_time_ms: executionTime
          });
        });

        req.on('timeout', () => {
          req.destroy();
          const executionTime = Date.now() - startTime;
          console.log(`⏰ HTTP request timeout after ${POSTBACK_TIMEOUT}ms`);
          console.log(`⏰ URL: ${finalUrl}`);
          console.log(`⏰ This might indicate:`);
          console.log(`   - Server is slow or overloaded`);
          console.log(`   - Network connectivity issues`);
          console.log(`   - Server is not responding`);
          
          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: `Timeout after ${POSTBACK_TIMEOUT}ms`,
            error_type: 'TIMEOUT',
            execution_time_ms: executionTime
          });
        });

        // Set timeout
        req.setTimeout(POSTBACK_TIMEOUT);

        // Handle socket timeout (connection timeout)
        req.on('socket', (socket) => {
          socket.setTimeout(POSTBACK_TIMEOUT);
          socket.on('timeout', () => {
            console.log('⏰ Socket timeout - connection took too long');
            req.destroy();
            const executionTime = Date.now() - startTime;
            resolve({
              success: false,
              fired_url: finalUrl,
              http_status: 0,
              error: `Connection timeout after ${POSTBACK_TIMEOUT}ms`,
              error_type: 'CONNECTION_TIMEOUT',
              execution_time_ms: executionTime
            });
          });
        });
      });

    } catch (error) {
      console.log('❌ Exception in sendImmediatePostback:', error.message);
      return {
        success: false,
        fired_url: callbackUrl,
        error: error.message,
        error_type: error.constructor.name
      };
    }
  }

  /**
   * Send postback using Redis data (no DB queries needed)
   */
  async sendPostbackFromRedisData(conversionData, clickData) {
    try {
      // For Redis hits, we need to check Redis for assignment and publisher data
      let callbackUrl = null;
      let postbackType = null;

      // 1. Check for assignment-specific callback URL
      if (clickData.publisher_offer_id) {
        const assignmentKey = `assignment:${conversionData.tenant_id}:${clickData.publisher_offer_id}`;
        try {
          const assignmentData = await redis.hgetall(assignmentKey);
          if (assignmentData?.callback_url) {
            callbackUrl = assignmentData.callback_url;
            postbackType = 'assignment';
          }
        } catch (redisError) {
          logger.debug('Redis assignment lookup failed:', redisError.message);
        }
      }

      // 2. Fallback to publisher's global postback URL
      if (!callbackUrl && clickData.publisher_id) {
        const publisherKey = `publisher:${conversionData.tenant_id}:${clickData.publisher_id}`;
        try {
          const publisherData = await redis.hgetall(publisherKey);
          if (publisherData?.global_postback_url) {
            callbackUrl = publisherData.global_postback_url;
            postbackType = 'global';
          }
        } catch (redisError) {
          logger.debug('Redis publisher lookup failed:', redisError.message);
        }
      }

      // 3. Send postback if we have a URL
      if (callbackUrl) {
        logger.info(`📤 Sending ${postbackType} postback for Redis hit: ${conversionData.click_uuid}`);

        const result = await this.sendImmediatePostback(callbackUrl, conversionData, {
          tid: conversionData.click_uuid, // affiliate click ID
          publisher_id: clickData.publisher_id
        });

        result.type = postbackType;
        return result;
      }

      logger.debug(`No postback URL found for Redis hit: ${conversionData.click_uuid}`);
      return null;

    } catch (error) {
      logger.warn(`Postback sending failed for Redis hit ${conversionData.click_uuid}:`, error.message);
      return null;
    }
  }

  // ============================================
  // NEW REDIS-FIRST ARCHITECTURE METHODS
  // ============================================

  /**
   * Enqueue conversion for async DB processing (Redis hit path)
   */
  async enqueueConversionForProcessing(conversionData) {
    try {
      console.log('🔄 Enqueueing conversion to Redis Stream...');
      
      // 1. Store conversion as Redis Hash (for visibility/debugging)
      const conversionKey = `conversion:${conversionData.tenant_id}:${conversionData.click_uuid}`;
      const conversionHash = {
        conversion_uuid: conversionData.conversion_uuid || `temp_${Date.now()}`,
        click_uuid: conversionData.click_uuid,
        offer_id: conversionData.offer_id?.toString() || '',
        publisher_id: conversionData.publisher_id?.toString() || '',
        publisher_offer_id: conversionData.publisher_offer_id?.toString() || '',
        tenant_id: conversionData.tenant_id?.toString() || '',
        rcid: conversionData.rcid || '',
        amount: conversionData.amount?.toString() || '0',
        payout: conversionData.payout?.toString() || '0',
        status: conversionData.status || 'pending',
        ip: conversionData.ip || '',
        timestamp: conversionData.timestamp || new Date().toISOString(),
        source: conversionData.source || 'unknown',
        processed: 'false' // Will be set to 'true' by worker
      };

      // Store conversion hash with 1 hour TTL (similar to architecture doc)
      await redis.hset(conversionKey, conversionHash);
      await redis.expire(conversionKey, 3600); // 1 hour TTL
      console.log(`✅ Conversion hash stored: ${conversionKey}`);

      // 2. Use Redis Stream for reliable delivery
      await redis.xadd('stream:conversion_processing', '*',
        'conversion_data', JSON.stringify(conversionData),
        'timestamp', new Date().toISOString(),
        'type', 'conversion'
      );
      console.log('✅ Conversion enqueued to stream');

      // 3. Also keep in queue for backwards compatibility with existing workers
      await redis.lpush('queue:conversions', JSON.stringify(conversionData));
      console.log('✅ Conversion enqueued to queue');

      console.log(`✅ Enqueued conversion for processing: ${conversionData.click_uuid}`);
      return { success: true, message: 'Queued' };
    } catch (error) {
      console.log('❌ Failed to enqueue conversion:', error.message);
      logger.error('Failed to enqueue conversion:', error);
      throw error;
    }
  }

  /**
   * Buffer postback for async processing (Redis miss path)
   */
  async bufferPostbackForProcessing(postbackData) {
    try {
      // Use Redis Stream for reliable delivery
      await redis.xadd('stream:postback_processing', '*',
        'postback_data', JSON.stringify(postbackData),
        'timestamp', new Date().toISOString(),
        'type', 'postback'
      );

      // Also keep in queue for backwards compatibility
      await redis.lpush('queue:postbacks_pending', JSON.stringify(postbackData));

      logger.debug(`Buffered postback for processing: ${postbackData.click_id}`);
    } catch (error) {
      logger.error('Failed to buffer postback:', error);
      throw error;
    }
  }

  async updateDailyStats(offerId, revenue, payout) {
    try {
      // UTC ENFORCEMENT: Store UTC date in DB. Business logic converts to IST only at query time.
      // Use CONVERT_TZ(created_at, '+00:00', '+05:30') in queries for IST display
      const today = new Date().toISOString().split('T')[0];

      const profit = revenue - payout;

      await pool.query(
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
    } catch (error) {
      logger.error('PostbackService.updateDailyStats error:', error);
    }
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    if (capAmount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
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

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    let query = `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`;
    const params = [offerId, publisherId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);

    const totalRevenue = parseFloat((Array.isArray(rows) ? rows[0] : rows).total_revenue || 0);
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId, tenantId = null) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    if (capCount <= 0) return false;

    // Use IST (UTC+05:30) for timezone conversions
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

    // ✅ CRITICAL: Add tenant_id filtering to cap check
    let query = `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`;
    const params = [offerId, publisherId];

    if (tenantId) {
      query += ' AND tenant_id = ?';
      params.push(tenantId);
    }

    const [rows] = await pool.query(query, params);

    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
    return count >= capCount;
  }
  async sendPublisherPostback(callbackUrl, conversion, click) {
    const startTime = Date.now();
    let finalUrl = callbackUrl;
    let httpStatus = 0;
    let responseBody = '';
    let errorMessage = null;

    return new Promise((resolve) => {
      try {
        // Correct Macro Mapping:
        // {affiliate_click_id} -> click.tid (The ID affiliate provided)
        // {click_id} -> click.tid (Standard mapping for affiliates who expect their ID back in click_id param)
        const affiliateClickId = click?.tid || '';

        // Replace macros in callback URL using replaceMacros function
        const url = replaceMacros(callbackUrl, {
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
            logger.info(`Postback sent to publisher: ${finalUrl} - Status: ${res.statusCode}`);
            logger.info('Publisher Postback Function Success', { url: finalUrl, status: httpStatus });

            // Log success
            await this.logPostbackAttempt({
              publisher_id: click?.publisher_id,
              conversion_id: conversion.id,
              affiliate_click_id: affiliateClickId,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody,
              execution_time_ms: Date.now() - startTime
            });

            resolve({
              success: httpStatus >= 200 && httpStatus < 300,
              fired_url: finalUrl,
              http_status: httpStatus,
              response_body: responseBody
            });
          });
        });

        req.on('error', async (err) => {
          errorMessage = err.message;
          logger.error(`PostbackService.sendPublisherPostback error for ${finalUrl}:`, err.message);
          logger.error('Publisher Postback Function Failed', { url: finalUrl, error: errorMessage });

          // Log error
          await this.logPostbackAttempt({
            publisher_id: click?.publisher_id,
            conversion_id: conversion.id,
            affiliate_click_id: affiliateClickId,
            fired_url: finalUrl,
            http_status: 0,
            response_body: null,
            error_message: errorMessage,
            execution_time_ms: Date.now() - startTime
          });

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: errorMessage
          });
        });

        req.on('timeout', () => {
          req.destroy();
          errorMessage = 'Timeout';
          logger.warn(`PostbackService.sendPublisherPostback timeout for ${finalUrl}`);
          logger.error('Publisher Postback Function Failed (Timeout)', { url: finalUrl });

          resolve({
            success: false,
            fired_url: finalUrl,
            http_status: 0,
            error: 'Timeout'
          });
        });

        req.setTimeout(5000);
      } catch (error) {
        errorMessage = error.message;
        logger.error('PostbackService.sendPublisherPostback error:', error);
        logger.error('Publisher Postback Function Failed (Exception)', { url: finalUrl, error: errorMessage });

        // Use an IIFE to handle async logging in catch block
        (async () => {
          await this.logPostbackAttempt({
            publisher_id: click?.publisher_id,
            conversion_id: conversion.id,
            affiliate_click_id: click?.source_id,
            fired_url: finalUrl,
            http_status: 0,
            response_body: null,
            error_message: errorMessage,
            execution_time_ms: Date.now() - startTime
          });
        })();

        resolve({
          success: false,
          fired_url: finalUrl,
          http_status: 0,
          error: errorMessage
        });
      }
    });
  }

  async logPostbackAttempt(data) {
    try {
      await pool.query(
        `INSERT INTO affiliate_postback_logs (
          publisher_id, conversion_id, affiliate_click_id, fired_url, 
          http_status, response_body, error_message, execution_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.publisher_id || 0,
          data.conversion_id || null,
          data.affiliate_click_id || null,
          data.fired_url || '',
          data.http_status || 0,
          data.response_body || null,
          data.error_message || null,
          data.execution_time_ms || 0
        ]
      );
    } catch (err) {
      logger.error('Failed to write to affiliate_postback_logs:', err);
    }
  }

  async getPostbackLogs(filters = {}, tenantId = null) {
    try {
      let query = `
        SELECT l.*, p.email as publisher_email, p.company_name, p.tenant_id
        FROM affiliate_postback_logs l
        LEFT JOIN publishers p ON l.publisher_id = p.id
      `;
      const params = [];
      const conditions = [];

      // Tenant isolation
      if (tenantId) {
        conditions.push('p.tenant_id = ?');
        params.push(tenantId);
      }

      if (filters.publisher_id) {
        conditions.push('l.publisher_id = ?');
        params.push(filters.publisher_id);
      }

      if (filters.conversion_id) {
        conditions.push('l.conversion_id = ?');
        params.push(filters.conversion_id);
      }

      if (filters.affiliate_click_id) {
        conditions.push('l.affiliate_click_id = ?');
        params.push(filters.affiliate_click_id);
      }

      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      query += ' ORDER BY l.id DESC';

      // Count query for pagination
      let countQuery = `
        SELECT COUNT(*) as total
        FROM affiliate_postback_logs l
        LEFT JOIN publishers p ON l.publisher_id = p.id
      `;
      if (conditions.length > 0) {
        countQuery += ' WHERE ' + conditions.join(' AND ');
      }

      const [countRows] = await pool.query(countQuery, params); // reusing params as conditions are same
      const total = countRows[0].total;

      if (filters.limit) {
        query += ' LIMIT ?';
        params.push(parseInt(filters.limit));
      } else {
        query += ' LIMIT 100';
      }

      if (filters.offset) {
        query += ' OFFSET ?';
        params.push(parseInt(filters.offset));
      }

      const [rows] = await pool.query(query, params);

      return {
        data: rows,
        total: total
      };
    } catch (error) {
      logger.error('PostbackService.getPostbackLogs error:', error);
      throw error;
    }
  }

  /**
   * Validate offer is active and not expired before processing conversion
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferForConversion(offer) {
    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not active. Current status: ${offer.status}. Only live offers can accept conversions.`,
        error_type: 'offer_not_active'
      };
    }

    // UTC ENFORCEMENT: Business logic validation uses IST conversion for time-based checks
    // Storage remains UTC, only business rules convert to IST
    const now = new Date();
    const istTime = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
    const currentDate = istTime.toISOString().split('T')[0]; // YYYY-MM-DD in IST
    const currentTime = istTime.toISOString().split('T')[1].split('.')[0]; // HH:MM:SS in IST

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date); // Assuming stored as YYYY-MM-DD
      // We interpret stored date as end of that day in IST
      endDate.setHours(23, 59, 59, 999);

      // Compare YYYY-MM-DD strings to avoid offset confusion
      if (currentDate > offer.end_date) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      // Compare YYYY-MM-DD strings
      if (currentDate < offer.start_date) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions if both start_time and end_time are set
    // Assuming start_time and end_time are stored as 'HH:MM:SS' strings
    if (offer.start_time && offer.end_time) {
      const startTime = offer.start_time;
      const endTime = offer.end_time;

      // Compare times (HH:MM:SS format)
      if (currentTime < startTime || currentTime > endTime) {
        return {
          valid: false,
          message: `Conversion outside allowed time window. Allowed: ${startTime} - ${endTime}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.start_time) {
      // Only start_time set
      if (currentTime < offer.start_time) {
        return {
          valid: false,
          message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.end_time) {
      // Only end_time set
      if (currentTime > offer.end_time) {
        return {
          valid: false,
          message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    }

    return {
      valid: true,
      message: 'Offer is valid for conversion',
      error_type: null
    };
  }

  async isCapExceeded(offer, tenantId = null) {
    // ✅ CRITICAL: Total cap check with tenant_id filtering
    if (offer.total_cap && offer.total_cap > 0) {
      let query = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const totalCount = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (totalCount >= offer.total_cap) return true;
    }

    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    const tz = '+05:30';

    if (capType === 'daily' && offer.daily_cap && offer.daily_cap > 0) {
      let query = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND DATE(CONVERT_TZ(created_at, '+00:00', '${tz}')) = DATE(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.daily_cap) return true;
    }

    if (capType === 'monthly' && offer.monthly_cap && offer.monthly_cap > 0) {
      let query = `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEAR(CONVERT_TZ(created_at, '+00:00', '${tz}')) = YEAR(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}')) AND MONTH(CONVERT_TZ(created_at, '+00:00', '${tz}')) = MONTH(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'))`;
      const params = [offer.id];

      if (tenantId) {
        query += ' AND tenant_id = ?';
        params.push(tenantId);
      }

      const [rows] = await pool.query(query, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.monthly_cap) return true;
    }

    if (capType === 'weekly' && offer.total_cap && offer.total_cap > 0) {
      const [rows] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEARWEEK(CONVERT_TZ(created_at, '+00:00', '${tz}'), 1) = YEARWEEK(CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '${tz}'), 1)`,
        [offer.id]
      );
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.total_cap) return true;
    }

    return false;
  }
}

export default new PostbackService();

