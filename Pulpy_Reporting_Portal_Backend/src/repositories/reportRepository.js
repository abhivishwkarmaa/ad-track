const DIM_MAP = {
  'offer_id': 'o.public_offer_id as offer_id, o.name as offer_name',
  'publisher_id': `c.publisher_id as publisher_id,
    COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_name,
    COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', c.publisher_id, '@unknown')) as publisher_email`,
  'advertiser_id': 'a.id as advertiser_id, a.company_name as advertiser_name',
  'country': 'c.country',
  'isp': 'c.isp',
  'city': 'c.city',
  'region': 'c.region',
  'tid': 'c.tid',
  'date': "DATE(c.created_at)",
  'hour': "HOUR(c.created_at)",
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

export class ReportRepository {
  constructor(pool) {
    this.pool = pool;
    this.DIM_MAP = DIM_MAP;
  }

  async executeCustomQuery(query, params) {
    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async getRollupSummary({ rt, dWhere, dParams }) {
    const rollupSql = `
      SELECT
        COUNT(DISTINCT CASE WHEN total_clicks > 0 THEN publisher_id END) AS affiliates,
        COALESCE(SUM(total_clicks), 0) AS unique_clicks,
        COALESCE(SUM(total_conversions), 0) AS conversions,
        COALESCE(SUM(revenue), 0) AS revenue,
        COALESCE(SUM(payout), 0) AS payout,
        COALESCE(SUM(profit), 0) AS profit,
        0 AS impressions
      FROM ${rt}
      WHERE ${dWhere}
    `;
    const [rows] = await this.pool.query(rollupSql, dParams);
    return rows[0];
  }

  async getSummaryRaw({ clickWhere, convWhere, allParams }) {
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
    const [rows] = await this.pool.query(sql, allParams);
    return rows[0];
  }

  async getDetailedAggregatedCount({ table, where, params, groupFields }) {
    const sql = `
      SELECT COUNT(DISTINCT ${groupFields}) as total 
      FROM ${table} 
      WHERE ${where}
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows[0]?.total || 0;
  }

  async getDetailedAggregatedExport({ query, params }) {
    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async getDetailedAggregatedPaged({ query, params }) {
    const [rows] = await this.pool.query(query, params);
    return rows;
  }

  async getMetadata({ table, fields, where, params }) {
    const sql = `
      SELECT ${fields}
      FROM ${table}
      WHERE ${where}
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getConversionAggregates({ where, params }) {
    const sql = `
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
      WHERE ${where}
      GROUP BY conv.publisher_id, conv.offer_id
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getConversionAggregatesForOffer({ where, params }) {
    const sql = `
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
      WHERE ${where}
      GROUP BY conv.offer_id
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getConversionAggregatesForPublisher({ where, params }) {
    const sql = `
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
      WHERE ${where}
      GROUP BY conv.publisher_id
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getConversionAggregatesForTuples({ where, placeholders, params }) {
    const sql = `
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
      WHERE ${where}
        AND (conv.publisher_id, conv.offer_id) IN (${placeholders})
      GROUP BY conv.publisher_id, conv.offer_id
    `;
    const [rows] = await this.pool.query(sql, params);
    return rows;
  }

  async getDailyClickStatsFourDim({ selectPartsDaily, dParams, limit, offset, isExport }) {
    const dataQueryDaily = `
      SELECT
        ${selectPartsDaily.join(',\n                  ')},
        cnt.__total
      FROM daily_click_stats d
      LEFT JOIN offers o ON o.id = d.offer_id
      LEFT JOIN publishers p ON p.id = d.publisher_id
      LEFT JOIN advertisers a ON a.id = o.advertiser_id
      CROSS JOIN (
        SELECT COUNT(*) AS __total
        FROM daily_click_stats dcnt
        WHERE dcnt.tenant_id = ? AND dcnt.stat_date BETWEEN ? AND ?
      ) cnt
      WHERE d.tenant_id = ? AND d.stat_date BETWEEN ? AND ?
      ORDER BY d.stat_date DESC, d.total_clicks DESC, d.offer_id ASC, d.publisher_id ASC
    `;
    const dataParamsDaily = [...dParams, ...dParams, ...dParams];

    if (isExport) {
      const [rows] = await this.pool.query(dataQueryDaily, dataParamsDaily);
      return rows;
    }

    const pagedQueryDaily = `${dataQueryDaily} LIMIT ? OFFSET ?`;
    const [rows] = await this.pool.query(pagedQueryDaily, [...dataParamsDaily, limit, offset]);
    return rows;
  }

  async getFinancialSummary({ clickWhere, convWhere, clickParams, convParams }) {
    const allParams = [...clickParams, ...clickParams, ...convParams, ...convParams, ...convParams, ...convParams];
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
    const [rows] = await this.pool.query(sql, allParams);
    const summary = rows[0] || { affiliates: 0, unique_clicks: 0, impressions: 0, conversions: 0, revenue: 0, payout: 0, profit: 0 };
    
    const conversionRate = summary.unique_clicks > 0
      ? (summary.conversions / summary.unique_clicks) * 100
      : 0;

    return { ...summary, conversion_rate: parseFloat(conversionRate.toFixed(2)) };
  }

  async getConversions({ filters, tenantId, limit, offset }) {
    let baseQuery = `
      SELECT 
        conv.id, conv.conversion_uuid, conv.click_uuid, conv.offer_id, conv.publisher_id, conv.tenant_id, conv.status, conv.amount, conv.payout, conv.ip, conv.timestamp, conv.created_at,
        o.name as offer_name, o.public_offer_id,
        p.company_name as publisher_name, p.email as publisher_email, p.public_publisher_id,
        c.ip as click_ip, c.country as click_country, c.user_agent as click_ua
      FROM conversions conv
      LEFT JOIN offers o ON conv.offer_id = o.id
      LEFT JOIN publishers p ON conv.publisher_id = p.id
      LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid
      WHERE 1=1
    `;
    const params = [];

    if (tenantId) {
      baseQuery += ' AND conv.tenant_id = ?';
      params.push(tenantId);
    }

    if (filters.date_from) {
      baseQuery += ' AND conv.created_at >= ?';
      params.push(`${filters.date_from} 00:00:00`);
    }
    if (filters.date_to) {
      baseQuery += ' AND conv.created_at <= ?';
      params.push(`${filters.date_to} 23:59:59`);
    }
    if (filters.offer_id) {
      baseQuery += ' AND conv.offer_id = ?';
      params.push(filters.offer_id);
    }
    if (filters.publisher_id) {
      baseQuery += ' AND conv.publisher_id = ?';
      params.push(filters.publisher_id);
    }
    if (filters.status) {
      baseQuery += ' AND conv.status = ?';
      params.push(filters.status);
    }
    if (filters.conversion_uuid) {
      baseQuery += ' AND conv.conversion_uuid LIKE ?';
      params.push(`%${filters.conversion_uuid}%`);
    }
    if (filters.click_uuid) {
      baseQuery += ' AND conv.click_uuid LIKE ?';
      params.push(`%${filters.click_uuid}%`);
    }

    const countSql = `SELECT COUNT(*) as total FROM conversions conv WHERE 1=1 ` + baseQuery.split('WHERE 1=1')[1];
    const [countRows] = await this.pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    const dataSql = baseQuery + ' ORDER BY conv.created_at DESC LIMIT ? OFFSET ?';
    const [rows] = await this.pool.query(dataSql, [...params, limit, offset]);

    return { rows, total };
  }

  async getAggregatedReport({ selects, joins, where, params, groups, orders, limit, offset, isExport }) {
    let sql = `SELECT ${selects.join(', ')} FROM clicks c ${joins.join(' ')} WHERE ${where}`;
    if (groups && groups.length > 0) sql += ` GROUP BY ${groups.join(', ')}`;
    if (orders && orders.length > 0) sql += ` ORDER BY ${orders.join(', ')}`;
    
    if (isExport) {
        const [rows] = await this.pool.query(sql, params);
        return rows;
    }

    const countBaseQuery = `SELECT 1 FROM clicks c ${joins.join(' ')} WHERE ${where} ${groups && groups.length > 0 ? `GROUP BY ${groups.join(', ')}` : ''}`;
    const countSql = `SELECT COUNT(*) as total FROM (${countBaseQuery}) as agg`;
    const [countRows] = await this.pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ` LIMIT ? OFFSET ?`;
    const [rows] = await this.pool.query(sql, [...params, limit, offset]);
    return { rows, total };
  }

  async getDetailedLog({ where, params, limit, offset, isExport }) {
    const selectClause = `
      c.id as click_id,
      c.click_uuid,
      c.offer_id as internal_offer_id,
      o.name as offer_name,
      o.public_offer_id as offer_id,
      c.publisher_id,
      p.public_publisher_id,
      p.email as publisher_email,
      COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', c.publisher_id)) as publisher_name,
      c.ip,
      c.x_forwarded_for,
      c.user_agent,
      c.referrer as referer,
      c.authorization_token as authorization_token,
      c.country, c.region, c.city, c.isp, c.domain,
      c.device_type, c.browser, c.os, c.os_version,
      c.device_brand, c.device_model,
      c.source_id, c.device_id, c.google_id, c.android_id,
      c.rcid, c.tid,
      c.timestamp as click_timestamp,
      c.created_at as click_created_at,
      conv.id as conversion_id,
      conv.conversion_uuid,
      conv.status as conversion_status,
      conv.amount as conversion_amount,
      conv.payout as conversion_payout,
      conv.timestamp as conversion_timestamp
    `;

    const joins = `
      FROM clicks c
      LEFT JOIN offers o ON c.offer_id = o.id
      LEFT JOIN publishers p ON c.publisher_id = p.id
      LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
    `;

    let sql = `SELECT ${selectClause} ${joins} WHERE ${where} ORDER BY c.created_at DESC`;
    
    if (isExport) {
        const [rows] = await this.pool.query(sql, params);
        return rows;
    }

    const countSql = `SELECT COUNT(*) as total FROM clicks c LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid WHERE ${where}`;
    const [countRows] = await this.pool.query(countSql, params);
    const total = countRows[0]?.total || 0;

    sql += ` LIMIT ? OFFSET ?`;
    const [rows] = await this.pool.query(sql, [...params, limit, offset]);
    return { rows, total };
  }

  async getPerformanceSummaryReport({ 
    tenantId, utcStart, utcEnd, 
    needsUniqueClicksAgg, needsConversionMetrics, 
    includeAllMetrics, wantsMetric, 
    limit, offset, isExport 
  }) {
    const selectParts = [
      'base.date_group as date_group',
      'COALESCE(o.public_offer_id, CAST(base.offer_id AS CHAR)) as offer_id',
      'COALESCE(NULLIF(TRIM(o.name), \'\'), CONCAT(\'Offer #\', base.offer_id)) as offer_name',
      'base.publisher_id as publisher_id',
      `COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', base.publisher_id)) as publisher_name`,
      `COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', base.publisher_id, '@unknown')) as publisher_email`,
      'COALESCE(o.advertiser_id, 0) as advertiser_id',
      `COALESCE(NULLIF(TRIM(a.name), ''), CONCAT('Advertiser #', o.advertiser_id)) as advertiser_name`,
    ];

    if (wantsMetric('clicks') || includeAllMetrics) selectParts.push('COALESCE(ca.clicks, 0) as clicks');
    if (wantsMetric('unique_clicks') || includeAllMetrics) selectParts.push('COALESCE(ca.unique_clicks, 0) as unique_clicks');
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

    const cteHeader = `
      WITH
      ca AS (
        SELECT
          c.offer_id,
          c.publisher_id,
          DATE(c.created_at) as date_group,
          COUNT(*) as clicks
          ${needsUniqueClicksAgg ? ', COUNT(DISTINCT c.ip) as unique_clicks' : ''}
        FROM clicks c
        WHERE c.tenant_id = ? AND c.created_at BETWEEN ? AND ?
        GROUP BY c.offer_id, c.publisher_id, date_group
      )
      ${needsConversionMetrics ? `,
      va AS (
        SELECT
          conv.offer_id,
          conv.publisher_id,
          DATE(conv.created_at) as date_group,
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
        WHERE conv.tenant_id = ? AND conv.created_at BETWEEN ? AND ?
        GROUP BY conv.offer_id, conv.publisher_id, date_group
      )` : ''}
      ,
      base AS (
        SELECT offer_id, publisher_id, date_group FROM ca
        ${needsConversionMetrics ? `
        UNION DISTINCT
        SELECT offer_id, publisher_id, date_group FROM va
        ` : ''}
      )
    `;

    const dataQuery = `
      ${cteHeader}
      SELECT
        ${selectParts.join(',\n        ')},
        bt.__total
      FROM base
      LEFT JOIN offers o ON o.id = base.offer_id
      LEFT JOIN publishers p ON p.id = base.publisher_id
      LEFT JOIN advertisers a ON a.id = o.advertiser_id
      LEFT JOIN ca
        ON ca.offer_id = base.offer_id AND ca.publisher_id = base.publisher_id AND ca.date_group = base.date_group
      ${needsConversionMetrics ? `
      LEFT JOIN va
        ON va.offer_id = base.offer_id AND va.publisher_id = base.publisher_id AND va.date_group = base.date_group
      ` : ''}
      CROSS JOIN (SELECT COUNT(*) AS __total FROM base) bt
      ORDER BY base.date_group DESC, COALESCE(ca.clicks, 0) DESC, base.offer_id ASC, base.publisher_id ASC
    `;

    const baseParams = needsConversionMetrics
      ? [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd]
      : [tenantId, utcStart, utcEnd];

    const pagedQuery = `${dataQuery} LIMIT ? OFFSET ?`;
    const [rows] = await this.pool.query(pagedQuery, [...baseParams, limit, offset]);
    return rows;
  }

  async getPivotAggregatedReport({ tenantId, utcStart, utcEnd, clickWhere, convWhere, clickParams, convParams, needsConversionMetrics, limit, offset, isExport }) {
    if (isExport) {
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
              WHERE ${convWhere}
              GROUP BY conv.publisher_id, conv.offer_id
            ) va ON va.publisher_id = c.publisher_id AND va.offer_id = c.offer_id` : ''}
          WHERE ${clickWhere}
          GROUP BY c.publisher_id, c.offer_id, p.company_name, p.email, o.public_offer_id, o.name
          ORDER BY clicks DESC, c.publisher_id ASC, c.offer_id ASC
        `;
        const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
        const [rows] = await this.pool.query(exportQuery, exportParams);
        return rows;
    }

    const topPairsQuery = `
      SELECT c.publisher_id, c.offer_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
      FROM clicks c
      WHERE ${clickWhere}
      GROUP BY c.publisher_id, c.offer_id
      ORDER BY clicks DESC, c.publisher_id ASC, c.offer_id ASC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await this.pool.query(topPairsQuery, [...clickParams, limit, offset]);
    return rows;
  }

  async getGenericAggregatedReport({ tenantId, utcStart, utcEnd }) {
    const pairsQuery = `
      SELECT DISTINCT publisher_id, offer_id FROM clicks
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
      UNION
      SELECT DISTINCT publisher_id, offer_id FROM conversions
        WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
    `;
    const pairsParams = [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd];

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
    const finalParams = [
      ...pairsParams,
      tenantId, utcStart, utcEnd,
      tenantId, utcStart, utcEnd,
    ];
    const [rows] = await this.pool.query(query, finalParams);
    return rows;
  }

  async getOfferAggregatedReport({ tenantId, utcStart, utcEnd, clickWhere, convWhere, clickParams, convParams, needsConversionMetrics, limit, offset, isExport }) {
    if (isExport) {
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
            WHERE ${convWhere}
            GROUP BY conv.offer_id
          ) va ON va.offer_id = c.offer_id` : ''}
        WHERE ${clickWhere}
        GROUP BY c.offer_id, o.public_offer_id, o.name
        ORDER BY clicks DESC, c.offer_id ASC
      `;
      const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
      const [rows] = await this.pool.query(exportQuery, exportParams);
      return rows;
    }

    const topOffersQuery = `
      SELECT c.offer_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
      FROM clicks c
      WHERE ${clickWhere}
      GROUP BY c.offer_id
      ORDER BY clicks DESC, c.offer_id ASC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await this.pool.query(topOffersQuery, [...clickParams, limit, offset]);
    return rows;
  }

  async getPublisherAggregatedReport({ tenantId, utcStart, utcEnd, clickWhere, convWhere, clickParams, convParams, needsConversionMetrics, wantsMetric, limit, offset, isExport }) {
    if (isExport) {
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
                COALESCE(SUM(conv.amount) - COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit,
                COALESCE(SUM(CASE WHEN conv.status = 'pending' THEN conv.payout ELSE 0 END), 0) as pending_payout,
                COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout
              FROM conversions conv
              WHERE ${convWhere}
              GROUP BY conv.publisher_id
            ) va ON va.publisher_id = c.publisher_id` : ''}
          WHERE ${clickWhere}
          GROUP BY c.publisher_id, p.company_name, p.email
          ORDER BY clicks DESC, c.publisher_id ASC
        `;
        const exportParams = needsConversionMetrics ? [...convParams, ...clickParams] : [...clickParams];
        const [rows] = await this.pool.query(exportQuery, exportParams);
        return rows;
    }

    async getTopPublishersForPaged({ clickWhere, clickParams, limit, offset }) {
        const sql = `
          SELECT c.publisher_id, COUNT(*) as clicks, COUNT(DISTINCT c.ip) as unique_clicks
          FROM clicks c
          WHERE ${clickWhere}
          GROUP BY c.publisher_id
          ORDER BY clicks DESC, c.publisher_id ASC
          LIMIT ? OFFSET ?
        `;
        const [rows] = await this.pool.query(sql, [...clickParams, limit, offset]);
        return rows;
    }

    /**
     * Generic query executor — used by service when SQL is built dynamically.
     * All pool.query() calls belong in the repository layer.
     * @param {string} sql
     * @param {Array}  params
     * @returns {Promise<Array>} rows
     */
    async execute(sql, params = []) {
        return this.pool.query(sql, params);
    }

    /** Summary: rollup from pre-aggregated daily_click_stats table */
    async getSummaryRollup({ rollupTable, where, params }) {
        const sql = `
          SELECT
            COUNT(DISTINCT CASE WHEN total_clicks > 0 THEN publisher_id END) AS affiliates,
            COALESCE(SUM(total_clicks), 0)      AS unique_clicks,
            COALESCE(SUM(total_conversions), 0) AS conversions,
            COALESCE(SUM(revenue), 0)            AS revenue,
            COALESCE(SUM(payout), 0)             AS payout,
            COALESCE(SUM(profit), 0)             AS profit,
            0 AS impressions
          FROM ${rollupTable}
          WHERE ${where}
        `;
        const [rows] = await this.pool.query(sql, params);
        return rows[0] || { affiliates: 0, unique_clicks: 0, impressions: 0, conversions: 0, revenue: 0, payout: 0, profit: 0 };
    }

    /** Summary: scalar subquery method (live clicks/conversions tables) */
    async getSummaryScalar({ clickWhere, convWhere, clickParams, convParams }) {
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
        const allParams = [...clickParams, ...clickParams, ...convParams, ...convParams, ...convParams, ...convParams];
        const [rows] = await this.pool.query(sql, allParams);
        return rows[0] || { affiliates: 0, unique_clicks: 0, impressions: 0, conversions: 0, revenue: 0, payout: 0, profit: 0 };
    }

    /** Fetch publisher display meta for a list of publisher IDs */
    async getPublisherMeta(publisherIds) {
        if (!publisherIds || publisherIds.length === 0) return [];
        const [rows] = await this.pool.query(
            `SELECT p.id as publisher_id,
                    COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', p.id)) as publisher_name,
                    COALESCE(NULLIF(TRIM(p.email), ''), CONCAT('publisher-', p.id, '@unknown')) as publisher_email
             FROM publishers p
             WHERE p.id IN (?)`,
            [publisherIds]
        );
        return rows;
    }

    /** Fetch offer display meta for a list of internal offer IDs */
    async getOfferMeta(offerIds) {
        if (!offerIds || offerIds.length === 0) return [];
        const [rows] = await this.pool.query(
            `SELECT o.id as offer_internal_id,
                    COALESCE(o.public_offer_id, CAST(o.id AS CHAR)) as offer_id,
                    COALESCE(NULLIF(TRIM(o.name), ''), CONCAT('Offer #', o.id)) as offer_name
             FROM offers o
             WHERE o.id IN (?)`,
            [offerIds]
        );
        return rows;
    }

    /** Aggregate conversions grouped by publisher_id for a given tenant/date window */
    async getConversionsByPublisherIds({ publisherIds, convWhere, convParams }) {
        if (!publisherIds || publisherIds.length === 0) return [];
        const [rows] = await this.pool.query(
            `SELECT
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
             WHERE ${convWhere} AND conv.publisher_id IN (?)
             GROUP BY conv.publisher_id`,
            [...convParams, publisherIds]
        );
        return rows;
    }

    /** Aggregate conversions grouped by offer_id for a given tenant/date window */
    async getConversionsByOfferIds({ offerIds, convWhere, convParams }) {
        if (!offerIds || offerIds.length === 0) return [];
        const [rows] = await this.pool.query(
            `SELECT
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
             WHERE ${convWhere} AND conv.offer_id IN (?)
             GROUP BY conv.offer_id`,
            [...convParams, offerIds]
        );
        return rows;
    }

    /**
     * Aggregate conversions for specific (publisher_id, offer_id) pairs.
     * @param {Array<{publisher_id, offer_id}>} pairs
     */
    async getConversionPairs({ pairs, convWhere, convParams }) {
        if (!pairs || pairs.length === 0) return [];
        const tuplePlaceholders = pairs.map(() => '(?, ?)').join(', ');
        const tupleParams = pairs.flatMap(r => [r.publisher_id, r.offer_id]);
        const [rows] = await this.pool.query(
            `SELECT
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
             WHERE ${convWhere}
               AND (conv.publisher_id, conv.offer_id) IN (${tuplePlaceholders})
             GROUP BY conv.publisher_id, conv.offer_id`,
            [...convParams, ...tupleParams]
        );
        return rows;
    }

    /** Full publisher conversion stats query (for getPublisherConversionStats) */
    async getPublisherConversionStats({ tenantId, utcStart, utcEnd }) {
        const pairsParams = [tenantId, utcStart, utcEnd, tenantId, utcStart, utcEnd];
        const sql = `
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
          FROM (
            SELECT DISTINCT publisher_id, offer_id FROM clicks
              WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
            UNION
            SELECT DISTINCT publisher_id, offer_id FROM conversions
              WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
          ) as pairs
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
              COALESCE(SUM(CASE WHEN status = 'approved' THEN amount - payout ELSE 0 END), 0)  AS approved_profit
            FROM conversions
            WHERE tenant_id = ? AND created_at BETWEEN ? AND ?
            GROUP BY publisher_id, offer_id
          ) conv_stats ON conv_stats.publisher_id = p.id AND conv_stats.offer_id = o.id
          ORDER BY conv_stats.total_conversions DESC, conv_stats.approved_conversions DESC
        `;
        const finalParams = [
            ...pairsParams,
            tenantId, utcStart, utcEnd,
            tenantId, utcStart, utcEnd,
        ];
        const [rows] = await this.pool.query(sql, finalParams);
        return rows;
    }

    /** Conversions list with filtering and pagination */
    async getConversions({ query, countQuery, params, limit, offset }) {
        const [countRows] = await this.pool.query(countQuery, params);
        const total = countRows[0]?.total || 0;
        const [rows] = await this.pool.query(query, [...params, limit, offset]);
        return { rows, total };
    }
}

// (no singleton export)
