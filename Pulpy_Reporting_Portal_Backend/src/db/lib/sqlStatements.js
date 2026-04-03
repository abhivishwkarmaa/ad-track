/**
 * Split raw SQL into executable statements.
 * Naive split on `;` — sufficient for our migration files (no stored procedures).
 */

export function splitSqlStatements(sql) {
  return sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}
