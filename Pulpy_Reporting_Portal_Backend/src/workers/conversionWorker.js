import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { generateClickId } from '../utils/urlGenerator.js';

const STREAM_KEY = 'stream:conversions';
const GROUP_NAME = 'conversion_group';
const CONSUMER_NAME = `conv_worker_${process.env.HOSTNAME || 'local'}_${process.pid}`;
const BATCH_SIZE = 50;
const BLOCK_MS = 2000;

const MAX_RETRY = 3;

/**
 * Setup Redis Stream Group
 */
async function setupStream() {
    try {
        await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
        logger.info(`✅ Conversion Stream Ready: ${STREAM_KEY}`);
    } catch (err) {
        if (err.message && err.message.includes('BUSYGROUP')) {
            logger.info(`✅ Conversion Group Exists: ${GROUP_NAME}`);
        } else {
            logger.error(`❌ Failed to setup conversion stream: ${err.message}`);
            throw err;
        }
    }
}

/**
 * Main Conversion Worker Loop
 */
async function runConversionWorker() {
    await setupStream();
    logger.info(`🚀 Conversion Worker Started: ${CONSUMER_NAME}`);

    while (true) {
        try {
            // Read from Stream
            const response = await redis.xreadgroup(
                'GROUP', GROUP_NAME, CONSUMER_NAME,
                'COUNT', BATCH_SIZE,
                'BLOCK', BLOCK_MS,
                'STREAMS', STREAM_KEY, '>'
            );

            if (!response || !response.length) {
                // Heartbeat / Maintenance logic could go here
                continue;
            }

            const entries = response[0][1];
            if (entries.length === 0) continue;

            logger.info(`📥 Processing ${entries.length} conversions...`);

            await processConversionBatch(entries);

        } catch (err) {
            logger.error({ err }, '❌ Conversion Worker Error Loop');
            // Backoff
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

/**
 * Process a batch of conversions
 */
async function processConversionBatch(entries) {
    const validConversions = [];
    const msgIdsToAck = [];
    const retryLater = [];

    // 1. Fetch Data
    const pipeline = redis.pipeline();
    const mapMsgIdToClickUuid = new Map();

    for (const [msgId, fields] of entries) {
        const clickIdIdx = fields.indexOf('click_uuid');
        const clickUuid = clickIdIdx !== -1 ? fields[clickIdIdx + 1] : null;

        if (clickUuid) {
            mapMsgIdToClickUuid.set(msgId, clickUuid);
            pipeline.get(`conversion:${clickUuid}`);
        } else {
            // Invalid message
            msgIdsToAck.push(msgId);
        }
    }

    const results = await pipeline.exec();

    // 2. Validate & Categorize
    // results: [[err, jsonString], ...]
    let resultIdx = 0;

    // We need to match results back to msgIds. 
    // They are in order of loop iteration for valid clickUuids.
    // Let's iterate entries again or reconstruction map.
    // Better: iterate mapMsgIdToClickUuid entries

    const clickUuidsToCheck = [];
    const indexToMsgId = []; // Map index in clickUuidsToCheck to msgId

    const conversionDataMap = new Map(); // clickUuid -> conversionData

    for (const [msgId, clickUuid] of mapMsgIdToClickUuid) {
        const [err, jsonString] = results[resultIdx++];

        if (!err && jsonString) {
            const data = JSON.parse(jsonString);
            conversionDataMap.set(clickUuid, data);
            clickUuidsToCheck.push(clickUuid);
            indexToMsgId.push(msgId);
        } else {
            // Data expired or missing logic
            // If data missing, we can't process. 
            // Log error and ACK (drop) or Retry?
            // If it's missing from Redis, we lost the conversion payload. 
            // Dropping is the only specific action unless we have backup.
            logger.warn(`⚠️ Conversion data missing for ${clickUuid}, dropping.`);
            msgIdsToAck.push(msgId);
        }
    }

    if (clickUuidsToCheck.length === 0) {
        if (msgIdsToAck.length > 0) await redis.xack(STREAM_KEY, GROUP_NAME, ...msgIdsToAck);
        return;
    }

    // 3. Bulk Check if Clicks Exists in DB
    // Optimization: SELECT click_uuid FROM clicks WHERE click_uuid IN (...)
    // We can't insert conversion if click doesn't exist (Foreign Key).

    let existingClickUuids = new Set();

    try {
        // Chunk query if too large
        const sql = `SELECT click_uuid FROM clicks WHERE click_uuid IN (?)`;
        const [rows] = await pool.query(sql, [clickUuidsToCheck]);

        rows.forEach(r => existingClickUuids.add(r.click_uuid));

    } catch (dbErr) {
        logger.error({ err: dbErr }, '❌ DB Error checking clicks');
        // If DB down, we should retry ALL this batch later.
        // Return without ACKing.
        // Or push to internal retry queue?
        // Simple: Throw to trigger worker loop catch + backoff + retry same batch (XREADGROUP doesn't auto-retry unless we claim, wait. 
        // Logic: If we crash here, messages are Pending. Next restart we need to Claim them.
        // Current implementation reads NEW messages (>). 
        // We need a PEL recovery mechanism or just NACK (do nothing).
        // Let's NACK by throwing.
        throw dbErr;
    }

    // 4. Filter: Ready vs Retry
    for (let i = 0; i < clickUuidsToCheck.length; i++) {
        const clickUuid = clickUuidsToCheck[i];
        const msgId = indexToMsgId[i];

        if (existingClickUuids.has(clickUuid)) {
            // Ready to Insert
            validConversions.push({
                msgId,
                data: conversionDataMap.get(clickUuid)
            });
        } else {
            // Click Missing from DB
            // Check if Click is in Redis (Lag)?
            // For now, treat as "Retry Later"
            // We shouldn't ACK. We should let it sit in PEL or move to Retry Stream.
            // Moving to Retry Stream is safer to avoid blocking partition.
            retryLater.push({ msgId, clickUuid });
        }
    }

    // 5. Bulk Insert Conversions
    if (validConversions.length > 0) {
        try {
            await bulkInsertConversions(validConversions);
            // ACK processed
            const processedIds = validConversions.map(v => v.msgId);
            msgIdsToAck.push(...processedIds);

            // Cleanup Redis Keys
            const cleanPipe = redis.pipeline();
            validConversions.forEach(v => {
                cleanPipe.del(`conversion:${v.data.click_uuid}`);
            });
            await cleanPipe.exec();

        } catch (insertErr) {
            logger.error('❌ Conversion Bulk Insert Failed:', insertErr);
            // Don't ACK.
            throw insertErr;
        }
    }

    // 6. Handle Retries (Click Not Found)
    // Strategy: Move to 'stream:conversions:retry' or just NACK?
    // If we NACK, they stay in Pending. We need a recovery worker.
    // User requested "Retry safely".
    // Let's re-queue them to the Main Stream with a visible timestamp or delay?
    // Or use internal Retry Bucket.
    // Simple robust way: PUSH back to TAIL of stream with 'retry_count'.
    // BUT we must filter duplicates if we do that.
    // Better: Use a dedicated Retry ZSET `queue:conversions:retry` (timestamp).
    // And a loop pulls from there.

    // For this implementation, let's keep it simple: 
    // Log them, and do NOT ACK.
    // They will remain in PEL.
    // We need a Recovery Function (like in redisWorker) to process PEL.
    // I will add `recoverPendingConversions` similar to `recoverStuckMessages`.

    if (retryLater.length > 0) {
        logger.info(`⏳ ${retryLater.length} conversions waiting for parent click (Pending)`);
        // Do nothing -> stays in PEL.
    }

    // 7. ACK messages that were processed or invalid
    if (msgIdsToAck.length > 0) {
        await redis.xack(STREAM_KEY, GROUP_NAME, ...msgIdsToAck);
    }
}

import postbackService from '../services/postbackService.js';

/**
 * Bulk Insert Logic
 */
async function bulkInsertConversions(items) {
    if (items.length === 0) return;

    const values = items.map(item => {
        const c = item.data; // conversion data
        // Generate a longer, collision-resistant conversion UUID using the same generator
        // Fallback to uuidv4 for missing ids (shouldn't happen)
        let conversionUuid;
        try {
            conversionUuid = generateClickId(c.tenant_id || 0, c.offer_id || 0, c.publisher_id || 0, 96);
        } catch (e) {
            conversionUuid = uuidv4();
        }
        c.conversion_uuid = conversionUuid; // Save for postback

        return [
            conversionUuid,
            c.click_uuid, c.offer_id, c.publisher_id, c.publisher_offer_id, c.tenant_id,
            c.rcid || uuidv4(), c.status, c.amount, c.payout, c.ip,
            c.postback_payload, new Date(), new Date(), new Date(),
            0  // affiliate_postback_fired: fire only when status=approved, then set to 1
        ];
    });

    const sql = `INSERT INTO conversions (
        conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at, affiliate_postback_fired
    ) VALUES ? ON DUPLICATE KEY UPDATE updated_at = VALUES(updated_at)`;

    await pool.query(sql, [values]);

    // Fetch IDs for logging
    try {
        const uuids = items.map(item => item.data.conversion_uuid);
        if (uuids.length > 0) {
            const [rows] = await pool.query('SELECT id, conversion_uuid FROM conversions WHERE conversion_uuid IN (?)', [uuids]);
            const uuidMap = new Map();
            rows.forEach(r => uuidMap.set(r.conversion_uuid, r.id));

            items.forEach(item => {
                if (uuidMap.has(item.data.conversion_uuid)) {
                    item.data.id = uuidMap.get(item.data.conversion_uuid);
                }
            });
        }
    } catch (idErr) {
        logger.error('❌ Failed to fetch conversion IDs:', idErr);
    }

    // Update Stats
    const pipeline = redis.pipeline();
    const today = new Date().toISOString().split('T')[0];

    items.forEach(item => {
        const c = item.data;
        const tenantIdVal = c.tenant_id || 0;
        const statsKeyOffer = `stats:offer:${c.offer_id}:${tenantIdVal}:${today}`;
        const statsKeyPub = `stats:pub:${c.publisher_id}:${tenantIdVal}:${today}`;

        // Revenue: ALWAYS increment (Advertiser Revenue) - regardless of status
        pipeline.incrbyfloat(`${statsKeyOffer}:revenue`, c.amount);
        pipeline.incrbyfloat(`${statsKeyPub}:revenue`, c.amount);

        // Only increment stats if status is not rejected
        if (c.status !== 'rejected' && c.status !== 'rejected_cap') {
            pipeline.incr(`${statsKeyOffer}:conversions`);
            pipeline.incr(`${statsKeyPub}:conversions`);

            // Payout: ONLY Approved
            if (c.status === 'approved') {
                pipeline.incrbyfloat(`${statsKeyOffer}:payout`, c.payout);
                pipeline.incrbyfloat(`${statsKeyPub}:payout`, c.payout);
            }
        }
    });

    await pipeline.exec();
    logger.info(`✅ Inserted ${items.length} conversions`);

    // Fire Affiliate Postbacks
    await fireAffiliatePostbacks(items);
}

/**
 * Fire Affiliate Postbacks
 * BUSINESS RULE: Only fire when status === 'approved'. Then set affiliate_postback_fired=1 for idempotency.
 */
async function fireAffiliatePostbacks(items) {
    const promises = items.map(async (item) => {
        const c = item.data;
        // STRICT: Affiliate postback ONLY for approved conversions. Never for pending/rejected/rejected_cap.
        if (c.status !== 'approved' || !c.callback_url) return;

        try {
            const conversion = {
                conversion_uuid: c.conversion_uuid,
                id: c.id,
                tenant_id: c.tenant_id,
                publisher_id: c.publisher_id,
                rcid: c.rcid,
                payout: c.payout,
                amount: c.amount,
                status: c.status
            };
            const click = { tid: c.tid };

            await postbackService.sendPublisherPostback(c.callback_url, conversion, click);
            try {
                await pool.query(
                    'UPDATE conversions SET affiliate_postback_fired = 1 WHERE id = ? AND tenant_id = ?',
                    [c.id, c.tenant_id]
                );
            } catch (updateErr) {
                if (updateErr.code === 'ER_BAD_FIELD_ERROR') {
                    logger.warn('affiliate_postback_fired column missing - run migration add_affiliate_postback_fired.sql');
                } else throw updateErr;
            }
            logger.info(`✅ Affiliate Postback Fired: ${c.callback_url}`);
        } catch (err) {
            logger.error(`❌ Failed to fire affiliate postback: ${err.message}`, { url: c.callback_url });
        }
    });

    await Promise.allSettled(promises);
}


/**
 * Recover Pending/Stuck Messages (e.g. waiting for Click)
 */
async function recoverPendingConversions() {
    try {
        // Check PEL for messages older than 60s
        const pending = await redis.xpending(STREAM_KEY, GROUP_NAME, '-', '+', 100);
        const stuck = pending.filter(p => p[2] > 60000); // 60s idle

        if (stuck.length === 0) return;

        logger.info(`♻️ Reclaiming ${stuck.length} stuck/pending conversions`);
        const ids = stuck.map(p => p[0]);

        const claimed = await redis.xclaim(STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 60000, ...ids);

        if (claimed.length > 0) {
            // Pass claimed directly as it matches [[msgId, fields], ...] format expected by processConversionBatch
            await processConversionBatch(claimed);
        }
    } catch (e) {
        logger.error({ err: e }, 'Recovery Error');
    }
}

// Start Recovery Loop
setInterval(recoverPendingConversions, 60000);


export default runConversionWorker;
