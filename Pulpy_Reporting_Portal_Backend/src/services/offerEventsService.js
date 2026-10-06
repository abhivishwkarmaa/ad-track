/**
 * Offer Events Service: Handles multi-event / multi-goal configuration for offers.
 * Stores events like install, registration, deposit with custom revenue and payout.
 */

import pool from '../db/connection.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';

const OFFER_EVENTS_CACHE_TTL = 300;

function offerEventsCacheKey(offerId, tenantId) {
  return `ref:offer:events:v2:${tenantId}:${offerId}`;
}

class OfferEventsService {
  /**
   * Set / Replace events for an offer in atomic transaction
   * @param {number} offerId 
   * @param {number} tenantId 
   * @param {Array} events - [{ event_name, title, advertiser_amount, affiliate_amount, allow_multiple, status }]
   */
  async setOfferEvents(offerId, tenantId, events = []) {
    const list = Array.isArray(events) ? events : [];

    // Validation
    const seenNames = new Set();
    for (const ev of list) {
      const name = String(ev.event_name || '').trim().toLowerCase();
      if (!name) {
        const err = new Error('Each offer event must have an event_name (e.g. install, registration)');
        err.statusCode = 400;
        throw err;
      }

      if (!/^[a-zA-Z0-9_\-]+$/.test(name)) {
        const err = new Error(`Invalid event_name "${name}". Only alphanumeric, underscores, and hyphens allowed`);
        err.statusCode = 400;
        throw err;
      }

      if (seenNames.has(name)) {
        const err = new Error(`Duplicate event_name "${name}" found in offer events`);
        err.statusCode = 400;
        throw err;
      }
      seenNames.add(name);
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        'DELETE FROM offer_events WHERE offer_id = ? AND tenant_id = ?',
        [offerId, tenantId]
      );

      if (list.length > 0) {
        // Determine primary goal: explicit is_primary === true, or first with payout > 0, or index 0
        let primaryIdx = list.findIndex(ev => ev.is_primary === true || ev.is_primary === 1 || ev.is_primary === '1' || ev.is_primary === 'true');
        if (primaryIdx === -1) {
          primaryIdx = list.findIndex(ev => (parseFloat(ev.affiliate_amount) || 0) > 0);
        }
        if (primaryIdx === -1) {
          primaryIdx = 0;
        }

        const values = list.map((ev, idx) => [
          tenantId,
          offerId,
          String(ev.event_name).trim().toLowerCase(),
          ev.title ? String(ev.title).trim() : null,
          parseFloat(ev.advertiser_amount) || 0.0,
          parseFloat(ev.affiliate_amount) || 0.0,
          idx === primaryIdx ? 1 : 0,
          Boolean(ev.allow_multiple) ? 1 : 0,
          ev.status === 'inactive' ? 'inactive' : 'active',
        ]);

        await connection.query(
          `INSERT INTO offer_events (
            tenant_id, offer_id, event_name, title, advertiser_amount, affiliate_amount, is_primary, allow_multiple, status
          ) VALUES ?`,
          [values]
        );
      }

      await connection.commit();

      try {
        await redis.del(offerEventsCacheKey(offerId, tenantId));
      } catch (e) {
        logger.warn(`Redis del offer events cache: ${e.message}`);
      }

      logger.info(`✅ Set ${list.length} events for offer ${offerId} in tenant ${tenantId}`);
    } catch (error) {
      await connection.rollback();
      logger.error('Error setting offer events:', error);
      throw error;
    } finally {
      connection.release();
    }
  }

  /**
   * Get all events configured for an offer (Redis cached)
   */
  async getOfferEvents(offerId, tenantId) {
    if (!offerId || !tenantId) return [];

    const key = offerEventsCacheKey(offerId, tenantId);
    try {
      const cached = await redis.get(key);
      if (cached != null && cached !== '') {
        const parsed = JSON.parse(cached);
        return Array.isArray(parsed) ? parsed : [];
      }
    } catch (e) {
      logger.warn(`Redis get offer events error: ${e.message}`);
    }

    const [rows] = await pool.query(
      `SELECT id, tenant_id, offer_id, event_name, title, advertiser_amount, affiliate_amount, is_primary, allow_multiple, status
       FROM offer_events
       WHERE offer_id = ? AND tenant_id = ?
       ORDER BY id ASC`,
      [offerId, tenantId]
    );

    const events = (Array.isArray(rows) ? rows : []).map((r) => ({
      id: r.id,
      tenant_id: r.tenant_id,
      offer_id: r.offer_id,
      event_name: r.event_name,
      title: r.title || r.event_name,
      advertiser_amount: parseFloat(r.advertiser_amount) || 0,
      affiliate_amount: parseFloat(r.affiliate_amount) || 0,
      is_primary: Boolean(r.is_primary === 1 || r.is_primary === true),
      allow_multiple: Boolean(r.allow_multiple === 1 || r.allow_multiple === true),
      status: r.status,
    }));

    try {
      await redis.setex(key, OFFER_EVENTS_CACHE_TTL, JSON.stringify(events));
    } catch (e) {
      logger.warn(`Redis setex offer events error: ${e.message}`);
    }

    return events;
  }

  /**
   * Look up a specific event for an offer
   */
  async getOfferEvent(offerId, eventName, tenantId) {
    if (!offerId || !eventName || !tenantId) return null;
    const normalizedName = String(eventName).trim().toLowerCase();
    const events = await this.getOfferEvents(offerId, tenantId);
    return events.find((ev) => ev.event_name.toLowerCase() === normalizedName) || null;
  }
}

export default new OfferEventsService();
