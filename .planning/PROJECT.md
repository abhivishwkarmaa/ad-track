# Pulpy Ad Track (Reporting Portal)

## What This Is

A **multi-tenant ad tracking and reporting platform**: a **Fastify** API plus **Redis-backed workers** record clicks, events, impressions, and conversions; **publishers** get postbacks; **tenant admins** use a **React (Vite)** SPA for offers, reporting, dashboards, and subscription-gated features. Tenants are resolved from **subdomains** (Host / `X-Forwarded-Host`), not client-supplied tenant headers.

## Core Value

**Accurate, tenant-isolated attribution and reporting** — clicks and conversions must be recorded and surfaced per tenant without cross-tenant leakage, with postbacks firing only when business rules (e.g. approved conversions) say so.

## Requirements

### Validated

- ✓ **Subdomain multi-tenancy** — tenant resolved from host; admin/API routes scoped per tenant — existing
- ✓ **Click and event tracking** — public routes (`/click`, `/event`, `/imp`, postbacks) with Redis streams and workers — existing
- ✓ **Admin JSON API** — Fastify routes → controllers → services; Joi validation — existing
- ✓ **React admin UI** — Vite dev proxy to API; authenticated pages and API client — existing
- ✓ **Reporting & dashboards** — MySQL-backed reports and dashboard services — existing
- ✓ **Auth** — JWT/cookies for admin; bcrypt + jsonwebtoken — existing
- ✓ **Persistence** — MySQL pool, migrations under `src/db/migrations/` — existing
- ✓ **Async processing** — dedicated worker entrypoints (click, conversion, event, stats, etc.) — existing
- ✓ **v1 engineering milestone (2026-04)** — production JWT/CORS/debug gates; tiered rate limits; Docker port alignment; `multipleStatements: false` pool; `(tenant_id, url_key)` uniqueness path; affiliate postback policy + unit tests; ops/maint/reporting docs

### Active

- [ ] **vNext milestone** — define product or engineering goals; replace placeholder `.planning/REQUIREMENTS.md` and extend `.planning/ROADMAP.md` after `/gsd-new-milestone` or manual planning

### Out of Scope

- **Greenfield rewrite** — replacing Fastify/React/MySQL/Redis stack without strong business trigger — defer unless explicitly approved
- **Non-subdomain tenancy** — path- or header-based tenant selection — not current product model; would need product decision

## Context

- **Monorepo layout:** `Pulpy_Reporting_Portal_Backend/` (Node 20, ESM), `Pulpy_Reporting_Portal_frontend/` (React 19, Vite 7). Independent `package.json` per app; root lockfile may exist without root `package.json`.
- **Codebase reference:** `.planning/codebase/` (STACK, ARCHITECTURE, INTEGRATIONS, STRUCTURE, CONVENTIONS, TESTING, CONCERNS) from `/gsd-map-codebase` on 2026-04-03.
- **Product docs:** additional backend markdown under `Pulpy_Reporting_Portal_Backend/docs/` and topic-specific files (subscriptions, deployment, API notes).

## Constraints

- **Tech stack:** JavaScript (ESM), Fastify, mysql2, ioredis, React — must stay compatible with production deployment and team skills
- **Multi-tenant isolation:** data and URL keys must remain tenant-scoped; changes to uniqueness or routing need migration and QA
- **Postback policy:** conversion postbacks only for approved status; non-approved must not fire publisher postbacks (see workspace regression guardrails)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Subdomain-based tenant resolution | Matches production routing and existing middleware | ✓ Good — established |
| Redis streams + separate worker processes | High-volume tracking off the API hot path | ✓ Good — established |
| Brownfield GSD init after codebase map | Planning grounded in actual repo | ✓ Good — v1 phases shipped |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):

1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):

1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-03 after v1.0 milestone archival and living roadmap/requirements reset*
