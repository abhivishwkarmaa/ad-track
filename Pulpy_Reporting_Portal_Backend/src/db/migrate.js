/**
 * CLI entry for database migrations.
 * Delegates to MigrationRunner (SOLID: thin entrypoint, logic in lib/).
 */
import pool from './connection.js';
import { MigrationRunner } from './lib/migrationRunner.js';

async function main() {
  const runner = new MigrationRunner({ pool });
  try {
    await runner.run();
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
