# Codebase Structure

**Analysis Date:** 2026-04-03

## Directory Layout

```
ad-track/
├── Pulpy_Reporting_Portal_Backend/    # Node ESM Fastify API, workers, DB scripts
│   ├── src/
│   │   ├── server.js                  # HTTP entry: Fastify app + routes
│   │   ├── routes/                    # Route plugins (HTTP → controller)
│   │   ├── controllers/               # Request/response adapters
│   │   ├── services/                  # Business logic, SQL, Redis
│   │   ├── middleware/                # auth, tenant, validate, errors, logging
│   │   ├── validators/                # Joi schemas for HTTP inputs
│   │   ├── schemas/                   # Domain-oriented schemas (e.g. offer)
│   │   ├── db/                        # connection pool, migrate.js, migrations/*.sql
│   │   ├── config/                    # redis (and related) config
│   │   ├── workers/                   # stream consumers, aggregation workers
│   │   ├── utils/                     # logger, tenantScope, secureErrors, parsers
│   │   └── tests/                     # Jest tests and manual scripts
│   ├── click-worker.js                # Process entry: click stream worker
│   ├── conversion-worker.js           # Process entry: conversion worker
│   ├── event-worker.js                # Process entry: event worker
│   ├── stats-worker.js                # Process entry: stats worker
│   ├── redis-hygiene-worker.js        # Hygiene worker entry
│   ├── ecosystem.config.cjs           # PM2 process definitions
│   ├── jest.config.js                 # Jest configuration
│   └── package.json                   # Scripts: dev, start, migrate, workers, test
├── Pulpy_Reporting_Portal_frontend/   # Vite + React 19 SPA
│   ├── index.html                     # Vite HTML shell
│   ├── vite.config.js                 # Dev server + API/tracking proxy
│   ├── eslint.config.js
│   └── src/
│       ├── main.jsx                   # React root
│       ├── App.jsx                    # Router + providers + route table
│       ├── index.css, App.css
│       ├── components/                # Layout, UI primitives, feature widgets
│       ├── pages/                     # Screen-level routes (Dashboard, Offer, …)
│       ├── context/                   # Auth, theme, toast, refresh, data
│       ├── hooks/                     # useReports, useOffers, etc.
│       ├── services/                  # api.js (fetch wrapper, auth, relative /api)
│       └── utils/                     # dates, timezone, activity, subscription helpers
└── .planning/                         # GSD / planning artifacts (this folder)
```

## Directory Purposes

**`Pulpy_Reporting_Portal_Backend/src/routes/`:**
- Purpose: Define HTTP surface area and wire middleware + controllers.
- Contains: One file per domain area (`auth.js`, `reports.js`, `tracking.js`, `offer.routes.js`, …).
- Key files: `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` (public tracking), `Pulpy_Reporting_Portal_Backend/src/routes/reports.js` (admin reports under `/api/admin/reports` prefix from `server.js`).

**`Pulpy_Reporting_Portal_Backend/src/controllers/`:**
- Purpose: Per-area HTTP handlers; keep thin: validate inputs, call services, return JSON.
- Contains: `*Controller.js` classes or default exports.
- Key files: `Pulpy_Reporting_Portal_Backend/src/controllers/trackingController.js`, `Pulpy_Reporting_Portal_Backend/src/controllers/reportController.js`, `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js`

**`Pulpy_Reporting_Portal_Backend/src/services/`:**
- Purpose: Core domain and integration logic (MySQL, Redis, email, postbacks).
- Contains: Many `*.js` and a few `*.service.js` files (e.g. `offer.service.js`, `advertiser.service.js`).
- Key files: `Pulpy_Reporting_Portal_Backend/src/services/reportService.js`, `Pulpy_Reporting_Portal_Backend/src/services/trackingService.js`, `Pulpy_Reporting_Portal_Backend/src/services/postbackService.js`

**`Pulpy_Reporting_Portal_Backend/src/middleware/`:**
- Purpose: Cross-cutting request processing: authentication, tenant, subscription gate, Joi validation, errors.
- Key files: `Pulpy_Reporting_Portal_Backend/src/middleware/tenant.js`, `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`, `Pulpy_Reporting_Portal_Backend/src/middleware/subscriptionAccess.js`, `Pulpy_Reporting_Portal_Backend/src/middleware/validate.js`, `Pulpy_Reporting_Portal_Backend/src/middleware/errorHandler.js`

**`Pulpy_Reporting_Portal_Backend/src/db/`:**
- Purpose: MySQL pool and schema evolution.
- Contains: `connection.js`, `migrate.js`, SQL under `migrations/`, ad-hoc cleanup scripts.
- Key files: `Pulpy_Reporting_Portal_Backend/src/db/connection.js`, `Pulpy_Reporting_Portal_Backend/src/db/migrate.js`

**`Pulpy_Reporting_Portal_Backend/src/workers/`:**
- Purpose: Long-running consumers and batch jobs (not the same process as API in typical PM2 setup).
- Key files: `Pulpy_Reporting_Portal_Backend/src/workers/redisWorker.js`, `Pulpy_Reporting_Portal_Backend/src/workers/conversionWorker.js`, `Pulpy_Reporting_Portal_Backend/src/workers/statsWorker.js`

**`Pulpy_Reporting_Portal_frontend/src/pages/`:**
- Purpose: Top-level screens matched by React Router.
- Contains: Subfolders per feature (`Dashboard/`, `Offer/`, `Affiliate/`, `Tenant/`, `Reports/`, …).

**`Pulpy_Reporting_Portal_frontend/src/components/`:**
- Purpose: Shared layout (`Layout/`), reusable UI (`Skeleton/`, `TimelineFilter/`, …).

**`Pulpy_Reporting_Portal_frontend/src/context/`:**
- Purpose: Global React state: auth session, theme, notifications, refresh triggers.

## Key File Locations

**Entry Points:**
- `Pulpy_Reporting_Portal_Backend/src/server.js`: Fastify API process.
- `Pulpy_Reporting_Portal_Backend/click-worker.js`, `Pulpy_Reporting_Portal_Backend/conversion-worker.js`, `Pulpy_Reporting_Portal_Backend/event-worker.js`, `Pulpy_Reporting_Portal_Backend/stats-worker.js`: Worker processes.
- `Pulpy_Reporting_Portal_frontend/src/main.jsx`: SPA bootstrap.
- `Pulpy_Reporting_Portal_frontend/index.html`: Vite entry HTML.

**Configuration:**
- `Pulpy_Reporting_Portal_Backend/ecosystem.config.cjs`: PM2 app names, ports, worker scripts.
- `Pulpy_Reporting_Portal_Backend/src/config/redis.js`: Redis client wiring (referenced across app).
- `Pulpy_Reporting_Portal_frontend/vite.config.js`: Port 5173, proxy rules preserving Host for tenant subdomains.
- Environment: `.env` at backend root (existence only; do not commit secrets)—loaded via `dotenv` in `server.js` and workers.

**Core Logic:**
- `Pulpy_Reporting_Portal_Backend/src/services/`: Primary business implementation.
- `Pulpy_Reporting_Portal_frontend/src/services/api.js`: Central `fetch` layer for `/api` and session handling.

**Testing:**
- `Pulpy_Reporting_Portal_Backend/jest.config.js`: Jest (ESM) settings.
- `Pulpy_Reporting_Portal_Backend/src/tests/*.test.js`: Example API tests; other `src/tests` files may be manual/load scripts.

## Naming Conventions

**Files:**
- Backend routes: `*.js` or `*.routes.js` (e.g. `offer.routes.js`, `advertiser.routes.js`).
- Backend services: mostly `*Service.js` or `*.service.js` (mixed convention—match neighboring files when adding code).
- Backend controllers: `*Controller.js`.
- Frontend: `PascalCase.jsx` for pages and components; `camelCase.js` for utilities and `api.js`.

**Directories:**
- Backend: plural layer folders (`routes`, `controllers`, `services`, `middleware`).
- Frontend: plural `components`, `pages`, `hooks`, `context`.

## Where to Add New Code

**New Feature (backend HTTP API):**
- Primary code: New or extended route in `Pulpy_Reporting_Portal_Backend/src/routes/`; controller in `Pulpy_Reporting_Portal_Backend/src/controllers/`; service in `Pulpy_Reporting_Portal_Backend/src/services/`; Joi schema in `Pulpy_Reporting_Portal_Backend/src/validators/` if needed.
- Register route in `Pulpy_Reporting_Portal_Backend/src/server.js` with correct `prefix` and middleware expectations (tenant vs admin).

**New Feature (frontend screen):**
- Implementation: Page under `Pulpy_Reporting_Portal_frontend/src/pages/<Feature>/`; shared UI under `Pulpy_Reporting_Portal_frontend/src/components/`.
- Routing: Add `<Route>` in `Pulpy_Reporting_Portal_frontend/src/App.jsx` inside the authenticated `Layout` tree as appropriate.
- API calls: Extend `Pulpy_Reporting_Portal_frontend/src/services/api.js` or add a small module under `src/services/` if the surface area grows.

**New Worker or batch job:**
- Worker logic: `Pulpy_Reporting_Portal_Backend/src/workers/<name>.js`.
- Process entry: New root-level `*.js` next to `click-worker.js` if a standalone process is required; register in `ecosystem.config.cjs` for PM2.

**Utilities:**
- Shared backend helpers: `Pulpy_Reporting_Portal_Backend/src/utils/` (prefer existing `tenantScope.js`, `secureErrors.js` patterns).
- Shared frontend helpers: `Pulpy_Reporting_Portal_frontend/src/utils/`.

**Database schema change:**
- Add SQL under `Pulpy_Reporting_Portal_Backend/src/db/migrations/` and wire execution through `Pulpy_Reporting_Portal_Backend/src/db/migrate.js` or project-specific migration runners already in `src/db/`.

## Special Directories

**`Pulpy_Reporting_Portal_Backend/src/db/migrations/`:**
- Purpose: Versioned SQL and occasional dump references.
- Generated: No (hand-maintained).
- Committed: Yes.

**`Pulpy_Reporting_Portal_Backend/logs/` (if present on deploy):**
- Purpose: PM2 log paths configured in `ecosystem.config.cjs`.
- Generated: Yes (runtime).
- Committed: Typically no—confirm `.gitignore` in repo.

**`.planning/`:**
- Purpose: Planning and codebase reference docs for GSD workflows.
- Generated: By planning tooling / mappers.
- Committed: Per team policy; maps reference this tree.

---

*Structure analysis: 2026-04-03*
