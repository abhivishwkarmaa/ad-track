import crypto from 'crypto';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcrypt';
import emailService from '../services/emailService.js';
import assignmentService from '../services/assignmentService.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import { getIstTodayYmd, prevIstYmd, splitDateRangeForRollup, shouldUseRawReportingTables } from '../utils/reportDailyRollup.js';
import { istYmdSpanToMysqlUtcRange, normalizeMysqlUtcDatetime } from '../utils/mysqlUtcRange.js';
import { getReportingRollupTableName } from '../config/reportingRollupTable.js';

function isIstReportTimezone(tz) {
  const t = String(tz || '').trim();
  return !t || t === 'Asia/Kolkata' || t === 'Asia/Calcutta' || t === 'IST' || t === '+05:30';
}

function emptyPublisherStats() {
  return { clicks: 0, uniqueClicks: 0, conversions: 0, approved: 0, pending: 0, rejected: 0, payout: 0 };
}

function addPublisherStats(target, row = {}) {
  target.clicks += Number(row.clicks || 0);
  target.uniqueClicks += Number(row.unique_clicks || 0);
  target.conversions += Number(row.conversions || 0);
  target.approved += Number(row.approved || 0);
  target.pending += Number(row.pending || 0);
  target.rejected += Number(row.rejected || 0);
  target.payout += Number(row.payout || 0);
  return target;
}

function withRates(stats) {
  const clicks = Number(stats.clicks || 0);
  const approved = Number(stats.approved || 0);
  const payout = Number(stats.payout || 0);
  return {
    clicks,
    uniqueClicks: Number(stats.uniqueClicks || 0),
    conversions: approved,
    approved,
    payout: Number(payout.toFixed(2)),
    cr: clicks > 0 ? Number(((approved / clicks) * 100).toFixed(2)) : 0,
    epc: clicks > 0 ? Number((payout / clicks).toFixed(4)) : 0,
  };
}

function eachYmd(fromYmd, toYmd) {
  const days = [];
  let cur = fromYmd;
  let guard = 0;
  while (cur && cur <= toYmd && guard < 400) {
    days.push(cur);
    if (cur === toYmd) break;
    const [y, m, d] = cur.split('-').map(Number);
    cur = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    guard += 1;
  }
  return days;
}

function previousYmdRange(fromYmd, toYmd) {
  const days = eachYmd(fromYmd, toYmd);
  const span = Math.max(1, days.length);
  const prevTo = prevIstYmd(fromYmd);
  let prevFrom = prevTo;
  for (let i = 1; i < span; i += 1) prevFrom = prevIstYmd(prevFrom);
  return { from: prevFrom, to: prevTo };
}

function legacyRangeToYmd(range, todayIST) {
  if (range === 'yesterday') {
    const y = prevIstYmd(todayIST);
    return { from: y, to: y };
  }
  if (range === '7d' || range === '14d' || range === '30d') {
    const back = range === '7d' ? 6 : range === '14d' ? 13 : 29;
    let from = todayIST;
    for (let i = 0; i < back; i += 1) from = prevIstYmd(from);
    return { from, to: todayIST };
  }
  if (range === 'this_month') {
    const [y, m] = todayIST.split('-');
    return { from: `${y}-${m}-01`, to: todayIST };
  }
  return { from: todayIST, to: todayIST };
}

async function queryPublisherRawWindow(tenantId, publisherId, start, end) {
  const [clickRows] = await pool.query(
    `SELECT COUNT(*) as clicks, COUNT(DISTINCT ip) as unique_clicks
     FROM clicks
     WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?`,
    [tenantId, publisherId, start, end]
  );
  const [convRows] = await pool.query(
    `SELECT
       COUNT(*) as conversions,
       COUNT(CASE WHEN status = 'approved' THEN 1 END) as approved,
       COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending,
       COUNT(CASE WHEN status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected,
       COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as payout
     FROM conversions
     WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?`,
    [tenantId, publisherId, start, end]
  );
  return { ...(clickRows[0] || {}), ...(convRows[0] || {}) };
}

/**
 * Publisher-facing totals: every click, and only approved conversions.
 * Pending, rejected, and click-expired rows are not returned.
 * Past IST days come from the reporting rollup; today is scanned from raw tables.
 */
async function queryPublisherSummary({ tenantId, publisherId, fromYmd, toYmd, rangeStartUtc, rangeEndUtc, reportTimezone, rt }) {
  const useRollup = !shouldUseRawReportingTables() && isIstReportTimezone(reportTimezone) && fromYmd && toYmd;
  const stats = emptyPublisherStats();

  if (useRollup) {
    const split = splitDateRangeForRollup(fromYmd, toYmd);
    if (split.useRollup) {
      const [rows] = await pool.query(
        `SELECT
           COALESCE(SUM(total_clicks), 0) as clicks,
           COALESCE(SUM(unique_ips), 0) as unique_clicks,
           COALESCE(SUM(total_conversions), 0) as conversions,
           COALESCE(SUM(approved_conversions), 0) as approved,
           COALESCE(SUM(pending_conversions), 0) as pending,
           COALESCE(SUM(rejected_conversions), 0) as rejected,
           COALESCE(SUM(payout), 0) as payout
         FROM ${rt}
         WHERE tenant_id = ? AND publisher_id = ? AND stat_date BETWEEN ? AND ?`,
        [tenantId, publisherId, split.rollupFrom, split.rollupTo]
      );
      addPublisherStats(stats, rows[0] || {});
    }
    if (split.scanToday) {
      const span = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
      addPublisherStats(stats, await queryPublisherRawWindow(tenantId, publisherId, span.start, span.end));
    }
    return withRates(stats);
  }

  const derived = fromYmd && toYmd ? istYmdSpanToMysqlUtcRange(fromYmd, toYmd) : { start: null, end: null };
  const start = normalizeMysqlUtcDatetime(rangeStartUtc) || derived.start;
  const end = normalizeMysqlUtcDatetime(rangeEndUtc) || derived.end;
  if (!start || !end) return withRates(stats);
  return withRates(addPublisherStats(emptyPublisherStats(), await queryPublisherRawWindow(tenantId, publisherId, start, end)));
}

export class PublisherPortalController {
  /**
   * Get Publisher Dashboard Overview Metrics
   * 🔒 STRICT TENANT & PUBLISHER ISOLATION
   * Matches Admin Panel logic: Today from raw clicks/conversions (IST bounds), past days from daily_reporting_rollup
   */
  async getDashboard(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const {
        range,
        date_from: dateFrom,
        date_to: dateTo,
        range_start_utc: rangeStartUtc,
        range_end_utc: rangeEndUtc,
        report_timezone: reportTimezone,
      } = request.query || {};
      const rt = getReportingRollupTableName();

      const todayIST = getIstTodayYmd();
      const resolved = (dateFrom && dateTo)
        ? { from: String(dateFrom).slice(0, 10), to: String(dateTo).slice(0, 10) }
        : legacyRangeToYmd(range, todayIST);
      const fromYmd = resolved.from <= resolved.to ? resolved.from : resolved.to;
      const toYmd = resolved.from <= resolved.to ? resolved.to : resolved.from;
      const isHourly = fromYmd === toYmd;
      const rangeUtcSpan = istYmdSpanToMysqlUtcRange(fromYmd, toYmd);
      const summaryArgs = { tenantId, publisherId, rangeStartUtc, rangeEndUtc, reportTimezone, rt };

      const currentStats = await queryPublisherSummary({ ...summaryArgs, fromYmd, toYmd });
      const previousRange = previousYmdRange(fromYmd, toYmd);
      const previousStats = await queryPublisherSummary({
        ...summaryArgs,
        fromYmd: previousRange.from,
        toYmd: previousRange.to,
        rangeStartUtc: null,
        rangeEndUtc: null,
      });

      let trend = [];

      if (isHourly) {
        // Hourly breakdown in IST, same bucket as the admin performance chart.
        const utcStart = normalizeMysqlUtcDatetime(rangeStartUtc);
        const utcEnd = normalizeMysqlUtcDatetime(rangeEndUtc);
        const targetSpan = (!isIstReportTimezone(reportTimezone) && utcStart && utcEnd)
          ? { start: utcStart, end: utcEnd }
          : rangeUtcSpan;
        const [hourlyClicks] = await pool.query(
          `SELECT HOUR(DATE_ADD(created_at, INTERVAL 330 MINUTE)) as hr, COUNT(*) as clicks 
           FROM clicks 
           WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?
           GROUP BY HOUR(DATE_ADD(created_at, INTERVAL 330 MINUTE))`,
          [tenantId, publisherId, targetSpan.start, targetSpan.end]
        );

        const [hourlyConvs] = await pool.query(
          `SELECT HOUR(DATE_ADD(created_at, INTERVAL 330 MINUTE)) as hr,
                  COUNT(*) as conversions,
                  COALESCE(SUM(payout), 0) as payout
           FROM conversions
           WHERE tenant_id = ? AND publisher_id = ? AND status = 'approved' AND created_at BETWEEN ? AND ?
           GROUP BY HOUR(DATE_ADD(created_at, INTERVAL 330 MINUTE))`,
          [tenantId, publisherId, targetSpan.start, targetSpan.end]
        );

        const hourMap = {};
        for (let h = 0; h < 24; h++) {
          const label = `${String(h).padStart(2, '0')}:00`;
          hourMap[h] = { time: label, clicks: 0, conversions: 0, payout: 0, cr: 0, epc: 0 };
        }
        hourlyClicks.forEach(r => { if (hourMap[r.hr]) hourMap[r.hr].clicks = Number(r.clicks || 0); });
        hourlyConvs.forEach(r => {
          if (hourMap[r.hr]) {
            hourMap[r.hr].conversions = Number(r.conversions || 0);
            hourMap[r.hr].payout = Number(Number(r.payout || 0).toFixed(2));
          }
        });

        trend = Object.values(hourMap).map(item => ({
          ...item,
          cr: item.clicks > 0 ? Number(((item.conversions / item.clicks) * 100).toFixed(2)) : 0,
          epc: item.clicks > 0 ? Number((item.payout / item.clicks).toFixed(4)) : 0,
        }));
      } else {
        // Multi-day: Hybrid from daily_reporting_rollup + today raw scan
        const split = splitDateRangeForRollup(fromYmd, toYmd);
        const dayMap = {};

        // Build continuous date range
        let dCur = fromYmd;
        while (dCur <= toYmd) {
          dayMap[dCur] = { time: dCur, date: dCur, clicks: 0, conversions: 0, payout: 0, cr: 0, epc: 0 };
          const [y, m, d] = dCur.split('-').map(Number);
          const next = new Date(Date.UTC(y, m - 1, d + 1));
          dCur = next.toISOString().slice(0, 10);
        }

        // 3a. Past days from rollup table
        if (split.useRollup) {
          const [rollupRows] = await pool.query(
            `SELECT 
               stat_date,
               COALESCE(SUM(total_clicks), 0) as clicks,
               COALESCE(SUM(approved_conversions), 0) as conversions,
               COALESCE(SUM(payout), 0) as payout
             FROM ${rt}
             WHERE tenant_id = ? AND publisher_id = ? AND stat_date BETWEEN ? AND ?
             GROUP BY stat_date`,
            [tenantId, publisherId, split.rollupFrom, split.rollupTo]
          );

          rollupRows.forEach(r => {
            const key = r.stat_date instanceof Date ? r.stat_date.toISOString().slice(0, 10) : String(r.stat_date).slice(0, 10);
            if (dayMap[key]) {
              dayMap[key].clicks = Number(r.clicks || 0);
              dayMap[key].conversions = Number(r.conversions || 0);
              dayMap[key].payout = Number(Number(r.payout || 0).toFixed(2));
            }
          });
        }

        // 3b. Today from raw clicks/conversions
        if (split.scanToday) {
          const todaySpan = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
          const [todayRawClicks] = await pool.query(
            'SELECT COUNT(*) as clicks FROM clicks WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?',
            [tenantId, publisherId, todaySpan.start, todaySpan.end]
          );
          const [todayRawConvs] = await pool.query(
            `SELECT COUNT(*) as conversions,
                    COALESCE(SUM(payout), 0) as payout
             FROM conversions
             WHERE tenant_id = ? AND publisher_id = ? AND status = 'approved' AND created_at BETWEEN ? AND ?`,
            [tenantId, publisherId, todaySpan.start, todaySpan.end]
          );

          if (dayMap[todayIST]) {
            dayMap[todayIST].clicks = Number(todayRawClicks?.[0]?.clicks || 0);
            dayMap[todayIST].conversions = Number(todayRawConvs?.[0]?.conversions || 0);
            dayMap[todayIST].payout = Number(Number(todayRawConvs?.[0]?.payout || 0).toFixed(2));
          }
        }

        trend = Object.values(dayMap).map(item => ({
          ...item,
          cr: item.clicks > 0 ? Number(((item.conversions / item.clicks) * 100).toFixed(2)) : 0,
          epc: item.clicks > 0 ? Number((item.payout / item.clicks).toFixed(4)) : 0,
        }));
      }

      // 4. Period Totals
      const periodClicks = trend.reduce((sum, item) => sum + item.clicks, 0);
      const periodConversions = trend.reduce((sum, item) => sum + item.conversions, 0);
      const periodPayout = Number(trend.reduce((sum, item) => sum + item.payout, 0).toFixed(2));
      const periodCr = periodClicks > 0 ? Number(((periodConversions / periodClicks) * 100).toFixed(2)) : 0;
      const periodEpc = periodClicks > 0 ? Number((periodPayout / periodClicks).toFixed(4)) : 0;

      // 5. Top 5 Campaigns by Performance (Hybrid from Rollup + Today Raw)
      const split = splitDateRangeForRollup(fromYmd, toYmd);
      const offerStatMap = {};

      if (split.useRollup) {
        const [rollupOfferRows] = await pool.query(
          `SELECT 
             offer_id,
             COALESCE(SUM(total_clicks), 0) as clicks,
             COALESCE(SUM(approved_conversions), 0) as conversions,
             COALESCE(SUM(payout), 0) as payout
           FROM ${rt}
           WHERE tenant_id = ? AND publisher_id = ? AND stat_date BETWEEN ? AND ?
           GROUP BY offer_id`,
          [tenantId, publisherId, split.rollupFrom, split.rollupTo]
        );

        rollupOfferRows.forEach(r => {
          offerStatMap[r.offer_id] = {
            offer_id: r.offer_id,
            clicks: Number(r.clicks || 0),
            conversions: Number(r.conversions || 0),
            payout: Number(r.payout || 0),
          };
        });
      }

      if (split.scanToday) {
        const todaySpan = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
        const [todayOfferClicks] = await pool.query(
          `SELECT offer_id, COUNT(*) as clicks 
           FROM clicks 
           WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?
           GROUP BY offer_id`,
          [tenantId, publisherId, todaySpan.start, todaySpan.end]
        );

        const [todayOfferConvs] = await pool.query(
          `SELECT offer_id,
                  COUNT(*) as conversions,
                  COALESCE(SUM(payout), 0) as payout
           FROM conversions
           WHERE tenant_id = ? AND publisher_id = ? AND status = 'approved' AND created_at BETWEEN ? AND ?
           GROUP BY offer_id`,
          [tenantId, publisherId, todaySpan.start, todaySpan.end]
        );

        todayOfferClicks.forEach(r => {
          if (!offerStatMap[r.offer_id]) {
            offerStatMap[r.offer_id] = { offer_id: r.offer_id, clicks: 0, conversions: 0, payout: 0 };
          }
          offerStatMap[r.offer_id].clicks += Number(r.clicks || 0);
        });

        todayOfferConvs.forEach(r => {
          if (!offerStatMap[r.offer_id]) {
            offerStatMap[r.offer_id] = { offer_id: r.offer_id, clicks: 0, conversions: 0, payout: 0 };
          }
          offerStatMap[r.offer_id].conversions += Number(r.conversions || 0);
          offerStatMap[r.offer_id].payout += Number(r.payout || 0);
        });
      }

      const sortedOfferStats = Object.values(offerStatMap)
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5);

      let topOffers = [];
      if (sortedOfferStats.length > 0) {
        const offerIds = sortedOfferStats.map(s => s.offer_id);
        const [offersData] = await pool.query(
          `SELECT id, public_offer_id, name, category, affiliate_amount FROM offers WHERE id IN (?) AND tenant_id = ?`,
          [offerIds, tenantId]
        );
        const offerMetaMap = {};
        offersData.forEach(o => { offerMetaMap[o.id] = o; });

        topOffers = sortedOfferStats.map(s => {
          const o = offerMetaMap[s.offer_id] || {};
          return {
            offer_id: s.offer_id,
            public_offer_id: o.public_offer_id || s.offer_id,
            name: o.name || `Offer #${s.offer_id}`,
            category: o.category || 'Standard',
            payout_rate: Number(o.affiliate_amount || 0),
            clicks: s.clicks,
            conversions: s.conversions,
            payout: Number(s.payout.toFixed(2)),
            cr: s.clicks > 0 ? Number(((s.conversions / s.clicks) * 100).toFixed(2)) : 0,
          };
        });
      }

      // 6. Device Distribution Breakdown (exact range bounds)
      const [deviceRows] = await pool.query(
        `SELECT 
           COALESCE(NULLIF(TRIM(device_type), ''), 'Unknown') as device,
           COUNT(*) as clicks
         FROM clicks
         WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?
         GROUP BY device_type
         ORDER BY clicks DESC
         LIMIT 5`,
        [tenantId, publisherId, rangeUtcSpan.start, rangeUtcSpan.end]
      );
      const totalDeviceClicks = deviceRows.reduce((acc, r) => acc + Number(r.clicks || 0), 0);
      const deviceBreakdown = deviceRows.map(r => ({
        device: r.device,
        clicks: Number(r.clicks || 0),
        share: totalDeviceClicks > 0 ? Number(((Number(r.clicks) / totalDeviceClicks) * 100).toFixed(1)) : 0,
      }));

      // 7. Top Geos / Countries Breakdown
      const [geoRows] = await pool.query(
        `SELECT 
           COALESCE(NULLIF(TRIM(country), ''), 'Unknown') as country,
           COUNT(*) as clicks
         FROM clicks
         WHERE tenant_id = ? AND publisher_id = ? AND created_at BETWEEN ? AND ?
         GROUP BY country
         ORDER BY clicks DESC
         LIMIT 6`,
        [tenantId, publisherId, rangeUtcSpan.start, rangeUtcSpan.end]
      );
      const totalGeoClicks = geoRows.reduce((acc, r) => acc + Number(r.clicks || 0), 0);
      const geoBreakdown = geoRows.map(r => ({
        country: r.country,
        clicks: Number(r.clicks || 0),
        share: totalGeoClicks > 0 ? Number(((Number(r.clicks) / totalGeoClicks) * 100).toFixed(1)) : 0,
      }));

      // 8. Active Assigned Offers Count
      const [offerCountRows] = await pool.query(
        `SELECT COUNT(*) as count 
         FROM publisher_offers po 
         JOIN offers o ON po.offer_id = o.id 
         WHERE po.tenant_id = ? AND po.publisher_id = ? AND po.status = 'active' AND o.status = 'active'`,
        [tenantId, publisherId]
      );
      const activeOffersCount = Number(offerCountRows?.[0]?.count || 0);

      return reply.send({
        success: true,
        data: {
          range: range || 'custom',
          date_from: fromYmd,
          date_to: toYmd,
          metrics: {
            clicks: currentStats.clicks,
            uniqueClicks: currentStats.uniqueClicks,
            conversions: currentStats.approved,
            approved: currentStats.approved,
            payout: currentStats.payout,
            cr: currentStats.cr,
            epc: currentStats.epc,
            previousClicks: previousStats.clicks,
            previousConversions: previousStats.approved,
            previousApproved: previousStats.approved,
            previousPayout: previousStats.payout,
            activeOffersCount,
            todayClicks: currentStats.clicks,
            todayConversions: currentStats.approved,
            todayPayout: currentStats.payout,
            todayEpc: currentStats.epc,
            todayCr: currentStats.cr,
            yesterdayClicks: previousStats.clicks,
            yesterdayConversions: previousStats.approved,
            yesterdayPayout: previousStats.payout,
            periodClicks: currentStats.clicks,
            periodConversions: currentStats.approved,
            periodPayout: currentStats.payout,
            periodCr: currentStats.cr,
            periodEpc: currentStats.epc,
          },
          trend,
          topOffers,
          deviceBreakdown,
          geoBreakdown,
          publisher: {
            id: request.publisher.id,
            public_publisher_id: request.publisher.public_publisher_id,
            name: request.publisher.first_name || request.publisher.company_name || 'Publisher',
            email: request.publisher.email,
            company_name: request.publisher.company_name,
            global_postback_url: request.publisher.global_postback_url,
          },
        },
      });
    } catch (error) {
      logger.error('PublisherPortalController.getDashboard error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get Assigned Offers for this Publisher
   * Includes ready-to-use tracking link with click_id macro
   */
  async getOffers(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const baseURL = process.env.TRACKING_BASE_URL || process.env.BASE_URL || `${request.protocol}://${request.headers.host}`;

      const { search, status, page = 1, limit = 20 } = request.query || {};
      const offset = (Math.max(1, parseInt(page, 10)) - 1) * parseInt(limit, 10);

      let where = `WHERE po.tenant_id = ? AND po.publisher_id = ?`;
      const params = [tenantId, publisherId];

      if (status) {
        where += ` AND po.status = ?`;
        params.push(status);
      } else {
        where += ` AND po.status = 'active'`;
      }

      if (search && String(search).trim()) {
        const term = `%${String(search).trim()}%`;
        where += ` AND (o.name LIKE ? OR o.category LIKE ? OR CAST(o.public_offer_id AS CHAR) LIKE ?)`;
        params.push(term, term, term);
      }

      // Count query
      const [countRows] = await pool.query(
        `SELECT COUNT(*) as total 
         FROM publisher_offers po 
         JOIN offers o ON po.offer_id = o.id 
         ${where}`,
        params
      );
      const total = Number(countRows?.[0]?.total || 0);

      // Data query
      const [rows] = await pool.query(
        `SELECT 
            po.id as assignment_id,
            po.public_assignment_id,
            po.status as assignment_status,
            po.payout_override,
            po.assigned_at,
            o.id as offer_id,
            o.public_offer_id,
            o.name as offer_name,
            o.category,
            o.description,
            COALESCE(o.offer_currency, 'USD') as currency,
            o.affiliate_amount as default_payout,
            o.status as offer_status
         FROM publisher_offers po
         JOIN offers o ON po.offer_id = o.id
         ${where}
         ORDER BY po.assigned_at DESC
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit, 10), offset]
      );

      // Generate tracking links for each assignment
      const offersWithLinks = await Promise.all(
        rows.map(async (item) => {
          let trackingPayload = null;
          try {
            trackingPayload = await assignmentService.generateTrackingURL(
              item.assignment_id,
              baseURL,
              'standard',
              tenantId
            );
          } catch (err) {
            logger.warn('Failed to generate tracking URL for assignment:', { assignment_id: item.assignment_id, error: err.message });
          }

          const effectivePayout = item.payout_override !== null && item.payout_override !== undefined
            ? Number(item.payout_override)
            : Number(item.default_payout || 0);

          return {
            assignment_id: item.assignment_id,
            public_assignment_id: item.public_assignment_id,
            offer_id: item.offer_id,
            public_offer_id: item.public_offer_id,
            name: item.offer_name,
            category: item.category,
            description: item.description,
            currency: item.currency || 'USD',
            payout: effectivePayout,
            status: item.assignment_status,
            assigned_at: item.assigned_at,
            tracking_url: (trackingPayload?.tracking_url || '')
              .replace('click_id={click_id}', 'click_id={affiliate_click_id}')
              .replace(/%7B/gi, '{')
              .replace(/%7D/gi, '}'),
            offer_params: trackingPayload?.offer_params || [],
            required_params: trackingPayload?.required_params || [],
            supported_macros: [
              { macro: '{affiliate_click_id}', description: 'Your original click ID passed in tracking link (Recommended)' },
              { macro: '{click_id}', description: 'Standard click ID macro' },
              { macro: '{sub1}', description: 'Custom sub-parameter 1' },
              { macro: '{sub2}', description: 'Custom sub-parameter 2' },
              { macro: '{sub3}', description: 'Custom sub-parameter 3' },
              { macro: '{sub4}', description: 'Custom sub-parameter 4' },
              { macro: '{sub5}', description: 'Custom sub-parameter 5' },
            ],
          };
        })
      );

      return reply.send({
        success: true,
        data: offersWithLinks,
        pagination: {
          page: parseInt(page, 10),
          limit: parseInt(limit, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit, 10)),
        },
      });
    } catch (error) {
      logger.error('PublisherPortalController.getOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get Performance Reports Scoped to this Publisher
   * 🔒 STRICT TENANT & PUBLISHER ISOLATION
   * Matches Admin Panel logic: Today from raw clicks/conversions (IST bounds), past days from daily_reporting_rollup
   * Supports Group By: date, hour, offer, country, device_type, os, browser, status
   */
  async getReports(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const rt = getReportingRollupTableName();

      const todayIST = getIstTodayYmd();
      const defaultStart = prevIstYmd(todayIST); // default to yesterday or 30 days
      const {
        start_date,
        end_date,
        offer_id,
        country,
        device_type,
        status = 'all',
        group_by = 'date',
        search = '',
      } = request.query || {};

      const fromYmd = start_date || todayIST;
      const toYmd = end_date || todayIST;
      const rangeUtcSpan = istYmdSpanToMysqlUtcRange(fromYmd, toYmd);
      const split = splitDateRangeForRollup(fromYmd, toYmd);
      const todaySpan = istYmdSpanToMysqlUtcRange(todayIST, todayIST);

      // 1. Fetch Active Assigned Offers for the Filter Dropdown
      const [assignedOffers] = await pool.query(
        `SELECT o.id, o.public_offer_id, o.name, o.category
         FROM publisher_offers po
         JOIN offers o ON po.offer_id = o.id
         WHERE po.tenant_id = ? AND po.publisher_id = ? AND po.status = 'active'
         ORDER BY o.name ASC`,
        [tenantId, publisherId]
      );

      // 2. Base Filters
      let clickWhere = 'WHERE c.tenant_id = ? AND c.publisher_id = ? AND c.created_at BETWEEN ? AND ?';
      const clickParams = [tenantId, publisherId, rangeUtcSpan.start, rangeUtcSpan.end];

      let convWhere = 'WHERE conv.tenant_id = ? AND conv.publisher_id = ? AND conv.created_at BETWEEN ? AND ?';
      const convParams = [tenantId, publisherId, rangeUtcSpan.start, rangeUtcSpan.end];

      if (offer_id) {
        clickWhere += ' AND c.offer_id = ?';
        clickParams.push(offer_id);
        convWhere += ' AND conv.offer_id = ?';
        convParams.push(offer_id);
      }
      if (country) {
        clickWhere += ' AND c.country = ?';
        clickParams.push(country);
      }
      if (device_type) {
        clickWhere += ' AND c.device_type = ?';
        clickParams.push(device_type);
      }
      // Publisher reports expose approved conversions only.
      convWhere += ` AND conv.status = 'approved'`;
      void status;

      let rows = [];

      // 3. Execution depending on group_by
      if (group_by === 'offer') {
        // Hybrid: past days from rollup + today from raw
        const offerMap = {};

        // 3a. Rollup for past days
        if (split.useRollup) {
          let rollupSql = `
            SELECT 
              r.offer_id,
              COALESCE(SUM(r.total_clicks), 0) as clicks,
              COALESCE(SUM(r.approved_conversions), 0) as approved_convs,
              COALESCE(SUM(r.pending_conversions), 0) as pending_convs,
              COALESCE(SUM(r.rejected_conversions), 0) as rejected_convs,
              COALESCE(SUM(r.total_conversions), 0) as total_convs,
              COALESCE(SUM(r.payout), 0) as payout
            FROM ${rt} r
            WHERE r.tenant_id = ? AND r.publisher_id = ? AND r.stat_date BETWEEN ? AND ?
          `;
          const rollupParams = [tenantId, publisherId, split.rollupFrom, split.rollupTo];
          if (offer_id) {
            rollupSql += ' AND r.offer_id = ?';
            rollupParams.push(offer_id);
          }
          rollupSql += ' GROUP BY r.offer_id';

          const [rollupOfferRows] = await pool.query(rollupSql, rollupParams);
          rollupOfferRows.forEach(r => {
            offerMap[r.offer_id] = {
              id: r.offer_id,
              clicks: Number(r.clicks || 0),
              conversions: Number(r.approved_convs || 0),
              pending_conversions: Number(r.pending_convs || 0),
              rejected_conversions: Number(r.rejected_convs || 0),
              total_conversions: Number(r.total_convs || 0),
              payout: Number(Number(r.payout || 0).toFixed(2)),
            };
          });
        }

        // 3b. Today from raw
        if (split.scanToday) {
          let todayClickSql = 'WHERE c.tenant_id = ? AND c.publisher_id = ? AND c.created_at BETWEEN ? AND ?';
          const tClickParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];
          let todayConvSql = 'WHERE conv.tenant_id = ? AND conv.publisher_id = ? AND conv.created_at BETWEEN ? AND ?';
          const tConvParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];

          if (offer_id) {
            todayClickSql += ' AND c.offer_id = ?';
            tClickParams.push(offer_id);
            todayConvSql += ' AND conv.offer_id = ?';
            tConvParams.push(offer_id);
          }
          todayConvSql += ` AND conv.status = 'approved'`;

          const [todayClickRows] = await pool.query(
            `SELECT c.offer_id, COUNT(*) as clicks FROM clicks c ${todayClickSql} GROUP BY c.offer_id`,
            tClickParams
          );
          const [todayConvRows] = await pool.query(
            `SELECT 
               conv.offer_id,
               COUNT(CASE WHEN conv.status = 'approved' THEN 1 END) as approved_convs,
               COUNT(CASE WHEN conv.status = 'pending' THEN 1 END) as pending_convs,
               COUNT(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected_convs,
               COUNT(*) as total_convs,
               COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout
             FROM conversions conv ${todayConvSql} GROUP BY conv.offer_id`,
            tConvParams
          );

          todayClickRows.forEach(c => {
            if (!offerMap[c.offer_id]) {
              offerMap[c.offer_id] = { id: c.offer_id, clicks: 0, conversions: 0, pending_conversions: 0, rejected_conversions: 0, total_conversions: 0, payout: 0 };
            }
            offerMap[c.offer_id].clicks += Number(c.clicks || 0);
          });

          todayConvRows.forEach(v => {
            if (!offerMap[v.offer_id]) {
              offerMap[v.offer_id] = { id: v.offer_id, clicks: 0, conversions: 0, pending_conversions: 0, rejected_conversions: 0, total_conversions: 0, payout: 0 };
            }
            offerMap[v.offer_id].conversions += Number(v.approved_convs || 0);
            offerMap[v.offer_id].pending_conversions += Number(v.pending_convs || 0);
            offerMap[v.offer_id].rejected_conversions += Number(v.rejected_convs || 0);
            offerMap[v.offer_id].total_conversions += Number(v.total_convs || 0);
            offerMap[v.offer_id].payout = Number((offerMap[v.offer_id].payout + Number(v.payout || 0)).toFixed(2));
          });
        }

        // Fetch offer names & public IDs
        const allOfferIds = Object.keys(offerMap);
        let offerMetaMap = {};
        if (allOfferIds.length > 0) {
          const [oRows] = await pool.query(
            `SELECT id, public_offer_id, name, category, affiliate_amount FROM offers WHERE id IN (?) AND tenant_id = ?`,
            [allOfferIds, tenantId]
          );
          oRows.forEach(o => { offerMetaMap[o.id] = o; });
        }

        rows = Object.values(offerMap).map(row => {
          const o = offerMetaMap[row.id] || {};
          return {
            ...row,
            label: o.name || `Offer #${row.id}`,
            public_id: o.public_offer_id || row.id,
            category: o.category || 'Standard',
          };
        });
      } else if (group_by === 'hour') {
        // Hourly breakdown in IST: DATE_FORMAT(DATE_ADD(created_at, INTERVAL 330 MINUTE), '%Y-%m-%d %H:00')
        const [clickRows] = await pool.query(
          `SELECT 
             DATE_FORMAT(DATE_ADD(c.created_at, INTERVAL 330 MINUTE), '%Y-%m-%d %H:00') as dim_key,
             COUNT(*) as clicks 
           FROM clicks c 
           ${clickWhere} 
           GROUP BY dim_key`,
          clickParams
        );

        const [convRows] = await pool.query(
          `SELECT 
             DATE_FORMAT(DATE_ADD(conv.created_at, INTERVAL 330 MINUTE), '%Y-%m-%d %H:00') as dim_key,
             COUNT(CASE WHEN conv.status = 'approved' THEN 1 END) as approved_convs,
             COUNT(CASE WHEN conv.status = 'pending' THEN 1 END) as pending_convs,
             COUNT(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected_convs,
             COUNT(*) as total_convs,
             COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout
           FROM conversions conv 
           ${convWhere} 
           GROUP BY dim_key`,
          convParams
        );

        const hourMap = {};
        clickRows.forEach(c => {
          hourMap[c.dim_key] = {
            id: c.dim_key,
            label: c.dim_key,
            clicks: Number(c.clicks || 0),
            conversions: 0,
            pending_conversions: 0,
            rejected_conversions: 0,
            total_conversions: 0,
            payout: 0,
          };
        });

        convRows.forEach(v => {
          if (!hourMap[v.dim_key]) {
            hourMap[v.dim_key] = {
              id: v.dim_key,
              label: v.dim_key,
              clicks: 0,
              conversions: 0,
              pending_conversions: 0,
              rejected_conversions: 0,
              total_conversions: 0,
              payout: 0,
            };
          }
          hourMap[v.dim_key].conversions = Number(v.approved_convs || 0);
          hourMap[v.dim_key].pending_conversions = Number(v.pending_convs || 0);
          hourMap[v.dim_key].rejected_conversions = Number(v.rejected_convs || 0);
          hourMap[v.dim_key].total_conversions = Number(v.total_convs || 0);
          hourMap[v.dim_key].payout = Number(Number(v.payout || 0).toFixed(2));
        });

        rows = Object.values(hourMap).sort((a, b) => b.label.localeCompare(a.label));
      } else if (['country', 'device_type', 'os', 'browser'].includes(group_by)) {
        const field = group_by;
        const [clickRows] = await pool.query(
          `SELECT COALESCE(NULLIF(TRIM(c.${field}), ''), 'Unknown') as dim_key, COUNT(*) as clicks 
           FROM clicks c 
           ${clickWhere} 
           GROUP BY dim_key`,
          clickParams
        );

        const [convRows] = await pool.query(
          `SELECT 
             COALESCE(NULLIF(TRIM(c.${field}), ''), 'Unknown') as dim_key,
             COUNT(CASE WHEN conv.status = 'approved' THEN 1 END) as approved_convs,
             COUNT(CASE WHEN conv.status = 'pending' THEN 1 END) as pending_convs,
             COUNT(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected_convs,
             COUNT(*) as total_convs,
             COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout
           FROM conversions conv
           LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid AND c.tenant_id = ? AND c.publisher_id = ?
           ${convWhere}
           GROUP BY dim_key`,
          [tenantId, publisherId, ...convParams]
        );

        const dimMap = {};
        clickRows.forEach(c => {
          dimMap[c.dim_key] = {
            id: c.dim_key,
            label: c.dim_key,
            clicks: Number(c.clicks || 0),
            conversions: 0,
            pending_conversions: 0,
            rejected_conversions: 0,
            total_conversions: 0,
            payout: 0,
          };
        });

        convRows.forEach(v => {
          if (!dimMap[v.dim_key]) {
            dimMap[v.dim_key] = {
              id: v.dim_key,
              label: v.dim_key,
              clicks: 0,
              conversions: 0,
              pending_conversions: 0,
              rejected_conversions: 0,
              total_conversions: 0,
              payout: 0,
            };
          }
          dimMap[v.dim_key].conversions = Number(v.approved_convs || 0);
          dimMap[v.dim_key].pending_conversions = Number(v.pending_convs || 0);
          dimMap[v.dim_key].rejected_conversions = Number(v.rejected_convs || 0);
          dimMap[v.dim_key].total_conversions = Number(v.total_convs || 0);
          dimMap[v.dim_key].payout = Number(Number(v.payout || 0).toFixed(2));
        });

        rows = Object.values(dimMap);
      } else if (group_by === 'status') {
        const [convRows] = await pool.query(
          `SELECT 
             conv.status as dim_key,
             COUNT(*) as conversions,
             COALESCE(SUM(conv.payout), 0) as payout
           FROM conversions conv 
           ${convWhere} 
           GROUP BY conv.status`,
          convParams
        );

        rows = convRows.map(r => ({
          id: r.dim_key,
          label: r.dim_key ? (r.dim_key.charAt(0).toUpperCase() + r.dim_key.slice(1)) : 'Unknown',
          clicks: 0,
          conversions: Number(r.conversions || 0),
          pending_conversions: r.dim_key === 'pending' ? Number(r.conversions || 0) : 0,
          rejected_conversions: ['rejected', 'rejected_cap', 'click_expired'].includes(r.dim_key) ? Number(r.conversions || 0) : 0,
          total_conversions: Number(r.conversions || 0),
          payout: Number(Number(r.payout || 0).toFixed(2)),
        }));
      } else {
        // Default: Group by Date (Hybrid from daily_reporting_rollup + today raw)
        const dateMap = {};

        // 3a. Past days from rollup table
        if (split.useRollup) {
          let rollupDateSql = `
            SELECT 
              r.stat_date as dim_key,
              COALESCE(SUM(r.total_clicks), 0) as clicks,
              COALESCE(SUM(r.approved_conversions), 0) as approved_convs,
              COALESCE(SUM(r.pending_conversions), 0) as pending_convs,
              COALESCE(SUM(r.rejected_conversions), 0) as rejected_convs,
              COALESCE(SUM(r.total_conversions), 0) as total_convs,
              COALESCE(SUM(r.payout), 0) as payout
            FROM ${rt} r
            WHERE r.tenant_id = ? AND r.publisher_id = ? AND r.stat_date BETWEEN ? AND ?
          `;
          const rollupDateParams = [tenantId, publisherId, split.rollupFrom, split.rollupTo];
          if (offer_id) {
            rollupDateSql += ' AND r.offer_id = ?';
            rollupDateParams.push(offer_id);
          }
          rollupDateSql += ' GROUP BY r.stat_date';

          const [rollupDateRows] = await pool.query(rollupDateSql, rollupDateParams);
          rollupDateRows.forEach(r => {
            const key = r.dim_key instanceof Date ? r.dim_key.toISOString().slice(0, 10) : String(r.dim_key).slice(0, 10);
            dateMap[key] = {
              id: key,
              label: key,
              clicks: Number(r.clicks || 0),
              conversions: Number(r.approved_convs || 0),
              pending_conversions: Number(r.pending_convs || 0),
              rejected_conversions: Number(r.rejected_convs || 0),
              total_conversions: Number(r.total_convs || 0),
              payout: Number(Number(r.payout || 0).toFixed(2)),
            };
          });
        }

        // 3b. Today from raw
        if (split.scanToday) {
          let todayClickSql = 'WHERE c.tenant_id = ? AND c.publisher_id = ? AND c.created_at BETWEEN ? AND ?';
          const tClickParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];
          let todayConvSql = 'WHERE conv.tenant_id = ? AND conv.publisher_id = ? AND conv.created_at BETWEEN ? AND ?';
          const tConvParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];

          if (offer_id) {
            todayClickSql += ' AND c.offer_id = ?';
            tClickParams.push(offer_id);
            todayConvSql += ' AND conv.offer_id = ?';
            tConvParams.push(offer_id);
          }
          todayConvSql += ` AND conv.status = 'approved'`;

          const [todayClickRows] = await pool.query(
            `SELECT COUNT(*) as clicks FROM clicks c ${todayClickSql}`,
            tClickParams
          );
          const [todayConvRows] = await pool.query(
            `SELECT 
               COUNT(CASE WHEN conv.status = 'approved' THEN 1 END) as approved_convs,
               COUNT(CASE WHEN conv.status = 'pending' THEN 1 END) as pending_convs,
               COUNT(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 END) as rejected_convs,
               COUNT(*) as total_convs,
               COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout
             FROM conversions conv ${todayConvSql}`,
            tConvParams
          );

          dateMap[todayIST] = {
            id: todayIST,
            label: todayIST,
            clicks: Number(todayClickRows?.[0]?.clicks || 0),
            conversions: Number(todayConvRows?.[0]?.approved_convs || 0),
            pending_conversions: Number(todayConvRows?.[0]?.pending_convs || 0),
            rejected_conversions: Number(todayConvRows?.[0]?.rejected_convs || 0),
            total_conversions: Number(todayConvRows?.[0]?.total_convs || 0),
            payout: Number(Number(todayConvRows?.[0]?.payout || 0).toFixed(2)),
          };
        }

        rows = Object.values(dateMap).sort((a, b) => b.label.localeCompare(a.label));
      }

      // 4. Calculate CR & EPC and apply search filter
      let formattedRows = rows.map(row => {
        const clicks = Number(row.clicks || 0);
        const conversions = Number(row.conversions || 0);
        const payout = Number(row.payout || 0);
        return {
          id: row.id,
          label: row.label,
          public_id: row.public_id,
          category: row.category,
          clicks,
          conversions,
          payout,
          epc: clicks > 0 ? Number((payout / clicks).toFixed(4)) : 0,
          cr: clicks > 0 ? Number(((conversions / clicks) * 100).toFixed(2)) : 0,
        };
      });

      if (search && search.trim()) {
        const q = search.trim().toLowerCase();
        formattedRows = formattedRows.filter(r =>
          (r.label && String(r.label).toLowerCase().includes(q)) ||
          (r.public_id && String(r.public_id).toLowerCase().includes(q)) ||
          (r.category && String(r.category).toLowerCase().includes(q))
        );
      }

      // 5. Overall Summary Totals
      const summary = formattedRows.reduce(
        (acc, r) => ({
          total_clicks: acc.total_clicks + r.clicks,
          total_conversions: acc.total_conversions + r.conversions,
          total_payout: Number((acc.total_payout + r.payout).toFixed(2)),
        }),
        { total_clicks: 0, total_conversions: 0, total_payout: 0 }
      );

      summary.avg_epc = summary.total_clicks > 0 ? Number((summary.total_payout / summary.total_clicks).toFixed(4)) : 0;
      summary.avg_cr = summary.total_clicks > 0 ? Number(((summary.total_conversions / summary.total_clicks) * 100).toFixed(2)) : 0;

      // 6. Timeline Trend for interactive charts (Hybrid from daily_reporting_rollup + today raw)
      const timelineMap = {};
      let dCur = fromYmd;
      while (dCur <= toYmd) {
        timelineMap[dCur] = { date: dCur, clicks: 0, conversions: 0, payout: 0, cr: 0, epc: 0 };
        const [y, m, d] = dCur.split('-').map(Number);
        const next = new Date(Date.UTC(y, m - 1, d + 1));
        dCur = next.toISOString().slice(0, 10);
      }

      if (split.useRollup) {
        let rollupTimelineSql = `
          SELECT 
            r.stat_date,
            COALESCE(SUM(r.total_clicks), 0) as clicks,
            COALESCE(SUM(r.approved_conversions), 0) as conversions,
            COALESCE(SUM(r.payout), 0) as payout
          FROM ${rt} r
          WHERE r.tenant_id = ? AND r.publisher_id = ? AND r.stat_date BETWEEN ? AND ?
        `;
        const rTParams = [tenantId, publisherId, split.rollupFrom, split.rollupTo];
        if (offer_id) {
          rollupTimelineSql += ' AND r.offer_id = ?';
          rTParams.push(offer_id);
        }
        rollupTimelineSql += ' GROUP BY r.stat_date';

        const [rTRows] = await pool.query(rollupTimelineSql, rTParams);
        rTRows.forEach(r => {
          const key = r.stat_date instanceof Date ? r.stat_date.toISOString().slice(0, 10) : String(r.stat_date).slice(0, 10);
          if (timelineMap[key]) {
            timelineMap[key].clicks = Number(r.clicks || 0);
            timelineMap[key].conversions = Number(r.conversions || 0);
            timelineMap[key].payout = Number(Number(r.payout || 0).toFixed(2));
          }
        });
      }

      if (split.scanToday) {
        let tClickSql = 'WHERE c.tenant_id = ? AND c.publisher_id = ? AND c.created_at BETWEEN ? AND ?';
        const tCParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];
        let tConvSql = 'WHERE conv.tenant_id = ? AND conv.publisher_id = ? AND conv.created_at BETWEEN ? AND ?';
        const tVParams = [tenantId, publisherId, todaySpan.start, todaySpan.end];

        if (offer_id) {
          tClickSql += ' AND c.offer_id = ?';
          tCParams.push(offer_id);
          tConvSql += ' AND conv.offer_id = ?';
          tVParams.push(offer_id);
        }
        tConvSql += ` AND conv.status = 'approved'`;

        const [tClicks] = await pool.query(`SELECT COUNT(*) as clicks FROM clicks c ${tClickSql}`, tCParams);
        const [tConvs] = await pool.query(
          `SELECT 
             COUNT(CASE WHEN conv.status = 'approved' THEN 1 END) as conversions,
             COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout 
           FROM conversions conv ${tConvSql}`,
          tVParams
        );

        if (timelineMap[todayIST]) {
          timelineMap[todayIST].clicks = Number(tClicks?.[0]?.clicks || 0);
          timelineMap[todayIST].conversions = Number(tConvs?.[0]?.conversions || 0);
          timelineMap[todayIST].payout = Number(Number(tConvs?.[0]?.payout || 0).toFixed(2));
        }
      }

      const timeline = Object.values(timelineMap)
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(item => ({
          ...item,
          cr: item.clicks > 0 ? Number(((item.conversions / item.clicks) * 100).toFixed(2)) : 0,
          epc: item.clicks > 0 ? Number((item.payout / item.clicks).toFixed(4)) : 0,
        }));

      return reply.send({
        success: true,
        data: formattedRows,
        summary,
        timeline,
        assigned_offers: assignedOffers.map(o => ({
          id: o.id,
          public_offer_id: o.public_offer_id,
          name: o.name,
          category: o.category,
        })),
      });
    } catch (error) {
      logger.error('PublisherPortalController.getReports error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get Publisher Profile & Postback Settings
   */
  async getProfile(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;

      const [rows] = await pool.query(
        `SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status, created_at
         FROM publishers 
         WHERE id = ? AND tenant_id = ?`,
        [publisherId, tenantId]
      );

      if (!rows || rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Publisher not found' });
      }

      return reply.send({
        success: true,
        data: {
          ...rows[0],
          name: rows[0].first_name || rows[0].company_name || 'Publisher',
          fullName: rows[0].first_name || rows[0].company_name || 'Publisher',
          supported_macros: [
            { macro: '{click_id}', description: 'Your original click ID passed in tracking link' },
            { macro: '{payout}', description: 'Payout amount earned on this conversion' },
            { macro: '{offer_id}', description: 'Public offer ID' },
            { macro: '{conversion_id}', description: 'Unique conversion transaction ID' },
            { macro: '{sub1}', description: 'Sub parameter 1 passed in click' },
            { macro: '{sub2}', description: 'Sub parameter 2 passed in click' },
          ],
        },
      });
    } catch (error) {
      logger.error('PublisherPortalController.getProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Update Publisher Profile & Postback Settings
   */
  async updateProfile(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const { first_name, company_name, country, global_postback_url } = request.body || {};

      const updates = [];
      const params = [];

      if (first_name !== undefined) {
        updates.push('first_name = ?');
        params.push(first_name || null);
      }
      if (company_name !== undefined) {
        updates.push('company_name = ?');
        params.push(company_name || null);
      }
      if (country !== undefined) {
        updates.push('country = ?');
        params.push(country || null);
      }
      if (global_postback_url !== undefined) {
        updates.push('global_postback_url = ?');
        params.push(global_postback_url || null);
      }

      if (updates.length > 0) {
        updates.push('updated_at = UTC_TIMESTAMP()');
        params.push(publisherId, tenantId);
        await pool.query(
          `UPDATE publishers SET ${updates.join(', ')} WHERE id = ? AND tenant_id = ?`,
          params
        );
      }

      // Fetch updated record
      const [rows] = await pool.query(
        `SELECT id, public_publisher_id, email, first_name, company_name, country, global_postback_url, status
         FROM publishers 
         WHERE id = ? AND tenant_id = ?`,
        [publisherId, tenantId]
      );

      return reply.send({
        success: true,
        message: 'Profile updated successfully',
        data: rows[0],
      });
    } catch (error) {
      logger.error('PublisherPortalController.updateProfile error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async ensurePasswordResetTable() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        email VARCHAR(255) NOT NULL,
        otp VARCHAR(10) NOT NULL,
        status VARCHAR(20) DEFAULT 'pending',
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (email)
      )
    `);
  }

  /**
   * Email OTP for the logged-in publisher. Does not use the admin password flow.
   */
  async requestPasswordOtp(request, reply) {
    try {
      await this.ensurePasswordResetTable();
      const email = request.publisher.email;
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;

      const [rows] = await pool.query(
        'SELECT id FROM publishers WHERE id = ? AND tenant_id = ? AND email = ?',
        [publisherId, tenantId, email]
      );
      if (!rows || rows.length === 0) {
        return reply.code(404).send({ success: false, message: 'Publisher not found' });
      }

      const otp = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await pool.query(
        `INSERT INTO password_resets (email, otp, expires_at, status)
         VALUES (?, ?, ?, 'pending')
         ON DUPLICATE KEY UPDATE otp = VALUES(otp), expires_at = VALUES(expires_at), status = 'pending'`,
        [email, otp, expiresAt]
      );
      await emailService.sendOtpEmail(email, otp);

      return reply.send({ success: true, message: 'OTP sent to your email' });
    } catch (error) {
      logger.error('PublisherPortalController.requestPasswordOtp error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async verifyPasswordOtp(request, reply) {
    try {
      const email = request.publisher.email;
      const otp = String(request.body?.otp || '').trim();
      if (!/^\d{6}$/.test(otp)) {
        return reply.code(400).send({ success: false, message: 'Enter the 6-digit OTP' });
      }

      const [rows] = await pool.query(
        'SELECT email FROM password_resets WHERE email = ? AND otp = ? AND expires_at > NOW()',
        [email, otp]
      );
      if (!rows || rows.length === 0) {
        return reply.code(400).send({ success: false, message: 'Invalid or expired OTP' });
      }

      await pool.query(
        `UPDATE password_resets SET status = 'verified' WHERE email = ?`,
        [email]
      );
      return reply.send({ success: true, message: 'OTP verified' });
    } catch (error) {
      logger.error('PublisherPortalController.verifyPasswordOtp error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async resetPasswordWithOtp(request, reply) {
    try {
      const email = request.publisher.email;
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const newPassword = String(request.body?.newPassword || '');

      if (newPassword.length < 6) {
        return reply.code(400).send({
          success: false,
          message: 'Password must be at least 6 characters long',
        });
      }

      const [rows] = await pool.query(
        `SELECT email FROM password_resets WHERE email = ? AND status = 'verified' AND expires_at > NOW()`,
        [email]
      );
      if (!rows || rows.length === 0) {
        return reply.code(400).send({
          success: false,
          message: 'Verify the email OTP before setting a new password',
        });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        'UPDATE publishers SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND tenant_id = ? AND email = ?',
        [newHash, publisherId, tenantId, email]
      );
      await pool.query('DELETE FROM password_resets WHERE email = ?', [email]);

      return reply.send({ success: true, message: 'Password changed successfully' });
    } catch (error) {
      logger.error('PublisherPortalController.resetPasswordWithOtp error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Change Publisher Password
   */
  async changePassword(request, reply) {
    try {
      const publisherId = request.publisher.id;
      const tenantId = request.publisher.tenant_id;
      const { currentPassword, newPassword } = request.body || {};

      if (!currentPassword || !newPassword) {
        return reply.code(400).send({
          success: false,
          message: 'Both current password and new password are required',
        });
      }

      if (newPassword.length < 6) {
        return reply.code(400).send({
          success: false,
          message: 'New password must be at least 6 characters long',
        });
      }

      // Fetch password hash
      const [rows] = await pool.query(
        'SELECT password_hash FROM publishers WHERE id = ? AND tenant_id = ?',
        [publisherId, tenantId]
      );

      if (!rows || rows.length === 0 || !rows[0].password_hash) {
        return reply.code(400).send({
          success: false,
          message: 'Unable to verify password',
        });
      }

      const isValid = await bcrypt.compare(currentPassword, rows[0].password_hash);
      if (!isValid) {
        return reply.code(400).send({
          success: false,
          message: 'Incorrect current password',
        });
      }

      const newHash = await bcrypt.hash(newPassword, 10);
      await pool.query(
        'UPDATE publishers SET password_hash = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND tenant_id = ?',
        [newHash, publisherId, tenantId]
      );

      return reply.send({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('PublisherPortalController.changePassword error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new PublisherPortalController();
