/**
 * Full click / conversion detail for admin log drill-down.
 */

import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerParamsService from './offerParamsService.js';

function parseJsonField(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function mapOffer(row) {
  if (!row) return null;
  return {
    id: row.offer_internal_id,
    public_offer_id: row.public_offer_id,
    name: row.offer_name,
    status: row.offer_status,
    category: row.offer_category,
    offer_currency: row.offer_currency,
    affiliate_model: row.affiliate_model,
    affiliate_amount: row.affiliate_amount,
    preview_url: row.preview_url,
    advertiser_id: row.advertiser_internal_id,
    public_advertiser_id: row.public_advertiser_id,
    advertiser_name: row.advertiser_name,
  };
}

function mapPublisher(row) {
  if (!row) return null;
  return {
    id: row.publisher_internal_id,
    public_publisher_id: row.public_publisher_id,
    email: row.publisher_email,
    company_name: row.publisher_company,
    status: row.publisher_status,
    postback_url: row.publisher_postback_url,
  };
}

function mapAssignment(row) {
  if (!row?.assignment_id) return null;
  return {
    id: row.assignment_id,
    public_assignment_id: row.public_assignment_id,
    status: row.assignment_status,
    payout_override: row.payout_override,
    callback_url: row.callback_url,
    destination_url: row.destination_url,
    capping_type: row.capping_type,
    capping_duration: row.capping_duration,
    capping_action: row.capping_action,
  };
}

function mapClick(row) {
  if (!row) return null;
  return {
    id: row.click_id,
    click_uuid: row.click_uuid,
    tid: row.tid,
    rcid: row.rcid,
    ip: row.ip,
    x_forwarded_for: row.x_forwarded_for,
    user_agent: row.user_agent,
    referrer: row.referrer,
    authorization_token: row.authorization_token,
    country: row.country,
    region: row.region,
    city: row.city,
    isp: row.isp,
    location: parseJsonField(row.location),
    domain: row.domain,
    device_type: row.device_type,
    browser: row.browser,
    os: row.os,
    os_version: row.os_version,
    device_brand: row.device_brand,
    device_model: row.device_model,
    source_id: row.source_id,
    device_id: row.device_id,
    google_id: row.google_id,
    android_id: row.android_id,
    timestamp: row.click_timestamp,
    created_at: row.click_created_at,
    extra_params: parseJsonField(row.extra_params),
    offer_id: row.offer_internal_id,
    publisher_id: row.publisher_internal_id,
    publisher_offer_id: row.publisher_offer_id,
    tenant_id: row.tenant_id,
  };
}

function mapConversion(row) {
  if (!row?.conversion_id) return null;
  return {
    id: row.conversion_id,
    conversion_uuid: row.conversion_uuid,
    click_uuid: row.click_uuid,
    rcid: row.conv_rcid,
    status: row.conversion_status,
    amount: row.conversion_amount,
    payout: row.conversion_payout,
    ip: row.conversion_ip,
    timestamp: row.conversion_timestamp,
    created_at: row.conversion_created_at,
    updated_at: row.conversion_updated_at,
    is_test: row.is_test,
    affiliate_postback_fired: row.affiliate_postback_fired,
    postback_payload: parseJsonField(row.postback_payload),
    extra_params: parseJsonField(row.conversion_extra_params),
    offer_id: row.offer_internal_id,
    publisher_id: row.publisher_internal_id,
    publisher_offer_id: row.publisher_offer_id,
    tenant_id: row.tenant_id,
  };
}

const ENTITY_JOINS = `
  LEFT JOIN offers o ON c.offer_id = o.id
  LEFT JOIN publishers p ON c.publisher_id = p.id
  LEFT JOIN advertisers a ON o.advertiser_id = a.id
  LEFT JOIN publisher_offers po ON c.publisher_offer_id = po.id
`;

const ENTITY_SELECT = `
  o.id as offer_internal_id,
  o.public_offer_id,
  o.name as offer_name,
  o.status as offer_status,
  o.category as offer_category,
  o.offer_currency,
  o.affiliate_model,
  o.affiliate_amount,
  o.preview_url,
  o.advertiser_id as advertiser_internal_id,
  a.public_advertiser_id,
  a.name as advertiser_name,
  p.id as publisher_internal_id,
  p.public_publisher_id,
  p.email as publisher_email,
  COALESCE(NULLIF(TRIM(p.company_name), ''), NULLIF(TRIM(p.email), ''), CONCAT('Publisher #', p.id)) as publisher_company,
  p.status as publisher_status,
  p.global_postback_url as publisher_postback_url,
  po.id as assignment_id,
  po.public_assignment_id,
  po.status as assignment_status,
  po.payout_override,
  po.callback_url,
  po.destination_url,
  po.capping_type,
  po.capping_duration,
  po.capping_action
`;

class LogDetailService {
  async getClickDetail(clickUuid, tenantId) {
    if (!clickUuid || !tenantId) {
      const err = new Error('clickUuid and tenant context required');
      err.statusCode = 400;
      throw err;
    }

    try {
      const [rows] = await pool.query(
        `SELECT
          c.id as click_id,
          c.click_uuid,
          c.tid,
          c.rcid,
          c.ip,
          c.x_forwarded_for,
          c.user_agent,
          c.referrer,
          c.authorization_token,
          c.country,
          c.region,
          c.city,
          c.isp,
          c.location,
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
          c.timestamp as click_timestamp,
          c.created_at as click_created_at,
          c.extra_params,
          c.offer_id as offer_internal_id,
          c.publisher_id as publisher_internal_id,
          c.publisher_offer_id,
          c.tenant_id,
          ${ENTITY_SELECT},
          conv.id as conversion_id,
          conv.conversion_uuid,
          conv.rcid as conv_rcid,
          conv.status as conversion_status,
          conv.amount as conversion_amount,
          conv.payout as conversion_payout,
          conv.ip as conversion_ip,
          conv.timestamp as conversion_timestamp,
          conv.created_at as conversion_created_at,
          conv.updated_at as conversion_updated_at,
          conv.is_test,
          conv.affiliate_postback_fired,
          conv.postback_payload,
          conv.extra_params as conversion_extra_params
        FROM clicks c
        ${ENTITY_JOINS}
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid AND conv.tenant_id = c.tenant_id
        WHERE c.click_uuid = ? AND c.tenant_id = ?
        ORDER BY c.id DESC
        LIMIT 1`,
        [clickUuid, tenantId]
      );

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return null;

      const offerParams = await offerParamsService.getOfferParams(
        row.offer_internal_id,
        tenantId
      );

      return {
        click: mapClick(row),
        conversion: mapConversion(row),
        offer: mapOffer(row),
        publisher: mapPublisher(row),
        assignment: mapAssignment(row),
        offer_params: offerParams,
      };
    } catch (error) {
      logger.error('LogDetailService.getClickDetail error:', error);
      throw error;
    }
  }

  async getConversionDetail(conversionUuid, tenantId) {
    if (!conversionUuid || !tenantId) {
      const err = new Error('conversionUuid and tenant context required');
      err.statusCode = 400;
      throw err;
    }

    try {
      const [rows] = await pool.query(
        `SELECT
          conv.id as conversion_id,
          conv.conversion_uuid,
          conv.click_uuid,
          conv.rcid as conv_rcid,
          conv.status as conversion_status,
          conv.amount as conversion_amount,
          conv.payout as conversion_payout,
          conv.ip as conversion_ip,
          conv.timestamp as conversion_timestamp,
          conv.created_at as conversion_created_at,
          conv.updated_at as conversion_updated_at,
          conv.is_test,
          conv.affiliate_postback_fired,
          conv.postback_payload,
          conv.extra_params as conversion_extra_params,
          conv.offer_id as offer_internal_id,
          conv.publisher_id as publisher_internal_id,
          conv.publisher_offer_id,
          conv.tenant_id,
          c.id as click_id,
          c.tid,
          c.rcid,
          c.ip,
          c.x_forwarded_for,
          c.user_agent,
          c.referrer,
          c.authorization_token,
          c.country,
          c.region,
          c.city,
          c.isp,
          c.location,
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
          c.timestamp as click_timestamp,
          c.created_at as click_created_at,
          c.extra_params,
          ${ENTITY_SELECT}
        FROM conversions conv
        LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid AND conv.tenant_id = c.tenant_id
        LEFT JOIN offers o ON conv.offer_id = o.id
        LEFT JOIN publishers p ON conv.publisher_id = p.id
        LEFT JOIN advertisers a ON o.advertiser_id = a.id
        LEFT JOIN publisher_offers po ON conv.publisher_offer_id = po.id
        WHERE conv.conversion_uuid = ? AND conv.tenant_id = ?
        LIMIT 1`,
        [conversionUuid, tenantId]
      );

      const row = Array.isArray(rows) ? rows[0] : rows;
      if (!row) return null;

      const offerParams = await offerParamsService.getOfferParams(
        row.offer_internal_id,
        tenantId
      );

      return {
        conversion: mapConversion(row),
        click: mapClick(row),
        offer: mapOffer(row),
        publisher: mapPublisher(row),
        assignment: mapAssignment(row),
        offer_params: offerParams,
      };
    } catch (error) {
      logger.error('LogDetailService.getConversionDetail error:', error);
      throw error;
    }
  }
}

export default new LogDetailService();
