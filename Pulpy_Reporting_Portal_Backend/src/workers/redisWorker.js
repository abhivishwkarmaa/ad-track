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

    logger.info('🔄 Worker loop started - waiting for clicks from stream...');

    // Track last log time for periodic "waiting" messages
    let lastNoMessageLog = 0;

    while (true) {
        try {
            // Read from Stream
            const response = await redis.xreadgroup(
                'GROUP', GROUP_NAME, CONSUMER_NAME,
                'COUNT', BATCH_SIZE,
                'BLOCK', BATCH_TIMEOUT,
                'STREAMS', STREAM_KEY, '>'
            );

            // Reset error count on successful read (even if empty)
            consecutiveErrors = 0;

            if (!response || !response.length) {
                // No new messages - log periodically (every 10 seconds of waiting)
                const now = Date.now();
                if (!lastNoMessageLog || now - lastNoMessageLog > 10000) {
                    logger.debug('⏳ No new clicks in stream, waiting...');
                    lastNoMessageLog = now;
                }
                continue;
            }

            const messageCount = response[0]?.[1]?.length || 0;
            logger.info(`📥 Received ${messageCount} messages from stream`);

            const streamEntries = response[0][1];
            if (streamEntries.length === 0) continue;

            logger.info(`📦 Worker Processing Batch: ${streamEntries.length} clicks`);

            const streamClickData = [];
            const msgIds = [];

            // ✅ CRITICAL: Extract click data from stream messages
            // New format: tenant_id, offer_id, publisher_id, click_id
            for (const [msgId, fields] of streamEntries) {
                // Fields are [key1, val1, key2, val2...]
                // New format stores: tenant_id, offer_id, publisher_id, click_id
                const tenantIdIndex = fields.indexOf('tenant_id');
                const offerIdIndex = fields.indexOf('offer_id');
                const publisherIdIndex = fields.indexOf('publisher_id');
                const clickIdIndex = fields.indexOf('click_id');
                
                if (tenantIdIndex !== -1 && offerIdIndex !== -1 && 
                    publisherIdIndex !== -1 && clickIdIndex !== -1) {
                    const tenantId = fields[tenantIdIndex + 1];
                    const offerId = fields[offerIdIndex + 1];
                    const publisherId = fields[publisherIdIndex + 1];
                    const clickId = fields[clickIdIndex + 1];
                    
                    streamClickData.push({
                        msgId,
                        tenantId,
                        offerId,
                        publisherId,
                        clickId
                    });
                    msgIds.push(msgId);
                } else {
                    // Fallback: try old format with 'id' key (backwards compatibility)
                    const idIndex = fields.indexOf('id');
                    if (idIndex !== -1) {
                        const clickId = fields[idIndex + 1];
                        const tenantId = fields.indexOf('tenant_id') !== -1 ? 
                            fields[fields.indexOf('tenant_id') + 1] : null;
                        streamClickData.push({
                            msgId,
                            tenantId,
                            offerId: null, // Will need to read from Redis hash
                            publisherId: null, // Will need to read from Redis hash
                            clickId
                        });
                        msgIds.push(msgId);
                    }
                }
            }

            const clickIds = streamClickData.map(d => d.clickId);

            if (clickIds.length === 0) {
                // Ack empty messages
                if (msgIds.length > 0) await redis.xack(STREAM_KEY, GROUP_NAME, ...msgIds);
                continue;
            }

            // ✅ CRITICAL: Build Redis keys using new format: click:{tenant_id}:{offer_id}:{publisher_id}:{click_id}
            // Fallback to old format if tenant_id/offer_id/publisher_id not in stream
            const redisKeys = streamClickData.map(data => {
                if (data.tenantId && data.offerId && data.publisherId && data.clickId) {
                    return `click:${data.tenantId}:${data.offerId}:${data.publisherId}:${data.clickId}`;
                } else {
                    // Fallback to old format (backwards compatibility)
                    return `click:${data.clickId}`;
                }
            });

            // ✅ CRITICAL: Fetch full click data from Redis HASH
            // Worker MUST re-read full click data from Redis HASH (don't trust stream alone)
            const pipeline = redis.pipeline();
            logger.info('📥 Worker fetching click data from Redis:', redisKeys);
            redisKeys.forEach(key => pipeline.hgetall(key));
            const dataResults = await pipeline.exec();

            // DEBUG: Log first result to check if data exists
            if (dataResults.length > 0 && dataResults[0]) {
                const [err, firstData] = dataResults[0];
                logger.info('🔍 Worker processing batch - first click data:', {
                    hasError: !!err,
                    error: err?.message,
                    hasData: !!firstData,
                    dataKeys: firstData ? Object.keys(firstData) : [],
                    offer_id: firstData?.offer_id,
                    publisher_id: firstData?.publisher_id,
                    tenant_id: firstData?.tenant_id,
                    tenant_id_type: typeof firstData?.tenant_id,
                    click_uuid: clickIds[0]
                });
            }

            // DEBUG: Log first result to check content (removed duplicate logging)

            const validEntries = [];
            const invalidEntries = [];

            for (let i = 0; i < dataResults.length; i++) {
                const [err, clickData] = dataResults[i];
                const streamData = streamClickData[i];
                const clickUuid = streamData?.clickId || clickIds[i] || null;
                const redisKey = redisKeys[i] || null;

                // ✅ CRITICAL: Check if click data exists and is valid
                // Also check if click has already been flushed (avoid duplicate processing)
                if (!err && clickData && Object.keys(clickData).length > 0 && clickData.offer_id) {
                    // ✅ CRITICAL: Skip if already flushed (idempotency check)
                    const isFlushed = clickData.flushed === 'true' || clickData.flushed === true;
                    if (isFlushed) {
                        logger.info(`⏭️ Click already flushed (skipping): ${clickUuid}`, {
                            redis_key: redisKey,
                            click_id: clickUuid
                        });
                        // Still acknowledge message to prevent reprocessing
                        validEntries.push({
                            msgId: streamData.msgId,
                            clickUuid,
                            clickData,
                            alreadyFlushed: true
                        });
                    } else {
                        validEntries.push({
                            msgId: streamData.msgId,
                            clickUuid,
                            clickData,
                            alreadyFlushed: false
                        });
                    }
                } else {
                    const validationErrors = [];
                    if (err) validationErrors.push(`Redis error: ${err.message}`);
                    if (!clickData || Object.keys(clickData).length === 0) {
                        validationErrors.push('click hash does not exist in Redis (may have expired or was never written)');
                    } else if (!clickData.offer_id) {
                        validationErrors.push('missing offer_id in click data');
                    }

                    invalidEntries.push({
                        msgId: streamData?.msgId || msgIds[i],
                        clickUuid,
                        redisKey,
                        clickData: clickData || null,
                        errors: validationErrors
                    });
                    logger.warn(`❌ Click data invalid/missing: ${clickUuid || 'unknown'}`, {
                        redis_key: redisKey,
                        errors: validationErrors,
                        hasData: !!clickData,
                        dataKeys: clickData ? Object.keys(clickData) : [],
                        redisError: err?.message
                    });
                }
            }

            if (invalidEntries.length > 0) {
                // Separate entries with missing hashes (expired) from other validation errors
                const missingHashEntries = invalidEntries.filter(entry =>
                    entry.errors.some(e => e.includes('click hash does not exist'))
                );
                const otherInvalidEntries = invalidEntries.filter(entry =>
                    !entry.errors.some(e => e.includes('click hash does not exist'))
                );

                // Move only non-expired invalid entries to DLQ
                if (otherInvalidEntries.length > 0) {
                    await moveToDeadLetterQueue(otherInvalidEntries, {
                        reason: 'validation_error',
                        context: {
                            stream: STREAM_KEY,
                            group: GROUP_NAME,
                            consumer: CONSUMER_NAME,
                            batchSize: streamEntries.length
                        }
                    });
                }

                // Acknowledge all invalid entries (including expired hashes) to prevent pile-up
                const invalidPipeline = redis.pipeline();
                const invalidMsgIds = invalidEntries.map(entry => entry.msgId);
                invalidPipeline.xack(STREAM_KEY, GROUP_NAME, ...invalidMsgIds);

                if (missingHashEntries.length > 0) {
                    logger.warn(`⚠️ Acknowledging ${missingHashEntries.length} clicks with expired/missing hashes (cannot recover)`);
                }
                if (otherInvalidEntries.length > 0) {
                    logger.warn(`⚠️ Acknowledging ${otherInvalidEntries.length} clicks with validation errors (moved to DLQ)`);
                }

                await invalidPipeline.exec();
            }

            if (validEntries.length === 0) {
                logger.warn('⚠️ No valid entries to process after validation', {
                    total_entries: streamEntries.length,
                    invalid_count: invalidEntries.length,
                    invalid_reasons: invalidEntries.map(e => e.errors).flat()
                });
                // Still acknowledge invalid messages to prevent them from piling up
                if (invalidEntries.length > 0) {
                    const invalidMsgIds = invalidEntries.map(entry => entry.msgId);
                    await redis.xack(STREAM_KEY, GROUP_NAME, ...invalidMsgIds);
                    logger.info(`✅ Acknowledged ${invalidEntries.length} invalid messages`);
                }
                continue;
            }

            // ✅ CRITICAL: Log tenant_id status before processing
            logger.info(`📊 Processing ${validEntries.length} clicks with tenant_ids:`, {
                tenant_ids: validEntries.map(e => ({
                    click_uuid: e.clickData.click_uuid,
                    tenant_id: e.clickData.tenant_id || 'NULL',
                    tenant_id_type: typeof e.clickData.tenant_id,
                    offer_id: e.clickData.offer_id,
                    publisher_id: e.clickData.publisher_id
                }))
            });

            logger.info(`✅ Validated ${validEntries.length} clicks, ${invalidEntries.length} invalid`);

            // ✅ CRITICAL: Filter out already-flushed clicks (they don't need DB insert)
            const clicksToInsert = validEntries.filter(e => !e.alreadyFlushed);
            const alreadyFlushedIds = validEntries.filter(e => e.alreadyFlushed).map(e => e.msgId);

            if (alreadyFlushedIds.length > 0) {
                // Acknowledge already-flushed clicks
                await redis.xack(STREAM_KEY, GROUP_NAME, ...alreadyFlushedIds);
                logger.info(`✅ Acknowledged ${alreadyFlushedIds.length} already-flushed clicks`);
            }

            if (clicksToInsert.length === 0) {
                logger.info('⏭️ No new clicks to insert (all already flushed)');
                continue;
            }

            const validMsgIds = clicksToInsert.map(entry => entry.msgId);
            const validClicks = clicksToInsert.map(entry => entry.clickData);
            const clickIdsToCleanup = clicksToInsert.map(entry => {
                const c = entry.clickData;
                // Build Redis key using new format
                if (c.tenant_id && c.offer_id && c.publisher_id && c.click_uuid) {
                    return `click:${c.tenant_id}:${c.offer_id}:${c.publisher_id}:${c.click_uuid}`;
                }
                // Fallback to old format
                return `click:${c.click_uuid}`;
            });
            // UTC ENFORCEMENT: Use UTC timestamp for all DB operations
            const batchTimestamp = new Date().toISOString();

            let retryCount = 0;
            let insertSuccess = false;

            while (retryCount < MAX_RETRY_ATTEMPTS && !insertSuccess) {
                try {
                    // ✅ CRITICAL: Insert clicks into MySQL
                    await bulkInsertClicks(validClicks, batchTimestamp);
                    insertSuccess = true;

                    // ✅ CRITICAL: Mark clicks as flushed in Redis
                    const flushPipeline = redis.pipeline();
                    clickIdsToCleanup.forEach(key => {
                        flushPipeline.hset(key, 'flushed', 'true');
                    });
                    await flushPipeline.exec();
                    logger.info(`✅ Marked ${clickIdsToCleanup.length} clicks as flushed in Redis`);

                    await processPendingConversions(validClicks, batchTimestamp);

                    // UTC ENFORCEMENT: Use UTC date for stats keys (converted to IST only in business logic)
                    const pipelineStats = redis.pipeline();
                    const today = new Date().toISOString().split('T')[0];
                    for (const c of validClicks) {
                        // ✅ CRITICAL: Include tenant_id in Redis key structure for proper attribution
                        // Format: stats:offer:{offerId}:{tenantId}:{date}:{metric}
                        // Use 0 or 'null' for missing tenant_id to keep key structure consistent
                        const tenantIdVal = c.tenant_id || 0;
                        const statsKeyOffer = `stats:offer:${c.offer_id}:${tenantIdVal}:${today}`;
                        const statsKeyPub = `stats:pub:${c.publisher_id}:${tenantIdVal}:${today}`;

                        pipelineStats.incr(`${statsKeyOffer}:clicks`);
                        pipelineStats.incr(`${statsKeyPub}:clicks`);
                    }
                    await pipelineStats.exec();

                    // ✅ CRITICAL: After successful DB insert, ACK stream message
                    // Do NOT delete Redis hash immediately (keep for backfill safety net)
                    // Hash will expire after TTL (24h)
                    const cleanupPipeline = redis.pipeline();
                    cleanupPipeline.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                    // ✅ CRITICAL: DO NOT delete Redis hash - keep for backfill safety net
                    // cleanupPipeline.del() removed - let TTL handle cleanup
                    await cleanupPipeline.exec();

                    // ✅ CRITICAL: Log DB inserted
                    logger.info(`✅ DB inserted: ${validClicks.length} clicks`, {
                        click_ids: validClicks.map(c => c.click_uuid),
                        tenant_ids: validClicks.map(c => c.tenant_id),
                        offer_ids: validClicks.map(c => c.offer_id),
                        publisher_ids: validClicks.map(c => c.publisher_id)
                    });

                } catch (dbErr) {
                    retryCount++;
                    const isLastAttempt = retryCount >= MAX_RETRY_ATTEMPTS;

                    logger.error(`❌ BATCH DB INSERT FAILED - ATTEMPT ${retryCount}/${MAX_RETRY_ATTEMPTS}`, {
                        error: dbErr.message,
                        code: dbErr.code,
                        errno: dbErr.errno,
                        sqlState: dbErr.sqlState,
                        sqlMessage: dbErr.sqlMessage,
                        stream: STREAM_KEY,
                        group: GROUP_NAME,
                        consumer: CONSUMER_NAME,
                        batchSize: validClicks.length,
                        sampleMsgId: validEntries[0]?.msgId,
                        nextAction: isLastAttempt ? 'MOVE_TO_DLQ' : 'RETRY_WITH_BACKOFF'
                    });

                    if (isLastAttempt) {
                        await moveToDeadLetterQueue(validEntries, {
                            reason: 'db_insert_failure',
                            error: dbErr,
                            context: {
                                stream: STREAM_KEY,
                                group: GROUP_NAME,
                                consumer: CONSUMER_NAME,
                                batchSize: validClicks.length
                            }
                        });

                        await redis.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                        const cleanupPipeline = redis.pipeline();
                        clickIdsToCleanup.forEach(id => cleanupPipeline.del(`click:${id}`));
                        await cleanupPipeline.exec();

                        logger.error('❌ MAX RETRIES EXCEEDED - MOVED TO DLQ AND ACKED');
                    } else {
                        const backoffMs = Math.pow(2, retryCount) * 1000;
                        logger.info(`⏳ RETRYING IN ${backoffMs}ms...`);
                        await new Promise(r => setTimeout(r, backoffMs));
                    }
                }
            }

        } catch (err) {
            consecutiveErrors++;
            const errorType = classifyError(err);
            const isRetryable = errorType === ERROR_TYPES.RETRYABLE;
            
            // ✅ CRITICAL: Handle NOGROUP error - consumer group was deleted
            // Auto-recreate stream and consumer group, then retry
            if (err.message && (err.message.includes('NOGROUP') || err.message.includes('no such key'))) {
                logger.warn(`⚠️ Consumer group missing (NOGROUP) - recreating stream and group`, {
                    stream: STREAM_KEY,
                    group: GROUP_NAME,
                    error: err.message
                });
                try {
                    await setupStream();
                    logger.info(`✅ Stream and consumer group recreated successfully`);
                    consecutiveErrors = 0; // Reset error count after successful recreation
                    continue; // Retry reading immediately
                } catch (setupErr) {
                    logger.error(`❌ Failed to recreate stream/group: ${setupErr.message}`, setupErr);
                    // Fall through to normal error handling
                }
            }

            // Exponential backoff: 2s, 4s, 8s... max 1 min
            const backoffMs = Math.min(Math.pow(2, consecutiveErrors) * 1000, 60000);

            if (isRetryable) {
                logger.warn({
                    err: { message: err.message, code: err.code },
                    attempt: consecutiveErrors,
                    nextRetryMs: backoffMs
                }, `⚠️ Worker Retryable Error: ${err.message || 'Unknown'}`);
            } else {
                // Correct Pino usage: Object first, then message
                logger.error({
                    err,
                    stream: STREAM_KEY,
                    group: GROUP_NAME,
                    attempt: consecutiveErrors,
                    nextRetryMs: backoffMs
                }, `❌ Worker Critical Error: ${err.message || 'Unknown'}`);
            }

            await new Promise(r => setTimeout(r, backoffMs));
        }
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

// Recovery function to reprocess DLQ entries
async function recoverFromDeadLetterQueue() {
    try {
        const dlqKey = 'stream:clicks:dlq';
        const dlqLength = (await redis.xlen(dlqKey));

        if (dlqLength === 0) {
            logger.info('✅ DLQ is empty');
            return;
        }

        logger.info(`🔄 Recovering ${dlqLength} entries from DLQ`);

        const entries = await redis.xrange(dlqKey, '-', '+', 'COUNT', 100);

        for (const [entryId, fields] of entries) {
            try {
                const payload = JSON.parse(fields[1]);
                const clickData = payload.clickData || {};

                await bulkInsertClicks([clickData]);

                await redis.xdel(dlqKey, entryId);
                logger.info(`✅ Recovered click: ${clickData.click_uuid}`);

            } catch (recoverErr) {
                logger.error(`❌ Recovery failed for DLQ entry: ${entryId}`, recoverErr);
            }
        }

    } catch (err) {
        logger.error('❌ DLQ recovery failed:', err);
    }
}

// Manual recovery endpoint (can be called periodically)
export { recoverFromDeadLetterQueue };

export default runWorker;
