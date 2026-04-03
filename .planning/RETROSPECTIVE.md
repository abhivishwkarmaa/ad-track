# Retrospective

## Milestone: v1.0 — Engineering hardening

**Shipped:** 2026-04-03  
**Phases:** 5 | **Focus:** Brownfield security, data, ops, maintainability, QA

### What was built

Production JWT and CORS hardening; gated debug and test surfaces; MySQL pool and offer URL-key constraints; Docker port alignment; route-class rate limiting; documentation for offer modules and large-service extraction; centralized affiliate postback policy with unit tests.

### What worked

- Grounding planning in `.planning/codebase/` before coding reduced surprise refactors.
- Shared `getAffiliatePostbackDecision` kept postback rules consistent with workspace policy.
- Small, reviewable migrations (011, 014) with service-layer handling for duplicate keys.

### What was inefficient

- Full Jest suite depends on a clean DB; local duplicate-user noise blocked “all green” without environment hygiene.
- GSD `milestone complete` CLI miscounted phases/plans; milestones entry was corrected manually in `MILESTONES.md`.

### Patterns established

- Explicit `rateLimits` per route class; fail-fast secrets in production; conversion postback firing only for `approved` (enforced in policy + tests).

### Key lessons

- Validate CLI arguments (`milestone complete` needs a real version string, not `--help`).
- Keep living `ROADMAP.md` short after ship; full detail belongs under `.planning/milestones/`.

---

## Cross-milestone trends

| Milestone | Theme | Notes |
|-----------|--------|--------|
| v1.0 | Engineering hardening | Brownfield; no greenfield rewrite |
