/**
 * High-performance, timezone-agnostic date range handling for MySQL.
 * Eliminates "off-by-one-day" errors and ensures SARGable queries.
 */

/**
 * Validates if a string matches the YYYY-MM-DD format.
 * @param {string} dateStr 
 * @returns {boolean}
 */
export function isValidYmd(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim());
}

/**
 * Converts YYYY-MM-DD bounds directly to MySQL DATETIME strings.
 * Transparent approach: No Date object shifts, no local-to-UTC conversion.
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @returns {Object} { start: 'YYYY-MM-DD 00:00:00', end: 'YYYY-MM-DD 23:59:59' }
 */
export function ymdSpanToMysqlRange(startDate, endDate) {
  const start = isValidYmd(startDate) ? `${startDate.trim()} 00:00:00` : null;
  const end = isValidYmd(endDate) ? `${endDate.trim()} 23:59:59` : null;
  
  return { start, end };
}

/**
 * Validates if a string is a complete MySQL DATETIME format (YYYY-MM-DD HH:mm:ss).
 * @param {string} value 
 * @returns {string|null}
 */
export function normalizeMysqlDateTime(value) {
  if (value == null || typeof value !== 'string') return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return null;
  return s;
}
