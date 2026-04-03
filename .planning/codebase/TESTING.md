# Testing Patterns

**Analysis Date:** 2026-04-03

## Test Framework

**Runner:**
- Jest `^29.7.0` with `@jest/globals` explicit imports
- ESM: tests run via `node --experimental-vm-modules node_modules/jest/bin/jest.js` (see `Pulpy_Reporting_Portal_Backend/package.json` scripts)

**Config:**
- `Pulpy_Reporting_Portal_Backend/jest.config.js` (ESM `export default`)
  - `testEnvironment: 'node'`
  - `transform: {}` (no TS/Babel transform)
  - `moduleNameMapper`: maps `*.js` imports for extension resolution
  - `testMatch: ['**/tests/**/*.test.js']` — only files under `tests/` ending in `.test.js`
  - `collectCoverageFrom`: `src/**/*.js` excluding `src/tests/**` and `src/db/migrations/**`

**Assertion library:**
- Jest built-in (`expect`)

**Run commands (backend):**
```bash
cd Pulpy_Reporting_Portal_Backend && npm test              # all Jest tests
cd Pulpy_Reporting_Portal_Backend && npm run test:watch     # watch mode
```

**Frontend:**
- No `test` script in `Pulpy_Reporting_Portal_frontend/package.json` — automated UI/unit tests not configured in that package

## Test File Organization

**Location:**
- Backend: `Pulpy_Reporting_Portal_Backend/src/tests/*.test.js` (matches Jest `testMatch`)

**Naming:**
- `*.test.js` for Jest suites
- Other scripts in the same folder are **not** picked up by Jest: e.g., `tenant-routes.test.js` is documented as a manual script (`node src/tests/tenant-routes.test.js`), uses `axios` against a live server — naming overlaps with Jest pattern but content is a standalone runner, not `describe`/`it`

**Structure:**
```
Pulpy_Reporting_Portal_Backend/src/tests/
├── admin.test.js
├── tracking.test.js
├── multi-tenant.test.js
├── subscription.test.js
├── tenant-routes.test.js    # manual HTTP script (misleading name vs Jest usage)
└── ... (loadtest, throughput, verify scripts — not Jest)
```

## Test Structure

**Suite organization (Jest API tests):**
```javascript
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import someRoutes from '../routes/some.js';
import pool from '../db/connection.js';

describe('Feature API Tests', () => {
  let app;
  beforeAll(async () => {
    app = Fastify();
    await app.register(someRoutes, { prefix: '/api/...' });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  it('should ...', async () => {
    const response = await app.inject({ method, url, headers, payload });
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.success).toBe(true);
  });
});
```

**Patterns:**
- **HTTP testing:** Prefer Fastify `app.inject()` over `supertest` — `supertest` is listed in `devDependencies` but not used in the inspected test files
- **Database:** Tests use real `mysql2` pool from `db/connection.js`; setup inserts rows with `?` placeholders; teardown deletes and `pool.end()` in `afterAll`
- **Auth:** Basic auth header built with `Buffer.from('user:pass').toString('base64')` in `admin.test.js` — credentials are inline test data

**Multi-tenant suite (`multi-tenant.test.js`):**
- Uses `describe` / `test` from `@jest/globals`
- Constants at top for tenant and user fixtures; `beforeAll` seeds DB via `pool.query`

## Mocking

**Framework:** Jest available — inspected API tests do **not** mock DB or HTTP; they integration-test Fastify + MySQL

**Patterns:**
- Not applicable for the main `.test.js` suites — no `jest.mock()` pattern observed in the sampled files

**What to mock:**
- Not established as a project convention for backend — current style is integration-oriented

**What NOT to mock:**
- When extending these tests, match existing pattern: real pool and real route registration unless introducing a dedicated unit-test folder with a different config

## Fixtures and Factories

**Test data:**
- Inline SQL `INSERT` statements with unique emails/slugs (`Date.now()`, fixed test emails)
- Per-suite IDs stored in closure variables (`publisherId`, `offerId`, `testTenantId`)

**Location:**
- Co-lated in each test file; no central `fixtures/` or `factories/` directory detected

## Coverage

**Requirements:** None enforced in CI config from this analysis (no coverage gate referenced in `jest.config.js` beyond `collectCoverageFrom`)

**View coverage (typical Jest):**
```bash
cd Pulpy_Reporting_Portal_Backend && npx jest --coverage
```
(Add `--experimental-vm-modules` if invoking `node` directly the same way as `npm test`.)

## Test Types

**Unit tests:**
- Limited — `subscription.test.js` targets `subscriptionService` methods with DB backing (service-level integration)

**Integration tests:**
- Primary style: Fastify + routes + MySQL (`admin.test.js`, `tracking.test.js`, `multi-tenant.test.js`)

**E2E tests:**
- Not applicable in repo — `tenant-routes.test.js` is a manual axios script against `localhost:5001`, not a framework E2E runner

## Common Patterns

**Async testing:**
- `async` `it` blocks; `await app.inject(...)`; `await pool.query(...)`

**Error testing:**
- Assert `response.statusCode` and parse JSON body for `success` / error shape

## Known inconsistencies (for implementers)

- **`subscription.test.js` imports:** Uses `../src/db/connection.js` and `../src/services/...` from `src/tests/` — those paths resolve incorrectly (should be `../db/connection.js` and `../services/...`). Fix imports if the suite is run and fails to resolve modules.
- **`admin.test.js` / `tracking.test.js`:** Use SQL idioms such as `RETURNING id` in some snippets while `connection.js` is MySQL (`mysql2`) — verify tests against the actual DB dialect before relying on CI.
- **Manual scripts vs Jest:** Files under `src/tests/` that are not `describe`/`it` suites should ideally be renamed (e.g., `tenant-routes.manual.js`) or moved out of `testMatch` to avoid confusion.

---

*Testing analysis: 2026-04-03*
