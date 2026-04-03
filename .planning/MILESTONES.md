# Milestones

## v1.0 — Engineering hardening (shipped 2026-04-03)

**Name:** Engineering hardening  
**Phases:** 5 (integer phases 1–5)  
**Plans:** 1 formal phase plan (Phase 1 `01-PLAN.md`); phases 2–5 executed as brownfield waves with commits and docs.

**Key accomplishments:**

1. **Security:** Production JWT fail-fast, CORS allowlist, debug and `/api/test-postback` gated by configuration.
2. **Data:** Application MySQL pool `multipleStatements: false`; migration for `(tenant_id, url_key)` uniqueness; migration `011` for `daily_offer_stats` status columns.
3. **Operations:** Dockerfile and docs aligned on port **5000**; tiered rate limits by route class (`rateLimits.js`).
4. **Maintainability:** `OFFER_MODULES.md`, `SERVICE_EXTRACTION_BACKLOG.md`, and related ops/reporting docs.
5. **Quality:** Shared `affiliatePostbackPolicy` + Jest `affiliate-postback-policy.test.js`; reporting regression guidance in `REPORTING_TESTS.md`.

**Archives:**

- Roadmap snapshot: [`.planning/milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)
- Requirements snapshot: [`.planning/milestones/v1.0-REQUIREMENTS.md`](milestones/v1.0-REQUIREMENTS.md)
- Short summary: [`.planning/milestones/v1.0-engineering-hardening-ARCHIVE.md`](milestones/v1.0-engineering-hardening-ARCHIVE.md)

**Git tag:** `v1.0.0` (annotated on close-out commit)

---
