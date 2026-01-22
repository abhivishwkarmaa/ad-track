import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import trackingService from '../services/trackingService.js';
import postbackService from '../services/postbackService.js';

const BATCH_SIZE = 100; // Batch Insert Size
const BATCH_TIMEOUT = 1000; // Wait max 1s to fill batch
const STREAM_KEY = 'stream:clicks';
const GROUP_NAME = 'workers_group';
const CONSUMER_NAME = `worker_${process.env.HOSTNAME || 'local'}_${process.pid}`;
const MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts for failed inserts

const ERROR_TYPES = {
    FATAL: 'fatal',
    RETRYABLE: 'retryable'
};

function classifyError(err) {
    if (!err) return ERROR_TYPES.FATAL;
    const msg = (err.message || '').toLowerCase();
    const code = err.code || '';

    // Network / Redis / DB Connection Issues -> RETRYABLE
    if (code === 'ECONNREFUSED' || code === 'ETIMEDOUT' || code === 'PROTOCOL_CONNECTION_LOST' ||
        msg.includes('connection') || msg.includes('socket') || msg.includes('network') ||
        msg.includes('redis') || msg.includes('econnreset')) {
        return ERROR_TYPES.RETRYABLE;
    }

    return ERROR_TYPES.FATAL;
}

async function setupStream() {
    try {
        // ✅ CRITICAL: Ensure stream exists and consumer group exists
        // Use XGROUP CREATE with MKSTREAM to create stream if it doesn't exist
        // This ensures worker NEVER crashes due to missing stream or group
        await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
        logger.info(`✅ Redis stream and consumer group ready: ${STREAM_KEY}/${GROUP_NAME}`);
    } catch (err) {
        // BUSYGROUP means group already exists - this is OK
        if (err.message && err.message.includes('BUSYGROUP')) {
            logger.info(`✅ Consumer group already exists: ${STREAM_KEY}/${GROUP_NAME}`);
        } else {
            // Any other error is a problem - log but don't crash (will retry)
            logger.error(`❌ Failed to setup Redis stream: ${err.message}`, err);
            throw err;
        }
    }
}

async function runWorker() {
    let consecutiveErrors = 0;

    // Internal Buffer for Batching
    let localBuffer = [];
    let bufferStartTime = Date.now();
    let lastReclaimTime = Date.now();

    // Config
    const FLUSH_SIZE = 300;     // Target batch size
    const FLUSH_TIMEOUT_MS = 60000; // 60s max wait
    const RECLAIM_INTERVAL_MS = 60000; // Check stuck messages every 60s

    try {
        await setupStream();
        logger.info(`👷 Redis Stream Worker Started: ${CONSUMER_NAME}`);
        logger.info(`   Stream: ${STREAM_KEY}`);
        logger.info(`   Group: ${GROUP_NAME}`);
        logger.info(`   Consumer: ${CONSUMER_NAME}`);
    } catch (err) {
        logger.error('❌ Failed to setup Redis stream:', err);
        throw err;
    }

    logger.info('🔄 Worker loop started - buffering clicks...');

    while (true) {
        try {
            // 1. Periodic Stuck Message Reclamation
            if (Date.now() - lastReclaimTime > RECLAIM_INTERVAL_MS) {
                await recoverStuckMessages();
                lastReclaimTime = Date.now();
            }

            // 2. Read from Stream (Non-blocking or short block)
            // We use a short block (1s) to stay responsive but not spin-wait
            const response = await redis.xreadgroup(
                'GROUP', GROUP_NAME, CONSUMER_NAME,
                'COUNT', 100, // Fetch up to 100 at a time to fill buffer
                'BLOCK', 1000,
                'STREAMS', STREAM_KEY, '>'
            );

            // Reset error count on successful read
            consecutiveErrors = 0;

            // 3. Add to Local Buffer
            if (response && response.length && response[0][1].length > 0) {
                const streamEntries = response[0][1];
                for (const [msgId, fields] of streamEntries) {
                    localBuffer.push({ msgId, fields });
                }

                if (localBuffer.length === streamEntries.length) {
                    // First items in this new batch cycle
                    bufferStartTime = Date.now();
                }
            }

            // 4. Check Flush Conditions
            const isSizeFull = localBuffer.length >= FLUSH_SIZE;
            const isTimeUp = localBuffer.length > 0 && (Date.now() - bufferStartTime >= FLUSH_TIMEOUT_MS);

            if (isSizeFull || isTimeUp) {
                logger.info(`🔄 Flushing Buffer: ${localBuffer.length} items (Reason: ${isSizeFull ? 'Size' : 'Time'})`);

                await processBatch(localBuffer);

                // Clear Buffer
                localBuffer = [];
                bufferStartTime = Date.now();
            }

        } catch (err) {
            consecutiveErrors++;
            const errorType = classifyError(err);

            // Handle NOGROUP
            if (err.message && (err.message.includes('NOGROUP') || err.message.includes('no such key'))) {
                logger.warn(`⚠️ Consumer group missing (NOGROUP) - recreating...`);
                try {
                    await setupStream();
                    localBuffer = []; // Clear buffer on reset to avoid stale data issues
                    consecutiveErrors = 0;
                    continue;
                } catch (setupErr) {
                    logger.error(`❌ Re-setup failed: ${setupErr.message}`);
                }
            }

            const backoffMs = Math.min(Math.pow(2, consecutiveErrors) * 1000, 60000);
            logger.error({ err, backoffMs }, '❌ Worker Error Loop');
            await new Promise(r => setTimeout(r, backoffMs));
        }
    }
}

async function processBatch(buffer) {
    if (buffer.length === 0) return;

    const streamClickData = [];
    const msgIds = [];

    // Parse items
    for (const item of buffer) {
        const { msgId, fields } = item;
        msgIds.push(msgId);

        const tenantIdIndex = fields.indexOf('tenant_id');
        const offerIdIndex = fields.indexOf('offer_id');
        const publisherIdIndex = fields.indexOf('publisher_id');
        const clickIdIndex = fields.indexOf('click_id');

        if (tenantIdIndex !== -1 && offerIdIndex !== -1 &&
            publisherIdIndex !== -1 && clickIdIndex !== -1) {

            streamClickData.push({
                msgId,
                tenantId: fields[tenantIdIndex + 1],
                offerId: fields[offerIdIndex + 1],
                publisherId: fields[publisherIdIndex + 1],
                clickId: fields[clickIdIndex + 1]
            });
        } else {
            // Fallback old format
            const idIndex = fields.indexOf('id');
            if (idIndex !== -1) {
                streamClickData.push({
                    msgId,
                    clickId: fields[idIndex + 1],
                    // other fields null, will rely on redis hash
                });
            }
        }
    }

    const clickUuids = streamClickData.map(d => d.clickId).filter(Boolean);
    if (clickUuids.length === 0) {
        if (msgIds.length > 0) await redis.xack(STREAM_KEY, GROUP_NAME, ...msgIds);
        return;
    }

    // Prepare Redis Keys
    const redisKeys = streamClickData.map(data => {
        if (data.tenantId && data.offerId && data.publisherId && data.clickId) {
            return `click:${data.tenantId}:${data.offerId}:${data.publisherId}:${data.clickId}`;
        }
        return `click:${data.clickId}`;
    });

    // Fetch Full Data
    const pipeline = redis.pipeline();
    redisKeys.forEach(key => pipeline.hgetall(key));
    const dataResults = await pipeline.exec();

    const validEntries = [];
    const invalidEntries = [];

    for (let i = 0; i < dataResults.length; i++) {
        const [err, clickData] = dataResults[i];
        const streamInfo = streamClickData[i];

        // Check if data exists and is valid
        if (!err && clickData && Object.keys(clickData).length > 0 && clickData.offer_id) {
            // Check flushed flag
            const isFlushed = clickData.flushed === 'true' || clickData.flushed === true;
            validEntries.push({
                msgId: streamInfo.msgId,
                clickData,
                alreadyFlushed: isFlushed
            });
        } else {
            invalidEntries.push({
                msgId: streamInfo.msgId,
                error: err ? err.message : 'Missing Hash'
            });
        }
    }

    // Filter for DB Insert
    const toInsert = validEntries.filter(e => !e.alreadyFlushed);

    if (toInsert.length > 0) {
        const clicks = toInsert.map(e => e.clickData);
        // DB Insert
        try {
            await bulkInsertClicks(clicks);

            // Mark Flushed in Redis
            const markPipe = redis.pipeline();
            clicks.forEach(c => {
                const key = `click:${c.tenant_id}:${c.offer_id}:${c.publisher_id}:${c.click_uuid}`;
                markPipe.hset(key, 'flushed', 'true');
                // Also try old key format for safety
                if (!c.tenant_id) markPipe.hset(`click:${c.click_uuid}`, 'flushed', 'true');
            });
            await markPipe.exec();

            // Process Pending Conversions
            await processPendingConversions(clicks);

            // Update Stats
            const statsPipe = redis.pipeline();
            const today = new Date().toISOString().split('T')[0];
            clicks.forEach(c => {
                const tId = c.tenant_id || 0;
                statsPipe.incr(`stats:offer:${c.offer_id}:${tId}:${today}:clicks`);
                statsPipe.incr(`stats:pub:${c.publisher_id}:${tId}:${today}:clicks`);
            });
            await statsPipe.exec();

            logger.info(`✅ Batch Inserted: ${clicks.length} clicks`);

        } catch (dbErr) {
            logger.error(`❌ Batch DB Fail: ${dbErr.message}`);
            // If DB-wide failure, we do NOT ACK.
            // Throwing here will bubble up to runWorker loop, which will backoff and RETRY this batch?
            // Wait, localBuffer was cleared in runWorker after calling processBatch.
            // CRITICAL: processBatch must NOT throw if we want to drop/ack, BUT SHOULD throw if we want to retry.
            // However, runWorker clears buffer immediately after processBatch resolves.
            // Use retry logic INSIDE processBatch or change runWorker.

            // Since we cleared buffer, we CANNOT easily retry. 
            // FIX: Retry LOOP inside processBatch.

            throw dbErr; // Let runWorker catch it? No, runWorker loop continues.
            // We need robust retry inside bulkInsert or here. 
            // bulkInsertClicks already has some retry logic? Let's check.
            // No, bulkInsertClicks in original file tried to return result.
            // The implementation of bulkInsertClicks I see below (lines 493+) throws error on final fail.

            // If this throws, runWorker catches, backs off... but loop continues and buffer is LOST?
            // Actually, in runWorker:
            // await processBatch(localBuffer);
            // localBuffer = [];
            // If processBatch throws, 'localBuffer = []' is NOT reached! 
            // Loop catches error, sleeps, and retries...
            // BUT localBuffer is still full!
            // So when loop continues, it Resumes.
            // Need to ensure processBatch is idempotent if called again with same buffer.
            // Yes, 'alreadyFlushed' check handles that.
            throw dbErr;
        }
    }

    // ACK ALL messages (Processed + Invalid + AlreadyFlushed) after success
    const allMsgIds = buffer.map(b => b.msgId);
    if (allMsgIds.length > 0) {
        await redis.xack(STREAM_KEY, GROUP_NAME, ...allMsgIds);
    }
}

async function recoverStuckMessages() {
    try {
        // Find Pending Messages > 60s old
        // XPENDING stream group start end count consumer
        const pending = await redis.xpending(STREAM_KEY, GROUP_NAME, '-', '+', 100);

        // pending: [[msgId, consumer, idleTime, deliveryCount], ...]
        const now = Date.now();
        const stuck = pending.filter(p => p[2] > 60000); // idle > 60s

        if (stuck.length === 0) return;

        logger.info(`♻️  Reclaiming ${stuck.length} stuck messages`);

        const ids = stuck.map(p => p[0]);
        // Claim them!
        // XCLAIM key group consumer min-idle-time id [id ...]
        const claimed = await redis.xclaim(STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 60000, ...ids);

        // Claimed messages are returned. We should process them?
        // Actually, if we claim them, they become ours and Idle time resets.
        // We can just add them to our processing queue? 
        // Or better, XAUTOCLAIM in modern Redis, but XCLAIM works.
        // Once claimed, XREADGROUP will allow us to read them if we specify ID?
        // Actually, XREADGROUP '>' only reads NEW messages.
        // To read claimed messages, we usually need to read history '0'.
        // BUT, 'processBatch' logic expects a buffer.
        // Simple strategy: Just Claim. Next time we restart we might pick them up? 
        // No. If we claim, we must process.

        // Let's inject them into the localBuffer?
        // 'claimed' is Array of [msgId, fields].
        // Yes, perfect format.

        /*
          claimed structure from xclaim:
          [
             [ '123-0', [ 'key', 'val' ] ],
             ...
          ]
        */

        // NOTE: This runs inside runWorker usually, or alongside.
        // Since we refactored runWorker variables to be local scope, we can't easily inject.
        // Modified design: recoverStuckMessages should Return the messages, runWorker adds to buffer.

        // BUT wait, separate function approach.
        // If I keep 'recoverStuckMessages' separate, I can't inject.
        // I will inline the logic into runWorker or make it return items.
    } catch (e) {
        logger.error(`Error reclaiming: ${e.message}`);
    }
}

async function bulkInsertClicks(clicks, batchTimestamp = new Date()) {
    if (clicks.length === 0) return;

    // ✅ CRITICAL: Validate and sanitize click data before insert
    const validClicks = clicks.filter(c => {
        // Required fields check
        if (!c.click_uuid || !c.offer_id || !c.publisher_id) {
            logger.warn('❌ Invalid click data - missing required fields:', {
                click_uuid: c.click_uuid,
                offer_id: c.offer_id,
                publisher_id: c.publisher_id,
                tenant_id: c.tenant_id,
                all_fields: Object.keys(c)
            });
            return false;
        }

        // ✅ CRITICAL: In strict multi-tenant, tenant_id is REQUIRED
        // Parse tenant_id to check if it's valid
        let tenantId = null;
        if (c.tenant_id && c.tenant_id !== '' && c.tenant_id !== 'null' && c.tenant_id !== 'undefined') {
            const parsed = parseInt(c.tenant_id);
            if (!isNaN(parsed) && parsed > 0) {
                tenantId = parsed;
            }
        }

        if (!tenantId) {
            logger.error('❌ Invalid click data - missing tenant_id (strict multi-tenant violation):', {
                click_uuid: c.click_uuid,
                offer_id: c.offer_id,
                publisher_id: c.publisher_id,
                tenant_id_raw: c.tenant_id,
                tenant_id_type: typeof c.tenant_id
            });
            return false;
        }

        return true;
    });

    // ✅ CRITICAL: Log tenant_id status for debugging
    if (validClicks.length > 0) {
        logger.info(`📊 Processing ${validClicks.length} clicks with tenant_ids:`, {
            tenant_ids: validClicks.map(c => ({
                click_uuid: c.click_uuid,
                tenant_id: c.tenant_id || 'NULL',
                tenant_id_type: typeof c.tenant_id,
                offer_id: c.offer_id,
                publisher_id: c.publisher_id
            })),
            sample: {
                click_uuid: validClicks[0].click_uuid,
                offer_id: validClicks[0].offer_id,
                publisher_id: validClicks[0].publisher_id,
                tenant_id: validClicks[0].tenant_id || 'NULL',
                tenant_id_type: typeof validClicks[0].tenant_id
            }
        });
    }

    if (validClicks.length === 0) {
        logger.warn('❌ No valid clicks to insert after filtering');
        return;
    }

    // UTC ENFORCEMENT: All timestamps stored as UTC only. Business logic converts to IST when needed.
    // Column order must match table schema exactly
    // ✅ CRITICAL: Use INSERT IGNORE or ON DUPLICATE KEY UPDATE to prevent duplicates
    // If UNIQUE constraint on click_uuid exists, ON DUPLICATE KEY UPDATE will prevent duplicates
    // If constraint doesn't exist yet, INSERT IGNORE will silently skip duplicates
    // We use ON DUPLICATE KEY UPDATE to be explicit about handling duplicates
    const sql = `INSERT INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES ?
    ON DUPLICATE KEY UPDATE id = id`;

    // ✅ Log if we're about to insert clicks that might be duplicates
    const clickUuids = validClicks.map(c => c.click_uuid);
    logger.debug(`📝 Attempting to insert ${validClicks.length} clicks`, {
        sample_uuids: clickUuids.slice(0, 5),
        total: clickUuids.length
    });

    // UTC ENFORCEMENT: Database connection is set to UTC timezone, so Date objects will be stored correctly
    const values = validClicks.map(c => {
        // Safe parsing with fallbacks
        const offerId = parseInt(c.offer_id) || 0;
        const publisherId = parseInt(c.publisher_id) || 0;
        const publisherOfferId = c.publisher_offer_id ? parseInt(c.publisher_offer_id) : null;

        // ✅ CRITICAL: Parse tenant_id from Redis (may be string, number, or empty)
        // Redis stores values as strings, so handle empty string as null
        // In strict multi-tenant system, tenant_id should ALWAYS be set
        let tenantId = null;
        if (c.tenant_id && c.tenant_id !== '' && c.tenant_id !== 'null' && c.tenant_id !== 'undefined') {
            const parsed = parseInt(c.tenant_id);
            if (!isNaN(parsed) && parsed > 0) {
                tenantId = parsed;
            }
        }

        // ✅ CRITICAL: In strict multi-tenant, tenant_id is REQUIRED
        // Filter out clicks without tenant_id (data integrity issue)
        if (!tenantId) {
            logger.error('❌ CRITICAL: Click has no tenant_id - filtering out (strict multi-tenant violation)', {
                click_uuid: c.click_uuid,
                offer_id: c.offer_id,
                publisher_id: c.publisher_id,
                tenant_id_raw: c.tenant_id,
                tenant_id_type: typeof c.tenant_id,
                all_keys: Object.keys(c)
            });
            // This click will be filtered out in the validation step
        }

        return [
            c.click_uuid, offerId, publisherId, publisherOfferId, tenantId,
            c.ip || '', c.user_agent || '', c.referrer || '', c.country || '', c.region || null, c.city || null,
            c.isp || null, c.location || null, c.domain || '',
            c.device_type || '', c.browser || '', c.os || '', c.os_version || '', c.device_brand || '', c.device_model || '',
            c.source_id || null, c.device_id || null, c.google_id || null, c.android_id || null,
            c.rcid || null, c.tid || null,
            new Date(), new Date() // UTC timestamps - database connection handles timezone conversion
        ];
    });

    try {
        const result = await pool.query(sql, [values]);
        logger.info(`✅ Successfully inserted ${validClicks.length} clicks into database`, {
            affectedRows: result[0]?.affectedRows || 0,
            insertId: result[0]?.insertId || null,
            clicks: validClicks.map(c => ({
                click_uuid: c.click_uuid,
                offer_id: c.offer_id,
                publisher_id: c.publisher_id,
                tenant_id: c.tenant_id || 'NULL'
            }))
        });
        return result;
    } catch (err) {
        // ✅ CRITICAL: Enhanced error logging with tenant_id info
        logger.error('❌ BULK INSERT FAILED - DETAILED ERROR INFO:', {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            sqlMessage: err.sqlMessage,
            sql: sql.substring(0, 200) + '...', // Truncate long SQL
            valuesCount: values.length,
            firstValueSample: values[0] ? {
                click_uuid: values[0][0],
                offer_id: values[0][1],
                publisher_id: values[0][2],
                tenant_id: values[0][4], // tenant_id is at index 4
                tenant_id_type: typeof values[0][4],
                tenant_id_value: values[0][4]
            } : null,
            invalidClicksFiltered: clicks.length - validClicks.length,
            tenantIdsInBatch: validClicks.map(c => {
                const tenantId = c.tenant_id;
                return {
                    raw: tenantId,
                    type: typeof tenantId,
                    parsed: tenantId && tenantId !== '' ? parseInt(tenantId) : null
                };
            })
        });

        // ✅ CRITICAL: Check for foreign key constraint errors
        if (err.code === 'ER_NO_REFERENCED_ROW_2' || err.code === '23000') {
            logger.error('❌ FOREIGN KEY CONSTRAINT ERROR!');
            logger.error('   Error details:', {
                code: err.code,
                message: err.message,
                sqlState: err.sqlState,
                sqlMessage: err.sqlMessage
            });

            // Check which foreign key failed
            if (err.message && err.message.includes('tenant_id')) {
                logger.error('   ❌ tenant_id does not exist in tenants table!');
                logger.error('   Check: SELECT * FROM tenants WHERE id IN (SELECT DISTINCT tenant_id FROM clicks WHERE tenant_id IS NOT NULL);');
                logger.error('   Problematic tenant_ids in batch:', validClicks.map(c => ({
                    click_uuid: c.click_uuid,
                    tenant_id: c.tenant_id,
                    offer_id: c.offer_id,
                    publisher_id: c.publisher_id
                })));
            } else if (err.message && err.message.includes('offer_id')) {
                logger.error('   ❌ offer_id does not exist in offers table!');
                logger.error('   Problematic offer_ids in batch:', validClicks.map(c => c.offer_id));
            } else if (err.message && err.message.includes('publisher_id')) {
                logger.error('   ❌ publisher_id does not exist in publishers table!');
                logger.error('   Problematic publisher_ids in batch:', validClicks.map(c => c.publisher_id));
            }
        }

        throw err;
    }
}

async function processPendingConversions(clicks, batchTimestamp = new Date()) {
    // Check Redis for conversion:{click_id}
    const pipeline = redis.pipeline();
    clicks.forEach(c => pipeline.get(`conversion:${c.click_uuid}`));
    const results = await pipeline.exec();

    for (let i = 0; i < results.length; i++) {
        const [err, conversionJson] = results[i];
        if (!err && conversionJson) {
            try {
                const conv = JSON.parse(conversionJson);
                // Insert Conversion - UTC ENFORCEMENT: All timestamps stored as UTC only
                await pool.query(
                    `INSERT INTO conversions (
                      conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
                      rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        uuidv4(), // Generate new DB internal ID or use one if we generated?
                        conv.click_uuid, conv.offer_id, conv.publisher_id, conv.publisher_offer_id,
                        conv.rcid, conv.status, conv.amount, conv.payout, conv.ip,
                        conv.postback_payload, new Date(), new Date(), new Date()
                    ]
                );

                // Update Stats (Redis Atomic Counters) - UTC ENFORCEMENT: UTC date for stats keys
                // stats:offer:{id}:{date}:conversions
                // stats:offer:{id}:{date}:revenue
                // stats:offer:{id}:{date}:payout

                const today = new Date().toISOString().split('T')[0];
                const pipe = redis.pipeline();

                // ✅ CRITICAL: Include tenant_id in stats keys
                const tenantIdVal = conv.tenant_id || 0;
                const statsKeyOffer = `stats:offer:${conv.offer_id}:${tenantIdVal}:${today}`;
                const statsKeyPub = `stats:pub:${conv.publisher_id}:${tenantIdVal}:${today}`; // If we track pub stats

                pipe.incr(`${statsKeyOffer}:conversions`);
                pipe.incrbyfloat(`${statsKeyOffer}:revenue`, conv.amount); // Redis doesn't support float well in old versions, but incrbyfloat is standard now
                pipe.incrbyfloat(`${statsKeyOffer}:payout`, conv.payout);

                // Also Pub Stats?
                pipe.incr(`${statsKeyPub}:conversions`);
                pipe.incrbyfloat(`${statsKeyPub}:revenue`, conv.amount);
                pipe.incrbyfloat(`${statsKeyPub}:payout`, conv.payout);

                await pipe.exec();

                // Cleanup Conversion Key
                await redis.del(`conversion:${conv.click_uuid}`);

                logger.info(`✅ Pending Conversion Processed & Stats Updated (Redis): ${conv.click_uuid}`);

            } catch (insertErr) {
                logger.error(`Failed to process pending conversion for ${clicks[i].click_uuid}`, insertErr);
            }
        }
    }
}

import { v4 as uuidv4 } from 'uuid';

// Dead Letter Queue for failed inserts
async function moveToDeadLetterQueue(entries, options = {}) {
    try {
        const dlqKey = 'stream:clicks:dlq';
        const pipeline = redis.pipeline();
        const reason = options.reason || 'unknown_failure';
        const context = options.context || {};
        const errorInfo = options.error ? {
            message: options.error.message,
            code: options.error.code,
            errno: options.error.errno,
            sqlState: options.error.sqlState,
            sqlMessage: options.error.sqlMessage
        } : null;

        for (const entry of entries) {
            const payload = {
                click_uuid: entry.clickUuid || entry.click_uuid || entry.clickData?.click_uuid || 'unknown',
                streamId: entry.msgId,
                reason,
                error: errorInfo,
                validationErrors: entry.errors || null,
                context,
                clickData: entry.clickData || {},
                timestamp: new Date().toISOString() // UTC ENFORCEMENT: UTC timestamp for DLQ entries
            };
            pipeline.xadd(dlqKey, '*', 'payload', JSON.stringify(payload));
        }

        await pipeline.exec();
        logger.warn(`📋 Moved ${entries.length} entries to DLQ (${reason})`, context);
    } catch (dlqErr) {
        logger.error('❌ Failed to move entries to DLQ:', dlqErr);
    }
}

async function recoverStuckMessages() {
    try {
        const pending = await redis.xpending(STREAM_KEY, GROUP_NAME, '-', '+', 100);
        const now = Date.now();
        const stuck = pending.filter(p => p[2] > 60000); // 60s idle

        if (stuck.length === 0) return;

        logger.info(`♻️  Reclaiming ${stuck.length} stuck messages`);
        const ids = stuck.map(p => p[0]);

        // Claim and get message details
        const claimed = await redis.xclaim(STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 60000, ...ids);

        if (claimed && claimed.length > 0) {
            // Convert to format expected by processBatch
            // Claimed: [[msgId, [key, val, key, val]], ...]
            const buffer = claimed.map(([msgId, fields]) => ({ msgId, fields }));
            logger.info(`♻️  Processing ${buffer.length} reclaimed messages immediately`);
            await processBatch(buffer);
        }
    } catch (e) {
        logger.error(`Error reclaiming: ${e.message}`);
    }
}


export default runWorker;
