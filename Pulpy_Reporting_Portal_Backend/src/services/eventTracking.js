import pool from '../db/connection.js';
import redis from '../config/redis.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getIstTodayYmd } from '../utils/reportDailyRollup.js';

const REJECTED_STATUSES = new Set([
  'rejected',
  'rejected_cap',
  'click_expired',
  'declined',
  'unconfigured',
]);

const CLAIM_TTL_SECONDS = 900;

export function eventStatusBuckets(status) {
  const normalized = String(status || 'pending').toLowerCase();
  return {
    conversions: 1,
    approved: normalized === 'approved' ? 1 : 0,
    pending: normalized === 'pending' ? 1 : 0,
    rejected: REJECTED_STATUSES.has(normalized) ? 1 : 0,
  };
}

/**
 * Match a postback event against the offer's configured goals.
 * Inactive rows stay visible to the offer form, but they are not payable.
 */
export function resolveConfiguredEvent(configuredEvents, rawEventName) {
  const list = Array.isArray(configuredEvents) ? configuredEvents : [];
  const active = list.filter((ev) => ev.status !== 'inactive');
  const incoming = rawEventName ? String(rawEventName).trim().toLowerCase() : null;

  if (list.length === 0) {
    return {
      mode: 'legacy',
      eventName: incoming || 'default',
      matchedEvent: null,
      isPrimary: true,
    };
  }

  if (!incoming) {
    const primary = active.find((ev) => ev.is_primary) || active[0] || null;
    if (!primary) {
      return { mode: 'inactive', eventName: 'default', matchedEvent: null, isPrimary: false };
    }
    return {
      mode: 'matched',
      eventName: primary.event_name,
      matchedEvent: primary,
      isPrimary: Boolean(primary.is_primary),
    };
  }

  const named = list.find((ev) => String(ev.event_name).toLowerCase() === incoming) || null;
  if (!named) {
    return { mode: 'unconfigured', eventName: incoming, matchedEvent: null, isPrimary: false };
  }
  if (named.status === 'inactive') {
    return { mode: 'inactive', eventName: named.event_name, matchedEvent: named, isPrimary: false };
  }
  return {
    mode: 'matched',
    eventName: named.event_name,
    matchedEvent: named,
    isPrimary: Boolean(named.is_primary),
  };
}

/** Revenue/payout for a resolved event. Unknown and inactive events pay nothing. */
export function resolveEventMoney({ mode, matchedEvent, offer, assignment, amountParam }) {
  if (mode === 'unconfigured' || mode === 'inactive') {
    return { revenue: 0, payout: 0 };
  }

  let revenue = parseFloat(offer?.advertiser_amount) || 0;
  let payout = parseFloat(offer?.affiliate_amount) || 0;
  if (matchedEvent) {
    revenue = parseFloat(matchedEvent.advertiser_amount) || 0;
    payout = parseFloat(matchedEvent.affiliate_amount) || 0;
  } else if (assignment?.payout_override != null && assignment.payout_override !== '') {
    payout = parseFloat(assignment.payout_override) || 0;
  }

  if (amountParam !== undefined && amountParam !== null && String(amountParam).trim() !== '') {
    const parsed = parseFloat(amountParam);
    if (!Number.isNaN(parsed)) revenue = parsed;
  }

  return { revenue, payout };
}

export function dedupSlotFor(allowMultiple) {
  return allowMultiple ? uuidv4() : 'once';
}

export function funnelResultMessage(eventName, postbackResult) {
  if (postbackResult?.success) {
    return `Event '${eventName}' logged and publisher postback sent`;
  }
  const reason = postbackResult?.reason || 'no publisher callback was sent';
  return `Event '${eventName}' logged. Publisher postback was not sent (${reason})`;
}

export async function insertEventLog(row) {
  const payload = row.postbackPayload == null
    ? null
    : (typeof row.postbackPayload === 'string' ? row.postbackPayload : JSON.stringify(row.postbackPayload));
  const baseParams = [
    row.tenantId,
    row.offerId,
    row.publisherId || 0,
    row.clickUuid,
    row.eventName,
    row.amount ?? 0,
    row.payout ?? 0,
    row.isConversion ? 1 : 0,
    row.status,
    row.ip || null,
    payload,
  ];

  try {
    const [result] = await pool.query(
      `INSERT INTO event_logs (
        tenant_id, offer_id, publisher_id, click_uuid, event_name,
        amount, payout, is_conversion, status, ip, postback_payload, rcid, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [...baseParams, row.rcid || null]
    );
    return result.insertId || null;
  } catch (err) {
    if (err.code === 'ER_BAD_FIELD_ERROR' && /rcid/i.test(err.message || '')) {
      const [result] = await pool.query(
        `INSERT INTO event_logs (
          tenant_id, offer_id, publisher_id, click_uuid, event_name,
          amount, payout, is_conversion, status, ip, postback_payload, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
        baseParams
      );
      return result.insertId || null;
    }
    logger.error('Failed to insert event_logs:', err);
    return null;
  }
}

/** One event-stats row per accepted postback. Day is IST, matching the conversion worker. */
export async function upsertDailyOfferEventStats({ tenantId, offerId, eventName, status, revenue, payout }) {
  if (!tenantId || !offerId || !eventName) return;
  const buckets = eventStatusBuckets(status);
  const rev = Number(revenue) || 0;
  const pay = String(status).toLowerCase() === 'approved' ? (Number(payout) || 0) : 0;
  const profit = rev - pay;
  const day = getIstTodayYmd();

  await pool.query(
    `INSERT INTO daily_offer_event_stats (
      tenant_id, offer_id, event_name, day,
      conversions, approved_conversions, pending_conversions, rejected_conversions,
      revenue, payout, profit, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
    ON DUPLICATE KEY UPDATE
      conversions = daily_offer_event_stats.conversions + VALUES(conversions),
      approved_conversions = daily_offer_event_stats.approved_conversions + VALUES(approved_conversions),
      pending_conversions = daily_offer_event_stats.pending_conversions + VALUES(pending_conversions),
      rejected_conversions = daily_offer_event_stats.rejected_conversions + VALUES(rejected_conversions),
      revenue = daily_offer_event_stats.revenue + VALUES(revenue),
      payout = daily_offer_event_stats.payout + VALUES(payout),
      profit = daily_offer_event_stats.profit + VALUES(profit),
      updated_at = UTC_TIMESTAMP()`,
    [
      tenantId,
      offerId,
      eventName,
      day,
      buckets.conversions,
      buckets.approved,
      buckets.pending,
      buckets.rejected,
      rev,
      pay,
      profit,
    ]
  );
}

export async function recordRejectedSignal(row) {
  const status = row.status || 'declined';
  const eventLogId = await insertEventLog({
    ...row,
    amount: 0,
    payout: 0,
    isConversion: false,
    status,
  });
  try {
    await upsertDailyOfferEventStats({
      tenantId: row.tenantId,
      offerId: row.offerId,
      eventName: row.eventName,
      status,
      revenue: 0,
      payout: 0,
    });
  } catch (err) {
    logger.error('Failed to update event stats for rejected signal:', err);
  }
  return eventLogId;
}

async function queryRows(queryFn, sql, params) {
  const [rows] = await queryFn(sql, params);
  return Array.isArray(rows) ? rows : [];
}

/** Dedup one event name. Primary looks at conversions; funnel looks at event_logs. */
export async function findExistingEvent({
  isPrimary,
  clickUuid,
  eventName,
  tenantId,
  rcid,
  offerId,
  queryFn = (sql, params) => pool.query(sql, params),
}) {
  if (isPrimary) {
    if (clickUuid) {
      const rows = await queryRows(
        queryFn,
        `SELECT id, status, event_name FROM conversions
         WHERE click_uuid = ? AND event_name = ? AND tenant_id = ? LIMIT 1`,
        [clickUuid, eventName, tenantId]
      );
      if (rows.length > 0) return { row: rows[0], by: 'click' };
    }
    if (rcid && offerId) {
      const rows = await queryRows(
        queryFn,
        `SELECT id, status, event_name FROM conversions
         WHERE rcid = ? AND offer_id = ? AND event_name = ? AND tenant_id = ? LIMIT 1`,
        [rcid, offerId, eventName, tenantId]
      );
      if (rows.length > 0) return { row: rows[0], by: 'rcid' };
    }
    return null;
  }

  if (clickUuid) {
    const rows = await queryRows(
      queryFn,
      `SELECT id, status FROM event_logs
       WHERE click_uuid = ? AND event_name = ? AND tenant_id = ? LIMIT 1`,
      [clickUuid, eventName, tenantId]
    );
    if (rows.length > 0) return { row: rows[0], by: 'click' };
  }

  if (rcid && offerId) {
    try {
      const rows = await queryRows(
        queryFn,
        `SELECT id, status FROM event_logs
         WHERE rcid = ? AND offer_id = ? AND event_name = ? AND tenant_id = ? LIMIT 1`,
        [rcid, offerId, eventName, tenantId]
      );
      if (rows.length > 0) return { row: rows[0], by: 'rcid' };
    } catch (err) {
      if (err.code === 'ER_BAD_FIELD_ERROR') {
        logger.warn('event_logs.rcid is missing; run migrations before rcid funnel dedup');
        return null;
      }
      throw err;
    }
  }

  return null;
}

export async function claimEventOnce({ tenantId, clickUuid, eventName }) {
  if (!clickUuid || !eventName) return { claimed: true, key: null };
  const key = `dedup:event:${tenantId}:${clickUuid}:${eventName}`;
  try {
    const ok = await redis.set(key, '1', 'EX', CLAIM_TTL_SECONDS, 'NX');
    return { claimed: ok === 'OK', key };
  } catch (err) {
    logger.warn(`Event dedup claim failed open: ${err.message}`);
    return { claimed: true, key: null };
  }
}

export async function releaseEventClaim(key) {
  if (!key) return;
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn(`Event dedup claim release failed: ${err.message}`);
  }
}

export async function syncEventLogStatus({ clickUuid, eventName, tenantId, status, payout }) {
  if (!clickUuid || !eventName || !tenantId) return;
  try {
    await pool.query(
      `UPDATE event_logs
       SET status = ?, payout = ?
       WHERE click_uuid = ? AND event_name = ? AND tenant_id = ?
       ORDER BY id DESC LIMIT 1`,
      [status, payout, clickUuid, eventName, tenantId]
    );
  } catch (err) {
    logger.warn(`Failed to sync event_logs status for ${clickUuid}/${eventName}: ${err.message}`);
  }
}
