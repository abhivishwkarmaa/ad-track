#!/usr/bin/env node
/**
 * Backfill `daily_reporting_rollup` (REPORTING_ROLLUP_TABLE) from raw clicks + conversions.
 * Does not touch legacy `daily_click_stats`.
 *
 *   node backfill-reporting-rollup.js
 *   node backfill-reporting-rollup.js 2026-01-22 2026-02-24
 */
import dotenv from 'dotenv';
dotenv.config();

import pool from './src/db/connection.js';
import { getReportingRollupTableName } from './src/config/reportingRollupTable.js';

function istDateToUtcRange(dateStr) {
  const utcStart = new Date(`${dateStr}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
  const utcEnd = new Date(`${dateStr}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
  return { utcStart, utcEnd };
}

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00+05:30`);
  d.setUTCDate(d.getUTCDate() + n);
  return new Date(d.getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
}

function dateRange(fromDate, toDate) {
  const dates = [];
  let cur = fromDate;
  while (cur <= toDate) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

async function aggregateDay(istDate) {
  const table = getReportingRollupTableName();
  const { utcStart, utcEnd } = istDateToUtcRange(istDate);

  const [clickRows] = await pool.query(`
    SELECT
      tenant_id,
      publisher_id,
      offer_id,
      COUNT(*) AS total_clicks,
      COUNT(DISTINCT ip) AS unique_ips
    FROM clicks
    WHERE created_at BETWEEN ? AND ?
    GROUP BY tenant_id, publisher_id, offer_id
  `, [utcStart, utcEnd]);

  const [convRows] = await pool.query(`
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
  `, [utcStart, utcEnd]);

  const convMap = new Map();
  for (const row of convRows) {
    convMap.set(`${row.tenant_id}:${row.publisher_id}:${row.offer_id}`, row);
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

  if (values.length === 0) return 0;

  await pool.query(`
    INSERT INTO ${table}
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
  `, [values]);

  return values.length;
}

async function main() {
  let fromDate;
  let toDate;
  const table = getReportingRollupTableName();
  console.log(`Target table: ${table}`);

  if (process.argv[2] && process.argv[3]) {
    fromDate = process.argv[2];
    toDate = process.argv[3];
    console.log(`Backfill range: ${fromDate} → ${toDate}`);
  } else {
    const [[{ oldest, newest }]] = await pool.query(`
      SELECT
        DATE_FORMAT(DATE_ADD(MIN(created_at), INTERVAL 330 MINUTE), '%Y-%m-%d') AS oldest,
        DATE_FORMAT(DATE_ADD(MAX(created_at), INTERVAL 330 MINUTE), '%Y-%m-%d') AS newest
      FROM clicks
    `);
    fromDate = String(oldest).slice(0, 10);
    toDate = String(newest).slice(0, 10);
    console.log(`Auto range from clicks: ${fromDate} → ${toDate}`);
  }

  const dates = dateRange(fromDate, toDate);
  let totalRows = 0;
  for (const d of dates) {
    process.stdout.write(`  ${d} ... `);
    const rows = await aggregateDay(d);
    totalRows += rows;
    console.log(`${rows} rows`);
  }
  console.log(`Done. Total row upserts: ${totalRows}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
