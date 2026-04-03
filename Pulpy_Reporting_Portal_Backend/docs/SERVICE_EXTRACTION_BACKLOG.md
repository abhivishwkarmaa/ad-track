# Large service extraction (backlog)

High-churn files are called out in `.planning/codebase/CONCERNS.md`. Suggested order when you have characterization tests:

1. **Postback** — extract URL building / macro substitution from `postbackService.js` into `src/lib/postback/` helpers.
2. **Tracking** — separate Redis stream writes vs DB fallbacks in `trackingService.js`.
3. **Reporting** — extract filter builders from `reportService.js` into `src/lib/reports/queryBuilders.js`.

Rules: no behavior change per phase; add tests before aggressive splits.
