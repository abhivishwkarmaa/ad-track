/**
 * Quick one-shot diagnostic: prints the most recently inserted row from the
 * `clicks` table along with every column value, so we can confirm that the
 * Layer 1/2/3/4 optimizations did NOT drop or break any column.
 *
 * Usage:  node src/tests/inspect-last-click.js
 */

import dotenv from 'dotenv';
import clickRepository from '../repositories/clickRepository.js';
import pool from '../db/connection.js';

dotenv.config();

async function main() {
  const row = await clickRepository.findLatestById();

  if (!row) {
    console.log('No rows in clicks table.');
    process.exit(0);
  }

  const r = row;
  const keys = Object.keys(r);

  console.log('\nMost recent click row:');
  console.log('─'.repeat(72));
  for (const k of keys) {
    const v = r[k];
    const display = v === null ? '<NULL>' : (v instanceof Date ? v.toISOString() : String(v).slice(0, 70));
    console.log(`  ${k.padEnd(22)} = ${display}`);
  }

  const nullCols = keys.filter((k) => r[k] === null);
  const nonNull = keys.length - nullCols.length;
  console.log('─'.repeat(72));
  console.log(`Total columns: ${keys.length}   non-NULL: ${nonNull}   NULL: ${nullCols.length}`);
  if (nullCols.length) {
    console.log(`NULL columns:  ${nullCols.join(', ')}`);
  }

  await pool.end();
  process.exit(0);
}

main().catch((e) => {
  console.error('inspect-last-click failed:', e);
  process.exit(1);
});
