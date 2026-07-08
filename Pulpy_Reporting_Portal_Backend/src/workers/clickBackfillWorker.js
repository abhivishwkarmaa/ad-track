/**
 * Click Backfill Worker
 * 
 * SAFETY NET: Scans Redis for unflushed clicks and inserts them into DB
 * This guarantees ZERO click loss even if the main worker was down
 * 
 * Runs periodically to catch any clicks that were:
 * - Written to Redis but never added to stream
 * - Added to stream but worker crashed before processing
 * - Hash exists but flushed=false
 */

import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { getISP } from '../utils/ispLookup.js';

const BACKFILL_INTERVAL_MS = 5 * 60 * 1000; // Run every 5 minutes
const SCAN_COUNT = 100; // Scan in batches of 100 keys
const CLICK_KEY_PATTERN = 'click:*:*:*:*'; // New format: click:{tenant_id}:{offer_id}:{publisher_id}:{click_id}
const CLICK_KEY_PATTERN_OLD = 'click:*'; // Old format for backwards compatibility

/**
 * Scan Redis for unflushed clicks and insert them into DB
 */
async function backfillUnflushedClicks() {
    let cursor = 0;
    let totalScanned = 0;
    let totalProcessed = 0;
    let totalFlushed = 0;
    let totalErrors = 0;

    try {
        logger.info('🔄 Starting click backfill scan...');

        // ✅ CRITICAL: Scan for clicks using new format
        do {
            const [newCursor, keys] = await redis.scan(
                cursor,
                'MATCH', CLICK_KEY_PATTERN,
                'COUNT', SCAN_COUNT
            );
            cursor = parseInt(newCursor);

            if (keys.length > 0) {
                totalScanned += keys.length;
                logger.debug(`📋 Found ${keys.length} click keys (cursor: ${cursor})`);

                // Process keys in batches
                for (const key of keys) {
                    try {
                        // ✅ CRITICAL: Read click data from Redis HASH
                        const clickData = await redis.hgetall(key);

                        if (!clickData || Object.keys(clickData).length === 0) {
                            // Empty hash - skip
                            continue;
                        }

                        // ✅ CRITICAL: Check if already flushed
                        const isFlushed = clickData.flushed === 'true' || clickData.flushed === true;
                        if (isFlushed) {
                            totalFlushed++;
                            continue;
                        }

                        // ✅ CRITICAL: Validate required fields
                        if (!clickData.click_uuid || !clickData.offer_id || !clickData.publisher_id) {
                            logger.warn(`❌ Invalid click data in Redis key: ${key}`, {
                                has_click_uuid: !!clickData.click_uuid,
                                has_offer_id: !!clickData.offer_id,
                                has_publisher_id: !!clickData.publisher_id
                            });
                            continue;
                        }

                        // ✅ CRITICAL: Validate tenant_id (required in strict multi-tenant)
                        let tenantId = null;
                        if (clickData.tenant_id && clickData.tenant_id !== '' &&
                            clickData.tenant_id !== 'null' && clickData.tenant_id !== 'undefined') {
                            const parsed = parseInt(clickData.tenant_id);
                            if (!isNaN(parsed) && parsed > 0) {
                                tenantId = parsed;
                            }
                        }

                        if (!tenantId) {
                            logger.warn(`❌ Click missing tenant_id in Redis key: ${key}`, {
                                tenant_id_raw: clickData.tenant_id,
                                click_uuid: clickData.click_uuid
                            });
                            continue;
                        }

                        // ✅ CRITICAL: Insert click into MySQL
                        await insertClickIntoDB(clickData);

                        // ✅ CRITICAL: Mark as flushed in Redis
                        await redis.hset(key, 'flushed', 'true');
                        totalProcessed++;

                        logger.info(`✅ Backfilled click: ${clickData.click_uuid}`, {
                            redis_key: key,
                            tenant_id: tenantId,
                            offer_id: clickData.offer_id,
                            publisher_id: clickData.publisher_id
                        });

                    } catch (err) {
                        totalErrors++;
                        logger.error(`❌ Error processing click key: ${key}`, {
                            error: err.message,
                            stack: err.stack
                        });
                    }
                }
            }
        } while (cursor !== 0);

        // ✅ CRITICAL: Also scan for old format clicks (backwards compatibility)
        cursor = 0;
        do {
            const [newCursor, keys] = await redis.scan(
                cursor,
                'MATCH', CLICK_KEY_PATTERN_OLD,
                'COUNT', SCAN_COUNT
            );
            cursor = parseInt(newCursor);

            // Filter out keys that match new format (already processed above)
            const oldFormatKeys = keys.filter(key => !key.match(/^click:\d+:\d+:\d+:/));

            if (oldFormatKeys.length > 0) {
                for (const key of oldFormatKeys) {
                    try {
                        const clickData = await redis.hgetall(key);
                        if (!clickData || Object.keys(clickData).length === 0) continue;

                        const isFlushed = clickData.flushed === 'true' || clickData.flushed === true;
                        if (isFlushed) continue;

                        if (!clickData.click_uuid || !clickData.offer_id || !clickData.publisher_id) continue;

                        let tenantId = null;
                        if (clickData.tenant_id && clickData.tenant_id !== '' &&
                            clickData.tenant_id !== 'null' && clickData.tenant_id !== 'undefined') {
                            const parsed = parseInt(clickData.tenant_id);
                            if (!isNaN(parsed) && parsed > 0) {
                                tenantId = parsed;
                            }
                        }

                        if (!tenantId) continue;

                        await insertClickIntoDB(clickData);
                        await redis.hset(key, 'flushed', 'true');
                        totalProcessed++;

                        logger.info(`✅ Backfilled click (old format): ${clickData.click_uuid}`, {
                            redis_key: key,
                            tenant_id: tenantId
                        });

                    } catch (err) {
                        totalErrors++;
                        logger.error(`❌ Error processing old format click key: ${key}`, {
                            error: err.message
                        });
                    }
                }
            }
        } while (cursor !== 0);

        logger.info(`✅ Backfill complete: scanned=${totalScanned}, processed=${totalProcessed}, already_flushed=${totalFlushed}, errors=${totalErrors}`);

    } catch (err) {
        logger.error('❌ Backfill scan failed:', {
            error: err.message,
            stack: err.stack
        });
    }
}

/**
 * Best-effort ISP fill for a single click before insert.
 * Mirrors the worker behavior so backfilled rows are consistent with main flow.
 * Failures are silent — column stays NULL, same as old hot-path on getISP failure.
 */
async function fillIspIfMissing(clickData) {
    const currentIsp = clickData.isp;
    if (currentIsp && currentIsp !== '' && currentIsp !== 'null') return;
    const ip = clickData.ip;
    if (!ip || ip === '127.0.0.1' || ip.includes(':')) return;

    try {
        const cacheKey = `isp:${ip}`;
        const cached = await redis.get(cacheKey);
        if (cached !== null && cached !== undefined) {
            if (cached) clickData.isp = cached;
            return;
        }
        const isp = await getISP(ip);
        await redis.setex(cacheKey, 3600, isp || '');
        if (isp) clickData.isp = isp;
    } catch (e) {
        // Silent: isp stays whatever it was (likely empty).
    }
}

/**
 * Insert click into MySQL database
 */
async function insertClickIntoDB(clickData) {
    // Best-effort ISP enrichment (does not block on errors)
    await fillIspIfMissing(clickData);

    // Parse fields
    const offerId = parseInt(clickData.offer_id) || 0;
    const publisherId = parseInt(clickData.publisher_id) || 0;
    const publisherOfferId = clickData.publisher_offer_id ? parseInt(clickData.publisher_offer_id) : null;

    let tenantId = null;
    if (clickData.tenant_id && clickData.tenant_id !== '' &&
        clickData.tenant_id !== 'null' && clickData.tenant_id !== 'undefined') {
        const parsed = parseInt(clickData.tenant_id);
        if (!isNaN(parsed) && parsed > 0) {
            tenantId = parsed;
        }
    }

    // ✅ CRITICAL: Use INSERT ... ON DUPLICATE KEY UPDATE for idempotency
    // UNIQUE constraint on (tenant_id, offer_id, publisher_id, click_id) prevents duplicates
    const sql = `INSERT INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        extra_params, timestamp, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id = id`;

    const values = [
        clickData.click_uuid, offerId, publisherId, publisherOfferId, tenantId,
        clickData.ip || '', clickData.user_agent || '', clickData.referrer || '',
        clickData.country || '', clickData.region || null, clickData.city || null,
        clickData.isp || null, clickData.location || null, clickData.domain || '',
        clickData.device_type || '', clickData.browser || '', clickData.os || '',
        clickData.os_version || '', clickData.device_brand || '', clickData.device_model || '',
        clickData.source_id || null, clickData.device_id || null,
        clickData.google_id || null, clickData.android_id || null,
        clickData.rcid || null, clickData.tid || null,
        clickData.extra_params && String(clickData.extra_params).trim() !== '' ? clickData.extra_params : null,
        clickData.timestamp ? new Date(clickData.timestamp) : new Date(),
        new Date()
    ];

    await pool.query(sql, [values]);
}

/**
 * Start backfill worker
 */
async function startBackfillWorker() {
    logger.info('🔄 Click backfill worker started', {
        interval_ms: BACKFILL_INTERVAL_MS,
        pattern: CLICK_KEY_PATTERN
    });

    // Run immediately on startup (catch any missed clicks)
    await backfillUnflushedClicks();

    // Retry buffered postbacks
    await retryBufferedPostbacks();

    // Then run periodically
    setInterval(async () => {
        await backfillUnflushedClicks();
        await retryBufferedPostbacks();
    }, BACKFILL_INTERVAL_MS);
}

/**
 * Retry buffered postbacks from DB failure
 */
import { PostbackService } from '../services/postbackService.js';
const postbackService = new PostbackService();

async function retryBufferedPostbacks() {
    try {
        const RETRY_KEY = 'queue:postbacks:retry';
        const batchSize = 50;

        // Check length
        const len = await redis.llen(RETRY_KEY);
        if (len === 0) return;

        logger.info(`🔄 Retrying ${Math.min(len, batchSize)} buffered postbacks...`);

        for (let i = 0; i < batchSize; i++) {
            // RPOP - Process oldest first
            const itemStr = await redis.rpop(RETRY_KEY);
            if (!itemStr) break;

            try {
                const item = JSON.parse(itemStr);
                const { query, headers } = item;

                // Mock Request Object
                const mockReq = { headers, url: '/postback' };
                await postbackService.processPostback(query, mockReq);
                logger.info(`✅ Successfully reprocessed buffered postback: ${query.click_id || query.rcid}`);

            } catch (err) {
                // If it fails again due to DB error, maybe push back to LEFT (Head) or just log
                // If we push back, we might loop. 
                // Better: Log and maybe push to a DLQ if it's not a DB error.
                // If it IS a DB error, we should probably stop processing this batch to avoid spamming.

                const isDbError = err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT' || err.message?.includes('connect');

                if (isDbError) {
                    logger.warn(`⚠️ DB still unavailable during retry, stopping batch.`);
                    // Push back to list (Right side? No, we RPOP, so we should RPUSH to put it back at the end? Or LPUSH to put it back at front?)
                    // If we want to retry it "next", we put it back where we took it. We took from Right (Tail). So put back at Right.
                    await redis.rpush(RETRY_KEY, itemStr);
                    break; // Stop processing
                } else {
                    logger.error(`❌ Failed to retry postback (permanent failure?): ${err.message}`);
                    // Maybe move to DLQ?
                }
            }
        }
    } catch (e) {
        logger.error(`Error retrying buffered postbacks: ${e.message}`);
    }
}

export default startBackfillWorker;
