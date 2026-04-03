# Phase 1 — Implementation summary

**Date:** 2026-04-03

## New / updated environment variables

| Variable | Role |
|----------|------|
| `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, `JWT_SECRET` | Documented in `.env.example`; production startup fails if effective values are missing or placeholder (see `src/config/secrets.js`). |
| `CORS_ORIGINS` | **Required in production:** comma-separated allowed browser origins. Non-prod defaults include Vite `5173` plus any extra origins from this list. |
| `ENABLE_TRACKING_DEBUG_ROUTES` | `true` or `1` enables `/debug/clicks`, `/debug/validate/*`, `/debug/worker-status` in production. |
| `ENABLE_TEST_POSTBACK_ROUTES` | `true` registers `/api/test-postback` in production (always registered in non-production). |

## Files touched

- `src/config/secrets.js` (new)
- `src/server.js`, `src/middleware/auth.js`, `src/controllers/authController.js`
- `src/routes/tracking.js`, `src/middleware/tenant.js`
- `.env.example`

## Operator checklist

1. Set strong JWT secrets and `CORS_ORIGINS` before `NODE_ENV=production`.
2. Leave debug and test-postback flags off in production unless needed.
3. Restart API process after env changes.
