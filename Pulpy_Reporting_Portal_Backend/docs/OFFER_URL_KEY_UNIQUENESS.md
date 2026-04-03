# Offer keys and uniqueness

## Modern schema (`public_offer_id`)

The primary offers table enforces **`UNIQUE (tenant_id, public_offer_id)`** for tracking URLs. New offer creation goes through `offer.service.js` and uses this stable per-tenant public id.

## Legacy `url_key` (`offerService.js`)

Some paths still use a string **`url_key`** on `offers` (see `src/services/offerService.js`).

- **Uniqueness:** `(tenant_id, url_key)` must be unique when `url_key` is used. This is enforced by the database index **`uniq_offers_tenant_url_key`** added in migration `014_add_unique_offers_tenant_url_key.sql` (when the `url_key` column exists).
- **API:** Inserts/updates that collide return **409** with message *An offer with this URL key already exists for this tenant* (`DUPLICATE_URL_KEY`).

## Applying the migration

1. Ensure column `offers.url_key` exists on your database (legacy deployments).
2. Remove duplicate `(tenant_id, url_key)` rows if the migration logs a skip.
3. Run `npm run migrate` from `Pulpy_Reporting_Portal_Backend`.

## Application MySQL pool

The default connection pool uses **`multipleStatements: false`**. Migration scripts execute **one SQL statement at a time** (`src/db/migrate.js`); they do not rely on multi-statement queries on the pool.
