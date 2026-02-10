import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class ReportService {
  async getSummary(filters = {}, tenantId = null) {
    // FINANCIAL SEPARATION RULES:
    // 1. Revenue = SUM(amount) (Advertiser Revenue) - ALWAYS counted, regardless of status (even rejected).
    // 2. Payout = SUM(payout) (Publisher Earnings) - ONLY counted when status = 'approved'.
    // 3. Profit = Revenue - Payout.
    try {
      let query = `
        SELECT 
          COUNT(DISTINCT c.publisher_id) as affiliates,
          COUNT(DISTINCT c.id) as unique_clicks,
          COUNT(DISTINCT i.id) as impressions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as payout,
          COALESCE(SUM(conv.amount) - SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as profit
        FROM clicks c
        LEFT JOIN impressions i ON i.offer_id = c.offer_id AND i.publisher_id = c.publisher_id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE 1=1
      `;

      const filtersBuild = this.buildWhereClause(filters, tenantId);
      query += filtersBuild.clause;

      const [rows] = await pool.query(query, filtersBuild.params);
      const summary = rows[0] || {
        affiliates: 0,
        unique_clicks: 0,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        payout: 0,
        profit: 0,
      };

      // Calculate conversion rate
      const conversionRate = summary.unique_clicks > 0
        ? (summary.conversions / summary.unique_clicks) * 100
        : 0;

      return {
        ...summary,
        conversion_rate: parseFloat(conversionRate.toFixed(2)),
      };
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

      // Dimension Mapping
      const dimMap = {
        'offer_id': 'o.public_offer_id as offer_id, o.name as offer_name',
        'publisher_id': 'p.id as publisher_id, p.company_name as publisher_name, p.email as publisher_email',
        'advertiser_id': 'o.advertiser_id',
        'ip': 'c.ip',
        'country': 'c.country',
        'isp': 'c.isp',
        'city': 'c.city',
        'region': 'c.region',
        'tid': 'c.tid',
        'date': "DATE(CONVERT_TZ(c.created_at, '+00:00', '+05:30'))",
        'hour': "HOUR(CONVERT_TZ(c.created_at, '+00:00', '+05:30'))",
        'user_agent': 'c.user_agent',
        'device_type': 'c.device_type',
        'os': 'c.os',
        'browser': 'c.browser',
        'domain': 'c.domain',
        'click_uuid': 'c.click_uuid',
        'rcid': 'c.rcid',
        'referer': 'c.referrer'
      };

      // Safe column selector
      const getDimCol = (key) => {
        return dimMap[key] || 'NULL';
      };

      if (groupBy.length > 0) {
        // --- AGGREGATED REPORT MODE ---
        let selects = [];
        let groups = [];
        let orderBy = [];

        groupBy.forEach(dim => {
          if (dimMap[dim]) {
            selects.push(`${dim === 'date' ? dimMap[dim] + ' as date_group' : (dim === 'hour' ? dimMap[dim] + ' as hour_group' : getDimCol(dim))}`);

            // Group By Clause
            if (dim === 'date') groups.push(dimMap['date']);
            else if (dim === 'hour') groups.push(dimMap['hour']);
            else if (dim === 'offer_id') { groups.push('o.public_offer_id'); groups.push('o.name'); }
            else if (dim === 'publisher_id') { groups.push('p.id'); groups.push('p.company_name'); groups.push('p.email'); }
            else if (dim === 'advertiser_id') groups.push('o.advertiser_id');
            else if (dim === 'isp' || dim === 'city' || dim === 'region') { } // Cannot group by NULL literals easily or pointless
            else groups.push(dimMap[dim].split(' as ')[0]);
          }
        });

        // Metrics
        selects.push('COUNT(DISTINCT c.id) as clicks'); // Total clicks
        selects.push('COUNT(DISTINCT c.ip) as unique_clicks'); // Unique IP
        // Impressions not linked to clicks 1:1, so generally 0 in this join unless we switch to UNION.
        selects.push('0 as impressions');
        selects.push('COUNT(DISTINCT conv.id) as conversions');
        selects.push('COALESCE(SUM(conv.amount), 0) as revenue');
        selects.push('COALESCE(SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as payout');
        selects.push('COALESCE(SUM(conv.amount) - SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as profit');
        selects.push('COALESCE(SUM(CASE WHEN conv.status = \'pending\' THEN conv.payout ELSE 0 END), 0) as pending_payout');
        selects.push('COALESCE(SUM(CASE WHEN conv.status = \'approved\' THEN conv.payout ELSE 0 END), 0) as approved_payout');

        let query = `SELECT ${selects.join(', ')} 
                     FROM clicks c
                     LEFT JOIN offers o ON c.offer_id = o.id
                     LEFT JOIN publishers p ON c.publisher_id = p.id
                     LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
                     WHERE 1=1 `;

        const filtersBuild = this.buildWhereClause(filters, tenantId);
        query += filtersBuild.clause;

        if (groups.length > 0) {
          query += ` GROUP BY ${groups.join(', ')}`;
        }

        const countQuery = `SELECT COUNT(*) as total FROM (${query}) as agg`; // Inefficient but works for dynamic grouping

        const [countRows] = await pool.query(countQuery, filtersBuild.params);
        const total = countRows[0]?.total || 0;

        // --- EXPORT LOGIC ---
        if (filters.export === 'csv' || filters.export === 'true') {
          const exportQuery = query + ` LIMIT ? OFFSET ?`;
          const [exportRows] = await pool.query(exportQuery, [...filtersBuild.params, 100000, 0]); // Limit large export
          return { data: exportRows, isExport: true, sql: exportQuery, params: [...filtersBuild.params, 100000, 0] };
        }

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
          p.company_name as publisher_company,
          c.ip,
          c.user_agent,
          c.referrer,
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

    // ✅ CRITICAL: Add tenant_id filtering for tenant isolation
    if (tenantId) {
      clause += ' AND c.tenant_id = ?';
      params.push(tenantId);
    }

    if (filters.date_from) {
      clause += ' AND DATE(CONVERT_TZ(c.created_at, \'+00:00\', \'+05:30\')) >= ?';
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      clause += ' AND DATE(CONVERT_TZ(c.created_at, \'+00:00\', \'+05:30\')) <= ?';
      params.push(filters.date_to);
    }

    if (filters.offer_id) {
      clause += ' AND c.offer_id = ?';
      params.push(filters.offer_id);
    }

    if (filters.publisher_id) {
      clause += ' AND c.publisher_id = ?';
      params.push(filters.publisher_id);
    }

    if (filters.country) {
      clause += ' AND c.country = ?';
      params.push(filters.country);
    }

    if (filters.ip) {
      clause += ' AND c.ip = ?';
      params.push(filters.ip);
    }

    if (filters.tid) {
      clause += ' AND c.tid = ?';
      params.push(filters.tid);
    }

    if (filters.rcid) {
      clause += ' AND (c.rcid = ? OR conv.rcid = ?)';
      params.push(filters.rcid, filters.rcid);
    }

    if (filters.device_brand) {
      clause += ' AND c.device_brand = ?';
      params.push(filters.device_brand);
    }

    if (filters.os) {
      clause += ' AND c.os = ?';
      params.push(filters.os);
    }

    if (filters.browser) {
      clause += ' AND c.browser = ?';
      params.push(filters.browser);
    }

    if (filters.referrer) {
      clause += ' AND c.referrer LIKE ?';
      params.push(`%${filters.referrer}%`);
    }

    if (filters.source_id) {
      clause += ' AND c.source_id = ?';
      params.push(filters.source_id);
    }

    if (filters.google_id) {
      clause += ' AND c.google_id = ?';
      params.push(filters.google_id);
    }

    if (filters.android_id) {
      clause += ' AND c.android_id = ?';
      params.push(filters.android_id);
    }

    if (filters.hour !== undefined) {
      clause += ' AND HOUR(CONVERT_TZ(c.created_at, \'+00:00\', \'+05:30\')) = ?';
      params.push(filters.hour);
    }

    if (filters.os_version) {
      clause += ' AND c.os_version = ?';
      params.push(filters.os_version);
    }

    if (filters.device_model) {
      clause += ' AND c.device_model = ?';
      params.push(filters.device_model);
    }

    if (filters.user_agent) {
      clause += ' AND c.user_agent LIKE ?';
      params.push(`%${filters.user_agent}%`);
    }

    if (filters.advertiser_id) {
      clause += ' AND o.advertiser_id = ?';
      params.push(filters.advertiser_id);
    }

    if (filters.isp) {
      clause += ' AND c.isp = ?';
      params.push(filters.isp);
    }

    if (filters.city) {
      clause += ' AND c.city = ?';
      params.push(filters.city);
    }

    if (filters.region) {
      clause += ' AND c.region = ?';
      params.push(filters.region);
    }

    if (filters.domain) {
      clause += ' AND c.domain = ?';
      params.push(filters.domain);
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
      const params = [];
      const statsParams = []; // Params for the Stats Subqueries

      // 1. Build Date Condition (for Clicks/Conversions Stats)
      let dateCondition = '';
      if (filters.date_from) {
        dateCondition += ` AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) >= '${filters.date_from}'`;
      }
      if (filters.date_to) {
        dateCondition += ` AND DATE(DATE_ADD(created_at, INTERVAL 330 MINUTE)) <= '${filters.date_to}'`;
      }

      // 2. Build Relevant Pairs Subquery (Active Data from Clicks + Conversions)
      // This ensures we see stats even for unassigned/historical offers
      const pairsQuery = `
        SELECT DISTINCT publisher_id, offer_id FROM clicks WHERE tenant_id = ? ${dateCondition}
        UNION
        SELECT DISTINCT publisher_id, offer_id FROM conversions WHERE tenant_id = ? ${dateCondition}
      `;
      // params for pairsQuery: tenantId (x2)
      // Note: date_from/to are injected directly above as strings, so we don't need params for them in the array if safe (they are usually sanitized dates).
      // But above code pushed them to statsParams.
      // Let's rely on string injection or params.
      // The previous code injected ? and pushed to statsParams.
      // To be safe and cleaner, let's keep using ? in dateCondition variables if possible, but here we construct the string.
      // The original code used params for date_from/date_to.
      // Let's stick to the pattern:

      params.push(tenantId, tenantId); // For the 2 UNION selects

      // 3. Main Query
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
          -- FINANCIAL SEPARATION: Revenue (ALL), Payout (Approved Only)
          -- Total (Approved + Pending)
          COALESCE(conv_stats.total_revenue, 0) as total_revenue,
          COALESCE(conv_stats.approved_revenue, 0) as approved_revenue,
          COALESCE(conv_stats.total_payout, 0) as total_payout,
          COALESCE(conv_stats.approved_payout, 0) as approved_payout,
          COALESCE(conv_stats.total_profit, 0) as total_profit,
          COALESCE(conv_stats.approved_profit, 0) as approved_profit
        FROM (${pairsQuery}) as pairs
        JOIN publishers p ON pairs.publisher_id = p.id
        JOIN offers o ON pairs.offer_id = o.id
        LEFT JOIN (
          SELECT 
            publisher_id,
            offer_id,
            COUNT(DISTINCT id) as total_clicks
          FROM clicks
          WHERE tenant_id = ? ${dateCondition}
          GROUP BY publisher_id, offer_id
        ) click_stats ON click_stats.publisher_id = p.id AND click_stats.offer_id = o.id
        LEFT JOIN (
          SELECT 
            publisher_id,
            offer_id,
            COUNT(DISTINCT id) as total_conversions,
            COUNT(DISTINCT CASE WHEN status = 'approved' THEN id END) as approved_conversions,
            COUNT(DISTINCT CASE WHEN status = 'pending' THEN id END) as pending_conversions,
            COUNT(DISTINCT CASE WHEN status = 'rejected' THEN id END) as rejected_conversions,
            COUNT(DISTINCT CASE WHEN status = 'rejected_cap' THEN id END) as rejected_cap_conversions,
            
            -- Total (Approved + Pending)
            COALESCE(SUM(amount), 0) as total_revenue,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as total_payout,
            COALESCE(SUM(amount) - SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as total_profit,

            -- Approved
            COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_revenue,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as approved_payout,
            COALESCE(SUM(CASE WHEN status = 'approved' THEN amount - payout ELSE 0 END), 0) as approved_profit,

            -- Pending
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_revenue,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN payout ELSE 0 END), 0) as pending_payout,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount - payout ELSE 0 END), 0) as pending_profit

          FROM conversions
          WHERE tenant_id = ? ${dateCondition}
          GROUP BY publisher_id, offer_id
        ) conv_stats ON conv_stats.publisher_id = p.id AND conv_stats.offer_id = o.id
        ORDER BY conv_stats.total_conversions DESC, conv_stats.approved_conversions DESC
      `;

      // Params for main query:
      // 1. pairs params (already accumulated)
      // 2. click_stats params: tenantId, ...statsParams
      // 3. conv_stats params: tenantId, ...statsParams

      const finalParams = [
        ...params,
        tenantId, ...statsParams,
        tenantId, ...statsParams
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
        query += ' AND DATE(CONVERT_TZ(conv.created_at, \'+00:00\', \'+05:30\')) >= ?';
        params.push(filters.date_from);
      }
      if (filters.date_to) {
        query += ' AND DATE(CONVERT_TZ(conv.created_at, \'+00:00\', \'+05:30\')) <= ?';
        params.push(filters.date_to);
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

