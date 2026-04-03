---
phase: 01-production-security-hardening
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - Pulpy_Reporting_Portal_Backend/src/config/secrets.js
  - Pulpy_Reporting_Portal_Backend/src/middleware/auth.js
  - Pulpy_Reporting_Portal_Backend/src/controllers/authController.js
  - Pulpy_Reporting_Portal_Backend/src/server.js
  - Pulpy_Reporting_Portal_Backend/.env.example
  - Pulpy_Reporting_Portal_Backend/src/routes/tracking.js
  - Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js
  - Pulpy_Reporting_Portal_Backend/.env.example
autonomous: true
requirements:
  - SEC-01
  - SEC-02
  - SEC-03
  - SEC-04
must_haves:
  truths:
    - "With NODE_ENV=production, process exits before listen if JWT secrets are missing or placeholder (SEC-01)."
    - "Production CORS only allows origins in CORS_ORIGINS (or documented split) with credentials; not origin: true for arbitrary hosts (SEC-02)."
    - "GET /debug/clicks, /debug/validate/:offerId/:publisherId, /debug/worker-status return 404 or 403 in production unless ENABLE_TRACKING_DEBUG_ROUTES=true (SEC-03)."
    - "/api/test-postback is not registered in production unless ENABLE_TEST_POSTBACK_ROUTES=true (SEC-04)."
  artifacts:
    - path: Pulpy_Reporting_Portal_Backend/src/config/secrets.js
      provides: Central JWT secret resolution + assertProductionSecrets()
    - path: Pulpy_Reporting_Portal_Backend/src/server.js
      provides: CORS allowlist, conditional testPostback registration, early assertProductionSecrets call
  key_links:
    - from: Pulpy_Reporting_Portal_Backend/src/config/secrets.js
      to: Pulpy_Reporting_Portal_Backend/src/middleware/auth.js
      via: "import getAdminJwtSecret / getTenantJwtSecret / shared PLACEHOLDER set"
    - from: Pulpy_Reporting_Portal_Backend/src/server.js
      to: "@fastify/cors origin callback"
      via: "production branch reads process.env.CORS_ORIGINS"
---

<objective>
Harden the Pulpy Reporting Portal backend for production: fail-fast JWT secrets (SEC-01), explicit CORS allowlist with credentials (SEC-02), gated tracking debug HTTP routes (SEC-03), and opt-in test postback API registration (SEC-04).

Purpose: Unsafe defaults and permissive CORS must not ship in production; diagnostic and test surfaces must be configuration-gated.

Output: Implemented behavior in listed `files_modified`; `.env.example` documents `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, `JWT_SECRET` (legacy), `CORS_ORIGINS`, `ENABLE_TRACKING_DEBUG_ROUTES`, `ENABLE_TEST_POSTBACK_ROUTES`.
</objective>

<execution_context>
@$HOME/.cursor/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/01-production-security-hardening/01-CONTEXT.md
@.planning/REQUIREMENTS.md
@.cursor/rules/regression-guardrails.mdc
</context>

# Execution order

Run tasks in **wave order** (1 → 2 → 3 → 4). Later waves may touch files touched earlier; merge conflicts are avoided by sequencing.

**Note:** Do not add markdown horizontal rules (`---`) below the YAML frontmatter; they break GSD frontmatter parsing.

## Wave 1 — SEC-01: JWT secrets module and fail-fast

<task type="auto">
  <name>Task 1.1: Centralize JWT secrets and production assert</name>
  <requirement>SEC-01</requirement>
  <read_first>
    - Pulpy_Reporting_Portal_Backend/src/middleware/auth.js
    - Pulpy_Reporting_Portal_Backend/src/controllers/authController.js
    - Pulpy_Reporting_Portal_Backend/src/server.js (lines 1–15 for dotenv order)
    - Pulpy_Reporting_Portal_Backend/.env.example (create or extend JWT section)
  </read_first>
  <action>
    - Add `Pulpy_Reporting_Portal_Backend/src/config/secrets.js` exporting:
      - A frozen array or Set of **placeholder literals** matching current code defaults: `admin-secret-key-change-in-production`, `tenant-secret-key-change-in-production`, `your-secret-key-change-in-production`.
      - Functions `getAdminJwtSecret()`, `getTenantJwtSecret()` (and if needed `getLegacyJwtSecret()`) that read **only** `process.env.ADMIN_JWT_SECRET`, `process.env.TENANT_JWT_SECRET`, `process.env.JWT_SECRET` with the same fallback chain as today for non-production, but **no** inline string fallbacks duplicated in auth middleware/controller.
      - `assertProductionSecrets()`:
        - If `process.env.NODE_ENV !== 'production'`, return immediately.
        - If production: require each effective secret used for signing/verification to be **set and non-empty** and **not** in the placeholder set. Cover `ADMIN_JWT_SECRET` / `TENANT_JWT_SECRET` and, where `auth.js` still verifies with `process.env.JWT_SECRET || 'your-secret-key-change-in-production'`, treat unset or placeholder `JWT_SECRET` as fatal when that path is relied upon (mirror CONTEXT: legacy JWT_SECRET where still used).
        - On failure: `console.error` a clear message listing which var failed, then `process.exit(1)`.
    - Refactor `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js` to import getters from `secrets.js` and remove duplicate `const ADMIN_JWT_SECRET = process.env...` lines (lines ~8–9 and the inline `jwt.verify(..., process.env.JWT_SECRET || 'your-secret-key-change-in-production')` must use the centralized getter).
    - Refactor `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js` to use the same getters for all `jwt.sign` / `jwt.verify` that currently use `ADMIN_JWT_SECRET` / `TENANT_JWT_SECRET` constants at module top (~lines 13–14).
    - In `Pulpy_Reporting_Portal_Backend/src/server.js`, after `dotenv.config()` (line 12) and **before** `initializeServer()` is awaited in `start()` (around line 172), call `assertProductionSecrets()` imported from `./config/secrets.js` so production fails before plugins/routes load.
    - Update `Pulpy_Reporting_Portal_Backend/.env.example`: document `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, and `JWT_SECRET` (legacy) with one-line comments that **production** values must be strong random strings and must not match placeholder defaults; reference `assertProductionSecrets` behavior (exit on missing/placeholder in production).
  </action>
  <acceptance_criteria>
    - `rg "ADMIN_JWT_SECRET|TENANT_JWT_SECRET|JWT_SECRET" Pulpy_Reporting_Portal_Backend/.env.example` — must match at least three lines (variable names documented).
    - `rg "admin-secret-key-change-in-production|tenant-secret-key-change-in-production|your-secret-key-change-in-production" Pulpy_Reporting_Portal_Backend/src/middleware/auth.js Pulpy_Reporting_Portal_Backend/src/controllers/authController.js` — must return **no matches** (placeholders live only in `secrets.js`).
    - `rg "assertProductionSecrets" Pulpy_Reporting_Portal_Backend/src/server.js` — must show import and call in `start()` before `await initializeServer()`.
    - Manual/automated: `NODE_ENV=production` with unset `ADMIN_JWT_SECRET` exits non-zero before "Server started" log; with strong secrets set, server starts (smoke).
  </acceptance_criteria>
  <files>Pulpy_Reporting_Portal_Backend/src/config/secrets.js, Pulpy_Reporting_Portal_Backend/src/middleware/auth.js, Pulpy_Reporting_Portal_Backend/src/controllers/authController.js, Pulpy_Reporting_Portal_Backend/src/server.js, Pulpy_Reporting_Portal_Backend/.env.example</files>
  <verify>
    <automated>cd Pulpy_Reporting_Portal_Backend && rg -q "assertProductionSecrets" src/server.js && rg -q "ADMIN_JWT_SECRET" .env.example && rg -q "TENANT_JWT_SECRET" .env.example && ! rg -q "admin-secret-key-change-in-production|tenant-secret-key-change-in-production|your-secret-key-change-in-production" src/middleware/auth.js src/controllers/authController.js</automated>
  </verify>
  <done>Production startup calls assertProductionSecrets before initializeServer; auth.js and authController.js use secrets.js getters only; placeholder literals not duplicated outside secrets.js.</done>
</task>

## Wave 2 — SEC-02: CORS allowlist (production)

<task type="auto">
  <name>Task 2.1: Replace origin:true with env-driven allowlist</name>
  <requirement>SEC-02</requirement>
  <read_first>
    - Pulpy_Reporting_Portal_Backend/src/server.js (cors registration ~lines 41–47)
    - Pulpy_Reporting_Portal_Backend/.env.example (if present)
  </read_first>
  <action>
    - Replace `origin: true` in `fastify.register(cors, { ... })` with an `origin` **function** (Fastify `@fastify/cors` callback form):
      - **Production** (`process.env.NODE_ENV === 'production'`): parse `process.env.CORS_ORIGINS` as a comma-separated list (trim entries, ignore empty). Return `true` only if `request.headers.origin` is in that allowlist; if `CORS_ORIGINS` is unset or empty, fail safe: callback returns `false` (or register throws at startup — choose one documented behavior and document in `.env.example`).
      - **Non-production**: allow `http://localhost:5173`, `http://127.0.0.1:5173`, and optionally merge with `CORS_ORIGINS` if set (per CONTEXT: explicit dev defaults).
    - Keep `credentials: true`, `methods`, `allowedHeaders`, `exposedHeaders` unchanged unless required for preflight.
    - Update `Pulpy_Reporting_Portal_Backend/.env.example` with `CORS_ORIGINS` example: `https://admin.example.com,https://tenant.example.com` and a one-line comment that production requires it.
  </action>
  <acceptance_criteria>
    - `rg "origin: true" Pulpy_Reporting_Portal_Backend/src/server.js` — must return **no matches**.
    - `rg "CORS_ORIGINS" Pulpy_Reporting_Portal_Backend/src/server.js Pulpy_Reporting_Portal_Backend/.env.example` — both reference the variable.
    - Grep proof: `origin` callback contains `production` branch and uses comma-split of `CORS_ORIGINS`.
  </acceptance_criteria>
  <files>Pulpy_Reporting_Portal_Backend/src/server.js, Pulpy_Reporting_Portal_Backend/.env.example</files>
  <verify>
    <automated>cd Pulpy_Reporting_Portal_Backend && ! rg -q "origin: true" src/server.js && rg -q "CORS_ORIGINS" src/server.js</automated>
  </verify>
  <done>No `origin: true` in server.js; production path uses CORS_ORIGINS comma list; .env.example documents CORS_ORIGINS.</done>
</task>

## Wave 3 — SEC-03: Tracking debug routes + tenant middleware

<task type="auto">
  <name>Task 3.1: Gate debug GET routes and align tenant skip</name>
  <requirement>SEC-03</requirement>
  <read_first>
    - Pulpy_Reporting_Portal_Backend/src/routes/tracking.js (handlers `/debug/clicks`, `/debug/validate/:offerId/:publisherId`, `/debug/worker-status`)
    - Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js (`request.url.startsWith('/debug/')` branch)
  </read_first>
  <action>
    - Introduce env flag `ENABLE_TRACKING_DEBUG_ROUTES` (default **false** in production semantics): when `NODE_ENV=production` and env is not exactly `true` (or `1` if you document boolean parsing), each debug route handler must **not** expose diagnostics: `reply.code(404).send(...)` or `403` with minimal body (pick one; 404 matches "unreachable" wording in ROADMAP).
    - When enabled in production, routes behave as today.
    - Non-production: keep current permissive behavior for developer use.
    - Update `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`: if `/debug/` is skipped for tenant resolution **only** when debug is allowed, narrow the condition so `/debug/` is **not** exempt from tenant resolution when debug routes are disabled (avoid public bypass of tenant context on disabled routes — align with CONTEXT "security gating before public exposure"). If full tenant skip is still required for enabled debug, gate the skip with the same `ENABLE_TRACKING_DEBUG_ROUTES` check.
    - Document `ENABLE_TRACKING_DEBUG_ROUTES` in `.env.example`.
  </action>
  <acceptance_criteria>
    - `rg "ENABLE_TRACKING_DEBUG_ROUTES" Pulpy_Reporting_Portal_Backend/src/routes/tracking.js Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js Pulpy_Reporting_Portal_Backend/.env.example`
    - `rg "/debug/" Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js` — condition must reference the same enable flag as tracking routes (not a bare `startsWith('/debug/')` alone if that bypasses tenant when debug off).
    - Smoke: `NODE_ENV=production` without env → `GET /debug/clicks` returns 404 or 403 (curl local).
  </acceptance_criteria>
  <files>Pulpy_Reporting_Portal_Backend/src/routes/tracking.js, Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js, Pulpy_Reporting_Portal_Backend/.env.example</files>
  <verify>
    <automated>cd Pulpy_Reporting_Portal_Backend && rg -q "ENABLE_TRACKING_DEBUG_ROUTES" src/routes/tracking.js src/middleware/tenant.js .env.example</automated>
  </verify>
  <done>Debug handlers return 404/403 in production when flag off; tenant.js skips `/debug/` only when flag allows (same flag as tracking).</done>
</task>

## Wave 4 — SEC-04: Conditional `/api/test-postback` registration

<task type="auto">
  <name>Task 4.1: Register test postback routes only when enabled</name>
  <requirement>SEC-04</requirement>
  <read_first>
    - Pulpy_Reporting_Portal_Backend/src/server.js (`testPostbackRoutes` import and `fastify.register(testPostbackRoutes, ...)` ~lines 24, 110)
    - Pulpy_Reporting_Portal_Backend/src/routes/testPostback.js (export name only)
  </read_first>
  <action>
    - Add `ENABLE_TEST_POSTBACK_ROUTES`: in **production**, register `testPostbackRoutes` at prefix `/api/test-postback` **only** when `process.env.ENABLE_TEST_POSTBACK_ROUTES === 'true'` (or document `1` if chosen — be consistent with Wave 3 boolean parsing).
    - Non-production: keep current behavior (always register) **or** mirror with default on for dev — document choice in `.env.example` one line.
    - Ensure no alternate path exposes the same handlers without the flag in production (single registration site in `server.js`).
    - Document in `Pulpy_Reporting_Portal_Backend/.env.example`.
  </action>
  <acceptance_criteria>
    - `rg "testPostbackRoutes|ENABLE_TEST_POSTBACK" Pulpy_Reporting_Portal_Backend/src/server.js` — registration wrapped in env check for production branch.
    - `rg "ENABLE_TEST_POSTBACK" Pulpy_Reporting_Portal_Backend/.env.example`
    - Smoke: `NODE_ENV=production` without flag → `GET /api/test-postback` (any subpath) returns 404 from notFound handler; with `ENABLE_TEST_POSTBACK_ROUTES=true` and secrets set, route exists (curl).
  </acceptance_criteria>
  <files>Pulpy_Reporting_Portal_Backend/src/server.js, Pulpy_Reporting_Portal_Backend/.env.example</files>
  <verify>
    <automated>cd Pulpy_Reporting_Portal_Backend && rg -q "ENABLE_TEST_POSTBACK_ROUTES" src/server.js && rg -q "ENABLE_TEST_POSTBACK_ROUTES" .env.example</automated>
  </verify>
  <done>testPostbackRoutes registered in production only when ENABLE_TEST_POSTBACK_ROUTES matches documented enable value.</done>
</task>

<verification>
  - Run project linter on edited files if configured (e.g. `npm run lint` from `Pulpy_Reporting_Portal_Backend` if present).
  - Requirement trace: SEC-01 Task 1.1; SEC-02 Task 2.1; SEC-03 Task 3.1; SEC-04 Task 4.1.
</verification>

<success_criteria>
  - All four `must_haves.truths` observable in local smoke with `NODE_ENV=production` and controlled env vars.
  - No change to conversion/postback **business** rules (infrastructure gating only; per regression-guardrails).
</success_criteria>

<output>
After completion, create `.planning/phases/01-production-security-hardening/01-01-SUMMARY.md` (or project-standard SUMMARY name) documenting env vars and any manual operator steps.
</output>
