/**
 * Stats Aggregation Worker
 *
 * Populates daily_click_stats from raw clicks + conversions tables.
 * Runs:
 *   - On startup:   yesterday + today (catch-up)
 *   - Every hour:   today only         (keep today current within 1-hour lag)
 *   - Every day at midnight IST (00:05 IST): yesterday full day
 *
 * DESIGN RULES:
 * - Financial: Revenue = SUM(amount) ALL, Payout = SUM(payout) approved-only
 * - Timezone:  IST date computed in Node.js; raw UTC BETWEEN passed to SQL
 * - No DATE() / DATE_ADD() wrapping on indexed columns in WHERE
 * - Upsert (ON DUPLICATE KEY UPDATE) — fully idempotent, safe to re-run
 * - Only touches daily_click_stats — does NOT modify clicks or conversions
 */

import pool from '../db/connection.js';
import logger from '../utils/logger.js';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/** Current IST date string (YYYY-MM-DD) */
function getIstToday() {
    const now = new Date();
    return new Date(now.getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
}

/** IST date string for yesterday */
function getIstYesterday() {
    const now = new Date();
    return new Date(now.getTime() + 330 * 60 * 1000 - 86400 * 1000).toISOString().split('T')[0];
}

/**
 * Convert an IST calendar day (YYYY-MM-DD) to UTC datetime range.
 * e.g. '2026-02-24' → ['2026-02-23 18:30:00', '2026-02-24 18:29:59']
 */
function istDateToUtcRange(dateStr) {
    const utcStart = new Date(`${dateStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
    const utcEnd = new Date(`${dateStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
    return { utcStart, utcEnd };
}

// ─────────────────────────────────────────────
// Core aggregation function
// ─────────────────────────────────────────────

/**
 * Aggregate one IST day across all tenants and upsert into daily_click_stats.
 * @param {string} istDate  e.g. '2026-02-24'
 */
async function aggregateDay(istDate) {
    const { utcStart, utcEnd } = istDateToUtcRange(istDate);
    const startTs = Date.now();

    logger.info(`[StatsAgg] Aggregating ${istDate} (UTC: ${utcStart} → ${utcEnd})`);

    try {
        // ─────────────────────────────────────────
        // Step 1: Aggregate clicks for the day
        // One row per (tenant_id, publisher_id, offer_id)
        // Uses (tenant_id, created_at) index — no function on indexed column
        // ─────────────────────────────────────────
        const [clickRows] = await pool.query(`
      SELECT
        tenant_id,
        publisher_id,
        offer_id,
        COUNT(*)          AS total_clicks,
        COUNT(DISTINCT ip) AS unique_ips
      FROM clicks
      WHERE created_at BETWEEN ? AND ?
        AND referrer IS NOT NULL AND referrer <> ''
      GROUP BY tenant_id, publisher_id, offer_id
    `, [utcStart, utcEnd]);

        if (clickRows.length === 0) {
            logger.info(`[StatsAgg] No click data for ${istDate} — skipping`);
            return;
        }

        // ─────────────────────────────────────────
        // Step 2: Aggregate conversions for the day
        // Keyed by (tenant_id, publisher_id, offer_id)
        // FINANCIAL SEPARATION rules applied here:
        //   revenue      = SUM(amount)           — ALL conversions
        //   payout       = SUM(payout) approved  — ONLY approved
        //   pending_payout = SUM(payout) pending
        //   profit       = revenue - payout
        // ─────────────────────────────────────────
        const [convRows] = await pool.query(`
      SELECT
        tenant_id,
        publisher_id,
        offer_id,
        COUNT(*)                                                                AS total_conversions,
        COUNT(CASE WHEN status = 'approved'                    THEN 1 END)     AS approved_conversions,
        COUNT(CASE WHEN status = 'pending'                     THEN 1 END)     AS pending_conversions,
        COUNT(CASE WHEN status IN ('rejected','rejected_cap','click_expired')  THEN 1 END)     AS rejected_conversions,
        COALESCE(SUM(amount), 0)                                               AS revenue,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) AS payout,
        COALESCE(SUM(CASE WHEN status = 'pending'  THEN payout ELSE 0 END), 0) AS pending_payout
      FROM conversions
      WHERE created_at BETWEEN ? AND ?
      GROUP BY tenant_id, publisher_id, offer_id
    `, [utcStart, utcEnd]);

        // ─────────────────────────────────────────
        // Step 3: Merge click + conversion data in JS
        // ─────────────────────────────────────────
        const convMap = new Map();
        for (const row of convRows) {
            const key = `${row.tenant_id}:${row.publisher_id}:${row.offer_id}`;
            convMap.set(key, row);
        }

        // ─────────────────────────────────────────
        // Step 4: Build upsert payload
        // ─────────────────────────────────────────
        const values = clickRows.map(c => {
            const key = `${c.tenant_id}:${c.publisher_id}:${c.offer_id}`;
            const conv = convMap.get(key) || {};

            const revenue = parseFloat(conv.revenue || 0);
            const payout = parseFloat(conv.payout || 0);
            const pendingPayout = parseFloat(conv.pending_payout || 0);
            const profit = parseFloat((revenue - payout).toFixed(4));

            return [
                c.tenant_id,
                istDate,
                c.publisher_id,
                c.offer_id,
                c.total_clicks,
                c.unique_ips,
                parseInt(conv.total_conversions || 0),
                parseInt(conv.approved_conversions || 0),
                parseInt(conv.pending_conversions || 0),
                parseInt(conv.rejected_conversions || 0),
                revenue,
                payout,
                pendingPayout,
                profit,
            ];
        });

        // ─────────────────────────────────────────
        // Step 5: Upsert — fully idempotent
        // SET semantics (not increment) — re-running is always safe
        // ─────────────────────────────────────────
        const sql = `
      INSERT INTO daily_click_stats
        (tenant_id, stat_date, publisher_id, offer_id,
         total_clicks, unique_ips,
         total_conversions, approved_conversions, pending_conversions, rejected_conversions,
         revenue, payout, pending_payout, profit)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        total_clicks         = VALUES(total_clicks),
        unique_ips           = VALUES(unique_ips),
        total_conversions    = VALUES(total_conversions),
        approved_conversions = VALUES(approved_conversions),
        pending_conversions  = VALUES(pending_conversions),
        rejected_conversions = VALUES(rejected_conversions),
        revenue              = VALUES(revenue),
        payout               = VALUES(payout),
        pending_payout       = VALUES(pending_payout),
        profit               = VALUES(profit),
        updated_at           = UTC_TIMESTAMP()
    `;

        await pool.query(sql, [values]);

        const elapsed = Date.now() - startTs;
        logger.info(`[StatsAgg] ✅ ${istDate}: ${values.length} rows upserted in ${elapsed}ms`);

    } catch (err) {
        logger.error(`[StatsAgg] ❌ Failed to aggregate ${istDate}: ${err.message}`, { err });
        // Non-fatal — do not crash the process; next run will retry
    }
}

// ─────────────────────────────────────────────
// Scheduler
// ─────────────────────────────────────────────

async function runInitialBackfill() {
    logger.info('[StatsAgg] Running startup backfill (yesterday + today)...');
    await aggregateDay(getIstYesterday());
    await aggregateDay(getIstToday());
}

function scheduleHourlyRefresh() {
    // Every hour: refresh today's stats (keeps summary within 1-hour lag)
    setInterval(async () => {
        logger.info('[StatsAgg] Hourly refresh — aggregating today...');
        await aggregateDay(getIstToday());
    }, 60 * 60 * 1000); // 1 hour
}

function scheduleMidnightRun() {
    // Schedule a midnight IST (18:30 UTC) run to finalise yesterday's numbers
    function msUntilMidnightIst() {
        const now = new Date();
        const nowIst = new Date(now.getTime() + 330 * 60 * 1000);
        const midnight = new Date(nowIst);
        midnight.setUTCHours(0, 5, 0, 0); // 00:05 IST = 18:35 UTC previous day
        if (midnight <= nowIst) midnight.setUTCDate(midnight.getUTCDate() + 1);
        return midnight - nowIst;
    }

    setTimeout(async function tick() {
        logger.info('[StatsAgg] Midnight IST run — finalising yesterday...');
        await aggregateDay(getIstYesterday());
        await aggregateDay(getIstToday());
        // Schedule next tick in exactly 24h
        setTimeout(tick, 24 * 60 * 60 * 1000);
    }, msUntilMidnightIst());
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Manually trigger aggregation for a specific IST date.
 * Useful for backfilling historical data via admin endpoint.
 */
export async function aggregateDate(istDate) {
    return aggregateDay(istDate);
}

/**
 * Start the aggregation worker.
 * Call this once from the main server or ecosystem process.
 */
export async function startStatsAggregationWorker() {
    logger.info('[StatsAgg] Starting Stats Aggregation Worker...');
    await runInitialBackfill();
    scheduleHourlyRefresh();
    scheduleMidnightRun();
    logger.info('[StatsAgg] ✅ Stats Aggregation Worker running');
}

export default startStatsAggregationWorker;
