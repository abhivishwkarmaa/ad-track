# Roadmap: Pulpy Ad Track

## Milestones

- ✅ **v1.0 Engineering hardening** — Phases 1–5 (shipped 2026-04-03). Full detail: [`.planning/milestones/v1.0-ROADMAP.md`](milestones/v1.0-ROADMAP.md)
- 📋 **vNext** — Not started. Define scope via `/gsd-new-milestone` or manual planning in `.planning/PROJECT.md`.

## Shipped: v1.0 Engineering hardening

Brownfield milestone: production security, data and pool correctness, operations (port, rate limits), maintainability documentation for offer modules and service extraction, and automated checks for affiliate postback policy. Requirement families: **SEC → DATA → OPS → MAINT → QA**.

<details>
<summary>Phase checklist (v1.0)</summary>

- [x] **Phase 1:** Production security hardening — JWT fail-fast, CORS allowlist, gated debug and test-postback routes
- [x] **Phase 2:** Data correctness and pool safety — `(tenant_id, url_key)` uniqueness path, `multipleStatements: false` on app pool
- [x] **Phase 3:** Operations and abuse mitigation — Docker `PORT`/`EXPOSE` alignment, per-route-class rate limiting
- [x] **Phase 4:** Maintainability — offer module documentation, service extraction backlog
- [x] **Phase 5:** Quality — `affiliatePostbackPolicy` + Jest; reporting regression checklist in docs

</details>

## Next milestone

Add phases here when the next product or engineering goals are chosen. Requirements live in `.planning/REQUIREMENTS.md` (reset after v1.0; fill on kickoff).

## Progress (v1.0 — historical)

| Phase | Milestone | Plans / notes | Status | Completed |
|-------|-----------|---------------|--------|-----------|
| 1. Production security hardening | v1.0 | Phase plan `01-PLAN.md` | Complete | 2026-04-03 |
| 2. Data correctness and pool safety | v1.0 | Executed (no separate PLAN for later waves) | Complete | 2026-04-03 |
| 3. Operations and abuse mitigation | v1.0 | Same | Complete | 2026-04-03 |
| 4. Maintainability and module boundaries | v1.0 | Same | Complete | 2026-04-03 |
| 5. Quality and high-risk verification | v1.0 | Same | Complete | 2026-04-03 |

---
*Last updated: 2026-04-03 — v1.0 milestone archived; living roadmap collapsed to milestones view*
