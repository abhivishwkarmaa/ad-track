/**
 * Legacy range utility (now powered by mysqlTimeHelper.js)
 */
import { ymdSpanToMysqlRange, normalizeMysqlDateTime } from './mysqlTimeHelper.js';

export { ymdSpanToMysqlRange, normalizeMysqlDateTime };

// Backward compatibility alias
export function normalizeMysqlUtcDatetime(value) {
  return normalizeMysqlDateTime(value);
}

export function istYmdSpanToMysqlUtcRange(fromYmd, toYmd) {
  return ymdSpanToMysqlRange(fromYmd, toYmd);
}
