# Phase 1: Production security hardening — Context

**Gathered:** 2026-04-03  
**Status:** Ready for planning  
**Source:** Roadmap + requirements + codebase inspection (no separate discuss-phase)

## Phase boundary

Deliver **SEC-01–SEC-04**: production cannot start with placeholder JWT secrets; CORS is not permissive for credentialed cross-origin traffic in production; debug HTTP surfaces and `/api/test-postback` are gated or off in production by configuration.

## Implementation decisions (locked for this phase)

### SEC-01 — JWT fail-fast (production)

- On `NODE_ENV=production`, refuse startup if `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, or legacy `JWT_SECRET` (where still used for verification) are unset **or** equal to known placeholder strings currently in code (e.g. `admin-secret-key-change-in-production`, `tenant-secret-key-change-in-production`, `your-secret-key-change-in-production`).
- Centralize secret resolution in one module or small set of functions used by `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js` and `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js` to avoid drift.
- **Dev/test:** `NODE_ENV` not `production` may keep permissive defaults for local work; document in `.env.example`.

### SEC-02 — CORS allowlist (production)

- Replace `origin: true` in `Pulpy_Reporting_Portal_Backend/src/server.js` with logic that:
  - In production: only reflects origin if it matches `CORS_ORIGINS` (comma-separated list) or similar env; optionally separate admin vs tenant UI origins if product needs it.
  - In non-production: can keep broad behavior for Vite (`localhost:5173`) or mirror prod with explicit dev defaults.
- Preserve `credentials: true` where required for cookies; document required frontend origins.

### SEC-03 — Debug routes

- Routes under `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js`: `/debug/clicks`, `/debug/validate/:offerId/:publisherId`, `/debug/worker-status` must return **404** or **403** in production unless `ENABLE_TRACKING_DEBUG_ROUTES=true` (or similar) is set; prefer default **off** in production.
- Align `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js` skip logic if it currently exempts `/debug/` paths — security gating should apply before public exposure.

### SEC-04 — Test postback API

- `Pulpy_Reporting_Portal_Backend/src/server.js` registers `testPostbackRoutes` at `/api/test-postback`.
- In production, disable registration entirely unless `ENABLE_TEST_POSTBACK_ROUTES=true` (or similar); default **false**.

## Canonical references

**Backend**

- `Pulpy_Reporting_Portal_Backend/src/server.js` — CORS, route registration, plugins
- `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js` — JWT verification, secret fallbacks
- `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js` — duplicate secret constants (must align with middleware)
- `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` — debug GET routes
- `Pulpy_Reporting_Portal_Backend/src/routes/testPostback.js` — test-only postback helpers
- `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js` — `/debug/` handling on tenant resolution
- `Pulpy_Reporting_Portal_Backend/.env.example` — document new env vars

**Project rules**

- `.cursor/rules/regression-guardrails.mdc` — do not change conversion/postback business rules in unrelated edits; this phase is infrastructure gating only.

## Specific ideas

- Add a tiny `src/config/secrets.js` (or extend existing config) exporting `assertProductionSecrets()` called from `initializeServer()` before `listen`, or at top of `server.js` after `dotenv`.
- Log clear error messages to stderr and `process.exit(1)` on validation failure in production.

## Deferred

- Per-route rate limit tuning (Phase 3).
- MySQL `multipleStatements` (Phase 2).

---

*Phase: 01-production-security-hardening*
