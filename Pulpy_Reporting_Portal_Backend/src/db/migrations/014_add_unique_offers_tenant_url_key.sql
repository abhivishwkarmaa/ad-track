-- Enforce at most one offer per (tenant_id, url_key) for legacy rows that use url_key.
-- Requires column `offers.url_key`. If your schema has no url_key column, this statement is skipped by migrate.js (unknown column).
-- If duplicates exist for the same (tenant_id, url_key), resolve them before re-running.

ALTER TABLE offers ADD UNIQUE INDEX uniq_offers_tenant_url_key (tenant_id, url_key);
