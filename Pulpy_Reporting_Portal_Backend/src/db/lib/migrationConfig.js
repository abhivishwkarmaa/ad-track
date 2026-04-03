/**
 * Migration configuration (single place for paths and naming rules).
 */
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

/** Applied only when the DB has no core tables yet (see MigrationRunner). */
export const INITIAL_SCHEMA_FILE = '001_initial_schema.sql';

/**
 * If true, a brand-new DB only runs `001_initial_schema.sql`.
 * Keep false so newer feature migrations (e.g. event analytics) still apply
 * after the baseline dump (dump snapshot may predate those tables).
 */
export const SKIP_INCREMENTAL_ON_FRESH = false;

export function isInitialSchemaFile(filename) {
  return filename === INITIAL_SCHEMA_FILE;
}
