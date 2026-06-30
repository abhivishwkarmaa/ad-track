import pool from '../db/connection.js';

const CLICK_TABLE = process.env.CLICK_TABLE || 'clicks';

function resolveClickTableName() {
  if (!/^[a-zA-Z0-9_]+$/.test(CLICK_TABLE)) {
    return 'clicks';
  }
  return CLICK_TABLE;
}

/** @returns {string} Validated clicks table identifier for SQL fragments */
export function getClickTableName() {
  return resolveClickTableName();
}

async function executeQuery(sql, params, options = {}) {
  if (options.queryExecutor) {
    return options.queryExecutor(sql, params, options.timeoutMs);
  }
  return pool.query(sql, params);
}

async function queryRows(sql, params, options = {}) {
  const [rows] = await executeQuery(sql, params, options);
  return rows;
}

async function queryFirst(sql, params, options = {}) {
  const rows = await queryRows(sql, params, options);
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

class ClickRepository {
  getTableName() {
    return getClickTableName();
  }

  async findTenantOfferPublisherByClickUuid(clickUuid, tenantId, options = {}) {
    const t = getClickTableName();
    const sql = `SELECT tenant_id, offer_id, publisher_id FROM ${t} WHERE click_uuid = ? AND tenant_id = ? LIMIT 1`;
    return queryRows(sql, [clickUuid, tenantId], options);
  }

  async findFullByClickUuidOrTid(clickUuidOrTid, tenantId, options = {}) {
    const t = getClickTableName();
    const sql = `SELECT id, offer_id, publisher_id, tenant_id, publisher_offer_id, ip, user_agent, referrer, click_uuid, country, region, city, isp, location, domain, device_type, browser, os, os_version, device_brand, device_model, source_id, device_id, google_id, android_id, rcid, tid, timestamp, created_at, extra_params FROM ${t} WHERE (click_uuid = ? OR tid = ?) AND tenant_id = ? ORDER BY id DESC LIMIT 1`;
    const rows = await queryRows(sql, [clickUuidOrTid, clickUuidOrTid, tenantId], options);
    return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  }

  async findOfferIdByRcid(rcid, tenantId) {
    const t = getClickTableName();
    const sql = `SELECT offer_id FROM ${t} WHERE rcid = ? AND tenant_id = ? LIMIT 1`;
    return queryFirst(sql, [rcid, tenantId]);
  }

  async findByClickUuid(clickUuid, tenantId) {
    const t = getClickTableName();
    const sql = `SELECT * FROM ${t} WHERE click_uuid = ? AND tenant_id = ? LIMIT 1`;
    return queryFirst(sql, [clickUuid, tenantId]);
  }

  async findClickUuidsInList(clickUuids) {
    const t = getClickTableName();
    const sql = `SELECT click_uuid FROM ${t} WHERE click_uuid IN (?)`;
    return queryRows(sql, [clickUuids]);
  }

  async bulkInsert(values) {
    const t = getClickTableName();
    const sql = `INSERT INTO ${t} (
        click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES ?
    ON DUPLICATE KEY UPDATE id = id`;
    return pool.query(sql, [values]);
  }

  async insertSingle(values) {
    const t = getClickTableName();
    const sql = `INSERT INTO ${t} (
        click_uuid, offer_id, publisher_id, publisher_offer_id, tenant_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE id = id`;
    return pool.query(sql, [values]);
  }

  async countDistinctIpsForOfferInRange(offerId, tenantId, start, endExclusive) {
    const t = getClickTableName();
    const sql = tenantId
      ? `SELECT COUNT(DISTINCT ip) as uniq FROM ${t} WHERE offer_id = ? AND tenant_id = ? AND created_at >= ? AND created_at < ?`
      : `SELECT COUNT(DISTINCT ip) as uniq FROM ${t} WHERE offer_id = ? AND created_at >= ? AND created_at < ?`;
    const params = tenantId
      ? [offerId, tenantId, start, endExclusive]
      : [offerId, start, endExclusive];
    return queryFirst(sql, params);
  }

  async findLatestIpByOfferPublisher(offerId, publisherId) {
    const t = getClickTableName();
    const sql = `SELECT ip FROM ${t}
           WHERE offer_id = ? AND publisher_id = ?
           ORDER BY created_at DESC LIMIT 1`;
    return queryFirst(sql, [offerId, publisherId]);
  }

  async countByOfferIpInRange(offerId, ip, start, endExclusive, tenantId = null) {
    const t = getClickTableName();
    let sql = `SELECT COUNT(*) as cnt FROM ${t}
                 WHERE offer_id = ?
                   AND ip = ?
                   AND created_at >= ? AND created_at < ?`;
    const params = [offerId, ip, start, endExclusive];
    if (tenantId) {
      sql += ' AND tenant_id = ?';
      params.push(tenantId);
    }
    return queryFirst(sql, params);
  }

  async findRecentOrderedByCreatedAt(limit = 5) {
    const t = getClickTableName();
    const sql = `SELECT click_uuid, offer_id, publisher_id, tenant_id, created_at FROM ${t} ORDER BY created_at DESC LIMIT ?`;
    return queryRows(sql, [limit]);
  }

  async findLatestById() {
    const t = getClickTableName();
    const sql = `SELECT * FROM ${t} ORDER BY id DESC LIMIT 1`;
    return queryFirst(sql, []);
  }

  async deleteByOfferId(offerId) {
    const t = getClickTableName();
    const sql = `DELETE FROM ${t} WHERE offer_id = ?`;
    return pool.query(sql, [offerId]);
  }

  async aggregateDailyByTenantPublisherOffer(utcStart, utcEnd) {
    const t = getClickTableName();
    const sql = `
      SELECT
        tenant_id,
        publisher_id,
        offer_id,
        COUNT(*)          AS total_clicks,
        COUNT(DISTINCT ip) AS unique_ips
      FROM ${t}
      WHERE created_at BETWEEN ? AND ?
      GROUP BY tenant_id, publisher_id, offer_id
    `;
    return queryRows(sql, [utcStart, utcEnd]);
  }

  async findLatestForTestConversion(offerId, publisherId, tenantId, tid = null) {
    const t = getClickTableName();
    let sql = `
        SELECT id, offer_id, publisher_id, tenant_id, publisher_offer_id, ip, user_agent, referrer, click_uuid, country, region, city, isp, location, domain, device_type, browser, os, os_version, device_brand, device_model, source_id, device_id, google_id, android_id, rcid, tid, timestamp, created_at, extra_params
        FROM ${t} 
        WHERE offer_id = ? AND publisher_id = ? AND tenant_id = ?
      `;
    const params = [offerId, publisherId, tenantId];
    if (tid) {
      sql += ' AND (tid = ? OR click_uuid = ?)';
      params.push(tid, tid);
    }
    sql += ' ORDER BY created_at DESC LIMIT 1';
    return queryFirst(sql, params);
  }

  async countClicksTodayForCap(offerId, publisherId, startUTC, endUTC) {
    const t = getClickTableName();
    const sql = `SELECT COUNT(*) as count
       FROM ${t}
       WHERE offer_id = ?
         AND publisher_id = ?
         AND created_at BETWEEN ? AND ?`;
    return queryFirst(sql, [offerId, publisherId, startUTC, endUTC]);
  }

  async countClicksForTenantInRange(tenantId, start, end) {
    const t = getClickTableName();
    const sql = `SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks
         FROM ${t}
         WHERE tenant_id = ? AND created_at BETWEEN ? AND ?`;
    return queryFirst(sql, [tenantId, start, end]);
  }

  async countUsedByOfferInRange(offerId, usageTenantClause, params) {
    const t = getClickTableName();
    const sql = `SELECT COUNT(*) AS used FROM ${t} WHERE offer_id = ?${usageTenantClause} AND created_at >= ? AND created_at <= ?`;
    return queryFirst(sql, params);
  }

  async countUsedByOfferInMonth(offerId, usageTenantClause, params) {
    const t = getClickTableName();
    const sql = `SELECT COUNT(*) AS used FROM ${t} WHERE offer_id = ?${usageTenantClause} AND created_at >= ? AND created_at <= ?`;
    return queryFirst(sql, params);
  }

  async countUsedByOfferTotal(offerId, usageTenantClause, params) {
    const t = getClickTableName();
    const sql = `SELECT COUNT(*) AS used FROM ${t} WHERE offer_id = ?${usageTenantClause}`;
    return queryFirst(sql, params);
  }

  /**
   * Run arbitrary SQL that was built with getClickTableName() — keeps dynamic report queries
   * routed through the repository execution layer without duplicating SQL builders.
   */
  async query(sql, params) {
    return pool.query(sql, params);
  }
}

export default new ClickRepository();
