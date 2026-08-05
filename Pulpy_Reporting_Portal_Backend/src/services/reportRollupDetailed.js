/**
 * Detailed aggregated reports from daily_reporting_rollup (+ today from raw).
 * Used when REPORT_USE_RAW_TABLES is not true and filters/groupBy fit rollup grain.
 */
import pool from '../db/connection.js';
import { getReportingRollupTableName } from '../config/reportingRollupTable.js';
import { getIstTodayYmd, splitDateRangeForRollup } from '../utils/reportDailyRollup.js';
import { istYmdSpanToMysqlUtcRange } from '../utils/mysqlUtcRange.js';

function buildRollupEntitySql(alias, filters, offerIds) {
  const parts = [];
  const params = [];
  if (filters.offer_id) {
    parts.push(`${alias}.offer_id = ?`);
    params.push(filters.offer_id);
  }
  if (filters.publisher_id) {
    parts.push(`${alias}.publisher_id = ?`);
    params.push(filters.publisher_id);
  }
  if (offerIds && offerIds.length > 0) {
    parts.push(`${alias}.offer_id IN (${offerIds.map(() => '?').join(', ')})`);
    params.push(...offerIds);
  }
  const sql = parts.length ? ` AND ${parts.join(' AND ')}` : '';
  return { sql, params };
}

function pushTodayAgg(cteParts, params, {
  tenantId,
  utcStart,
  utcEnd,
  predC,
  predConv,
  needsUniqueClicksAgg,
  needsConversionMetrics,
}) {
  cteParts.push(`today_ca AS (
    SELECT
      c.offer_id,
      c.publisher_id,
      DATE(DATE_ADD(c.created_at, INTERVAL 330 MINUTE)) AS date_group,
      COUNT(*) AS clicks
      ${needsUniqueClicksAgg ? ', COUNT(DISTINCT c.ip) AS unique_clicks' : ''}
    FROM clicks c
    WHERE c.tenant_id = ?
      AND c.created_at BETWEEN ? AND ?
      ${predC.sql}
    GROUP BY c.offer_id, c.publisher_id, date_group
  )`);
  params.push(tenantId, utcStart, utcEnd, ...predC.params);

  if (needsConversionMetrics) {
    cteParts.push(`today_va AS (
      SELECT
        conv.offer_id,
        conv.publisher_id,
        DATE(DATE_ADD(conv.created_at, INTERVAL 330 MINUTE)) AS date_group,
        COUNT(*) AS conversions,
        SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) AS approved_conversions,
        SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) AS pending_conversions,
        SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) AS rejected_conversions,
        COALESCE(SUM(conv.amount), 0) AS revenue,
        COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) AS payout,
        COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) AS profit,
        COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) AS pending_payout,
        COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) AS approved_payout
      FROM conversions conv
      WHERE conv.tenant_id = ?
        AND conv.created_at BETWEEN ? AND ?
        ${predConv.sql}
      GROUP BY conv.offer_id, conv.publisher_id, date_group
    )`);
    params.push(tenantId, utcStart, utcEnd, ...predConv.params);
  }
}

/**
 * @param {object} ctx
 */
export async function runRollupDetailedAggregated(ctx) {
  const {
    filters,
    tenantId,
    page,
    limit,
    offset,
    groupBy,
    buildEntityFactPredicates,
    wantsMetric,
    includeAllMetrics,
  } = ctx;

  const todayIST = getIstTodayYmd();
  const fromDate = filters.date_from || todayIST;
  const toDate = filters.date_to || todayIST;
  const split = splitDateRangeForRollup(fromDate, toDate);

  const needsConversionMetrics =
    wantsMetric('conversions') ||
    wantsMetric('approved_conversions') ||
    wantsMetric('pending_conversions') ||
    wantsMetric('rejected_conversions') ||
    wantsMetric('revenue') ||
    wantsMetric('payout') ||
    wantsMetric('profit') ||
    wantsMetric('pending_payout') ||
    wantsMetric('approved_payout');

  const needsUniqueClicksAgg = wantsMetric('unique_clicks') || includeAllMetrics;
  const wantsDate = groupBy.includes('date');
  const wantsOffer = groupBy.includes('offer_id');
  const wantsPublisher = groupBy.includes('publisher_id');
  const wantsAdvertiser = groupBy.includes('advertiser_id');

  let offerIds = null;
  const filtersForPred = { ...filters };
  if (filters.advertiser_id) {
    const [offerRows] = await pool.query(
      'SELECT id FROM offers WHERE tenant_id = ? AND advertiser_id = ?',
      [tenantId, filters.advertiser_id]
    );
    offerIds = offerRows.map((r) => r.id);
    if (offerIds.length === 0) {
      return {
        data: [],
        pagination: { page, limit, total: 0, totalPages: 0 },
        isAggregated: true,
        source: 'rollup',
      };
    }
    delete filtersForPred.advertiser_id;
  }

  const predC = buildEntityFactPredicates('c', filtersForPred, tenantId);
  const predConv = buildEntityFactPredicates('conv', filtersForPred, tenantId);
  if (offerIds?.length) {
    const inList = offerIds.map(() => '?').join(', ');
    predC.sql += ` AND c.offer_id IN (${inList})`;
    predC.params.push(...offerIds);
    predConv.sql += ` AND conv.offer_id IN (${inList})`;
    predConv.params.push(...offerIds);
  }

  const rollupEntity = buildRollupEntitySql('r', filters, offerIds);
  const rt = getReportingRollupTableName();
  const cteParts = [];
  const params = [];

  if (split.useRollup) {
    cteParts.push(`rollup_ca AS (
      SELECT
        r.offer_id,
        r.publisher_id,
        r.stat_date AS date_group,
        SUM(r.total_clicks) AS clicks
        ${needsUniqueClicksAgg ? ', SUM(r.unique_ips) AS unique_clicks' : ''}
      FROM ${rt} r
      WHERE r.tenant_id = ?
        AND r.stat_date BETWEEN ? AND ?
        ${rollupEntity.sql}
      GROUP BY r.offer_id, r.publisher_id, r.stat_date
    )`);
    params.push(tenantId, split.rollupFrom, split.rollupTo, ...rollupEntity.params);

    if (needsConversionMetrics) {
      cteParts.push(`rollup_va AS (
        SELECT
          r.offer_id,
          r.publisher_id,
          r.stat_date AS date_group,
          SUM(r.total_conversions) AS conversions,
          SUM(r.approved_conversions) AS approved_conversions,
          SUM(r.pending_conversions) AS pending_conversions,
          SUM(r.rejected_conversions) AS rejected_conversions,
          COALESCE(SUM(r.revenue), 0) AS revenue,
          COALESCE(SUM(r.payout), 0) AS payout,
          COALESCE(SUM(r.profit), 0) AS profit,
          COALESCE(SUM(r.pending_payout), 0) AS pending_payout,
          COALESCE(SUM(r.payout), 0) AS approved_payout
        FROM ${rt} r
        WHERE r.tenant_id = ?
          AND r.stat_date BETWEEN ? AND ?
          ${rollupEntity.sql}
        GROUP BY r.offer_id, r.publisher_id, r.stat_date
      )`);
      params.push(tenantId, split.rollupFrom, split.rollupTo, ...rollupEntity.params);
    }
  }

  if (split.scanToday) {
    const todaySpan = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
    pushTodayAgg(cteParts, params, {
      tenantId,
      utcStart: todaySpan.start,
      utcEnd: todaySpan.end,
      predC,
      predConv,
      needsUniqueClicksAgg,
      needsConversionMetrics,
    });
  }

  const caSources = [];
  const vaSources = [];
  if (split.useRollup) {
    caSources.push('rollup_ca');
    if (needsConversionMetrics) vaSources.push('rollup_va');
  }
  if (split.scanToday) {
    caSources.push('today_ca');
    if (needsConversionMetrics) vaSources.push('today_va');
  }

  if (caSources.length === 0) {
    return {
      data: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
      isAggregated: true,
      source: 'rollup',
    };
  }

  if (caSources.length === 1) {
    cteParts.push(`ca AS (SELECT * FROM ${caSources[0]})`);
  } else {
    cteParts.push(`ca AS (${caSources.map((s) => `SELECT * FROM ${s}`).join(' UNION ALL ')})`);
  }

  if (needsConversionMetrics) {
    if (vaSources.length === 1) {
      cteParts.push(`va AS (SELECT * FROM ${vaSources[0]})`);
    } else {
      cteParts.push(`va AS (${vaSources.map((s) => `SELECT * FROM ${s}`).join(' UNION ALL ')})`);
    }
  }

  cteParts.push(`
    grain AS (
      SELECT offer_id, publisher_id, date_group FROM ca
      ${needsConversionMetrics ? `
      UNION DISTINCT
      SELECT offer_id, publisher_id, date_group FROM va` : ''}
    )
  `);

  // Join metrics + dimensions at offer×publisher×date, then re-aggregate to requested groupBy.
  cteParts.push(`
    enriched AS (
      SELECT
        g.date_group,
        g.offer_id,
        g.publisher_id,
        o.advertiser_id AS advertiser_id_internal,
        COALESCE(o.public_offer_id, CAST(g.offer_id AS CHAR)) AS offer_public_id,
        COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', g.offer_id)) AS offer_name,
        COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', g.publisher_id)) AS publisher_name,
        COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', g.publisher_id, '@unknown')) AS publisher_email,
        COALESCE(a.public_advertiser_id, CAST(o.advertiser_id AS CHAR)) AS advertiser_public_id,
        COALESCE(NULLIF(TRIM(a.name), ''), CONCAT('Advertiser #', o.advertiser_id)) AS advertiser_name,
        COALESCE(ca.clicks, 0) AS clicks
        ${needsUniqueClicksAgg ? ', COALESCE(ca.unique_clicks, 0) AS unique_clicks' : ''}
        ${needsConversionMetrics ? `,
        COALESCE(va.conversions, 0) AS conversions,
        COALESCE(va.approved_conversions, 0) AS approved_conversions,
        COALESCE(va.pending_conversions, 0) AS pending_conversions,
        COALESCE(va.rejected_conversions, 0) AS rejected_conversions,
        COALESCE(va.revenue, 0) AS revenue,
        COALESCE(va.payout, 0) AS payout,
        COALESCE(va.profit, 0) AS profit,
        COALESCE(va.pending_payout, 0) AS pending_payout,
        COALESCE(va.approved_payout, 0) AS approved_payout` : ''}
      FROM grain g
      LEFT JOIN offers o ON o.id = g.offer_id AND o.tenant_id = ${Number(tenantId)}
      LEFT JOIN publishers p ON p.id = g.publisher_id AND p.tenant_id = ${Number(tenantId)}
      LEFT JOIN advertisers a ON a.id = o.advertiser_id AND a.tenant_id = ${Number(tenantId)}
      LEFT JOIN ca
        ON ca.offer_id = g.offer_id AND ca.publisher_id = g.publisher_id AND ca.date_group = g.date_group
      ${needsConversionMetrics ? `
      LEFT JOIN va
        ON va.offer_id = g.offer_id AND va.publisher_id = g.publisher_id AND va.date_group = g.date_group` : ''}
    )
  `);

  const groupExpr = [];
  const selectDims = [];
  if (wantsDate) {
    groupExpr.push('e.date_group');
    selectDims.push('e.date_group AS date_group');
  }
  if (wantsOffer) {
    groupExpr.push('e.offer_id', 'e.offer_public_id', 'e.offer_name');
    selectDims.push('e.offer_public_id AS offer_id');
    selectDims.push('e.offer_name AS offer_name');
  }
  if (wantsPublisher) {
    groupExpr.push('e.publisher_id', 'e.publisher_name', 'e.publisher_email');
    selectDims.push('e.publisher_id AS publisher_id');
    selectDims.push('e.publisher_name AS publisher_name');
    selectDims.push('e.publisher_email AS publisher_email');
  }
  if (wantsAdvertiser) {
    groupExpr.push('e.advertiser_id_internal', 'e.advertiser_public_id', 'e.advertiser_name');
    selectDims.push('e.advertiser_public_id AS advertiser_id');
    selectDims.push('e.advertiser_name AS advertiser_name');
  }

  // Always expose full detail columns when UI asks for the common 3/4-dim export shape.
  // If groupBy is exactly offer+publisher+date, still include advertiser labels (matches UI CSV).
  const includeAdvertiserLabels =
    wantsAdvertiser ||
    (wantsOffer && wantsPublisher && wantsDate);

  if (includeAdvertiserLabels && !wantsAdvertiser) {
    groupExpr.push('e.advertiser_id_internal', 'e.advertiser_public_id', 'e.advertiser_name');
    selectDims.push('e.advertiser_public_id AS advertiser_id');
    selectDims.push('e.advertiser_name AS advertiser_name');
  }

  if (groupExpr.length === 0) {
    // Safety: should not happen when groupByEligibleForRollup passed
    groupExpr.push('e.offer_id', 'e.publisher_id', 'e.date_group');
    selectDims.push(
      'e.date_group AS date_group',
      'e.offer_public_id AS offer_id',
      'e.offer_name AS offer_name',
      'e.publisher_id AS publisher_id',
      'e.publisher_name AS publisher_name',
      'e.publisher_email AS publisher_email',
      'e.advertiser_public_id AS advertiser_id',
      'e.advertiser_name AS advertiser_name'
    );
  }

  const metricSelects = [];
  if (wantsMetric('clicks') || includeAllMetrics) metricSelects.push('SUM(e.clicks) AS clicks');
  if (needsUniqueClicksAgg) metricSelects.push('SUM(e.unique_clicks) AS unique_clicks');
  if (wantsMetric('impressions')) metricSelects.push('0 AS impressions');
  if (needsConversionMetrics) {
    if (wantsMetric('conversions') || includeAllMetrics) metricSelects.push('SUM(e.conversions) AS conversions');
    if (wantsMetric('approved_conversions') || includeAllMetrics) metricSelects.push('SUM(e.approved_conversions) AS approved_conversions');
    if (wantsMetric('pending_conversions') || includeAllMetrics) metricSelects.push('SUM(e.pending_conversions) AS pending_conversions');
    if (wantsMetric('rejected_conversions') || includeAllMetrics) metricSelects.push('SUM(e.rejected_conversions) AS rejected_conversions');
    if (wantsMetric('revenue') || includeAllMetrics) metricSelects.push('SUM(e.revenue) AS revenue');
    if (wantsMetric('payout') || includeAllMetrics) metricSelects.push('SUM(e.payout) AS payout');
    if (wantsMetric('profit') || includeAllMetrics) metricSelects.push('SUM(e.profit) AS profit');
    if (wantsMetric('pending_payout') || includeAllMetrics) metricSelects.push('SUM(e.pending_payout) AS pending_payout');
    if (wantsMetric('approved_payout') || includeAllMetrics) metricSelects.push('SUM(e.approved_payout) AS approved_payout');
  }

  cteParts.push(`
    grouped AS (
      SELECT
        ${[...selectDims, ...metricSelects].join(',\n        ')}
      FROM enriched e
      GROUP BY ${groupExpr.join(', ')}
    )
  `);

  const cteHeader = `WITH ${cteParts.join(',\n')}`;

  const orderParts = [];
  if (wantsDate) orderParts.push('date_group DESC');
  if (wantsMetric('clicks') || includeAllMetrics) orderParts.push('clicks DESC');
  if (wantsOffer) orderParts.push('offer_id ASC');
  if (wantsPublisher) orderParts.push('publisher_id ASC');
  const orderBy = orderParts.length ? `ORDER BY ${orderParts.join(', ')}` : 'ORDER BY 1';

  const exportMode = filters.export === 'csv' || filters.export === 'true';

  if (exportMode) {
    const exportQuery = `${cteHeader} SELECT * FROM grouped ${orderBy}`;
    const [exportRows] = await pool.query(exportQuery, params);
    return { data: exportRows, isExport: true, source: 'rollup' };
  }

  const countQuery = `${cteHeader} SELECT COUNT(*) AS total FROM grouped`;
  const pageQuery = `
    ${cteHeader}
    SELECT * FROM grouped
    ${orderBy}
    LIMIT ? OFFSET ?
  `;

  const [[countRows], [rows]] = await Promise.all([
    pool.query(countQuery, params),
    pool.query(pageQuery, [...params, limit, offset]),
  ]);

  const total = Number(countRows[0]?.total || 0);
  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 0 },
    isAggregated: true,
    source: 'rollup',
  };
}
