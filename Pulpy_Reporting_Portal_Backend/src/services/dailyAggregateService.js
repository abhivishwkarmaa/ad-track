import pool from '../db/connection.js';
import logger from '../utils/logger.js';

const ROLLUP_EVENT_NAME = '__all__';
let tableMissingLogged = false;

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

class DailyAggregateService {
  getIstDateString(date = new Date()) {
    const istTime = new Date(date.getTime() + (330 * 60 * 1000));
    return istTime.toISOString().split('T')[0];
  }

  async upsertDailyOfferPublisherStats(data) {
    const tenantId = parseInt(data.tenantId, 10);
    const offerId = parseInt(data.offerId, 10);
    const publisherId = parseInt(data.publisherId, 10);
    const day = data.day || this.getIstDateString();
    const eventName = String(data.eventName || ROLLUP_EVENT_NAME).trim().toLowerCase() || ROLLUP_EVENT_NAME;

    if (!tenantId || !offerId || !publisherId) return;

    const clicks = toNumber(data.clicks);
    const uniqueClicks = toNumber(data.uniqueClicks);
    const conversions = toNumber(data.conversions);
    const approvedConversions = toNumber(data.approvedConversions);
    const pendingConversions = toNumber(data.pendingConversions);
    const rejectedConversions = toNumber(data.rejectedConversions);
    const revenue = toNumber(data.revenue);
    const payout = toNumber(data.payout);
    const events = toNumber(data.events);
    const payableEvents = toNumber(data.payableEvents);
    const nonPayableEvents = toNumber(data.nonPayableEvents);
    const profit = revenue - payout;

    try {
      await pool.query(
        `INSERT INTO daily_offer_publisher_stats (
           tenant_id, day, offer_id, publisher_id, event_name,
           clicks, unique_clicks, conversions, approved_conversions, pending_conversions, rejected_conversions,
           revenue, payout, profit, events, payable_events, non_payable_events, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE
           clicks = clicks + VALUES(clicks),
           unique_clicks = unique_clicks + VALUES(unique_clicks),
           conversions = conversions + VALUES(conversions),
           approved_conversions = approved_conversions + VALUES(approved_conversions),
           pending_conversions = pending_conversions + VALUES(pending_conversions),
           rejected_conversions = rejected_conversions + VALUES(rejected_conversions),
           revenue = revenue + VALUES(revenue),
           payout = payout + VALUES(payout),
           profit = profit + VALUES(profit),
           events = events + VALUES(events),
           payable_events = payable_events + VALUES(payable_events),
           non_payable_events = non_payable_events + VALUES(non_payable_events),
           updated_at = UTC_TIMESTAMP()`,
        [
          tenantId,
          day,
          offerId,
          publisherId,
          eventName,
          clicks,
          uniqueClicks,
          conversions,
          approvedConversions,
          pendingConversions,
          rejectedConversions,
          revenue,
          payout,
          profit,
          events,
          payableEvents,
          nonPayableEvents,
        ]
      );
    } catch (err) {
      if (err.code === 'ER_NO_SUCH_TABLE') {
        if (!tableMissingLogged) {
          logger.warn('daily_offer_publisher_stats table missing. Run migration create_daily_offer_publisher_stats.sql');
          tableMissingLogged = true;
        }
        return;
      }
      throw err;
    }
  }

  async upsertWithRollup(data) {
    await this.upsertDailyOfferPublisherStats(data);
    const eventName = String(data.eventName || '').trim().toLowerCase();
    if (eventName !== ROLLUP_EVENT_NAME) {
      await this.upsertDailyOfferPublisherStats({
        ...data,
        eventName: ROLLUP_EVENT_NAME,
      });
    }
  }
}

export default new DailyAggregateService();
