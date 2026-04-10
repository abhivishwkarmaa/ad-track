/**
 * Reporting rollup worker — fills `daily_reporting_rollup` (override via REPORTING_ROLLUP_TABLE).
 * Isolated from legacy `daily_click_stats` so older code paths stay unchanged.
 */

import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { getReportingRollupTableName } from '../config/reportingRollupTable.js';

function getIstToday() {
  const now = new Date();
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
}

function getIstYesterday() {
  const now = new Date();
  return new Date(now.getTime() + 330 * 60 * 1000 - 86400 * 1000).toISOString().split('T')[0];
}

function istDateToUtcRange(dateStr) {
  const utcStart = new Date(`${dateStr}T00:00:00+00:00`).toISOString().slice(0, 19).replace('T', ' ');
  const utcEnd = new Date(`${dateStr}T23:59:59+00:00`).toISOString().slice(0, 19).replace('T', ' ');
  return { utcStart, utcEnd };
}

async function aggregateDay(istDate) {
  const rollupTable = getReportingRollupTableName();
  const { utcStart, utcEnd } = istDateToUtcRange(istDate);
  const startTs = Date.now();

  logger.info(`[ReportingRollup] Aggregating ${istDate} → ${rollupTable} (UTC: ${utcStart} → ${utcEnd})`);

  try {
    const [clickRows] = await pool.query(
      `
      SELECT
        tenant_id,
        publisher_id,
        offer_id,
        COUNT(*) AS total_clicks,
        COUNT(DISTINCT ip) AS unique_ips
      FROM clicks
      WHERE created_at BETWEEN ? AND ?
      GROUP BY tenant_id, publisher_id, offer_id
    `,
      [utcStart, utcEnd]
    );

    const [convRows] = await pool.query(
      `
      SELECT
        tenant_id,
        publisher_id,
        offer_id,
        COUNT(*) AS total_conversions,
        COUNT(CASE WHEN status = 'approved' THEN 1 END) AS approved_conversions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) AS pending_conversions,
        COUNT(CASE WHEN status IN ('rejected','rejected_cap','click_expired') THEN 1 END) AS rejected_conversions,
        COALESCE(SUM(amount), 0) AS revenue,
        COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) AS payout,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN payout ELSE 0 END), 0) AS pending_payout
      FROM conversions
      WHERE created_at BETWEEN ? AND ?
      GROUP BY tenant_id, publisher_id, offer_id
    `,
      [utcStart, utcEnd]
    );

    const convMap = new Map();
    for (const row of convRows) {
      const key = `${row.tenant_id}:${row.publisher_id}:${row.offer_id}`;
      convMap.set(key, row);
    }

    const clickKeySet = new Set();
    const values = clickRows.map((c) => {
      const key = `${c.tenant_id}:${c.publisher_id}:${c.offer_id}`;
      clickKeySet.add(key);
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
        parseInt(conv.total_conversions || 0, 10),
        parseInt(conv.approved_conversions || 0, 10),
        parseInt(conv.pending_conversions || 0, 10),
        parseInt(conv.rejected_conversions || 0, 10),
        revenue,
        payout,
        pendingPayout,
        profit,
      ];
    });

    for (const row of convRows) {
      const key = `${row.tenant_id}:${row.publisher_id}:${row.offer_id}`;
      if (clickKeySet.has(key)) continue;
      const revenue = parseFloat(row.revenue || 0);
      const payout = parseFloat(row.payout || 0);
      const pendingPayout = parseFloat(row.pending_payout || 0);
      const profit = parseFloat((revenue - payout).toFixed(4));
      values.push([
        row.tenant_id,
        istDate,
        row.publisher_id,
        row.offer_id,
        0,
        0,
        parseInt(row.total_conversions || 0, 10),
        parseInt(row.approved_conversions || 0, 10),
        parseInt(row.pending_conversions || 0, 10),
        parseInt(row.rejected_conversions || 0, 10),
        revenue,
        payout,
        pendingPayout,
        profit,
      ]);
    }

    if (values.length === 0) {
      logger.info(`[ReportingRollup] No click or conversion data for ${istDate} — skipping`);
      return;
    }

    const sql = `
      INSERT INTO ${rollupTable}
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
    logger.info(`[ReportingRollup] ✅ ${istDate}: ${values.length} rows upserted in ${elapsed}ms`);
  } catch (err) {
    logger.error(`[ReportingRollup] ❌ Failed to aggregate ${istDate}: ${err.message}`, { err });
  }
}

async function runInitialBackfill() {
  logger.info('[ReportingRollup] Startup backfill (yesterday + today)...');
  await aggregateDay(getIstYesterday());
  await aggregateDay(getIstToday());
}

function scheduleHourlyRefresh() {
  setInterval(async () => {
    logger.info('[ReportingRollup] Hourly refresh — today...');
    await aggregateDay(getIstToday());
  }, 60 * 60 * 1000);
}

function scheduleMidnightRun() {
  function msUntilMidnightIst() {
    const now = new Date();
    const nowIst = new Date(now.getTime() + 330 * 60 * 1000);
    const midnight = new Date(nowIst);
    midnight.setUTCHours(0, 5, 0, 0);
    if (midnight <= nowIst) midnight.setUTCDate(midnight.getUTCDate() + 1);
    return midnight - nowIst;
  }

  setTimeout(async function tick() {
    logger.info('[ReportingRollup] Midnight IST — yesterday + today...');
    await aggregateDay(getIstYesterday());
    await aggregateDay(getIstToday());
    setTimeout(tick, 24 * 60 * 60 * 1000);
  }, msUntilMidnightIst());
}

export async function aggregateReportingRollupDate(istDate) {
  return aggregateDay(istDate);
}

export async function startReportingStatsAggregationWorker() {
  logger.info('[ReportingRollup] Starting worker...');
  await runInitialBackfill();
  scheduleHourlyRefresh();
  scheduleMidnightRun();
  logger.info('[ReportingRollup] Worker running');
}

export default startReportingStatsAggregationWorker;
