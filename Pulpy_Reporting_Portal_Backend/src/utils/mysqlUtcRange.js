/**
 * Validates MySQL DATETIME strings used as UTC bounds for `created_at BETWEEN ? AND ?`.
 */
export function normalizeMysqlUtcDatetime(value) {
  if (value == null || typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  return s;
}

/**
 * Legacy: IST calendar day span (YYYY-MM-DD) → UTC MySQL datetimes (DB stores UTC).
 */
export function istYmdSpanToMysqlUtcRange(fromYmd, toYmd) {
  return {
    start: new Date(`${fromYmd}T00:00:00+05:30`).toISOString().slice(0, 19).replace('T', ' '),
    end: new Date(`${toYmd}T23:59:59+05:30`).toISOString().slice(0, 19).replace('T', ' '),
  };
}
