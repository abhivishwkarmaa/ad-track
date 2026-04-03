# Architecture

**Analysis Date:** 2026-04-03

## Pattern Overview

**Overall:** Monorepo-style layout with a **Node.js (ESM) Fastify HTTP API** and a separate **Vite + React SPA** admin/tenant UI. **Subdomain-based multi-tenancy** drives tenant resolution on every request; the API is **layered (routes → controllers → services)** with **Redis streams and background workers** for high-volume tracking paths.

**Key Characteristics:**
- HTTP API and workers share `Pulpy_Reporting_Portal_Backend/` code; production typically runs API and workers as **separate processes** (see `Pulpy_Reporting_Portal_Backend/ecosystem.config.cjs`).
- **Tenant context** is derived from the **Host / X-Forwarded-Host** subdomain, not from client-supplied tenant headers (`Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`).
- **Tracking** (`/click`, `/event`, `/imp`, postback routes) and **admin JSON APIs** (`/api/...`) coexist on one Fastify instance (`Pulpy_Reporting_Portal_Backend/src/server.js`).

## Layers

**HTTP server (Fastify):**
- Purpose: Application bootstrap, global plugins (CORS, helmet, cookies, rate limit), hooks, route registration, not-found handling.
- Location: `Pulpy_Reporting_Portal_Backend/src/server.js`
- Contains: Fastify instance creation, `dotenv` load, JSON body parser customization, `trustProxy` for reverse proxies.
- Depends on: route modules, middleware (`Pulpy_Reporting_Portal_Backend/src/middleware/*`), `Pulpy_Reporting_Portal_Backend/src/utils/logger.js`
- Used by: Node process entry (`npm start` → `src/server.js`)

**Routes:**
- Purpose: Map URL + method to controller handlers; apply route-scoped hooks (e.g. admin auth).
- Location: `Pulpy_Reporting_Portal_Backend/src/routes/*.js`
- Contains: Fastify plugin functions (`async function routes(fastify, options) { ... }`), `fastify.get/post/...`, per-route `authenticateAdmin` or validation preHandlers where used.
- Depends on: controllers, occasionally services directly for simple cases, middleware from `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`
- Used by: `server.js` via `fastify.register(..., { prefix: '...' })`

**Controllers:**
- Purpose: Parse `request` (query/body), enforce tenant/admin context, shape HTTP responses and status codes; delegate heavy work to services.
- Location: `Pulpy_Reporting_Portal_Backend/src/controllers/*.js`
- Contains: Class or object exports with async methods; uses `getTenantIdFromRequest` and related helpers from `Pulpy_Reporting_Portal_Backend/src/utils/tenantScope.js`
- Depends on: services (`Pulpy_Reporting_Portal_Backend/src/services/*`), utilities for errors (`Pulpy_Reporting_Portal_Backend/src/utils/errorResponse.js`, `secureErrors.js`)
- Used by: route handlers

**Services:**
- Purpose: Business logic, SQL composition/execution, Redis usage, cross-entity orchestration (reports, tracking, postbacks, offers, etc.).
- Location: `Pulpy_Reporting_Portal_Backend/src/services/*.js`
- Contains: Large modules (e.g. `reportService.js`, `trackingService.js`); primary integration with MySQL pool and Redis clients.
- Depends on: `Pulpy_Reporting_Portal_Backend/src/db/connection.js`, `Pulpy_Reporting_Portal_Backend/src/config/redis.js`, other services as needed
- Used by: controllers, workers, and sometimes middleware-related services

**Validation:**
- Purpose: Request validation with Joi; optional schema modules for domain objects.
- Location: `Pulpy_Reporting_Portal_Backend/src/middleware/validate.js` (middleware factory `validate(schema)`), `Pulpy_Reporting_Portal_Backend/src/validators/*.js`, `Pulpy_Reporting_Portal_Backend/src/schemas/*.js`
- Contains: `schema.validate` on `query` or `body`; strip unknown fields on success.
- Depends on: `joi`
- Used by: routes as `preHandler` where applied

**Persistence:**
- Purpose: MySQL connection pool, migrations, one-off DB maintenance scripts.
- Location: `Pulpy_Reporting_Portal_Backend/src/db/connection.js`, `Pulpy_Reporting_Portal_Backend/src/db/migrate.js`, `Pulpy_Reporting_Portal_Backend/src/db/migrations/*.sql`
- Contains: `mysql2/promise` pool; migration runners and SQL files.
- Depends on: environment variables for DB host/name/user/password (not documented here)
- Used by: services, middleware (tenant loads), workers

**Async workers:**
- Purpose: Consume Redis streams, bulk writes, stats aggregation, hygiene—**outside** the main API loop in production (PM2 separate apps).
- Location: `Pulpy_Reporting_Portal_Backend/src/workers/*.js`; process entry files at backend root (e.g. `Pulpy_Reporting_Portal_Backend/click-worker.js`, `conversion-worker.js`, `event-worker.js`, `stats-worker.js`)
- Contains: `redisWorker.js`, `conversionWorker.js`, `statsWorker.js`, etc.; root scripts wire `dotenv` and call worker modules.
- Depends on: `Pulpy_Reporting_Portal_Backend/src/config/redis.js`, services, same DB pool as API
- Used by: PM2 / manual `node` processes

**Frontend (React SPA):**
- Purpose: Authenticated admin/tenant UI; routing and layout; API client uses **relative** `/api` URLs so Host-based tenancy works behind Vite proxy or NGINX.
- Location: `Pulpy_Reporting_Portal_frontend/src/App.jsx`, `Pulpy_Reporting_Portal_frontend/src/main.jsx`, `Pulpy_Reporting_Portal_frontend/src/pages/**`, `Pulpy_Reporting_Portal_frontend/src/services/api.js`
- Contains: `react-router-dom` routes, context providers (`Pulpy_Reporting_Portal_frontend/src/context/*`), page-level screens, shared components.
- Depends on: Vite dev server proxy (`Pulpy_Reporting_Portal_frontend/vite.config.js`)
- Used by: Browser

## Data Flow

**Authenticated admin API request (example: reports):**

1. Browser calls relative URL `/api/admin/reports/...` with cookies/JWT; **Host** carries tenant subdomain.
2. NGINX or Vite proxy forwards to Fastify; `resolveTenant` runs on `onRequest` (`Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`).
3. `enforceSubscriptionAccess` runs on `preHandler` (`Pulpy_Reporting_Portal_Backend/src/middleware/subscriptionAccess.js`).
4. Route plugin applies `authenticateAdmin` where registered (e.g. `Pulpy_Reporting_Portal_Backend/src/routes/reports.js`).
5. Controller method reads `tenantId` via `getTenantIdFromRequest`, calls service.
6. Service queries MySQL (and optionally Redis) and returns data; controller sends JSON.

**Public tracking click:**

1. GET/HEAD `/click` hits `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` → `trackingController.handleClick`.
2. Service layer enqueues or writes to Redis stream / hashes as designed; click worker process drains stream and persists to MySQL (`Pulpy_Reporting_Portal_Backend/src/workers/redisWorker.js`, `Pulpy_Reporting_Portal_Backend/click-worker.js`).

**State Management:**
- **Server:** Request-scoped (`request.tenantId`, `request.tenant`, flags like `request.isAdminSubdomain`); no shared in-memory tenant state across requests.
- **Client:** React Context for auth, theme, toast, refresh (`Pulpy_Reporting_Portal_frontend/src/context/*`); `localStorage` for user snapshot and token coordination (`Pulpy_Reporting_Portal_frontend/src/services/api.js`).

## Key Abstractions

**Fastify route plugin:**
- Purpose: Group routes and prefixes; optional per-plugin hooks.
- Examples: `Pulpy_Reporting_Portal_Backend/src/routes/reports.js`, `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js`
- Pattern: `export default async function routes(fastify, options) { ... }`

**Tenant resolution service:**
- Purpose: Resolve slug → tenant record (Redis/DB strategy encapsulated).
- Examples: `Pulpy_Reporting_Portal_Backend/src/services/tenantResolutionService.js`, invoked from `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`

**Tenant-scoped controller helper:**
- Purpose: Single place to read `tenantId` from the enriched request.
- Examples: `getTenantIdFromRequest` in `Pulpy_Reporting_Portal_Backend/src/utils/tenantScope.js`, used in `Pulpy_Reporting_Portal_Backend/src/controllers/reportController.js`

**Secure error surface:**
- Purpose: Central error handler and helpers that log server-side detail but return minimal payloads by endpoint type (tracking vs API).
- Examples: `Pulpy_Reporting_Portal_Backend/src/middleware/errorHandler.js`, `Pulpy_Reporting_Portal_Backend/src/utils/secureErrors.js`

## Entry Points

**API server:**
- Location: `Pulpy_Reporting_Portal_Backend/src/server.js`
- Triggers: `node src/server.js` or `npm run dev` / PM2 `script: src/server.js`
- Responsibilities: Register plugins and routes; listen on `PORT`; optionally start in-process workers if `START_WORKERS_WITH_API=true` (see file tail).

**Click worker:**
- Location: `Pulpy_Reporting_Portal_Backend/click-worker.js`
- Triggers: `npm run worker:click`, PM2 `click-worker`
- Responsibilities: Run `redisWorker` and backfill worker (`Pulpy_Reporting_Portal_Backend/src/workers/redisWorker.js`, `Pulpy_Reporting_Portal_Backend/src/workers/clickBackfillWorker.js`)

**Frontend SPA:**
- Location: `Pulpy_Reporting_Portal_frontend/src/main.jsx` → `Pulpy_Reporting_Portal_frontend/src/App.jsx`
- Triggers: Vite `index.html` loads bundled app (`npm run dev` in frontend package)
- Responsibilities: Router, auth-gated layout, page composition

**Database migrations:**
- Location: `Pulpy_Reporting_Portal_Backend/src/db/migrate.js` (invoked via `npm run migrate` from backend `package.json`)

## Error Handling

**Strategy:** Fastify `setErrorHandler` delegates to `Pulpy_Reporting_Portal_Backend/src/middleware/errorHandler.js`, which uses `secureErrors` to classify tracking vs API responses and log diagnostics with `Pulpy_Reporting_Portal_Backend/src/utils/logger.js`.

**Patterns:**
- Validation: Joi middleware returns 400 with structured `details` (`Pulpy_Reporting_Portal_Backend/src/middleware/validate.js`); Fastify validation errors are mapped in `errorHandler`.
- Controllers: try/catch with `createErrorResponse` or `reply.code(...).send(...)` where used.

## Cross-Cutting Concerns

**Logging:** `pino` via Fastify logger and `Pulpy_Reporting_Portal_Backend/src/utils/logger.js`; request/response hooks in `Pulpy_Reporting_Portal_Backend/src/middleware/requestLogger.js`.

**Validation:** Joi in `validate` middleware; route-level `preHandler` chains.

**Authentication:** JWT/cookie patterns in `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`; admin-only routes register `authenticateAdmin`.

**Multi-tenancy:** Subdomain-only resolution in `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`; subscription enforcement in `Pulpy_Reporting_Portal_Backend/src/middleware/subscriptionAccess.js`.

---

*Architecture analysis: 2026-04-03*
