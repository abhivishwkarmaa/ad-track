# Codebase Concerns

**Analysis Date:** 2026-04-03

## Tech Debt

**Oversized service modules (maintainability / merge risk):**
- Issue: Core business logic is concentrated in very large JavaScript files, increasing the chance of regressions when changing unrelated behavior and making reviews difficult.
- Files: `Pulpy_Reporting_Portal_Backend/src/services/postbackService.js` (~2340 lines), `Pulpy_Reporting_Portal_Backend/src/services/trackingService.js` (~1963 lines), `Pulpy_Reporting_Portal_Backend/src/services/reportService.js` (~1718 lines), `Pulpy_Reporting_Portal_Backend/src/services/offer.service.js` (~1491 lines), `Pulpy_Reporting_Portal_Backend/src/services/dashboardService.js` (~1387 lines), `Pulpy_Reporting_Portal_Backend/src/controllers/adminController.js` (~1384 lines)
- Impact: Slower onboarding, higher defect rate on edits, harder to unit-test in isolation.
- Fix approach: Extract domain-specific helpers (e.g. postback URL building, report filter assembly, offer validation) into smaller modules under `src/services/` or `src/lib/` with explicit imports; add characterization tests before splitting.

**Duplicate / overlapping offer layers:**
- Issue: Two similarly named modules exist (`offer.service.js` vs `offerService.js`), increasing confusion about which API to import for new features.
- Files: `Pulpy_Reporting_Portal_Backend/src/services/offer.service.js`, `Pulpy_Reporting_Portal_Backend/src/services/offerService.js`, consumers such as `Pulpy_Reporting_Portal_Backend/src/controllers/offer.controller.js`, `Pulpy_Reporting_Portal_Backend/src/routes/testPostback.js`
- Impact: Inconsistent patterns, risk of updating one path and not the other.
- Fix approach: Document a single canonical module per domain in code (or consolidate behind one facade) and migrate imports incrementally.

**Database connection module noise:**
- Issue: `Pulpy_Reporting_Portal_Backend/src/db/connection.js` contains placeholder/duplicate comment blocks and verbose `console.log` startup banners mixed with production pool configuration.
- Impact: Harder to audit real configuration; log noise in production.
- Fix approach: Replace decorative logs with structured logger (`src/utils/logger.js`) at `info`/`debug` levels; remove placeholder comments; keep a single `dbConfig` object.

**Schema / uniqueness TODO:**
- Issue: Comment indicates `url_key` may need stronger uniqueness guarantees per tenant.
- Files: `Pulpy_Reporting_Portal_Backend/src/services/offerService.js` (approx. line 356)
- Impact: Possible cross-tenant or duplicate URL key collisions depending on DB constraints.
- Fix approach: Add migration for `(tenant_id, url_key)` uniqueness if product requires it; align validators and API errors.

**Deprecated frontend utility API:**
- Issue: `formatDateISTLegacy` (or similar) marked misleading for day buckets.
- Files: `Pulpy_Reporting_Portal_frontend/src/utils/dateTime.js`
- Impact: Incorrect display if legacy helper is still used somewhere.
- Fix approach: Grep for usages; migrate callers to `formatDateIST` and remove deprecated export when unused.

## Known Bugs

**No single tracked defect list in repository:**
- Symptoms: Source-level `TODO`/`FIXME` markers are sparse; most behavior is undocumented from a bug perspective.
- Files: Not applicable as a single file
- Trigger: Not applicable
- Workaround: Use issue tracker; expand backend tests around high-risk flows (postback, conversion status, reporting filters).

## Security Considerations

**JWT secrets with insecure defaults:**
- Risk: If environment variables are missing, tokens are signed/verified with hard-coded fallback strings.
- Files: `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js` (`ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, legacy `JWT_SECRET` fallbacks)
- Current mitigation: Production should always set secrets via environment.
- Recommendations: Fail fast at process startup when secrets are unset or equal to known placeholders; never ship defaults in production builds.

**Permissive CORS:**
- Risk: `origin: true` allows any origin with credentials, which can amplify impact of XSS or misconfigured cookie flags depending on deployment.
- Files: `Pulpy_Reporting_Portal_Backend/src/server.js`
- Current mitigation: Helmet registered (CSP disabled for tracking use case).
- Recommendations: Restrict to known admin and tenant front-end origins in production; document cookie `SameSite`/`Secure` expectations.

**Public debug and diagnostic HTTP routes:**
- Risk: Unauthenticated endpoints expose Redis stream metadata, recent clicks, worker status, and DB sample rows.
- Files: `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` (`/debug/clicks`, `/debug/validate/:offerId/:publisherId`, `/debug/worker-status`)
- Current mitigation: None visible in route registration (no auth hook).
- Recommendations: Gate behind admin auth, IP allowlist, or compile-time removal for production; or move to internal-only port.

**Test / integration API surface:**
- Risk: `Pulpy_Reporting_Portal_Backend/src/routes/testPostback.js` is registered in `Pulpy_Reporting_Portal_Backend/src/server.js` under `/api/test-postback`, expanding attack surface if exposed publicly.
- Current mitigation: Application-level controls may exist elsewhere (not verified in this pass).
- Recommendations: Disable in production via env flag or separate deployment profile.

**MySQL `multipleStatements: true` on pool:**
- Risk: Increases blast radius if any code path ever concatenates untrusted input into SQL.
- Files: `Pulpy_Reporting_Portal_Backend/src/db/connection.js`
- Current mitigation: Most queries use parameterized `?` placeholders; dynamic SQL in reporting builds fragments from controlled arrays.
- Recommendations: Prefer `multipleStatements: false` for app pool; reserve multi-statement execution for migration scripts only.

**Global rate limit configuration:**
- Risk: Default plugin allows very high traffic (`max: 5000` per minute) and several hot paths disable rate limiting entirely.
- Files: `Pulpy_Reporting_Portal_Backend/src/server.js`, `Pulpy_Reporting_Portal_Backend/src/routes/postback.js`, `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` (`rateLimit: false` on `/event`)
- Current mitigation: External WAF or CDN may apply limits.
- Recommendations: Tiered limits per route group; ensure postback/event abuse cannot exhaust DB or Redis without edge throttling.

## Performance Bottlenecks

**Reporting and aggregation queries:**
- Problem: `reportService` builds large dynamic `SELECT`/`COUNT` SQL with multiple optional dimensions; worst-case queries can be expensive on large `clicks` / `conversions` tables.
- Files: `Pulpy_Reporting_Portal_Backend/src/services/reportService.js`
- Cause: Ad-hoc reporting without guaranteed covering indexes for every filter combination.
- Improvement path: Materialized summaries, read replicas, stricter date bounds, query plans reviewed per tenant volume; reuse `queryWithTimeout` consistently.

**Fixed MySQL pool size:**
- Problem: `connectionLimit: 15` may become a bottleneck under concurrent admin + worker load.
- Files: `Pulpy_Reporting_Portal_Backend/src/db/connection.js`
- Cause: Single pool shared across API and potentially workers depending on deployment.
- Improvement path: Tune per process type; separate pools for workers vs API if co-hosted; monitor queue wait time.

**Redis Lua `eval` for hygiene:**
- Problem: Server-side Lua in Redis is correct for atomicity but adds operational complexity.
- Files: `Pulpy_Reporting_Portal_Backend/worker.js`, `Pulpy_Reporting_Portal_Backend/src/config/redisHygiene.js`
- Cause: Custom cleanup scripts.
- Improvement path: Monitor slowlog; ensure key patterns and TTLs align with traffic.

## Fragile Areas

**Dynamic SQL in reporting and filters:**
- Files: `Pulpy_Reporting_Portal_Backend/src/services/reportService.js`, `Pulpy_Reporting_Portal_Backend/src/services/publisherService.js`, `Pulpy_Reporting_Portal_Backend/src/services/cacheService.js`
- Why fragile: Predicate assembly must stay synchronized with Joi (or other) validators; any mismatch can yield wrong counts or open edge-case SQL bugs.
- Safe modification: Add integration tests for each new filter dimension; always bind parameters; never interpolate raw user strings into SQL fragments.
- Test coverage: Backend tests exist under `Pulpy_Reporting_Portal_Backend/src/tests/` but do not obviously cover every report permutation.

**Postback and conversion pipeline:**
- Files: `Pulpy_Reporting_Portal_Backend/src/services/postbackService.js`, `Pulpy_Reporting_Portal_Backend/src/workers/conversionWorker.js`
- Why fragile: Status transitions, idempotency, and external HTTP callbacks interact; regressions affect revenue and partner trust.
- Safe modification: Follow workspace rule: fire publisher postback only when conversion status is exactly `approved`; preserve idempotency checks.
- Test coverage: Verify with targeted tests and staging postbacks; not all branches appear covered by `src/tests/*.test.js`.

**Subscription access middleware:**
- Files: `Pulpy_Reporting_Portal_Backend/src/middleware/subscriptionAccess.js`
- Why fragile: Central gate for tenant state; path-prefix skips must stay accurate when adding routes.
- Safe modification: When adding public API routes, explicitly update `SKIP_PREFIXES` / `SKIP_PATHS` and add tests for new paths.

## Scaling Limits

**MySQL connection pool (per Node process):**
- Current capacity: `connectionLimit: 15` in `Pulpy_Reporting_Portal_Backend/src/db/connection.js`
- Limit: Throughput caps when queries pile up; risk of waiting on pool under load spikes.
- Scaling path: Horizontal API instances with per-instance pool caps; DB connection proxy (e.g. ProxySQL); optimize slow queries first.

**Single-region assumptions:**
- Limit: GeoIP (`geoip-lite`) and Redis streams imply single-cluster deployment unless explicitly designed for multi-region.
- Scaling path: Document RPO/RTO; consider regional Redis and DB replication for global tenants.

## Dependencies at Risk

**Transitive deprecated packages (lockfile metadata):**
- Risk: npm audit noise; eventual removal of unmaintained utilities.
- Files: `Pulpy_Reporting_Portal_Backend/package-lock.json` (e.g. deprecated `rimraf`/`glob` major lines in lock metadata)
- Impact: Build/tooling warnings; potential security advisories on dev dependencies.
- Migration plan: Periodic `npm audit`, upgrade Jest ecosystem and nested deps; pin major versions consciously.

**`geoip-lite` data freshness:**
- Risk: IP geolocation accuracy depends on bundled database updates.
- Files: Used from backend dependencies (`Pulpy_Reporting_Portal_Backend/package.json`)
- Impact: Wrong geo attribution in reports.
- Migration plan: Scheduled rebuild/update process or commercial GeoIP if accuracy is critical.

## Missing Critical Features

**Automated frontend tests:**
- Problem: `Pulpy_Reporting_Portal_frontend/package.json` defines `lint` and Vite scripts but no unit or E2E test runner (no Jest/Vitest/Playwright dependency).
- Blocks: Safe refactors of `Pulpy_Reporting_Portal_frontend/src/services/api.js` and page components without manual QA.

**Continuous integration:**
- Problem: No `.github/workflows` (or similar) detected in repo root for this analysis.
- Blocks: Guaranteed pre-merge test and lint runs for contributors.

## Test Coverage Gaps

**Backend:**
- What's not tested: Large portions of `postbackService.js`, `trackingService.js`, `reportService.js`, and workers remain outside explicit Jest cases.
- Files: Jest config `Pulpy_Reporting_Portal_Backend/jest.config.js` matches `**/tests/**/*.test.js`; only five test files exist under `Pulpy_Reporting_Portal_Backend/src/tests/`.
- Risk: Regressions in tracking, postback, and reporting may reach production unnoticed.
- Priority: High for revenue-impacting paths; Medium for admin-only CRUD.

**Frontend:**
- What's not tested: No automated component or integration tests detected.
- Files: `Pulpy_Reporting_Portal_frontend/` (no `*.test.*` / `*.spec.*` beside manual UI flows)
- Risk: API contract changes break UI silently.
- Priority: Medium until product stabilizes; High if release cadence increases.

---

*Concerns audit: 2026-04-03*
