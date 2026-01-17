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
 * Insert click into MySQL database
 */
async function insertClickIntoDB(clickData) {
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
        timestamp, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

    // Then run periodically
    setInterval(async () => {
        await backfillUnflushedClicks();
    }, BACKFILL_INTERVAL_MS);
}

export default startBackfillWorker;
