/**
 * Fast offer+publisher+advertiser+date detailed report:
 * - Historical IST days from daily_reporting_rollup
 * - Today from raw clicks/conversions (single day)
 * - Paginate keys before dimension joins
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

function pushRawCaVa(cteParts, params, {
  alias,
  table,
  tenantId,
  utcStart,
  utcEnd,
  pred,
  needsUniqueClicksAgg,
  needsConversionMetrics,
  cteName,
  allDates = false,
}) {
  const dateClause = allDates ? '' : ` AND ${alias}.created_at BETWEEN ? AND ?`;

  if (needsConversionMetrics && alias === 'conv') {
    cteParts.push(`${cteName} AS (
      SELECT
        ${alias}.offer_id,
        ${alias}.publisher_id,
        DATE(DATE_ADD(${alias}.created_at, INTERVAL 330 MINUTE)) as date_group,
        COUNT(*) as conversions,
        SUM(CASE WHEN ${alias}.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
        SUM(CASE WHEN ${alias}.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
        SUM(CASE WHEN ${alias}.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
        COALESCE(SUM(${alias}.amount), 0) as revenue,
        COALESCE(SUM(CASE WHEN ${alias}.status = 'approved' THEN ${alias}.payout ELSE 0 END), 0) as payout,
        COALESCE(SUM(${alias}.amount), 0) - COALESCE(SUM(CASE WHEN ${alias}.status = 'approved' THEN ${alias}.payout ELSE 0 END), 0) as profit,
        COALESCE(SUM(CASE WHEN ${alias}.status = 'pending' THEN ${alias}.payout ELSE 0 END), 0) as pending_payout,
        COALESCE(SUM(CASE WHEN ${alias}.status = 'approved' THEN ${alias}.payout ELSE 0 END), 0) as approved_payout
      FROM ${table} ${alias}
      WHERE ${alias}.tenant_id = ?
        ${dateClause}
        ${pred.sql}
      GROUP BY ${alias}.offer_id, ${alias}.publisher_id, date_group
    )`);
    params.push(tenantId);
    if (!allDates) params.push(utcStart, utcEnd);
    params.push(...pred.params);
    return;
  }

  cteParts.push(`${cteName} AS (
    SELECT
      ${alias}.offer_id,
      ${alias}.publisher_id,
      DATE(DATE_ADD(${alias}.created_at, INTERVAL 330 MINUTE)) as date_group,
      COUNT(*) as clicks
      ${needsUniqueClicksAgg ? `, COUNT(DISTINCT ${alias}.ip) as unique_clicks` : ''}
    FROM ${table} ${alias}
    WHERE ${alias}.tenant_id = ?
      ${dateClause}
      ${pred.sql}
    GROUP BY ${alias}.offer_id, ${alias}.publisher_id, date_group
  )`);
  params.push(tenantId);
  if (!allDates) params.push(utcStart, utcEnd);
  params.push(...pred.params);
}

/**
 * @param {object} ctx
 * @param {object} ctx.filters
 * @param {number|string} ctx.tenantId
 * @param {number} ctx.page
 * @param {number} ctx.limit
 * @param {number} ctx.offset
 * @param {function} ctx.buildEntityFactPredicates
 * @param {function} ctx.wantsMetric
 * @param {boolean} ctx.includeAllMetrics
 */
export async function runFourDimDetailedAggregated(ctx) {
  const {
    filters,
    tenantId,
    page,
    limit,
    offset,
    buildEntityFactPredicates,
    wantsMetric,
    includeAllMetrics,
  } = ctx;

  const allDates = filters.all_dates === true || filters.all_dates === 'true';
  const todayIST = getIstTodayYmd();
  const fromDate = filters.date_from || todayIST;
  const toDate = filters.date_to || todayIST;
  const fullSpan = istYmdSpanToMysqlUtcRange(fromDate, toDate);
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

  const needsUniqueClicksAgg = wantsMetric('unique_clicks');

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
      };
    }
    delete filtersForPred.advertiser_id;
  }

  const predC = buildEntityFactPredicates('c', filtersForPred, tenantId);
  const predConv = buildEntityFactPredicates('conv', filtersForPred, tenantId);
  if (offerIds?.length) {
    const inSql = ` AND c.offer_id IN (${offerIds.map(() => '?').join(', ')})`;
    const inSqlConv = ` AND conv.offer_id IN (${offerIds.map(() => '?').join(', ')})`;
    predC.sql += inSql;
    predC.params.push(...offerIds);
    predConv.sql += inSqlConv;
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

  const needsFullRaw =
    !split.useRollup && (!split.scanToday || fromDate < split.todayIST);
  const needsTodayRawOnly =
    split.scanToday && !needsFullRaw;

  if (needsTodayRawOnly) {
    const todaySpan = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
    pushRawCaVa(cteParts, params, {
      alias: 'c',
      table: 'clicks',
      tenantId,
      utcStart: todaySpan.start,
      utcEnd: todaySpan.end,
      pred: predC,
      needsUniqueClicksAgg,
      needsConversionMetrics: false,
      cteName: 'today_ca',
    });
    if (needsConversionMetrics) {
      pushRawCaVa(cteParts, params, {
        alias: 'conv',
        table: 'conversions',
        tenantId,
        utcStart: todaySpan.start,
        utcEnd: todaySpan.end,
        pred: predConv,
        needsUniqueClicksAgg: false,
        needsConversionMetrics: true,
        cteName: 'today_va',
      });
    }
  }

  if (needsFullRaw) {
    pushRawCaVa(cteParts, params, {
      alias: 'c',
      table: 'clicks',
      tenantId,
      utcStart: fullSpan.start,
      utcEnd: fullSpan.end,
      pred: predC,
      needsUniqueClicksAgg,
      needsConversionMetrics: false,
      cteName: 'raw_ca',
      allDates,
    });
    if (needsConversionMetrics) {
      pushRawCaVa(cteParts, params, {
        alias: 'conv',
        table: 'conversions',
        tenantId,
        utcStart: fullSpan.start,
        utcEnd: fullSpan.end,
        pred: predConv,
        needsUniqueClicksAgg: false,
        needsConversionMetrics: true,
        cteName: 'raw_va',
        allDates,
      });
    }
  } else if (split.scanToday && split.useRollup) {
    const todaySpan = istYmdSpanToMysqlUtcRange(split.todayIST, split.todayIST);
    pushRawCaVa(cteParts, params, {
      alias: 'c',
      table: 'clicks',
      tenantId,
      utcStart: todaySpan.start,
      utcEnd: todaySpan.end,
      pred: predC,
      needsUniqueClicksAgg,
      needsConversionMetrics: false,
      cteName: 'today_ca',
    });
    if (needsConversionMetrics) {
      pushRawCaVa(cteParts, params, {
        alias: 'conv',
        table: 'conversions',
        tenantId,
        utcStart: todaySpan.start,
        utcEnd: todaySpan.end,
        pred: predConv,
        needsUniqueClicksAgg: false,
        needsConversionMetrics: true,
        cteName: 'today_va',
      });
    }
  }

  // Merge partial CTEs into ca / va
  const caSources = [];
  const vaSources = [];
  if (split.useRollup) {
    caSources.push('rollup_ca');
    if (needsConversionMetrics) vaSources.push('rollup_va');
  }
  if (split.scanToday && split.useRollup) {
    caSources.push('today_ca');
    if (needsConversionMetrics) vaSources.push('today_va');
  }
  if (needsFullRaw) {
    caSources.push('raw_ca');
    if (needsConversionMetrics) vaSources.push('raw_va');
  }
  if (needsTodayRawOnly) {
    caSources.push('today_ca');
    if (needsConversionMetrics) vaSources.push('today_va');
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
    base AS (
      SELECT offer_id, publisher_id, date_group FROM ca
      ${needsConversionMetrics ? `
      UNION DISTINCT
      SELECT offer_id, publisher_id, date_group FROM va` : ''}
    )
  `);

  const selectParts = [
    'base.date_group as date_group',
    'COALESCE(o.public_offer_id, CAST(base.offer_id AS CHAR)) as offer_id',
    "COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', base.offer_id)) as offer_name",
    'base.publisher_id as publisher_id',
    `COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', base.publisher_id)) as publisher_name`,
    `COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', base.publisher_id, '@unknown')) as publisher_email`,
    'COALESCE(a.public_advertiser_id, CAST(o.advertiser_id AS CHAR)) as advertiser_id',
    `COALESCE(NULLIF(TRIM(a.name), ''), CONCAT('Advertiser #', o.advertiser_id)) as advertiser_name`,
  ];

  if (wantsMetric('clicks') || includeAllMetrics) selectParts.push('COALESCE(ca.clicks, 0) as clicks');
  if (wantsMetric('unique_clicks')) selectParts.push('COALESCE(ca.unique_clicks, 0) as unique_clicks');
  if (wantsMetric('impressions')) selectParts.push('0 as impressions');

  if (needsConversionMetrics) {
    if (wantsMetric('conversions') || includeAllMetrics) selectParts.push('COALESCE(va.conversions, 0) as conversions');
    if (wantsMetric('approved_conversions') || includeAllMetrics) selectParts.push('COALESCE(va.approved_conversions, 0) as approved_conversions');
    if (wantsMetric('pending_conversions') || includeAllMetrics) selectParts.push('COALESCE(va.pending_conversions, 0) as pending_conversions');
    if (wantsMetric('rejected_conversions') || includeAllMetrics) selectParts.push('COALESCE(va.rejected_conversions, 0) as rejected_conversions');
    if (wantsMetric('revenue') || includeAllMetrics) selectParts.push('COALESCE(va.revenue, 0) as revenue');
    if (wantsMetric('payout') || includeAllMetrics) selectParts.push('COALESCE(va.payout, 0) as payout');
    if (wantsMetric('profit') || includeAllMetrics) selectParts.push('COALESCE(va.profit, 0) as profit');
    if (wantsMetric('pending_payout') || includeAllMetrics) selectParts.push('COALESCE(va.pending_payout, 0) as pending_payout');
    if (wantsMetric('approved_payout') || includeAllMetrics) selectParts.push('COALESCE(va.approved_payout, 0) as approved_payout');
  }

  const cteHeader = `WITH ${cteParts.join(',\n')}`;

  const joinBlock = `
    FROM page
    INNER JOIN base
      ON base.offer_id = page.offer_id
      AND base.publisher_id = page.publisher_id
      AND base.date_group = page.date_group
    LEFT JOIN offers o ON o.id = base.offer_id
    LEFT JOIN publishers p ON p.id = base.publisher_id
    LEFT JOIN advertisers a ON a.id = o.advertiser_id
    LEFT JOIN ca
      ON ca.offer_id = base.offer_id AND ca.publisher_id = base.publisher_id AND ca.date_group = base.date_group
    ${needsConversionMetrics ? `
    LEFT JOIN va
      ON va.offer_id = base.offer_id AND va.publisher_id = base.publisher_id AND va.date_group = base.date_group` : ''}
  `;

  const orderBy = `
    ORDER BY base.date_group DESC, COALESCE(ca.clicks, 0) DESC, base.offer_id ASC, base.publisher_id ASC
  `;

  const exportMode = filters.export === 'csv' || filters.export === 'true';

  if (exportMode) {
    const exportQuery = `
      ${cteHeader}
      SELECT ${selectParts.join(',\n        ')}
      FROM base
      LEFT JOIN offers o ON o.id = base.offer_id
      LEFT JOIN publishers p ON p.id = base.publisher_id
      LEFT JOIN advertisers a ON a.id = o.advertiser_id
      LEFT JOIN ca
        ON ca.offer_id = base.offer_id AND ca.publisher_id = base.publisher_id AND ca.date_group = base.date_group
      ${needsConversionMetrics ? `
      LEFT JOIN va
        ON va.offer_id = base.offer_id AND va.publisher_id = base.publisher_id AND va.date_group = base.date_group` : ''}
      ${orderBy}
    `;
    const [exportRows] = await pool.query(exportQuery, params);
    return { data: exportRows, isExport: true };
  }

  const countQuery = `${cteHeader} SELECT COUNT(*) AS total FROM base`;
  const pageQuery = `
    ${cteHeader},
    page AS (
      SELECT base.offer_id, base.publisher_id, base.date_group
      FROM base
      LEFT JOIN ca
        ON ca.offer_id = base.offer_id AND ca.publisher_id = base.publisher_id AND ca.date_group = base.date_group
      ${orderBy}
      LIMIT ? OFFSET ?
    )
    SELECT ${selectParts.join(',\n      ')}
    ${joinBlock}
    ${orderBy}
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
  };
}
