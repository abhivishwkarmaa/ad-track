import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class ReportService {
  async getSummary(filters = {}, tenantId = null) {
    // FINANCIAL SEPARATION RULES:
    // 1. Revenue = SUM(amount)  — ALL conversions regardless of status
    // 2. Payout  = SUM(payout)  — ONLY approved conversions
    // 3. Profit  = Revenue - Payout
    //
    // ✅ PERFORMANCE: Independent scalar subqueries — no JOIN fanout, no temp tables.
    // Each subquery hits (tenant_id, created_at) composite index directly.
    try {
      // ── Build WHERE fragments (no table alias — scalar subqueries use bare column names) ──
      const clickParams = [];
      const convParams = [];
      let clickWhere = '1=1';
      let convWhere = '1=1';

      if (tenantId) {
        clickWhere += ' AND tenant_id = ?'; clickParams.push(tenantId);
        convWhere += ' AND tenant_id = ?'; convParams.push(tenantId);
      }

      // Default: today only (IST) — prevents open-ended scan
      const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
      const fromDate = filters.date_from || todayIST;
      const toDate = filters.date_to || todayIST;
      const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      clickWhere += ' AND created_at BETWEEN ? AND ?'; clickParams.push(utcStart, utcEnd);
      convWhere += ' AND created_at BETWEEN ? AND ?'; convParams.push(utcStart, utcEnd);

      // NOTE: No referrer guard — getSummary counts ALL clicks

      // Optional dimension filters
      if (filters.offer_id) { clickWhere += ' AND offer_id = ?'; clickParams.push(filters.offer_id); convWhere += ' AND offer_id = ?'; convParams.push(filters.offer_id); }
      if (filters.publisher_id) { clickWhere += ' AND publisher_id = ?'; clickParams.push(filters.publisher_id); convWhere += ' AND publisher_id = ?'; convParams.push(filters.publisher_id); }
      if (filters.ip) { clickWhere += ' AND ip = ?'; clickParams.push(filters.ip); }
      if (filters.sourceIp) { clickWhere += ' AND ip = ?'; clickParams.push(filters.sourceIp); }
      if (filters.country) { clickWhere += ' AND country = ?'; clickParams.push(filters.country); }
      if (filters.xff) { clickWhere += ' AND x_forwarded_for LIKE ?'; clickParams.push(`%${filters.xff}%`); }
      if (filters.authorizationToken) { clickWhere += ' AND authorization_token = ?'; clickParams.push(filters.authorizationToken); }
      if (filters.noReferrer === 'true' || filters.noReferrer === true) {
        clickWhere += " AND (referrer IS NULL OR referrer = '')";
        convWhere += " AND (referrer IS NULL OR referrer = '')";
      } else {
        if (filters.hasReferrer === 'true' || filters.hasReferrer === true) {
          clickWhere += " AND referrer IS NOT NULL AND LENGTH(TRIM(referrer)) > 0";
          convWhere += " AND referrer IS NOT NULL AND LENGTH(TRIM(referrer)) > 0";
        }
        if (filters.referrer) {
          clickWhere += " AND referrer LIKE ?";
          clickParams.push(`%${filters.referrer}%`);
          convWhere += " AND referrer LIKE ?";
          convParams.push(`%${filters.referrer}%`);
        }
      }
      const sql = `
        SELECT
          (SELECT COUNT(DISTINCT publisher_id) FROM clicks      WHERE ${clickWhere}) AS affiliates,
          (SELECT COUNT(*)                     FROM clicks      WHERE ${clickWhere}) AS unique_clicks,
          (SELECT COUNT(*)                     FROM conversions WHERE ${convWhere})  AS conversions,
          (SELECT COALESCE(SUM(amount), 0)     FROM conversions WHERE ${convWhere})  AS revenue,
          (SELECT COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) FROM conversions WHERE ${convWhere}) AS payout,
          (SELECT COALESCE(SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) FROM conversions WHERE ${convWhere}) AS profit,
          0 AS impressions
      `;

      // Params: affiliates(c), unique_clicks(c), conversions(cv), revenue(cv), payout(cv), profit(cv)
      const allParams = [...clickParams, ...clickParams, ...convParams, ...convParams, ...convParams, ...convParams];
      const [rows] = await pool.query(sql, allParams);

      const summary = rows[0] || { affiliates: 0, unique_clicks: 0, impressions: 0, conversions: 0, revenue: 0, payout: 0, profit: 0 };
      const conversionRate = summary.unique_clicks > 0
        ? (summary.conversions / summary.unique_clicks) * 100
        : 0;

      return { ...summary, conversion_rate: parseFloat(conversionRate.toFixed(2)) };
    } catch (error) {
      logger.error('ReportService.getSummary error:', error);
      throw error;
    }
  }

  async getDetailed(filters = {}, tenantId = null) {
    try {
      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 50);
      const offset = (page - 1) * limit;

      // FINANCIAL SEPARATION RULES:
      // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status (even rejected).
      // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
      // 3. Profit = Revenue - Payout.

      // Check if this is an aggregated report request
      const groupBy = filters.groupBy ? (Array.isArray(filters.groupBy) ? filters.groupBy : filters.groupBy.split(',')) : [];
      const columns = filters.columns ? (Array.isArray(filters.columns) ? filters.columns : filters.columns.split(',')) : [];
      const metricColumns = filters.metrics ? (Array.isArray(filters.metrics) ? filters.metrics : filters.metrics.split(',')) : [];

      // Dimension Mapping
      const dimMap = {
        'offer_id': 'o.public_offer_id as offer_id, o.name as offer_name',
        'publisher_id': `c.publisher_id as publisher_id,
          COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_name,
          COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', c.publisher_id, '@unknown')) as publisher_email`,
        'advertiser_id': 'o.advertiser_id',
        'ip': 'c.ip',
        'country': 'c.country',
        'isp': 'c.isp',
        'city': 'c.city',
        'region': 'c.region',
        'tid': 'c.tid',
        'date': "DATE(DATE_ADD(c.created_at, INTERVAL 330 MINUTE))",
        'hour': "HOUR(DATE_ADD(c.created_at, INTERVAL 330 MINUTE))",
        'user_agent': 'c.user_agent',
        'device_type': 'c.device_type',
        'os': 'c.os',
        'browser': 'c.browser',
        'domain': 'c.domain',
        'click_uuid': 'c.click_uuid',
        'rcid': 'c.rcid',
        'referer': 'c.referrer as referer',
        'x_forwarded_for': 'c.x_forwarded_for as x_forwarded_for',
        'authorization_token': 'c.authorization_token as authorization_token'
      };

      // Safe column selector
      const getDimCol = (key) => {
        return dimMap[key] || 'NULL';
      };

      if (groupBy.length > 0) {
        const selectedMetrics = new Set((metricColumns.length > 0 ? metricColumns : columns).map(m => String(m).trim()).filter(Boolean));
        const includeAllMetrics = selectedMetrics.size === 0;
        const wantsMetric = (name) => includeAllMetrics || selectedMetrics.has(name);

        // Fast path: publisher-only aggregation (most common slow case: month + groupBy=publisher_id)
        // Uses pre-aggregated subqueries and avoids click_uuid joins across large ranges.
        const simpleKeys = new Set(['page', 'limit', 'date_from', 'date_to', 'groupBy', 'metrics', 'columns', 'export', 'all_dates']);
        const hasComplexFilters = Object.keys(filters).some((k) => !simpleKeys.has(k) && filters[k] !== undefined && filters[k] !== null && filters[k] !== '');
        if (groupBy.length === 1 && groupBy[0] === 'publisher_id' && !hasComplexFilters) {
          const allDates = filters.all_dates === true || filters.all_dates === 'true';
          const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
          const fromDate = filters.date_from || todayIST;
          const toDate = filters.date_to || todayIST;
          const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
          const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

          const clickWhere = [`c.tenant_id = ?`];
          const clickParams = [tenantId];
          if (!allDates) {
            clickWhere.push('c.created_at BETWEEN ? AND ?');
            clickParams.push(utcStart, utcEnd);
          }

          const convWhere = [`conv.tenant_id = ?`];
          const convParams = [tenantId];
          if (!allDates) {
            convWhere.push('conv.created_at BETWEEN ? AND ?');
            convParams.push(utcStart, utcEnd);
          }

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

          const selectParts = [
            'base.publisher_id as publisher_id',
            `COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', base.publisher_id)) as publisher_name`,
            `COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', base.publisher_id, '@unknown')) as publisher_email`
          ];

          if (wantsMetric('clicks')) selectParts.push('COALESCE(ca.clicks, 0) as clicks');
          if (wantsMetric('unique_clicks')) selectParts.push('COALESCE(ca.unique_clicks, 0) as unique_clicks');
          if (wantsMetric('impressions')) selectParts.push('0 as impressions');
          if (wantsMetric('conversions')) selectParts.push('COALESCE(va.conversions, 0) as conversions');
          if (wantsMetric('approved_conversions')) selectParts.push('COALESCE(va.approved_conversions, 0) as approved_conversions');
          if (wantsMetric('pending_conversions')) selectParts.push('COALESCE(va.pending_conversions, 0) as pending_conversions');
          if (wantsMetric('rejected_conversions')) selectParts.push('COALESCE(va.rejected_conversions, 0) as rejected_conversions');
          if (wantsMetric('revenue')) selectParts.push('COALESCE(va.revenue, 0) as revenue');
          if (wantsMetric('payout')) selectParts.push('COALESCE(va.payout, 0) as payout');
          if (wantsMetric('profit')) selectParts.push('COALESCE(va.profit, 0) as profit');
          if (wantsMetric('pending_payout')) selectParts.push('COALESCE(va.pending_payout, 0) as pending_payout');
          if (wantsMetric('approved_payout')) selectParts.push('COALESCE(va.approved_payout, 0) as approved_payout');
          if (selectParts.length === 3) selectParts.push('COALESCE(ca.clicks, 0) as clicks');

          const countQuery = `SELECT COUNT(DISTINCT c.publisher_id) as total FROM clicks c WHERE ${clickWhere.join(' AND ')}`;

          // Export keeps full dataset behavior, but query is still pre-aggregated and avoids click_uuid joins.
          if (filters.export === 'csv' || filters.export === 'true') {
            let exportQuery = `
              SELECT
                c.publisher_id as publisher_id,
                COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_name,
                COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', c.publisher_id, '@unknown')) as publisher_email,
                COUNT(*) as clicks,
                COUNT(DISTINCT c.ip) as unique_clicks
                ${needsConversionMetrics ? `,
                COALESCE(va.conversions, 0) as conversions,
                COALESCE(va.approved_conversions, 0) as approved_conversions,
                COALESCE(va.pending_conversions, 0) as pending_conversions,
                COALESCE(va.rejected_conversions, 0) as rejected_conversions,
                COALESCE(va.revenue, 0) as revenue,
                COALESCE(va.payout, 0) as payout,
                COALESCE(va.profit, 0) as profit,
                COALESCE(va.pending_payout, 0) as pending_payout,
                COALESCE(va.approved_payout, 0) as approved_payout` : ''}
              FROM clicks c
              LEFT JOIN publishers p ON p.id = c.publisher_id
              ${needsConversionMetrics ? `
                LEFT JOIN (
                  SELECT
                    conv.publisher_id,
                    COUNT(*) as conversions,
                    SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                    SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                    SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                    COALESCE(SUM(conv.amount), 0) as revenue,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                    COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                    COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
                  FROM conversions conv
                  WHERE ${convWhere.join(' AND ')}
                  GROUP BY conv.publisher_id
                ) va ON va.publisher_id = c.publisher_id` : ''}
              WHERE ${clickWhere.join(' AND ')}
              GROUP BY c.publisher_id, p.company_name, p.email
              ORDER BY clicks DESC, c.publisher_id ASC
              LIMIT 100000
            `;
            const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
            const [exportRows] = await pool.query(exportQuery, exportParams);
            return { data: exportRows, isExport: true };
          }

          // Paged strategy: get top publishers first, then fetch conversion aggregates only for those publishers.
          const topPublishersQuery = `
            SELECT c.publisher_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
            FROM clicks c
            WHERE ${clickWhere.join(' AND ')}
            GROUP BY c.publisher_id
            ORDER BY clicks DESC, c.publisher_id ASC
            LIMIT ? OFFSET ?
          `;
          const [countResult, publisherResult] = await Promise.all([
            pool.query(countQuery, clickParams),
            pool.query(topPublishersQuery, [...clickParams, limit, offset])
          ]);
          const countRows = countResult[0];
          const publisherRows = publisherResult[0];
          const total = countRows[0]?.total || 0;
          const publisherIds = publisherRows.map(r => r.publisher_id).filter(Boolean);

          if (publisherIds.length === 0) {
            return {
              data: [],
              pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
              isAggregated: true
            };
          }

          const publisherMetaPromise = pool.query(
            `SELECT p.id as publisher_id,
                    COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', p.id)) as publisher_name,
                    COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', p.id, '@unknown')) as publisher_email
             FROM publishers p
             WHERE p.id IN (?)`,
            [publisherIds]
          );

          const conversionPromise = needsConversionMetrics
            ? pool.query(
              `
              SELECT
                conv.publisher_id,
                COUNT(*) as conversions,
                SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                COALESCE(SUM(conv.amount), 0) as revenue,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
              FROM conversions conv
              WHERE ${convWhere.join(' AND ')} AND conv.publisher_id IN (?)
              GROUP BY conv.publisher_id
            `,
              [...convParams, publisherIds]
            )
            : Promise.resolve([[]]);

          const [publisherMetaResult, conversionResult] = await Promise.all([publisherMetaPromise, conversionPromise]);
          const publisherMetaRows = publisherMetaResult[0];
          const publisherMetaMap = new Map(publisherMetaRows.map(r => [r.publisher_id, r]));

          let conversionMap = new Map();
          if (needsConversionMetrics) {
            const conversionRows = conversionResult[0];
            conversionMap = new Map(conversionRows.map(r => [r.publisher_id, r]));
          }

          const rows = publisherRows.map((row) => {
            const pubMeta = publisherMetaMap.get(row.publisher_id) || {
              publisher_id: row.publisher_id,
              publisher_name: `Publisher #${row.publisher_id}`,
              publisher_email: `publisher-${row.publisher_id}@unknown`
            };
            const conv = conversionMap.get(row.publisher_id) || {};

            const resultRow = {
              publisher_id: row.publisher_id,
              publisher_name: pubMeta.publisher_name,
              publisher_email: pubMeta.publisher_email
            };

            if (wantsMetric('clicks') || includeAllMetrics) resultRow.clicks = Number(row.clicks || 0);
            if (wantsMetric('unique_clicks') || includeAllMetrics) resultRow.unique_clicks = Number(row.unique_clicks || 0);
            if (wantsMetric('impressions')) resultRow.impressions = 0;
            if (needsConversionMetrics) {
              if (wantsMetric('conversions') || includeAllMetrics) resultRow.conversions = Number(conv.conversions || 0);
              if (wantsMetric('approved_conversions') || includeAllMetrics) resultRow.approved_conversions = Number(conv.approved_conversions || 0);
              if (wantsMetric('pending_conversions') || includeAllMetrics) resultRow.pending_conversions = Number(conv.pending_conversions || 0);
              if (wantsMetric('rejected_conversions') || includeAllMetrics) resultRow.rejected_conversions = Number(conv.rejected_conversions || 0);
              if (wantsMetric('revenue') || includeAllMetrics) resultRow.revenue = Number(conv.revenue || 0);
              if (wantsMetric('payout') || includeAllMetrics) resultRow.payout = Number(conv.payout || 0);
              if (wantsMetric('profit') || includeAllMetrics) resultRow.profit = Number(conv.profit || 0);
              if (wantsMetric('pending_payout') || includeAllMetrics) resultRow.pending_payout = Number(conv.pending_payout || 0);
              if (wantsMetric('approved_payout') || includeAllMetrics) resultRow.approved_payout = Number(conv.approved_payout || 0);
            }

            return resultRow;
          });

          return {
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            isAggregated: true
          };
        }

        // Fast path: offer-only aggregation (month + groupBy=offer_id can also be heavy).
        // Uses paged click aggregation + conversion aggregation for page offer IDs only.
        if (groupBy.length === 1 && groupBy[0] === 'offer_id' && !hasComplexFilters) {
          const allDates = filters.all_dates === true || filters.all_dates === 'true';
          const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
          const fromDate = filters.date_from || todayIST;
          const toDate = filters.date_to || todayIST;
          const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
          const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

          const clickWhere = [`c.tenant_id = ?`];
          const clickParams = [tenantId];
          if (!allDates) {
            clickWhere.push('c.created_at BETWEEN ? AND ?');
            clickParams.push(utcStart, utcEnd);
          }

          const convWhere = [`conv.tenant_id = ?`];
          const convParams = [tenantId];
          if (!allDates) {
            convWhere.push('conv.created_at BETWEEN ? AND ?');
            convParams.push(utcStart, utcEnd);
          }

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

          const countQuery = `SELECT COUNT(DISTINCT c.offer_id) as total FROM clicks c WHERE ${clickWhere.join(' AND ')}`;

          if (filters.export === 'csv' || filters.export === 'true') {
            let exportQuery = `
              SELECT
                COALESCE(o.public_offer_id, CAST(c.offer_id AS CHAR)) as offer_id,
                COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', c.offer_id)) as offer_name,
                COUNT(*) as clicks,
                COUNT(DISTINCT c.ip) as unique_clicks
                ${needsConversionMetrics ? `,
                COALESCE(va.conversions, 0) as conversions,
                COALESCE(va.approved_conversions, 0) as approved_conversions,
                COALESCE(va.pending_conversions, 0) as pending_conversions,
                COALESCE(va.rejected_conversions, 0) as rejected_conversions,
                COALESCE(va.revenue, 0) as revenue,
                COALESCE(va.payout, 0) as payout,
                COALESCE(va.profit, 0) as profit,
                COALESCE(va.pending_payout, 0) as pending_payout,
                COALESCE(va.approved_payout, 0) as approved_payout` : ''}
              FROM clicks c
              LEFT JOIN offers o ON o.id = c.offer_id
              ${needsConversionMetrics ? `
                LEFT JOIN (
                  SELECT
                    conv.offer_id,
                    COUNT(*) as conversions,
                    SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                    SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                    SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                    COALESCE(SUM(conv.amount), 0) as revenue,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                    COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                    COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
                  FROM conversions conv
                  WHERE ${convWhere.join(' AND ')}
                  GROUP BY conv.offer_id
                ) va ON va.offer_id = c.offer_id` : ''}
              WHERE ${clickWhere.join(' AND ')}
              GROUP BY c.offer_id, o.public_offer_id, o.name
              ORDER BY clicks DESC, c.offer_id ASC
              LIMIT 100000
            `;
            const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
            const [exportRows] = await pool.query(exportQuery, exportParams);
            return { data: exportRows, isExport: true };
          }

          const topOffersQuery = `
            SELECT c.offer_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
            FROM clicks c
            WHERE ${clickWhere.join(' AND ')}
            GROUP BY c.offer_id
            ORDER BY clicks DESC, c.offer_id ASC
            LIMIT ? OFFSET ?
          `;
          const [countResult, offerResult] = await Promise.all([
            pool.query(countQuery, clickParams),
            pool.query(topOffersQuery, [...clickParams, limit, offset])
          ]);
          const countRows = countResult[0];
          const offerRows = offerResult[0];
          const total = countRows[0]?.total || 0;
          const offerIds = offerRows.map(r => r.offer_id).filter(Boolean);

          if (offerIds.length === 0) {
            return {
              data: [],
              pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
              isAggregated: true
            };
          }

          const offerMetaPromise = pool.query(
            `SELECT o.id as offer_internal_id,
                    COALESCE(o.public_offer_id, CAST(o.id AS CHAR)) as offer_id,
                    COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', o.id)) as offer_name
             FROM offers o
             WHERE o.id IN (?)`,
            [offerIds]
          );
          const conversionPromise = needsConversionMetrics
            ? pool.query(
              `
              SELECT
                conv.offer_id,
                COUNT(*) as conversions,
                SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                COALESCE(SUM(conv.amount), 0) as revenue,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
              FROM conversions conv
              WHERE ${convWhere.join(' AND ')} AND conv.offer_id IN (?)
              GROUP BY conv.offer_id
            `,
              [...convParams, offerIds]
            )
            : Promise.resolve([[]]);

          const [offerMetaResult, conversionResult] = await Promise.all([offerMetaPromise, conversionPromise]);
          const offerMetaRows = offerMetaResult[0];
          const offerMetaMap = new Map(offerMetaRows.map(r => [r.offer_internal_id, r]));

          let conversionMap = new Map();
          if (needsConversionMetrics) {
            const conversionRows = conversionResult[0];
            conversionMap = new Map(conversionRows.map(r => [r.offer_id, r]));
          }

          const rows = offerRows.map((row) => {
            const offerMeta = offerMetaMap.get(row.offer_id) || {
              offer_internal_id: row.offer_id,
              offer_id: String(row.offer_id),
              offer_name: `Offer #${row.offer_id}`
            };
            const conv = conversionMap.get(row.offer_id) || {};

            const resultRow = {
              offer_id: offerMeta.offer_id,
              offer_name: offerMeta.offer_name
            };

            if (wantsMetric('clicks') || includeAllMetrics) resultRow.clicks = Number(row.clicks || 0);
            if (wantsMetric('unique_clicks') || includeAllMetrics) resultRow.unique_clicks = Number(row.unique_clicks || 0);
            if (wantsMetric('impressions')) resultRow.impressions = 0;
            if (needsConversionMetrics) {
              if (wantsMetric('conversions') || includeAllMetrics) resultRow.conversions = Number(conv.conversions || 0);
              if (wantsMetric('approved_conversions') || includeAllMetrics) resultRow.approved_conversions = Number(conv.approved_conversions || 0);
              if (wantsMetric('pending_conversions') || includeAllMetrics) resultRow.pending_conversions = Number(conv.pending_conversions || 0);
              if (wantsMetric('rejected_conversions') || includeAllMetrics) resultRow.rejected_conversions = Number(conv.rejected_conversions || 0);
              if (wantsMetric('revenue') || includeAllMetrics) resultRow.revenue = Number(conv.revenue || 0);
              if (wantsMetric('payout') || includeAllMetrics) resultRow.payout = Number(conv.payout || 0);
              if (wantsMetric('profit') || includeAllMetrics) resultRow.profit = Number(conv.profit || 0);
              if (wantsMetric('pending_payout') || includeAllMetrics) resultRow.pending_payout = Number(conv.pending_payout || 0);
              if (wantsMetric('approved_payout') || includeAllMetrics) resultRow.approved_payout = Number(conv.approved_payout || 0);
            }

            return resultRow;
          });

          return {
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            isAggregated: true
          };
        }

        // Fast path: publisher+offer aggregation (common heavy case with month range).
        // Strategy: page top click groups first, then aggregate conversions only for those page pairs.
        if (
          groupBy.length === 2 &&
          groupBy.includes('publisher_id') &&
          groupBy.includes('offer_id') &&
          !hasComplexFilters
        ) {
          const allDates = filters.all_dates === true || filters.all_dates === 'true';
          const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
          const fromDate = filters.date_from || todayIST;
          const toDate = filters.date_to || todayIST;
          const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
          const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

          const clickWhere = [`c.tenant_id = ?`];
          const clickParams = [tenantId];
          if (!allDates) {
            clickWhere.push('c.created_at BETWEEN ? AND ?');
            clickParams.push(utcStart, utcEnd);
          }

          const convWhere = [`conv.tenant_id = ?`];
          const convParams = [tenantId];
          if (!allDates) {
            convWhere.push('conv.created_at BETWEEN ? AND ?');
            convParams.push(utcStart, utcEnd);
          }

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

          const countQuery = `
            SELECT COUNT(*) as total
            FROM (
              SELECT 1
              FROM clicks c
              WHERE ${clickWhere.join(' AND ')}
              GROUP BY c.publisher_id, c.offer_id
            ) grouped_pairs
          `;
          if (filters.export === 'csv' || filters.export === 'true') {
            let exportQuery = `
              SELECT
                c.publisher_id as publisher_id,
                COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_name,
                COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', c.publisher_id, '@unknown')) as publisher_email,
                COALESCE(o.public_offer_id, CAST(c.offer_id AS CHAR)) as offer_id,
                COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', c.offer_id)) as offer_name,
                COUNT(*) as clicks,
                COUNT(DISTINCT c.ip) as unique_clicks
                ${needsConversionMetrics ? `,
                COALESCE(va.conversions, 0) as conversions,
                COALESCE(va.approved_conversions, 0) as approved_conversions,
                COALESCE(va.pending_conversions, 0) as pending_conversions,
                COALESCE(va.rejected_conversions, 0) as rejected_conversions,
                COALESCE(va.revenue, 0) as revenue,
                COALESCE(va.payout, 0) as payout,
                COALESCE(va.profit, 0) as profit,
                COALESCE(va.pending_payout, 0) as pending_payout,
                COALESCE(va.approved_payout, 0) as approved_payout` : ''}
              FROM clicks c
              LEFT JOIN publishers p ON p.id = c.publisher_id
              LEFT JOIN offers o ON o.id = c.offer_id
              ${needsConversionMetrics ? `
                LEFT JOIN (
                  SELECT
                    conv.publisher_id,
                    conv.offer_id,
                    COUNT(*) as conversions,
                    SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                    SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                    SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                    COALESCE(SUM(conv.amount), 0) as revenue,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                    COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                    COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                    COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
                  FROM conversions conv
                  WHERE ${convWhere.join(' AND ')}
                  GROUP BY conv.publisher_id, conv.offer_id
                ) va ON va.publisher_id = c.publisher_id AND va.offer_id = c.offer_id` : ''}
              WHERE ${clickWhere.join(' AND ')}
              GROUP BY c.publisher_id, c.offer_id, p.company_name, p.email, o.public_offer_id, o.name
              ORDER BY clicks DESC, c.publisher_id ASC, c.offer_id ASC
              LIMIT 100000
            `;
            const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
            const [exportRows] = await pool.query(exportQuery, exportParams);
            return { data: exportRows, isExport: true };
          }

          const topPairsQuery = `
            SELECT c.publisher_id, c.offer_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
            FROM clicks c
            WHERE ${clickWhere.join(' AND ')}
            GROUP BY c.publisher_id, c.offer_id
            ORDER BY clicks DESC, c.publisher_id ASC, c.offer_id ASC
            LIMIT ? OFFSET ?
          `;
          const [countResult, pairResult] = await Promise.all([
            pool.query(countQuery, clickParams),
            pool.query(topPairsQuery, [...clickParams, limit, offset])
          ]);
          const countRows = countResult[0];
          const pairRows = pairResult[0];
          const total = countRows[0]?.total || 0;
          if (pairRows.length === 0) {
            return {
              data: [],
              pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
              isAggregated: true
            };
          }

          const publisherIds = [...new Set(pairRows.map(r => r.publisher_id).filter(Boolean))];
          const offerIds = [...new Set(pairRows.map(r => r.offer_id).filter(Boolean))];

          const publisherMetaPromise = pool.query(
            `SELECT p.id as publisher_id,
                    COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', p.id)) as publisher_name,
                    COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', p.id, '@unknown')) as publisher_email
             FROM publishers p
             WHERE p.id IN (?)`,
            [publisherIds]
          );
          const offerMetaPromise = pool.query(
            `SELECT o.id as offer_internal_id,
                    COALESCE(o.public_offer_id, CAST(o.id AS CHAR)) as offer_id,
                    COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', o.id)) as offer_name
             FROM offers o
             WHERE o.id IN (?)`,
            [offerIds]
          );

          let conversionPromise = Promise.resolve([[]]);
          if (needsConversionMetrics) {
            const tuplePlaceholders = pairRows.map(() => '(?, ?)').join(', ');
            const tupleParams = [];
            pairRows.forEach((r) => {
              tupleParams.push(r.publisher_id, r.offer_id);
            });
            const conversionsForPageQuery = `
              SELECT
                conv.publisher_id,
                conv.offer_id,
                COUNT(*) as conversions,
                SUM(CASE WHEN conv.status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
                SUM(CASE WHEN conv.status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
                SUM(CASE WHEN conv.status IN ('rejected', 'rejected_cap', 'click_expired') THEN 1 ELSE 0 END) as rejected_conversions,
                COALESCE(SUM(conv.amount), 0) as revenue,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
                COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
              FROM conversions conv
              WHERE ${convWhere.join(' AND ')}
                AND (conv.publisher_id, conv.offer_id) IN (${tuplePlaceholders})
              GROUP BY conv.publisher_id, conv.offer_id
            `;
            conversionPromise = pool.query(conversionsForPageQuery, [...convParams, ...tupleParams]);
          }

          const [publisherMetaResult, offerMetaResult, conversionResult] = await Promise.all([
            publisherMetaPromise,
            offerMetaPromise,
            conversionPromise
          ]);
          const publisherMetaRows = publisherMetaResult[0];
          const publisherMetaMap = new Map(publisherMetaRows.map(r => [r.publisher_id, r]));

          const offerMetaRows = offerMetaResult[0];
          const offerMetaMap = new Map(offerMetaRows.map(r => [r.offer_internal_id, r]));

          let conversionMap = new Map();
          if (needsConversionMetrics) {
            const conversionRows = conversionResult[0];
            conversionMap = new Map(conversionRows.map(r => [`${r.publisher_id}:${r.offer_id}`, r]));
          }

          const rows = pairRows.map((row) => {
            const pubMeta = publisherMetaMap.get(row.publisher_id) || {
              publisher_id: row.publisher_id,
              publisher_name: `Publisher #${row.publisher_id}`,
              publisher_email: `publisher-${row.publisher_id}@unknown`
            };
            const offerMeta = offerMetaMap.get(row.offer_id) || {
              offer_internal_id: row.offer_id,
              offer_id: String(row.offer_id),
              offer_name: `Offer #${row.offer_id}`
            };
            const conv = conversionMap.get(`${row.publisher_id}:${row.offer_id}`) || {};

            const resultRow = {
              publisher_id: row.publisher_id,
              publisher_name: pubMeta.publisher_name,
              publisher_email: pubMeta.publisher_email,
              offer_id: offerMeta.offer_id,
              offer_name: offerMeta.offer_name
            };

            if (wantsMetric('clicks') || includeAllMetrics) resultRow.clicks = Number(row.clicks || 0);
            if (wantsMetric('unique_clicks') || includeAllMetrics) resultRow.unique_clicks = Number(row.unique_clicks || 0);
            if (wantsMetric('impressions')) resultRow.impressions = 0;
            if (needsConversionMetrics) {
              if (wantsMetric('conversions') || includeAllMetrics) resultRow.conversions = Number(conv.conversions || 0);
              if (wantsMetric('approved_conversions') || includeAllMetrics) resultRow.approved_conversions = Number(conv.approved_conversions || 0);
              if (wantsMetric('pending_conversions') || includeAllMetrics) resultRow.pending_conversions = Number(conv.pending_conversions || 0);
              if (wantsMetric('rejected_conversions') || includeAllMetrics) resultRow.rejected_conversions = Number(conv.rejected_conversions || 0);
              if (wantsMetric('revenue') || includeAllMetrics) resultRow.revenue = Number(conv.revenue || 0);
              if (wantsMetric('payout') || includeAllMetrics) resultRow.payout = Number(conv.payout || 0);
              if (wantsMetric('profit') || includeAllMetrics) resultRow.profit = Number(conv.profit || 0);
              if (wantsMetric('pending_payout') || includeAllMetrics) resultRow.pending_payout = Number(conv.pending_payout || 0);
              if (wantsMetric('approved_payout') || includeAllMetrics) resultRow.approved_payout = Number(conv.approved_payout || 0);
            }

            return resultRow;
          });

          return {
            data: rows,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            isAggregated: true
          };
        }

        // --- AGGREGATED REPORT MODE ---
        let selects = [];
        let groups = [];

        groupBy.forEach(dim => {
          if (dimMap[dim]) {
            selects.push(`${dim === 'date' ? dimMap[dim] + ' as date_group' : (dim === 'hour' ? dimMap[dim] + ' as hour_group' : getDimCol(dim))}`);

            // Group By Clause
            if (dim === 'date') groups.push(dimMap['date']);
            else if (dim === 'hour') groups.push(dimMap['hour']);
            else if (dim === 'offer_id') { groups.push('o.public_offer_id'); groups.push('o.name'); }
            else if (dim === 'publisher_id') { groups.push('c.publisher_id'); groups.push('p.company_name'); groups.push('p.email'); }
            else if (dim === 'advertiser_id') groups.push('o.advertiser_id');
            else if (dim === 'isp' || dim === 'city' || dim === 'region') { } // Cannot group by NULL literals easily or pointless
            else groups.push(dimMap[dim].split(' as ')[0]);
          }
        });

        // Metrics (compute only requested ones; avoid expensive DISTINCT unless required)
        const needsConversionJoinForMetrics =
          wantsMetric('conversions') ||
          wantsMetric('approved_conversions') ||
          wantsMetric('pending_conversions') ||
          wantsMetric('rejected_conversions') ||
          wantsMetric('revenue') ||
          wantsMetric('payout') ||
          wantsMetric('profit') ||
          wantsMetric('pending_payout') ||
          wantsMetric('approved_payout');

        // Use DISTINCT click id so conversion join cannot inflate click counts.
        if (wantsMetric('clicks')) selects.push('COUNT(DISTINCT c.id) as clicks');
        if (wantsMetric('unique_clicks')) selects.push('COUNT(DISTINCT c.ip) as unique_clicks');
        if (wantsMetric('impressions')) selects.push('0 as impressions');
        if (wantsMetric('conversions')) selects.push('SUM(CASE WHEN conv.id IS NOT NULL THEN 1 ELSE 0 END) as conversions');
        if (wantsMetric('approved_conversions')) selects.push('SUM(CASE WHEN conv.status = \'approved\' THEN 1 ELSE 0 END) as approved_conversions');
        if (wantsMetric('pending_conversions')) selects.push('SUM(CASE WHEN conv.status = \'pending\' THEN 1 ELSE 0 END) as pending_conversions');
        if (wantsMetric('rejected_conversions')) selects.push('SUM(CASE WHEN conv.status IN (\'rejected\', \'rejected_cap\', \'click_expired\') THEN 1 ELSE 0 END) as rejected_conversions');
        if (wantsMetric('revenue')) selects.push('COALESCE(SUM(conv.amount), 0) as revenue');
        if (wantsMetric('payout')) selects.push('COALESCE(SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as payout');
        if (wantsMetric('profit')) selects.push('COALESCE(SUM(conv.amount), 0) - COALESCE(SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as profit');
        if (wantsMetric('pending_payout')) selects.push('COALESCE(SUM(CASE WHEN conv.status = \'pending\' THEN conv.payout ELSE 0 END), 0) as pending_payout');
        if (wantsMetric('approved_payout')) selects.push('COALESCE(SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as approved_payout');

        // Per-click time when grouping includes click_uuid (one row per click — not an hour bucket).
        if (groupBy.includes('click_uuid')) {
          selects.push('MAX(c.created_at) as click_created_at');
        }

        if (selects.length === 0) {
          selects.push('COUNT(*) as clicks');
        }

        let query = `SELECT ${selects.join(', ')} 
                     FROM clicks c
                     LEFT JOIN offers o ON c.offer_id = o.id
                     LEFT JOIN publishers p ON c.publisher_id = p.id
                     ${needsConversionJoinForMetrics || filters.status || filters.rcid || filters.search ? 'LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid AND conv.tenant_id = c.tenant_id' : ''}
                     WHERE 1=1 `;

        const filtersBuild = this.buildWhereClause(filters, tenantId);
        query += filtersBuild.clause;

        if (groups.length > 0) {
          query += ` GROUP BY ${groups.join(', ')}`;
        }

        // Deterministic order: click-level groups by latest click time; else date/hour buckets.
        const aggregatedOrderParts = [];
        if (groupBy.includes('click_uuid')) {
          aggregatedOrderParts.push('MAX(c.created_at) DESC');
        }
        if (groupBy.includes('date')) {
          aggregatedOrderParts.push('DATE(DATE_ADD(c.created_at, INTERVAL 330 MINUTE)) DESC');
        }
        if (groupBy.includes('hour')) {
          aggregatedOrderParts.push('HOUR(DATE_ADD(c.created_at, INTERVAL 330 MINUTE)) DESC');
        }
        if (aggregatedOrderParts.length > 0) {
          query += ` ORDER BY ${aggregatedOrderParts.join(', ')}`;
        } else if (groups.length > 0) {
          query += ' ORDER BY MAX(c.created_at) DESC';
        }

        // --- EXPORT LOGIC ---
        if (filters.export === 'csv' || filters.export === 'true') {
          const exportQuery = query + ` LIMIT ? OFFSET ?`;
          const [exportRows] = await pool.query(exportQuery, [...filtersBuild.params, 100000, 0]); // Limit large export
          return { data: exportRows, isExport: true, sql: exportQuery, params: [...filtersBuild.params, 100000, 0] };
        }

        // Faster count query: only count grouped keys, avoid metric SELECT and avoid conversions join unless required.
        const needsConvJoinForCount =
          Boolean(filters.status) ||
          Boolean(filters.rcid) ||
          Boolean(filters.search);

        let countBaseQuery = `
          SELECT 1
          FROM clicks c
          LEFT JOIN offers o ON c.offer_id = o.id
          LEFT JOIN publishers p ON c.publisher_id = p.id
          ${needsConvJoinForCount ? 'LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid AND conv.tenant_id = c.tenant_id' : ''}
          WHERE 1=1
          ${filtersBuild.clause}
        `;
        if (groups.length > 0) countBaseQuery += ` GROUP BY ${groups.join(', ')}`;

        const countQuery = `SELECT COUNT(*) as total FROM (${countBaseQuery}) as agg`;
        const [countRows] = await pool.query(countQuery, filtersBuild.params);
        const total = countRows[0]?.total || 0;

        query += ` LIMIT ? OFFSET ?`;
        const [rows] = await pool.query(query, [...filtersBuild.params, limit, offset]);

        return {
          data: rows,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          isAggregated: true
        };

      } else {
        // --- DETAILED LOG MODE (Existing logic but with dynamic columns support potential) ---
        // For now, keep returning full detailed rows as per existing functionality, 
        // but maybe select specific columns if requested?
        // The user's image shows "Log Type: All", which is Detailed.

        let selectClause = `
          c.id as click_id,
          c.click_uuid,
          c.offer_id as internal_offer_id,
          o.name as offer_name,
          o.public_offer_id as offer_id,
          c.publisher_id,
          p.public_publisher_id,
          p.email as publisher_email,
          COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_company,
          c.ip,
          c.x_forwarded_for,
          c.user_agent,
          c.referrer as referer,
          c.authorization_token as authorization_token,
          c.country,
          c.region,
          c.city,
          c.isp,
          c.domain,
          c.device_type,
          c.browser,
          c.os,
          c.os_version,
          c.device_brand,
          c.device_model,
          c.source_id,
          c.device_id,
          c.google_id,
          c.android_id,
          c.rcid,
          c.tid,
          c.timestamp as click_timestamp,
          c.created_at as click_created_at,
          conv.id as conversion_id,
          conv.conversion_uuid,
          conv.status as conversion_status,
          conv.amount as conversion_amount,
          conv.payout as conversion_payout,
          conv.timestamp as conversion_timestamp
        `;

        // If columns specified, we COULD filter selectClause, but UI might expect standard shape.
        // Let's stick to standard detailed view unless we want to optimize.
        // Given complexity, standard view is safer for "Detailed Reports".

        let query = `
          SELECT ${selectClause}
          FROM clicks c
          LEFT JOIN offers o ON c.offer_id = o.id
          LEFT JOIN publishers p ON c.publisher_id = p.id
          LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
          WHERE 1=1
        `;

        const countQuery = `
          SELECT COUNT(*) as total
          FROM clicks c
          LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
          LEFT JOIN offers o ON c.offer_id = o.id
          WHERE 1=1
        `;

        const filtersBuild = this.buildWhereClause(filters, tenantId);
        query += filtersBuild.clause;
        query += ' ORDER BY c.created_at DESC';

        // --- EXPORT LOGIC DETAILED ---
        if (filters.export === 'csv' || filters.export === 'true') {
          // For detailed export, we might need a much larger limit or Stream
          query += ' LIMIT 10000 OFFSET 0'; // Cap at 10k for safety or Stream
          const [exportRows] = await pool.query(query, filtersBuild.params);
          return { data: exportRows, isExport: true };
        }

        query += ' LIMIT ? OFFSET ?';

        const [countRows] = await pool.query(countQuery + filtersBuild.clause, filtersBuild.params);
        const total = parseInt(countRows[0]?.total || 0);
        const [rows] = await pool.query(query, [...filtersBuild.params, limit, offset]);

        return {
          data: rows,
          pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
          isAggregated: false
        };
      }
    } catch (error) {
      logger.error('ReportService.getDetailed error:', error);
      throw error;
    }
  }

  buildWhereClause(filters, tenantId = null) {
    let clause = '';
    const params = [];

    // ✅ CRITICAL: Tenant isolation — always first
    if (tenantId) {
      clause += ' AND c.tenant_id = ?';
      params.push(tenantId);
    }

    // ✅ Date range — index-safe BETWEEN on raw UTC created_at (no DATE() wrapping)
    // Default is today unless all_dates=true (then no date restriction)
    const allDates = filters.all_dates === true || filters.all_dates === 'true';
    const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
    const fromDate = filters.date_from || todayIST;
    const toDate = filters.date_to || todayIST;

    if (!allDates) {
      const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      clause += ' AND c.created_at BETWEEN ? AND ?';
      params.push(utcStart, utcEnd);
    }

    // ✅ HOUR filter — index-safe: compute UTC boundaries in JS, use BETWEEN on raw column
    // Old: HOUR(DATE_ADD(c.created_at, INTERVAL 330 MINUTE)) = ?  ← breaks index
    // New: c.created_at BETWEEN <utc_hour_start> AND <utc_hour_end>  ← index-safe
    if (!allDates && filters.hour !== undefined && filters.date_from) {
      const h = parseInt(filters.hour, 10);
      const utcHourStart = new Date(`${fromDate}T${String(h).padStart(2, '0')}:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcHourEnd = new Date(`${fromDate}T${String(h).padStart(2, '0')}:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      clause += ' AND c.created_at BETWEEN ? AND ?';
      params.push(utcHourStart, utcHourEnd);
    }

    // NOTE: No referrer guard here — reports show ALL clicks, including direct traffic.

    if (filters.offer_id) { clause += ' AND c.offer_id = ?'; params.push(filters.offer_id); }
    if (filters.publisher_id) { clause += ' AND c.publisher_id = ?'; params.push(filters.publisher_id); }
    if (filters.country) { clause += ' AND c.country = ?'; params.push(filters.country); }
    if (filters.ip) { clause += ' AND c.ip = ?'; params.push(filters.ip); }
    if (filters.tid) { clause += ' AND c.tid = ?'; params.push(filters.tid); }

    if (filters.rcid) {
      clause += ' AND (c.rcid = ? OR conv.rcid = ?)';
      params.push(filters.rcid, filters.rcid);
    }

    if (filters.device_brand) { clause += ' AND c.device_brand = ?'; params.push(filters.device_brand); }
    if (filters.os) { clause += ' AND c.os = ?'; params.push(filters.os); }
    if (filters.browser) { clause += ' AND c.browser = ?'; params.push(filters.browser); }

    // Referrer traffic mode filter
    if (filters.noReferrer === 'true' || filters.noReferrer === true) {
      clause += " AND (c.referrer IS NULL OR c.referrer = '')";
    } else {
      if (filters.hasReferrer === 'true' || filters.hasReferrer === true) {
        clause += " AND c.referrer IS NOT NULL AND LENGTH(TRIM(c.referrer)) > 0";
      }
      if (filters.referrer) {
        clause += ' AND c.referrer LIKE ?';
        params.push(`%${filters.referrer}%`);
      }
    }

    if (filters.source_id) { clause += ' AND c.source_id = ?'; params.push(filters.source_id); }
    if (filters.google_id) { clause += ' AND c.google_id = ?'; params.push(filters.google_id); }
    if (filters.android_id) { clause += ' AND c.android_id = ?'; params.push(filters.android_id); }
    if (filters.os_version) { clause += ' AND c.os_version = ?'; params.push(filters.os_version); }
    if (filters.device_model) { clause += ' AND c.device_model = ?'; params.push(filters.device_model); }

    if (filters.user_agent) {
      clause += ' AND c.user_agent LIKE ?';
      params.push(`%${filters.user_agent}%`);
    }

    if (filters.advertiser_id) { clause += ' AND o.advertiser_id = ?'; params.push(filters.advertiser_id); }
    if (filters.isp) { clause += ' AND c.isp = ?'; params.push(filters.isp); }
    if (filters.city) { clause += ' AND c.city = ?'; params.push(filters.city); }
    if (filters.region) { clause += ' AND c.region = ?'; params.push(filters.region); }
    if (filters.domain) { clause += ' AND c.domain = ?'; params.push(filters.domain); }

    // ✅ NEW: Source IP exact match (uses idx_clicks_tenant_created_ip)
    if (filters.sourceIp) {
      clause += ' AND c.ip = ?';
      params.push(filters.sourceIp);
    }

    // ✅ NEW: X-Forwarded-For LIKE (uses idx_clicks_tenant_created_xff prefix)
    if (filters.xff) {
      clause += ' AND c.x_forwarded_for LIKE ?';
      params.push(`%${filters.xff}%`);
    }

    // ✅ NEW: Authorization token exact match (uses idx_clicks_tenant_created_auth_token)
    if (filters.authorizationToken) {
      clause += ' AND c.authorization_token = ?';
      params.push(filters.authorizationToken);
    }

    if (filters.status) {
      clause += ' AND conv.status = ?';
      params.push(filters.status);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      clause += ` AND (
        c.click_uuid LIKE ? OR
        conv.conversion_uuid LIKE ? OR
        o.name LIKE ? OR
        p.email LIKE ? OR
        p.company_name LIKE ? OR
        c.ip LIKE ? OR
        c.user_agent LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    return { clause, params };
  }

  /**
   * Get publisher conversion statistics grouped by offer
   * @param {Object} filters - Filter options (publisher_id, offer_id, date_from, date_to)
   * @param {Number} tenantId - Tenant context
   * @returns {Promise<Object>} Publisher conversion statistics
   */
  async getPublisherConversionStats(filters = {}, tenantId = null) {
    try {
      const { publisher_id, offer_id } = filters;

      // ✅ Date range — parameterized BETWEEN on raw UTC created_at (index-safe, no string injection)
      // Default: today only (IST) — prevents open-ended full table scan
      const todayIST = new Date(new Date().getTime() + 330 * 60 * 1000).toISOString().split('T')[0];
      const fromDate = filters.date_from || todayIST;
      const toDate = filters.date_to || todayIST;
      const utcStart = new Date(`${fromDate}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
      const utcEnd = new Date(`${toDate}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');

      // ── 1. Pairs subquery — distinct (publisher, offer) combinations seen in date range ──
      // params: tenantId, utcStart, utcEnd  (×2 for UNION)
      const pairsQuery = `
        SELECT DISTINCT publisher_id, offer_id FROM clicks
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
        UNION
        SELECT DISTINCT publisher_id, offer_id FROM conversions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
      `;
      const pairsParams = [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd];

      // ── 2. Main query — subqueries use the same parameterized window ──
      const query = `
        SELECT
          p.id as publisher_id,
          p.email as publisher_email,
          p.company_name as publisher_company,
          p.country as publisher_country,
          o.id as offer_id,
          o.public_offer_id,
          o.name as offer_name,
          o.category as offer_category,
          COALESCE(click_stats.total_clicks, 0) as total_clicks,
          COALESCE(conv_stats.total_conversions, 0) as total_conversions,
          COALESCE(conv_stats.approved_conversions, 0) as approved_conversions,
          COALESCE(conv_stats.pending_conversions, 0) as pending_conversions,
          COALESCE(conv_stats.rejected_conversions, 0) as rejected_conversions,
          COALESCE(conv_stats.rejected_cap_conversions, 0) as rejected_cap_conversions,
          COALESCE(conv_stats.total_revenue, 0) as total_revenue,
          COALESCE(conv_stats.approved_revenue, 0) as approved_revenue,
          COALESCE(conv_stats.total_payout, 0) as total_payout,
          COALESCE(conv_stats.approved_payout, 0) as approved_payout,
          COALESCE(conv_stats.total_profit, 0) as total_profit,
          COALESCE(conv_stats.approved_profit, 0) as approved_profit
        FROM (${pairsQuery}) as pairs
        JOIN publishers  p ON pairs.publisher_id = p.id
        JOIN offers      o ON pairs.offer_id     = o.id
        LEFT JOIN (
          SELECT publisher_id, offer_id, COUNT(DISTINCT id) as total_clicks
          FROM clicks
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
          GROUP BY publisher_id, offer_id
        ) click_stats ON click_stats.publisher_id = p.id AND click_stats.offer_id = o.id
        LEFT JOIN (
          SELECT
            publisher_id, offer_id,
            COUNT(DISTINCT id)                                                                AS total_conversions,
            COUNT(DISTINCT CASE WHEN status = 'approved'     THEN id END)                    AS approved_conversions,
            COUNT(DISTINCT CASE WHEN status = 'pending'      THEN id END)                    AS pending_conversions,
            COUNT(DISTINCT CASE WHEN status IN ('rejected','click_expired') THEN id END)     AS rejected_conversions,
            COUNT(DISTINCT CASE WHEN status = 'rejected_cap' THEN id END)                    AS rejected_cap_conversions,
            COALESCE(SUM(amount), 0)                                                         AS total_revenue,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN payout  ELSE 0 END), 0)          AS total_payout,
            COALESCE(SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) AS total_profit,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN amount   ELSE 0 END), 0)         AS approved_revenue,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN payout   ELSE 0 END), 0)         AS approved_payout,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN amount - payout ELSE 0 END), 0)  AS approved_profit,
            COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount   ELSE 0 END), 0)         AS pending_revenue,
            COALESCE(SUM(CASE WHEN status = 'pending'  THEN payout   ELSE 0 END), 0)         AS pending_payout,
            COALESCE(SUM(CASE WHEN status = 'pending'  THEN amount - payout ELSE 0 END), 0)  AS pending_profit
          FROM conversions
          WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
          GROUP BY publisher_id, offer_id
        ) conv_stats ON conv_stats.publisher_id = p.id AND conv_stats.offer_id = o.id
        ORDER BY conv_stats.total_conversions DESC, conv_stats.approved_conversions DESC
      `;

      // Params order: pairs(×6) + click_stats(tenantId, utcStart, utcEnd) + conv_stats(tenantId, utcStart, utcEnd)
      const finalParams = [
        ...pairsParams,
        tenantId, utcStart, utcEnd,  // click_stats subquery
        tenantId, utcStart, utcEnd,  // conv_stats subquery
      ];

      const [rows] = await pool.query(query, finalParams);

      const stats = rows.map(row => {
        const conversionRate = row.total_clicks > 0
          ? (row.total_conversions / row.total_clicks) * 100
          : 0;
        const approvalRate = row.total_conversions > 0
          ? (row.approved_conversions / row.total_conversions) * 100
          : 0;

        return {
          publisher: {
            id: row.publisher_id,
            email: row.publisher_email,
            company_name: row.publisher_company,
            country: row.publisher_country,
          },
          offer: {
            id: row.offer_id,
            public_id: row.public_offer_id,
            name: row.offer_name,
            category: row.offer_category,
          },
          clicks: {
            total: parseInt(row.total_clicks || 0),
          },
          conversions: {
            total: parseInt(row.total_conversions || 0),
            approved: parseInt(row.approved_conversions || 0),
            pending: parseInt(row.pending_conversions || 0),
            rejected: parseInt(row.rejected_conversions || 0),
            rejected_cap: parseInt(row.rejected_cap_conversions || 0),
            conversion_rate: parseFloat(conversionRate.toFixed(2)),
            approval_rate: parseFloat(approvalRate.toFixed(2)),
          },
          revenue: {
            total: parseFloat(row.total_revenue || 0),
            approved: parseFloat(row.approved_revenue || 0),
            pending: parseFloat(row.pending_revenue || 0),
          },
          payout: {
            total: parseFloat(row.total_payout || 0),
            approved: parseFloat(row.approved_payout || 0),
            pending: parseFloat(row.pending_payout || 0),
          },
          profit: {
            total: parseFloat(row.total_profit || 0),
            approved: parseFloat(row.approved_profit || 0),
            pending: parseFloat(row.pending_profit || 0),
          },
        };
      });

      // Calculate Summary Aggregates
      const summaryInitial = {
        total_clicks: 0,
        total_conversions: 0,
        total_approved_conversions: 0,
        total_revenue: 0,
        total_payout: 0,
        total_profit: 0
      };

      const summaryStats = stats.reduce((acc, curr) => {
        acc.total_clicks += curr.clicks.total;
        acc.total_conversions += curr.conversions.total;
        acc.total_approved_conversions += curr.conversions.approved;
        acc.total_revenue += curr.revenue.total;
        acc.total_payout += curr.payout.total;
        acc.total_profit += curr.profit.total;
        return acc;
      }, summaryInitial);

      return {
        stats,
        summary: {
          total_publishers: new Set(rows.map(r => r.publisher_id)).size,
          total_offers: new Set(rows.map(r => r.offer_id)).size,
          total_combinations: rows.length,
          ...summaryStats
        },
      };
    } catch (error) {
      logger.error('ReportService.getPublisherConversionStats error:', error);
      throw error;
    }
  }

  async getConversions(filters = {}, tenantId = null) {
    try {
      const limit = parseInt(filters.limit || 50);
      const offset = (parseInt(filters.page || 1) - 1) * limit;

      let query = `
        SELECT 
          conv.id,
          conv.conversion_uuid,
          conv.click_uuid,
          conv.offer_id as internal_offer_id,
          o.name as offer_name,
          o.public_offer_id as offer_id,
          conv.publisher_id,
          p.public_publisher_id,
          p.company_name as publisher_name,
          conv.amount,
          conv.payout,
          conv.status,
          conv.ip,
          conv.created_at,
          cl.country,
          cl.region,
          cl.city,
          cl.device_type,
          cl.os,
          cl.browser
        FROM conversions conv
        LEFT JOIN offers o ON conv.offer_id = o.id
        LEFT JOIN publishers p ON conv.publisher_id = p.id
        LEFT JOIN clicks cl ON conv.click_uuid = cl.click_uuid
        WHERE 1=1
      `;

      const params = [];

      // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
      if (tenantId) {
        query += ' AND conv.tenant_id = ?';
        params.push(tenantId);
      }

      if (filters.date_from) {
        const utcStart = new Date(`${filters.date_from}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        query += ' AND conv.created_at >= ?';
        params.push(utcStart);
      }
      if (filters.date_to) {
        const utcEnd = new Date(`${filters.date_to}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' ');
        query += ' AND conv.created_at <= ?';
        params.push(utcEnd);
      }
      if (filters.offer_id) {
        query += ' AND conv.offer_id = ?';
        params.push(filters.offer_id);
      }
      if (filters.publisher_id) {
        query += ' AND conv.publisher_id = ?';
        params.push(filters.publisher_id);
      }
      if (filters.status) {
        query += ' AND conv.status = ?';
        params.push(filters.status);
      }
      if (filters.conversion_uuid) {
        query += ' AND conv.conversion_uuid LIKE ?';
        params.push(`%${filters.conversion_uuid}%`);
      }
      if (filters.click_uuid) {
        query += ' AND conv.click_uuid LIKE ?';
        params.push(`%${filters.click_uuid}%`);
      }

      // Count query
      const countQuery = `SELECT COUNT(*) as total FROM conversions conv WHERE 1=1 ` + query.split('WHERE 1=1')[1];
      const [countRows] = await pool.query(countQuery, params);
      const total = countRows[0]?.total || 0;

      query += ' ORDER BY conv.created_at DESC LIMIT ? OFFSET ?';
      const [rows] = await pool.query(query, [...params, limit, offset]);

      return {
        data: rows,
        pagination: {
          page: parseInt(filters.page || 1),
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      logger.error('ReportService.getConversions error:', error);
      throw error;
    }
  }
}

export default new ReportService();

