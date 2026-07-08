/**
 * Offer parameters: publisher sub-IDs and custom pass-through keys.
 * Definitions in offer_params table; enforced on click in trackingService.
 */

import pool from '../db/connection.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';

const OFFER_PARAMS_CACHE_TTL = 300;

function offerParamsCacheKey(offerId, tenantId) {
  return `ref:offer:params:${tenantId}:${offerId}`;
}

/** Query keys reserved for platform tracking — not offer-defined sub params. */
export const RESERVED_OFFER_CLICK_PARAM_KEYS = new Set([
  'offer_id',
  'oid',
  'pub_id',
  'a',
  'publisher_id',
  'click_id',
  'clickid',
  'tid',
  'rcid',
  'sub',
  'm',
  'token',
  'auth',
]);

const SUB_PARAM_ALIASES = {
  sub1: ['s1', 'aff_sub', 'aff_sub1', 'sub_id'],
  sub2: ['s2', 'aff_sub2'],
  sub3: ['s3', 'aff_sub3'],
  sub4: ['s4', 'aff_sub4'],
  sub5: ['s5', 'aff_sub5'],
  source: ['src', 'utm_source'],
  campaign: ['utm_campaign', 'camp'],
  creative: ['utm_content', 'creative_id'],
  keyword: ['utm_term', 'kw'],
};

function isBlank(v) {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  return false;
}

function queryToLowercaseMap(query) {
  const map = {};
  if (!query || typeof query !== 'object') return map;
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (s === '') continue;
    const lk = String(k).toLowerCase();
    if (map[lk] === undefined) map[lk] = s;
  }
  return map;
}

class OfferParamsService {
  async setOfferParams(offerId, tenantId, params = []) {
    const list = Array.isArray(params) ? params : [];
    for (const p of list) {
      const k = String(p.param_key || '').trim();
      if (!k) {
        const err = new Error('Each offer_param must have a non-empty param_key');
        err.statusCode = 400;
        throw err;
      }
      if (RESERVED_OFFER_CLICK_PARAM_KEYS.has(k.toLowerCase())) {
        const err = new Error(`param_key "${k}" is reserved for platform tracking (use another name)`);
        err.statusCode = 400;
        throw err;
      }
    }

    const seenKeys = new Set();
    for (const p of list) {
      const lower = String(p.param_key).trim().toLowerCase();
      if (seenKeys.has(lower)) {
        const err = new Error(`Duplicate param_key "${p.param_key}" in offer_params`);
        err.statusCode = 400;
        throw err;
      }
      seenKeys.add(lower);
    }

    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      await connection.query(
        'DELETE FROM offer_params WHERE offer_id = ? AND tenant_id = ?',
        [offerId, tenantId]
      );

      if (list.length > 0) {
        const values = list.map((p) => [
          offerId,
          tenantId,
          p.param_key,
          p.is_required ? 1 : 0,
          p.default_value != null && p.default_value !== '' ? String(p.default_value) : null,
        ]);

        await connection.query(
          `INSERT INTO offer_params (offer_id, tenant_id, param_key, is_required, default_value)
           VALUES ?`,
          [values]
        );
      }

      await connection.commit();
      try {
        await redis.del(offerParamsCacheKey(offerId, tenantId));
      } catch (e) {
        logger.warn(`Redis del offer params cache: ${e.message}`);
      }
      logger.info(`Set ${list.length} offer_params for offer ${offerId}`);
    } catch (error) {
      await connection.rollback();
      if (error?.code === 'ER_DUP_ENTRY') {
        const err = new Error('Duplicate param_key in offer_params (each parameter name must be unique)');
        err.statusCode = 400;
        throw err;
      }
      logger.error('Error setting offer params:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  async getOfferParams(offerId, tenantId) {
    if (tenantId == null || tenantId === '') {
      return [];
    }

    const key = offerParamsCacheKey(offerId, tenantId);
    try {
      const cached = await redis.get(key);
      if (cached != null && cached !== '') {
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      logger.warn(`Redis getOfferParams cache read: ${e.message}`);
    }

    try {
      const [rows] = await pool.query(
        `SELECT param_key, is_required, default_value
         FROM offer_params
         WHERE offer_id = ? AND tenant_id = ?
         ORDER BY id ASC`,
        [offerId, tenantId]
      );

      const list = Array.isArray(rows) ? rows : [];
      try {
        await redis.setex(key, OFFER_PARAMS_CACHE_TTL, JSON.stringify(list));
      } catch (e) {
        logger.warn(`Redis getOfferParams cache write: ${e.message}`);
      }
      return list;
    } catch (error) {
      logger.error('Error fetching offer params:', error);
      throw error;
    }
  }

  collectProvidedForDefinitions(offerParamDefs, query) {
    const lower = queryToLowercaseMap(query);
    const out = {};
    if (!Array.isArray(offerParamDefs)) return out;

    for (const def of offerParamDefs) {
      const key = def.param_key;
      if (!key || RESERVED_OFFER_CLICK_PARAM_KEYS.has(String(key).toLowerCase())) continue;

      const candidates = new Set([String(key).toLowerCase()]);
      const aliases = SUB_PARAM_ALIASES[key] || SUB_PARAM_ALIASES[String(key).toLowerCase()] || [];
      for (const a of aliases) {
        candidates.add(String(a).toLowerCase());
      }

      for (const c of candidates) {
        if (lower[c] !== undefined) {
          out[key] = lower[c];
          break;
        }
      }
    }
    return out;
  }

  applyPlaceholders(urlTemplate, params = {}) {
    if (!urlTemplate) return '';

    return urlTemplate.replace(/{(\w+)}/g, (match, key) => {
      const v = params[key];
      return v != null && v !== '' ? String(v) : '';
    });
  }

  validateRequiredParams(offerParams, providedParams = {}) {
    const missing = [];
    if (!Array.isArray(offerParams)) {
      return { valid: true, missing };
    }

    offerParams.forEach((param) => {
      const required =
        param.is_required === true || param.is_required === 1 || param.is_required === '1';
      if (required && isBlank(providedParams[param.param_key])) {
        missing.push(param.param_key);
      }
    });

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  extractExtraParams(query) {
    const extraParams = {};
    if (!query || typeof query !== 'object') return extraParams;

    Object.keys(query).forEach((key) => {
      if (!RESERVED_OFFER_CLICK_PARAM_KEYS.has(String(key).toLowerCase())) {
        const v = query[key];
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          extraParams[key] = String(v);
        }
      }
    });

    return extraParams;
  }

  mergeWithDefaults(offerParams, providedParams = {}) {
    const merged = { ...providedParams };

    if (!Array.isArray(offerParams)) return merged;

    offerParams.forEach((param) => {
      if (isBlank(merged[param.param_key]) && !isBlank(param.default_value)) {
        merged[param.param_key] = String(param.default_value);
      }
    });

    return merged;
  }
}

export default new OfferParamsService();
