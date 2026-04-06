/**
 * Reporting rollup table name (isolated from legacy `daily_click_stats`).
 * Set REPORTING_ROLLUP_TABLE=daily_reporting_rollup in env (default).
 * Identifier validated to prevent SQL injection.
 */
export function getReportingRollupTableName() {
  const t = process.env.REPORTING_ROLLUP_TABLE || 'daily_reporting_rollup';
  if (!/^[a-zA-Z0-9_]+$/.test(t)) {
    return 'daily_reporting_rollup';
  }
  return t;
}
