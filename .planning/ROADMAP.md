# Roadmap: Pulpy Ad Track (brownfield milestone)

## Overview

This milestone hardens production security, tightens data and operational correctness, improves maintainability of high-churn backend modules, and locks in automated verification on the highest-risk paths (postbacks, reporting). Phases follow requirement families: **SEC → DATA → OPS → MAINT → QA**.

## Phases

**Phase Numbering:** Integer phases only for this milestone.

- [ ] **Phase 1: Production security hardening** — JWT, CORS, debug routes, and test-only surfaces safe in production
- [ ] **Phase 2: Data correctness & pool safety** — Offer URL-key rules and MySQL pool configuration
- [ ] **Phase 3: Operations & abuse mitigation** — Docker/port alignment and route-class rate limiting
- [ ] **Phase 4: Maintainability & module boundaries** — Offer domain clarity and extraction plan for large services
- [ ] **Phase 5: Quality & high-risk verification** — Postback/conversion tests and reporting regression coverage

## Phase Details

### Phase 1: Production security hardening
**Goal**: Production deployments cannot run with unsafe JWT defaults, permissive CORS with credentials, or publicly reachable debug/test surfaces.
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04
**Success Criteria** (what must be TRUE):
  - With `NODE_ENV=production`, the process **does not start** (or fails fast) if admin/tenant JWT secrets are missing or match known placeholder values.
  - In production, **only explicitly allowlisted** admin/tenant origins receive credentialed CORS responses; arbitrary origins cannot use `origin: true` with credentials.
  - **Debug/diagnostic HTTP routes** (e.g. Redis/click/worker debug) are **unreachable** from the public internet in production unless gated by config (disabled, admin-only, or IP allowlist as designed).
  - **`/api/test-postback`** (or equivalent) is **disabled by default** in production and only works when explicitly enabled via configuration.
**Plans**: TBD

### Phase 2: Data correctness & pool safety
**Goal**: Offer URL keys behave per product rules, and the app MySQL pool cannot execute multi-statement abuse paths.
**Depends on**: Phase 1
**Requirements**: DATA-01, DATA-02
**Success Criteria** (what must be TRUE):
  - **Uniqueness** of `(tenant_id, url_key)` (or the chosen product rule) is **documented**, **enforced** in the database, and **API errors** align when duplicates are attempted.
  - The **application** MySQL pool uses **`multipleStatements: false`**, with any exception path for migrations/scripts **documented** and kept separate from the app pool.
**Plans**: TBD

### Phase 3: Operations & abuse mitigation
**Goal**: Deployments and operators have one clear story for ports/containers, and high-volume routes are not trivially abusable without mitigation.
**Depends on**: Phase 2
**Requirements**: OPS-01, OPS-02
**Success Criteria** (what must be TRUE):
  - **Dockerfile `EXPOSE`**, application **default port**, and **documented env** are **aligned** and point to a **single source of truth** operators can follow.
  - **Rate limiting** has been **reviewed and applied** per route class (tracking, postback, event) so trivial abuse cannot exhaust DB/Redis without **edge or app-tier** mitigation.
**Plans**: TBD

### Phase 4: Maintainability & module boundaries
**Goal**: Offer-domain code has one clear pattern, and the largest service files have a credible, phased extraction plan without behavior regressions.
**Depends on**: Phase 3
**Requirements**: MAINT-01, MAINT-02
**Success Criteria** (what must be TRUE):
  - The **offer domain** has a **single canonical module** (or **documented facade**), and `offer.service.js` vs `offerService.js` style duplication is **resolved or explicitly exported** so contributors know where to change behavior.
  - **Largest service modules** have a **written phased plan** to extract helpers/submodules, **starting from the highest-churn area** (e.g. postback/tracking/report), with **no intentional behavior regressions**.
**Plans**: TBD

### Phase 5: Quality & high-risk verification
**Goal**: Automated tests guard conversion→postback policy and at least one complex reporting path.
**Depends on**: Phase 4
**Requirements**: QA-01, QA-02
**Success Criteria** (what must be TRUE):
  - **Characterization or integration tests** prove **postback fires only** when conversion status is **`approved`**, and **idempotency safeguards** are asserted for approved postbacks.
  - **Reporting filters / admin report APIs** have **regression coverage** for **at least one representative complex query path** in `reportService`-related flows.
**Plans**: TBD

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Production security hardening | 1/1 | Planned | - |
| 2. Data correctness & pool safety | 0/TBD | Not started | - |
| 3. Operations & abuse mitigation | 0/TBD | Not started | - |
| 4. Maintainability & module boundaries | 0/TBD | Not started | - |
| 5. Quality & high-risk verification | 0/TBD | Not started | - |
