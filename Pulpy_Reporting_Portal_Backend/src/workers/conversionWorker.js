import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { generateClickId } from '../utils/urlGenerator.js';
import cacheService from '../services/cacheService.js';
import dailyAggregateService from '../services/dailyAggregateService.js';

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
        // ✅ STRICT CAP CHECK (DB/Worker Level)
        await Promise.all(validConversions.map(async (v) => {
            const c = v.data;
            try {
                // Fetch assignment & offer to check caps
                const [assignment, offer] = await Promise.all([
                    cacheService.getAssignment(c.publisher_id, c.offer_id, c.tenant_id),
                    cacheService.getOffer(c.offer_id, c.tenant_id)
                ]);

                let rejected = false;

                // 1. Check Offer Cap (or Force Reject from Click)
                if (c.force_reject === 'true' || c.force_reject === true) {
                    c.status = 'rejected_cap';
                    c.payout = 0;
                    rejected = true;
                    logger.info(`[WORKER] Conversion rejected (Force Reject from Click)`, {
                        click_uuid: c.click_uuid,
                        offer_id: c.offer_id
                    });
                } else if (offer) {
                    const offerCapStatus = await cacheService.getCapStatus('offer', offer.id, offer, c.tenant_id);
                    if (offerCapStatus.isHit) {
                        c.status = 'rejected_cap';
                        c.payout = 0;
                        rejected = true;
                        logger.info(`[WORKER] Conversion rejected (Offer Cap Hit)`, {
                            click_uuid: c.click_uuid,
                            offer_id: offer.id
                        });
                    }
                }

                // 2. Check Publisher Cap (if not already rejected)
                if (!rejected && assignment) {
                    const pubCapStatus = await cacheService.getCapStatus('publisher', assignment.id, assignment, c.tenant_id);
                    if (pubCapStatus.isHit) {
                        c.status = 'rejected_cap';
                        c.payout = 0;
                        rejected = true;
                        logger.info(`[WORKER] Conversion rejected (Publisher Cap Hit)`, {
                            click_uuid: c.click_uuid,
                            assignment_id: assignment.id,
                            cap_type: assignment.capping_type
                        });
                    }
                }

                // 3. Increment Counters (if not rejected & valid status & assignment/offer exists)
                if (!rejected && ['approved', 'pending'].includes(c.status)) {
                    const incPromises = [];
                    if (assignment) {
                        // Publisher budget uses payout
                        incPromises.push(cacheService.incrementCap('publisher', assignment.id, assignment, c.payout, c.tenant_id));
                    }
                    if (offer) {
                        // Offer budget uses amount (revenue)
                        incPromises.push(cacheService.incrementCap('offer', offer.id, offer, c.amount, c.tenant_id));
                    }
                    await Promise.all(incPromises);
                }

            } catch (capErr) {
                logger.error(`[WORKER] Cap check failed for ${c.click_uuid}`, capErr);
                // Continue with original status on error (monitor logs)
            }
        }));

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
        // Keep long-format IDs even in fallback paths.
        let conversionUuid;
        try {
            conversionUuid = generateClickId(c.tenant_id || 0, c.offer_id || 0, c.publisher_id || 0, 96);
        } catch (e) {
            conversionUuid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 96);
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

    // Fetch IDs for logging and strict stats
    let uuids = [];
    try {
        uuids = items.map(item => item.data.conversion_uuid);
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

    // 5. Update Daily Offer Stats (Strict Ledger)
    // We update stats directly after insertion.
    // CRITICAL: Only update stats for conversions that were actually NEW (inserted).
    // If a conversion was a duplicate (updated), we must NOT increment stats again.
    // Since we used ON DUPLICATE KEY UPDATE, we can't easily distinguish per-row in batch result.
    // Strategy: We already have 'uuids' (all conversion_uuids in batch).
    // We need to identify which ones were ALREADY in DB before this batch (duplicates).
    // But we just inserted them!
    // Wait, the previous block fetched IDs: "SELECT id, conversion_uuid FROM conversions WHERE conversion_uuid IN (?)".
    // If we run this SELECT *before* the INSERT, we know which ones exist.
    // But we are running it *after*.
    // Actually, we can rely on the `created_at` timestamp.
    // If `created_at` is close to `NOW()`, it's new. If it's old, it was an update.
    // Better: We should filter duplicates *before* insert if we want strict stats.

    // REVISED STRATEGY for Strict Stats:
    // The previous implementation of `bulkInsertConversions` simply ran INSERT ... ON DUPLICATE KEY UPDATE.
    // To ensure we don't double count stats, we will:
    // 1. Identify valid NEW items only.
    //    We can do this by checking if `affectedRows` matches `items.length` (all new) or by stricter checks.
    //    Or, we can calculate stats ONLY for items that *didn't* exist before.
    //    Since `processPostback` service already does a check for `rcid` and `click_id` deduplication,
    //    most duplicates should be caught there.
    //    However, race conditions in the worker (processed twice) are the main risk.

    // Let's rely on the fact that `conversion_uuid` is unique.
    // We will verify which UUIDs are "new" to the stats system.
    // But simpler: The worker should process a given message ID only once (Redis Stream semantics).
    // The only risk is if the worker crashes after DB insert but before ACK.
    // In that case, the message is re-delivered.
    // If we simply increment stats again, we double count.
    // SOLUTION: Check if the conversion ALREADY contributed to stats? No, too hard.
    // SOLUTION: Check if conversion was created RECENTLY (in this transaction).
    // Let's modify the fetch logic above to get `created_at`.
    // If `created_at` > `timestamp_before_insert`, it's new.

    const newItems = [];
    try {
        if (uuids.length > 0) {
            // We fetch the rows again to check timestamps, or we could have done it in the previous fetch
            const [rows] = await pool.query('SELECT conversion_uuid, created_at, updated_at FROM conversions WHERE conversion_uuid IN (?)', [uuids]);

            // Create a map of uuid -> row
            const rowMap = new Map();
            rows.forEach(r => rowMap.set(r.conversion_uuid, r));

            items.forEach(item => {
                const dbRow = rowMap.get(item.data.conversion_uuid);
                // Logic: If the row's created_at is strictly equal to updated_at (within a second tolerance), it's likely a new insert.
                // If updated_at is significantly later than created_at, it was an update (duplicate).
                // OR: If the record didn't exist before (we can't check that now effectively without a pre-select).
                // ROBUST WAY: Use the `affiliate_postback_fired` flag or similar? No.

                // Let's use the discrepancy between created_at and updated_at.
                // When inserted: created_at ~= updated_at.
                // When updated (duplicate): created_at < updated_at.
                if (dbRow) {
                    const created = new Date(dbRow.created_at).getTime();
                    const updated = new Date(dbRow.updated_at).getTime();
                    // Tolerance of 1000ms
                    if (Math.abs(updated - created) < 2000) {
                        newItems.push(item);
                    } else {
                        logger.warn(`⚠️ Duplicate conversion detected (skipping stats increment): ${item.data.conversion_uuid}`);
                    }
                }
            });
        }
    } catch (checkErr) {
        logger.error('❌ Failed to check for new conversions, skipping stats update to be safe:', checkErr);
        // If we can't verify they are new, we SKIP updating stats to prevent inflation.
        // Better to under-report than over-report in a "Strict Ledger" scenario.
        return;
    }

    try {
        if (newItems.length > 0) {
            await updateDailyStats(newItems);
            logger.info(`✅ Updated daily_offer_stats for ${newItems.length} NEW conversions`);
        }
    } catch (statsErr) {
        logger.error('❌ Failed to update daily_offer_stats:', statsErr);
    }

    // Fire Affiliate Postbacks
    await fireAffiliatePostbacks(items);
}

/**
 * Helper to get IST Date String (YYYY-MM-DD)
 */
const getIstDateString = () => {
    const now = new Date();
    // UTC time + 5 hours 30 minutes
    const istTime = new Date(now.getTime() + (330 * 60 * 1000));
    return istTime.toISOString().split('T')[0];
};

/**
 * Update Daily Offer Stats directly in DB
 */
async function updateDailyStats(items) {
    if (items.length === 0) return;

    const today = getIstDateString(); // YYYY-MM-DD in IST
    const groups = {}; // Key: offer_id:tenant_id:publisher_id

    // Aggregate delta for this batch
    for (const item of items) {
        const c = item.data;
        const offerId = c.offer_id;
        const tenantId = c.tenant_id || 0;
        const publisherId = c.publisher_id;
        const key = `${offerId}:${tenantId}:${publisherId}`;

        if (!groups[key]) {
            groups[key] = {
                offerId,
                tenantId,
                publisherId,
                conversions: 0,
                approved: 0,
                pending: 0,
                rejected: 0,
                revenue: 0,
                payout: 0
            };
        }

        const g = groups[key];
        // Revenue: Always count (Advertiser Revenue)
        g.revenue += parseFloat(c.amount || 0);
        g.conversions += 1;

        const status = (c.status || 'pending').toLowerCase();
        if (status === 'approved') {
            g.approved += 1;
            g.payout += parseFloat(c.payout || 0); // Payout only if approved
        } else if (status === 'pending') {
            g.pending += 1;
        } else if (status === 'rejected' || status === 'rejected_cap' || status === 'click_expired') {
            g.rejected += 1;
        }
    }

    // Execute Updates
    // We process each group (Offer + Tenant)
    const promises = Object.values(groups).map(async (g) => {
        const profit = g.revenue - g.payout;

        const sql = `
            INSERT INTO daily_offer_stats (
                offer_id, tenant_id, day, 
                clicks, unique_clicks, 
                conversions, approved_conversions, pending_conversions, rejected_conversions,
                revenue, payout, profit, 
                created_at, updated_at
            )
            VALUES (?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
            ON DUPLICATE KEY UPDATE
                conversions = conversions + VALUES(conversions),
                approved_conversions = approved_conversions + VALUES(approved_conversions),
                pending_conversions = pending_conversions + VALUES(pending_conversions),
                rejected_conversions = rejected_conversions + VALUES(rejected_conversions),
                revenue = revenue + VALUES(revenue),
                payout = payout + VALUES(payout),
                profit = profit + VALUES(profit),
                updated_at = UTC_TIMESTAMP()
        `;

        await pool.query(sql, [
            g.offerId, g.tenantId, today,
            g.conversions, g.approved, g.pending, g.rejected,
            g.revenue, g.payout, profit
        ]);
        await dailyAggregateService.upsertWithRollup({
            tenantId: g.tenantId,
            day: today,
            offerId: g.offerId,
            publisherId: g.publisherId,
            eventName: 'conversion',
            conversions: g.conversions,
            approvedConversions: g.approved,
            pendingConversions: g.pending,
            rejectedConversions: g.rejected,
            revenue: g.revenue,
            payout: g.payout,
        });
    });

    await Promise.all(promises);

}

/**
 * Fire Affiliate Postbacks
 * BUSINESS RULE: Only fire when status === 'approved'. Then set affiliate_postback_fired=1 for idempotency.
 */
async function fireAffiliatePostbacks(items) {
    const promises = items.map(async (item) => {
        const c = item.data;
        const normalizedStatus = (c.status || '').toString().toLowerCase();
        // STRICT: Affiliate postback ONLY for approved conversions. Never for pending/rejected/rejected_cap/click_expired.
        if (normalizedStatus !== 'approved' || !c.callback_url) return;

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

            const postbackResult = await postbackService.sendPublisherPostback(c.callback_url, conversion, click);
            if (!postbackResult?.success) {
                logger.warn(`⚠️ Affiliate Postback Not Marked Fired (request failed): ${c.callback_url}`, {
                    conversion_id: c.id,
                    tenant_id: c.tenant_id,
                    status: c.status,
                    reason: postbackResult?.reason || postbackResult?.error || 'unknown'
                });
                return;
            }
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
