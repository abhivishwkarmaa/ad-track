/**
 * Helpers for reading pre-aggregated reporting rollup (`daily_reporting_rollup`, see REPORTING_ROLLUP_TABLE).
 * Legacy `daily_click_stats` is not used by the fast reporting path.
 *
 * Env:
 * - REPORT_USE_RAW_TABLES=true  → force raw clicks/conversions (opt-in)
 * - REPORT_USE_DAILY_STATS=false → legacy force-raw (same as raw tables)
 * Default (unset) → use rollup/stats when filters allow
 */

/** Current IST calendar date YYYY-MM-DD */
export function getIstTodayYmd() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().split('T')[0];
}

/** Previous IST calendar day YYYY-MM-DD */
export function prevIstYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 1);
  return dt.toISOString().slice(0, 10);
}

/**
 * When true, reports must scan raw `clicks` / `conversions`.
 * Default false → prefer daily_reporting_rollup.
 */
export function shouldUseRawReportingTables() {
  if (String(process.env.REPORT_USE_RAW_TABLES || '').toLowerCase() === 'true') return true;
  // Back-compat: old flag disabled daily stats
  if (process.env.REPORT_USE_DAILY_STATS === 'false') return true;
  return false;
}

/** Click-level / non-rollup filters that cannot be answered from daily_reporting_rollup. */
export function filtersBlockReportingRollup(filters = {}) {
  if (shouldUseRawReportingTables()) return true;

  const rs = filters.range_start_utc;
  const re = filters.range_end_utc;
  if (rs != null && rs !== '' && re != null && re !== '') return true;

  if (filters.all_dates === true || filters.all_dates === 'true') return true;
  if (filters.noReferrer === 'true' || filters.noReferrer === true) return true;
  if (filters.hasReferrer === 'true' || filters.hasReferrer === true) return true;
  if (filters.referrer) return true;
  if (filters.ip) return true;
  if (filters.sourceIp) return true;
  if (filters.country) return true;
  if (filters.xff) return true;
  if (filters.authorizationToken) return true;

  return false;
}

/** groupBy keys supported by rollup grain (day × offer × publisher[+advertiser via join]). */
const ROLLUP_GROUP_KEYS = new Set(['offer_id', 'publisher_id', 'advertiser_id', 'date']);

export function groupByEligibleForRollup(groupBy = []) {
  if (!Array.isArray(groupBy) || groupBy.length === 0) return false;
  return groupBy.every((k) => ROLLUP_GROUP_KEYS.has(String(k).trim()));
}

/**
 * Split an IST YMD range into sealed rollup days + optional today raw scan.
 * @returns {{ todayIST: string, useRollup: boolean, rollupFrom: string|null, rollupTo: string|null, scanToday: boolean }}
 */
export function splitDateRangeForRollup(fromDate, toDate) {
  const todayIST = getIstTodayYmd();
  const from = fromDate || todayIST;
  const to = toDate || todayIST;

  const scanToday = from <= todayIST && to >= todayIST;

  let rollupFrom = null;
  let rollupTo = null;
  if (from < todayIST) {
    rollupFrom = from;
    rollupTo = to < todayIST ? to : prevIstYmd(todayIST);
    if (rollupTo < rollupFrom) {
      rollupFrom = null;
      rollupTo = null;
    }
  }

  const useRollup = rollupFrom != null && rollupTo != null;
  return { todayIST, useRollup, rollupFrom, rollupTo, scanToday };
}

/**
 * True when getSummary() can use rollup (possibly hybrid with today raw).
 */
export function summaryShouldUseDailyClickStats(filters) {
  return !filtersBlockReportingRollup(filters);
}

/**
 * True when offer+publisher+advertiser+date fast path can read from rollup.
 * @deprecated Prefer groupByEligibleForRollup + filtersBlockReportingRollup
 */
export function fourDimShouldUseDailyClickStats({
  groupBy,
  hasComplexFilters,
  allDates,
  dateTo,
}) {
  if (shouldUseRawReportingTables()) return false;
  if (hasComplexFilters || allDates) return false;

  const wantsOfferPubAdvDate =
    groupBy.length === 4 &&
    groupBy.includes('offer_id') &&
    groupBy.includes('publisher_id') &&
    groupBy.includes('advertiser_id') &&
    groupBy.includes('date');

  if (!wantsOfferPubAdvDate) return false;

  // Allow ranges that include today (hybrid rollup + today raw).
  void dateTo;
  return true;
}
