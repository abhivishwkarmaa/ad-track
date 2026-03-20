import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import postbackService from '../services/postbackService.js';
import dailyAggregateService from '../services/dailyAggregateService.js';

const STREAM_KEY = 'stream:events';
const GROUP_NAME = 'event_group';
const CONSUMER_NAME = `event_worker_${process.env.HOSTNAME || 'local'}_${process.pid}`;
const BATCH_SIZE = 50;
const BLOCK_MS = 2000;
const MAX_RETRY = parseInt(process.env.EVENT_WORKER_MAX_RETRY || '5', 10);
const RETRY_KEY_PREFIX = 'event:retry:';
const APPROVAL_ELIGIBLE_STATUSES = new Set(['approved', 'pending']);
let eventStatsColumnsMissingLogged = false;
let eventAnalyticsTableMissingLogged = false;

const getIstDateString = () => {
  const now = new Date();
  const istTime = new Date(now.getTime() + (330 * 60 * 1000));
  return istTime.toISOString().split('T')[0];
};

async function updateDailyEventStats({ offerId, tenantId, isPayable }) {
  const today = getIstDateString();
  const payableInc = isPayable ? 1 : 0;
  const nonPayableInc = isPayable ? 0 : 1;

  try {
    await pool.query(
      `INSERT INTO daily_offer_stats (
         offer_id, tenant_id, day, events, payable_events, non_payable_events, created_at, updated_at
       )
       VALUES (?, ?, ?, 1, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         events = COALESCE(daily_offer_stats.events, 0) + 1,
         payable_events = COALESCE(daily_offer_stats.payable_events, 0) + VALUES(payable_events),
         non_payable_events = COALESCE(daily_offer_stats.non_payable_events, 0) + VALUES(non_payable_events),
         updated_at = UTC_TIMESTAMP()`,
      [offerId, tenantId, today, payableInc, nonPayableInc]
    );
  } catch (statsErr) {
    if (statsErr.code === 'ER_BAD_FIELD_ERROR') {
      if (!eventStatsColumnsMissingLogged) {
        logger.warn('daily_offer_stats event columns missing. Run migration to add events/payable_events/non_payable_events');
        eventStatsColumnsMissingLogged = true;
      }
      return;
    }
    throw statsErr;
  }
}

async function insertEventAnalyticsFact(payload) {
  try {
    await pool.query(
      `INSERT INTO event_analytics (
         tenant_id, event_at, event_day, event_hour, click_uuid, offer_id, publisher_id, publisher_offer_id,
         event_name, event_id, event_value, is_known_event, is_payable_event, payout_event,
         conversion_status, conversion_amount, conversion_payout, conversion_already_exists,
         approval_percentage, payout_override, metadata, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())`,
      [
        payload.tenant_id,
        payload.event_at,
        payload.event_day,
        payload.event_hour,
        payload.click_uuid,
        payload.offer_id,
        payload.publisher_id,
        payload.publisher_offer_id,
        payload.event_name,
        payload.event_id || null,
        payload.event_value,
        payload.is_known_event ? 1 : 0,
        payload.is_payable_event ? 1 : 0,
        payload.payout_event,
        payload.conversion_status || null,
        payload.conversion_amount ?? null,
        payload.conversion_payout ?? null,
        payload.conversion_already_exists ? 1 : 0,
        payload.approval_percentage ?? null,
        payload.payout_override ?? null,
        payload.metadata ? JSON.stringify(payload.metadata) : null,
      ]
    );
  } catch (err) {
    if (err.code === 'ER_NO_SUCH_TABLE') {
      if (!eventAnalyticsTableMissingLogged) {
        logger.warn('event_analytics table missing. Run migration create_event_analytics.sql');
        eventAnalyticsTableMissingLogged = true;
      }
      return;
    }
    throw err;
  }
}

async function setupStream() {
  try {
    // Start at 0 so newly-created group can drain existing backlog safely.
    await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '0', 'MKSTREAM');
    logger.info(`✅ Event Stream Ready: ${STREAM_KEY}`);
  } catch (err) {
    if (err.message && err.message.includes('BUSYGROUP')) {
      logger.info(`✅ Event Group Exists: ${GROUP_NAME}`);
    } else {
      logger.error(`❌ Failed to setup event stream: ${err.message}`);
      throw err;
    }
  }
}

function fieldsToObject(fields = []) {
  const obj = {};
  for (let i = 0; i < fields.length; i += 2) {
    obj[fields[i]] = fields[i + 1];
  }
  return obj;
}

async function processEventEntry(msgId, fields) {
  const parsed = fieldsToObject(fields);
  const tenantId = Number(parsed.tenant_id || 0);
  const clickUuid = parsed.click_uuid;
  const offerId = Number(parsed.offer_id || 0);
  const publisherId = Number(parsed.publisher_id || 0);
  const publisherOfferId = parsed.publisher_offer_id ? Number(parsed.publisher_offer_id) : null;
  const eventName = String(parsed.event_name || '').trim().toLowerCase();
  const eventId = parsed.event_id ? String(parsed.event_id).trim() : null;
  const eventValue = Number(parsed.event_value || 0);
  const payoutEvent = String(parsed.payout_event || 'purchase').trim().toLowerCase();
  const isPayable = parsed.is_payable === '1' || eventName === payoutEvent;
  const isKnownEvent = parsed.is_known_event === '0' ? false : true;
  const advertiserAmount = Number(parsed.advertiser_amount || 0);
  const affiliateAmount = Number(parsed.affiliate_amount || 0);
  const rcid = parsed.rcid || uuidv4();
  const tid = parsed.tid || '';
  const requestIp = parsed.request_ip || '';

  if (!tenantId || !clickUuid || !offerId || !publisherId || !eventName) {
    logger.warn('⚠️ Invalid event stream payload, dropping', { msgId, parsed });
    await redis.xack(STREAM_KEY, GROUP_NAME, msgId);
    return;
  }

  let metadataObj = null;
  if (parsed.metadata) {
    try {
      metadataObj = JSON.parse(parsed.metadata);
    } catch {
      metadataObj = { raw: parsed.metadata };
    }
  }
  const metadataJson = metadataObj ? JSON.stringify(metadataObj) : null;
  const eventAt = parsed.timestamp ? new Date(parsed.timestamp) : new Date();
  const eventAtIso = Number.isNaN(eventAt.getTime()) ? new Date() : eventAt;
  const eventDay = new Date(eventAtIso.getTime() + (330 * 60 * 1000)).toISOString().split('T')[0];
  const eventHour = parseInt(new Date(eventAtIso.getTime() + (330 * 60 * 1000)).toISOString().split('T')[1].slice(0, 2), 10);
  let assignment = null;
  let callbackUrl = null;
  let approvalPercentage = null;
  let conversionStatus = null;
  let conversionAmountForFact = null;
  let conversionPayoutForFact = null;
  let conversionAlreadyExists = false;
  let payoutOverrideForFact = null;

  if (publisherOfferId) {
    const [assignmentRows] = await pool.query(
      `SELECT po.id as assignment_id, po.payout_override, po.conversion_approval_percentage, po.callback_url, p.global_postback_url
       FROM publisher_offers po
       LEFT JOIN publishers p ON p.id = po.publisher_id
       WHERE po.id = ? AND po.tenant_id = ?
       LIMIT 1`,
      [publisherOfferId, tenantId]
    );
    assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : null;
    callbackUrl = assignment?.callback_url || assignment?.global_postback_url || null;
    approvalPercentage = assignment?.conversion_approval_percentage;
    payoutOverrideForFact = assignment?.payout_override != null ? Number(assignment.payout_override) : null;
  } else {
    const [publisherRows] = await pool.query(
      `SELECT global_postback_url
       FROM publishers
       WHERE id = ? AND tenant_id = ?
       LIMIT 1`,
      [publisherId, tenantId]
    );
    const publisher = Array.isArray(publisherRows) ? publisherRows[0] : null;
    callbackUrl = publisher?.global_postback_url || null;
  }

  const [eventInsert] = await pool.query(
    `INSERT INTO events (
       click_uuid, event_name, event_id, offer_id, publisher_id, tenant_id, event_value, metadata, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE id = id`,
    [
      clickUuid,
      eventName,
      eventId || null,
      offerId,
      publisherId,
      tenantId,
      Number(eventValue || 0),
      metadataJson,
    ]
  );
  const isDuplicateEvent = eventInsert.affectedRows !== 1;
  if (!isDuplicateEvent) {
    await updateDailyEventStats({
      offerId,
      tenantId,
      isPayable,
    });
    await dailyAggregateService.upsertWithRollup({
      tenantId,
      day: eventDay,
      offerId,
      publisherId,
      eventName,
      events: 1,
      payableEvents: isPayable ? 1 : 0,
      nonPayableEvents: isPayable ? 0 : 1,
    });
  }

  if (!isDuplicateEvent && callbackUrl) {
    await postbackService.sendPublisherEventPostback(
      callbackUrl,
      {
        tenant_id: tenantId,
        publisher_id: publisherId,
        rcid,
        status: 'approved',
        amount: Number(eventValue || 0),
        payout: 0,
      },
      {
        tid,
        publisher_id: publisherId,
      },
      {
        event_name: eventName,
        event_id: eventId || null,
        event_value: Number(eventValue || 0),
      }
    );
  }

  if (isPayable) {
    const [existingRows] = await pool.query(
      `SELECT id
       FROM conversions
       WHERE click_uuid = ? AND tenant_id = ?
       LIMIT 1`,
      [clickUuid, tenantId]
    );
    conversionAlreadyExists = Array.isArray(existingRows) && existingRows.length > 0;

    if (!conversionAlreadyExists) {
      const conversionAmount = eventValue > 0 ? eventValue : (Number.isFinite(advertiserAmount) ? advertiserAmount : 0);
      const conversionPayout = Number(assignment?.payout_override || affiliateAmount || 0);
      let finalStatus = 'approved';
      if (
        APPROVAL_ELIGIBLE_STATUSES.has(finalStatus) &&
        approvalPercentage !== null &&
        approvalPercentage !== undefined &&
        assignment?.assignment_id
      ) {
        finalStatus = await postbackService.determineDeterministicApprovalStatus({
          tenantId,
          offerId,
          publisherId,
          assignmentId: assignment.assignment_id,
          decisionKey: rcid || clickUuid || tid,
          approvalPercentage: Number(approvalPercentage),
          fallbackStatus: finalStatus
        });
      }
      conversionStatus = finalStatus;
      conversionAmountForFact = conversionAmount;
      conversionPayoutForFact = finalStatus === 'approved' ? conversionPayout : 0;

      const conversionPayload = {
        click_uuid: clickUuid,
        offer_id: offerId,
        publisher_id: publisherId,
        publisher_offer_id: publisherOfferId || null,
        tenant_id: tenantId,
        rcid,
        status: finalStatus,
        amount: conversionAmount,
        payout: finalStatus === 'approved' ? conversionPayout : 0,
        ip: requestIp,
        timestamp: new Date().toISOString(),
        postback_payload: JSON.stringify({
          source: 'event_api',
          event_name: eventName,
          event_id: eventId || null,
          metadata: metadataObj
        }),
        callback_url: callbackUrl,
        tid,
        force_reject: false
      };

      await redis.setex(
        `conversion:${clickUuid}`,
        900,
        JSON.stringify(conversionPayload)
      );
      await redis.xadd(
        'stream:conversions',
        '*',
        'click_uuid',
        clickUuid,
        'timestamp',
        new Date().toISOString()
      );
    } else {
      conversionStatus = 'already_exists';
    }
  }
  if (!isPayable) {
    conversionStatus = null;
  }

  if (!isDuplicateEvent) {
    await insertEventAnalyticsFact({
      tenant_id: tenantId,
      event_at: eventAtIso.toISOString().slice(0, 19).replace('T', ' '),
      event_day: eventDay,
      event_hour: Number.isFinite(eventHour) ? eventHour : 0,
      click_uuid: clickUuid,
      offer_id: offerId,
      publisher_id: publisherId,
      publisher_offer_id: publisherOfferId || null,
      event_name: eventName,
      event_id: eventId || null,
      event_value: Number(eventValue || 0),
      is_known_event: isKnownEvent,
      is_payable_event: isPayable,
      payout_event: payoutEvent,
      conversion_status: conversionStatus,
      conversion_amount: conversionAmountForFact,
      conversion_payout: conversionPayoutForFact,
      conversion_already_exists: conversionAlreadyExists,
      approval_percentage: approvalPercentage != null ? Number(approvalPercentage) : null,
      payout_override: payoutOverrideForFact,
      metadata: metadataObj,
    });
  }
  await redis.xack(STREAM_KEY, GROUP_NAME, msgId);
  await redis.del(`${RETRY_KEY_PREFIX}${msgId}`);
}

async function handleProcessingError(msgId, parsed, err) {
  const retryKey = `${RETRY_KEY_PREFIX}${msgId}`;
  let retryCount = 1;
  try {
    retryCount = await redis.incr(retryKey);
    if (retryCount === 1) {
      await redis.expire(retryKey, 24 * 60 * 60);
    }
  } catch (retryErr) {
    logger.error('Failed to increment event retry counter', {
      msgId,
      error: retryErr.message
    });
  }

  if (retryCount > MAX_RETRY) {
    try {
      await redis.xadd(
        'stream:events:dlq',
        '*',
        'message_id',
        msgId,
        'error',
        err.message || 'unknown_error',
        'payload',
        JSON.stringify(parsed || {}),
        'failed_at',
        new Date().toISOString()
      );
      await redis.xack(STREAM_KEY, GROUP_NAME, msgId);
      await redis.del(retryKey);
      logger.error('❌ Event moved to DLQ after retries', { msgId, retryCount });
    } catch (dlqErr) {
      logger.error('Failed to move event to DLQ', { msgId, error: dlqErr.message });
    }
  } else {
    logger.warn('Event processing failed, will retry', { msgId, retryCount, error: err.message });
  }
}

async function processEventBatch(entries) {
  for (const [msgId, fields] of entries) {
    const parsed = fieldsToObject(fields);
    try {
      await processEventEntry(msgId, fields);
    } catch (err) {
      await handleProcessingError(msgId, parsed, err);
    }
  }
}

async function recoverPendingEvents() {
  try {
    const pending = await redis.xpending(STREAM_KEY, GROUP_NAME, '-', '+', 100);
    const stuck = pending.filter((p) => p[2] > 60000);
    if (stuck.length === 0) return;

    const ids = stuck.map((p) => p[0]);
    const claimed = await redis.xclaim(STREAM_KEY, GROUP_NAME, CONSUMER_NAME, 60000, ...ids);
    if (claimed.length > 0) {
      await processEventBatch(claimed);
    }
  } catch (err) {
    logger.error('Event worker recovery error', { error: err.message });
  }
}

async function runEventWorker() {
  await setupStream();
  logger.info(`🚀 Event Worker Started: ${CONSUMER_NAME}`);

  setInterval(recoverPendingEvents, 60000);

  while (true) {
    try {
      const response = await redis.xreadgroup(
        'GROUP', GROUP_NAME, CONSUMER_NAME,
        'COUNT', BATCH_SIZE,
        'BLOCK', BLOCK_MS,
        'STREAMS', STREAM_KEY, '>'
      );

      if (!response || !response.length) continue;

      const entries = response[0][1];
      if (!entries || entries.length === 0) continue;

      await processEventBatch(entries);
    } catch (err) {
      logger.error('❌ Event worker loop error', { error: err.message });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

export default runEventWorker;
