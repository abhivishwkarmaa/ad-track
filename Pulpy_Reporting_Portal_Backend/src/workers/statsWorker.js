import redis from '../config/redis.js';
import pool, { dbHealth } from '../db/connection.js';
import logger from '../utils/logger.js';

const FLUSH_INTERVAL = 10000; // 10 seconds

let isFlushing = false;

async function flushStats() {
    // Prevent overlapping flushes if DB/Redis is slow
    if (isFlushing) {
        logger.debug('⏳ Stats flush skipped - previous flush in progress');
        return;
    }

    // Gracefully skip if Redis is not ready
    if (redis.status !== 'ready') {
        const logLevel = redis.status === 'reconnecting' ? 'debug' : 'warn';
        logger[logLevel](`⚠️ Stats flush skipped: Redis status is '${redis.status}'`);
        return;
    }

    // Gracefully skip if Database is not available
    if (!dbHealth.isAvailable()) {
        logger.warn('⚠️ Stats flush skipped: Database is unreachable (will retry when online)');
        return;
    }

    isFlushing = true;

    try {
        const pattern = 'stats:offer:*:*:*:*'; // id:tenant_id:date:metric
        let cursor = '0';
        const keys = [];

        // Scan all relevant stats keys
        do {
            const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
            cursor = reply[0];
            keys.push(...reply[1]);
        } while (cursor !== '0');

        if (keys.length === 0) return;

        // Group by Offer+Tenant+Date
        // Key format: stats:offer:{id}:{tenant_id}:{date}:{metric}
        const updates = {}; // { "15:1:2023-10-27": { offerId, tenantId, date, clicks: 0, ... } }

        const pipeline = redis.pipeline();

        // Atomic GETSET to retrieve delta and reset to 0
        for (const key of keys) {
            pipeline.getset(key, '0');
        }

        const results = await pipeline.exec();

        // Process Results
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const [err, valStr] = results[i];

            if (err) {
                logger.warn({ key, err: err.message }, '⚠️ Failed to read stats key');
                continue;
            }

            const val = parseFloat(valStr || '0');

            if (val > 0) {
                const parts = key.split(':');
                // parts[0]=stats, [1]=offer, [2]=ID, [3]=TENANT_ID, [4]=DATE, [5]=METRIC
                if (parts.length < 6) continue; // Skip if old format or invalid

                const offerId = parts[2];
                const tenantIdStr = parts[3];
                const date = parts[4];
                const metric = parts[5];
                const groupKey = `${offerId}:${tenantIdStr}:${date}`;

                if (!updates[groupKey]) {
                    updates[groupKey] = {
                        offerId,
                        tenantId: tenantIdStr === '0' || tenantIdStr === 'null' ? null : parseInt(tenantIdStr),
                        date,
                        clicks: 0,
                        conversions: 0,
                        revenue: 0,
                        payout: 0
                    };
                }

                updates[groupKey][metric] = (updates[groupKey][metric] || 0) + val;
            }
        }

        const updateList = Object.values(updates);
        if (updateList.length === 0) return;

        logger.info(`📊 Flushing Stats for ${updateList.length} offers...`);

        // UTC ENFORCEMENT: Use UTC timestamp for all DB operations
        // const batchTimestamp = new Date().toISOString(); 

        // FINANCIAL SEPARATION RULES (Enforced in conversionWorker/postbackService):
        // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status.
        // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
        // 3. Profit = Revenue - Payout.
        // This worker aggregates the pre-calculated deltas from Redis.

        await Promise.all(updateList.map(async (stat) => {
            const profit = stat.revenue - stat.payout;
            // UTC ENFORCEMENT: Use UTC_TIMESTAMP() for DB timestamps, never pass JS Date objects
            const sql = `
                INSERT INTO daily_offer_stats (offer_id, tenant_id, day, clicks, conversions, revenue, payout, profit, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
                ON DUPLICATE KEY UPDATE
                    clicks = daily_offer_stats.clicks + ?,
                    conversions = daily_offer_stats.conversions + ?,
                    revenue = daily_offer_stats.revenue + ?,
                    payout = daily_offer_stats.payout + ?,
                    profit = daily_offer_stats.profit + ?,
                    updated_at = UTC_TIMESTAMP()
            `;
            const params = [
                stat.offerId, stat.tenantId, stat.date, stat.clicks, stat.conversions, stat.revenue, stat.payout, profit,
                stat.clicks, stat.conversions, stat.revenue, stat.payout, profit
            ];

            await pool.query(sql, params);
        }));

        logger.info('✅ Stats Flushed to DB');

    } catch (err) {
        logger.error({
            err: { message: err.message, code: err.code, stack: err.stack }
        }, '❌ Stats Flush Failed');
    } finally {
        isFlushing = false;
    }
}

function startStatsWorker() {
    logger.info('📉 Stats Worker Started (10s interval)');
    setInterval(flushStats, FLUSH_INTERVAL);
}

export default startStatsWorker;
