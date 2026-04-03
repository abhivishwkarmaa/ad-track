# Reporting regression testing

`reportService.js` builds dynamic SQL for admin reports. Automated coverage for every branch is deferred; use this checklist before releases:

1. **Tenant scope** — run a report as tenant A; confirm no rows from tenant B (same filters).
2. **Date range** — boundary: start/end of day in configured timezone; empty range returns empty set, not error.
3. **Export** — same filters as on-screen table; row counts match.

Add Jest integration tests when a stable `buildReport*` API is extracted from `reportService.js`.
