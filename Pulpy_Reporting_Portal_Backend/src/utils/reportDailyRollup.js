/**
 * Helpers for reading pre-aggregated reporting rollup (`daily_reporting_rollup`, see REPORTING_ROLLUP_TABLE).
 * Legacy `daily_click_stats` is not used by the fast reporting path.
 */

/** Current IST calendar date YYYY-MM-DD */
export function getIstTodayYmd() {
  return new Date(Date.now() + 330 * 60 * 1000).toISOString().split('T')[0];
}

/**
 * True when getSummary() can SUM rollup table instead of raw clicks/conversions.
 */
export function summaryShouldUseDailyClickStats(filters) {
  if (process.env.REPORT_USE_DAILY_STATS === 'false') return false;

  const rs = filters.range_start_utc;
  const re = filters.range_end_utc;
  if (rs != null && rs !== '' && re != null && re !== '') return false;

  if (filters.noReferrer === 'true' || filters.noReferrer === true) return false;
  if (filters.hasReferrer === 'true' || filters.hasReferrer === true) return false;
  if (filters.referrer) return false;
  if (filters.ip) return false;
  if (filters.sourceIp) return false;
  if (filters.country) return false;
  if (filters.xff) return false;
  if (filters.authorizationToken) return false;

  const todayIST = getIstTodayYmd();
  const toDate = filters.date_to || todayIST;

  if (toDate >= todayIST) return false;

  return true;
}

/**
 * True when offer+publisher+advertiser+date fast path can read from rollup.
 */
export function fourDimShouldUseDailyClickStats({
  groupBy,
  hasComplexFilters,
  allDates,
  dateTo,
}) {
  if (process.env.REPORT_USE_DAILY_STATS === 'false') return false;
  if (hasComplexFilters || allDates) return false;

  const wantsOfferPubAdvDate =
    groupBy.length === 4 &&
    groupBy.includes('offer_id') &&
    groupBy.includes('publisher_id') &&
    groupBy.includes('advertiser_id') &&
    groupBy.includes('date');

  if (!wantsOfferPubAdvDate) return false;

  const todayIST = getIstTodayYmd();
  const toDate = dateTo || todayIST;
  if (toDate >= todayIST) return false;

  return true;
}
