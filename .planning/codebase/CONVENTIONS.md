# Coding Conventions

**Analysis Date:** 2026-04-03

## Naming Patterns

**Files (Backend — `Pulpy_Reporting_Portal_Backend/src/`):**
- Single-purpose routes: `auth.js`, `admin.js`, `tracking.js` in `routes/`
- Multi-word or domain-scoped route modules: `offer.routes.js`, `advertiser.routes.js`
- Controllers: `authController.js` (PascalCase class export) alongside `offer.controller.js`, `advertiser.controller.js` (default export pattern)
- Services: `camelCaseService.js` (e.g., `subscriptionService.js`, `reportService.js`) and `*.service.js` for some domains (`offer.service.js`, `advertiser.service.js`)
- Validators: `*Validator.js` in `validators/`
- Schemas (Fastify/Joi-style): `*.schema.js` in `schemas/`
- Utilities: `camelCase.js` in `utils/`
- Workers: descriptive names in `workers/` (e.g., `conversionWorker.js`)

**Files (Frontend — `Pulpy_Reporting_Portal_frontend/src/`):**
- React pages: `PascalCase.jsx` under `pages/<Feature>/`
- Shared components: `PascalCase.jsx` under `components/<Name>/`
- Hooks: `use*.js` in `hooks/`
- Context: `*Context.jsx` in `context/`
- API client: `services/api.js`

**Functions:**
- camelCase for functions and methods (`initializeServer`, `validate`, `createErrorResponse`)
- Route handlers are often class methods on controllers (`AuthController.prototype` pattern via class export in `controllers/authController.js`)

**Variables:**
- camelCase for locals and request-scoped data
- SCREAMING_SNAKE for module-level config constants (e.g., JWT-related constants in `controllers/authController.js`)
- API JSON payloads and DB columns often use `snake_case` (e.g., `first_name`, `advertiser_revenue`) as returned/stored from the API and MySQL

**Types:**
- Not applicable (JavaScript codebase; `@types/*` packages exist for React/Jest typings only in respective packages)

## Code Style

**Formatting:**
- No Prettier or Biome config detected at repo root or in `Pulpy_Reporting_Portal_Backend/` or `Pulpy_Reporting_Portal_frontend/`
- Style is enforced only where ESLint applies (frontend)

**Linting:**
- **Frontend:** ESLint 9 flat config in `Pulpy_Reporting_Portal_frontend/eslint.config.js`
  - `files: ['**/*.{js,jsx}']`
  - Extends `@eslint/js` recommended, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` (Vite)
  - Custom rule: `'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }]` (allows unused vars matching uppercase/constant pattern)
- **Backend:** No ESLint in `Pulpy_Reporting_Portal_Backend/package.json`; no shared root lint config detected

**Module system:**
- Both apps use `"type": "module"` in their `package.json` — prefer `import`/`export` and `.js` extensions in import paths (backend consistently uses `.js` suffix in imports)

## Import Organization

**Order (observed in `Pulpy_Reporting_Portal_Backend/src/server.js` and controllers):**
1. External packages (`fastify`, `@fastify/*`, `dotenv`)
2. Local utilities and middleware (`./utils/logger.js`, `./middleware/errorHandler.js`)
3. Route modules (`./routes/*.js`)

**Path aliases:**
- Not detected — use relative paths such as `../db/connection.js`, `../services/subscriptionService.js`

**Frontend (`Pulpy_Reporting_Portal_frontend/src/`):**
- Relative imports; extension sometimes omitted for same-folder JS (`import x from '../utils/foo'`) and explicit `.jsx` for components where used (e.g., `main.jsx` imports `./App.jsx`)

## Error Handling

**Centralized Fastify hook:**
- Global error handler registered from `middleware/errorHandler.js` (`errorHandler`); uses `utils/secureErrors.js` for `createSecureErrorResponse`, domain errors (`ValidationError`, `TenantNotFoundError`, etc.), and endpoint classification (`isTrackingEndpoint`, `isApiEndpoint`)

**Patterns:**
- Map Fastify `error.validation` to HTTP 400 with structured validation details
- Map PostgreSQL-style codes (`23505`, `23503`, `23502`) and MySQL-style codes (`ER_DUP_ENTRY`, etc.) to 409/400 as appropriate
- Map JWT errors (`JsonWebTokenError`, `TokenExpiredError`) to 401
- Legacy/simple helpers in `utils/errorResponse.js`: `createErrorResponse`, `createSuccessResponse` (success payloads use `{ success: true, data, optional message }`)

**Validation:**
- **Joi:** `middleware/validate.js` exports `validate(schema)` — validates `query` for GET, `body` otherwise; `abortEarly: false`, `stripUnknown: true`; errors return `{ success: false, error, message, details, timestamp }`
- **Fastify JSON Schema:** Used alongside controllers in routes such as `routes/offer.routes.js` (`schema: { body: createOfferSchema }` with definitions in `schemas/offer.schema.js`)

**Controller-level:**
- Inline `reply.code(4xx).send({ success: false, error, message })` for simple validation failures (see `controllers/authController.js`)

## Logging

**Framework:** `pino` via `utils/logger.js`

**Patterns:**
- Logger passed into Fastify constructor in `server.js` (`logger` option)
- Level from `process.env.LOG_LEVEL` (default `info`)
- `pino-pretty` transport in development only (`NODE_ENV === 'development'`)
- Error path: `logErrorWithDetails` in `secureErrors.js` (used by `errorHandler`)

## Comments

**When to comment:**
- High-traffic or security-sensitive areas use block comments explaining invariants (e.g., `server.js` trust proxy, tenant resolution; `api.js` forbidding `VITE_API_URL` in production)
- Emoji markers (`✅`, `🔒`) appear in comments for scanability — follow existing files when touching the same areas

**JSDoc/TSDoc:**
- Sparse; some test files and scripts use JSDoc-style headers describing purpose (e.g., `src/tests/subscription.test.js`)

## Function Design

**Size:** Large service files exist (e.g., `services/reportService.js`); no enforced max line count

**Parameters:** Prefer destructuring from `request.body` / `request.query` in controllers; pass tenant/user context via `getTenantIdFromRequest` and similar helpers in `utils/tenantScope.js`

**Return values:** HTTP handlers use `reply.code().send()`; services return plain objects or DB results

## Module Design

**Exports:**
- **Default export:** Common for Fastify plugin functions, single controller instances, `logger`, `pool`
- **Named export:** `errorHandler`, `validate`, utility functions in `utils/`

**Barrel files:**
- Not a project-wide pattern — import from concrete modules

---

*Convention analysis: 2026-04-03*
