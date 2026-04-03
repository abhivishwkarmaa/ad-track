# v1 Requirements — Pulpy Ad Track

**Source:** Brownfield initialization from `.planning/PROJECT.md` and `.planning/codebase/CONCERNS.md`.  
**Scope:** Near-term product and engineering outcomes for this milestone (security, maintainability, reliability).

## v1 Requirements

### Security & production hardening

- [ ] **SEC-01**: Process **fails fast at startup** if admin/tenant JWT secrets are missing or equal to known placeholder values in production (`NODE_ENV=production`).
- [ ] **SEC-02**: **CORS** is restricted to an explicit allowlist of admin/tenant origins in production (no `origin: true` with credentials for arbitrary origins).
- [ ] **SEC-03**: **Debug/diagnostic HTTP routes** (e.g. Redis/click/worker debug) are **disabled or admin/IP-gated** in production via configuration.
- [ ] **SEC-04**: **`/api/test-postback`** (or equivalent test-only surface) is **off by default** in production or requires explicit env to enable.

### Data & correctness

- [ ] **DATA-01**: Document and enforce **`(tenant_id, url_key)`** (or product-chosen) uniqueness for offers if the product requires no duplicate URL keys per tenant; migration + API errors aligned.
- [ ] **DATA-02**: **MySQL pool** uses `multipleStatements: false` for the application pool unless a documented exception path exists (migrations/scripts separate).

### Reliability & operations

- [ ] **OPS-01**: **Dockerfile / PORT / EXPOSE** and application default port are **documented and aligned** (single source of truth in docs and env).
- [ ] **OPS-02**: **Rate limiting** is reviewed per route class (tracking, postback, event) so abuse cannot trivially exhaust DB/Redis without edge or app-tier mitigation.

### Maintainability

- [ ] **MAINT-01**: **Offer domain** has a **single canonical module** (or documented facade); `offer.service.js` vs `offerService.js` confusion reduced via consolidation or explicit exports.
- [ ] **MAINT-02**: **Largest service modules** have a phased extraction plan (helpers/submodules) starting with the highest-churn area (e.g. postback/tracking/report), without behavior regressions.

### Quality & verification

- [ ] **QA-01**: **Characterization tests** (or integration tests) cover **conversion status → postback** behavior: postback fires only when status is **approved**; idempotency safeguards asserted.
- [ ] **QA-02**: **Reporting filters / admin report APIs** have regression coverage for at least one representative complex query path in `reportService`-related flows.

## v2 (deferred)

- Broader **frontend** migration from legacy date helpers (`formatDateISTLegacy` callers) — after grep-based audit
- **PM2 / worker** topology documentation as code (ecosystem file vs runbooks) — nice-to-have
- **Structured logging** replacement for decorative `connection.js` startup noise — can pair with MAINT work

## Out of Scope

- **Replacing** MySQL with another primary store — not in v1
- **New attribution model** (e.g. SKAdNetwork-only) — product roadmap, not this engineering milestone
- **Full test coverage** of every route — aspirational; v1 targets high-risk paths only

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| DATA-01 | Phase 2 | Pending |
| DATA-02 | Phase 2 | Pending |
| OPS-01 | Phase 3 | Pending |
| OPS-02 | Phase 3 | Pending |
| MAINT-01 | Phase 4 | Pending |
| MAINT-02 | Phase 4 | Pending |
| QA-01 | Phase 5 | Pending |
| QA-02 | Phase 5 | Pending |

---
*Last updated: 2026-04-03*
