# External Integrations

**Analysis Date:** 2026-04-03

## APIs & External Services

**IP intelligence:**
- **ip-api.com** — HTTP JSON lookup for ISP/mobile fields; used in `Pulpy_Reporting_Portal_Backend/src/utils/ispLookup.js` via `axios.get` (1s timeout). No API key in code; subject to provider rate limits and availability.

**CDN / edge headers (optional):**
- **Cloudflare** — `CF-IPCountry` read as fallback country in `Pulpy_Reporting_Portal_Backend/src/utils/countryLookup.js` (`getCountryFromHeaders`). Not a direct API call; depends on deployment putting Cloudflare in front.

**Email delivery:**
- **SMTP** (provider-agnostic) — **Nodemailer** in `Pulpy_Reporting_Portal_Backend/src/services/emailService.js` using `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, plus contact routing via `CONTACT_ADMIN_EMAIL`. Defaults in code reference a common hosted SMTP host pattern; actual provider is environment-defined.

**Outbound publisher postbacks:**
- **HTTP/HTTPS** — Native Node `http` / `https` in `Pulpy_Reporting_Portal_Backend/src/services/postbackService.js` to fire callbacks to publisher-configured URLs (not a third-party SDK).

## Data Storage

**Databases:**
- **MySQL** — Primary application data via `mysql2/promise` pool in `Pulpy_Reporting_Portal_Backend/src/db/connection.js`. Connection parameters: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`. Migrations: `npm run migrate` → `Pulpy_Reporting_Portal_Backend/src/db/migrate.js`.

**File Storage:**
- Local filesystem only for application runtime; no cloud object SDK in `package.json`.

**Caching:**
- **Redis** — `ioredis` in `Pulpy_Reporting_Portal_Backend/src/config/redis.js` (`REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`). Used for streams, click hashes, hygiene/capacity workers, and related services.

## Authentication & Identity

**Auth Provider:**
- **Custom JWT + cookies** — No OAuth/SaaS IdP in dependencies. `jsonwebtoken` and HTTP-only cookies in `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js` and `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`. Secrets: `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`, with fallback to `JWT_SECRET` (defaults in code are placeholders; production must override).

**Password hashing:**
- **bcrypt** — `Pulpy_Reporting_Portal_Backend/src/services/publisherService.js` and related flows.

## Monitoring & Observability

**Error Tracking:**
- Not detected — no Sentry/Rollbar/etc. in `package.json`.

**Logs:**
- **Pino** — `Pulpy_Reporting_Portal_Backend/src/utils/logger.js`; level from `LOG_LEVEL`, pretty transport in development.

## CI/CD & Deployment

**Hosting:**
- Not defined in-repo — `Dockerfile` at `Pulpy_Reporting_Portal_Backend/Dockerfile` suggests container deployment; no `.github/workflows` found at repository root in this analysis.

**CI Pipeline:**
- Not detected in-repo for this snapshot.

## Environment Configuration

**Required env vars (typical full stack):**
- Database: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Redis: `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD` (if Redis auth enabled).
- Auth: `JWT_SECRET` and/or `ADMIN_JWT_SECRET`, `TENANT_JWT_SECRET`.
- Email (if sending): `SMTP_*`, `CONTACT_ADMIN_EMAIL` where used.
- Public URLs: `BASE_URL`, `TRACKING_BASE_URL`, tenant portal settings (`TENANT_BASE_DOMAIN`, `TENANT_PORTAL_PROTOCOL`, `TENANT_LOGIN_PATH`) in `emailService.js`.
- Server: `PORT`, `HOST`, `NODE_ENV`.

**Secrets location:**
- Local/ deployment `.env` or platform secret manager — never commit. Reference names only from `Pulpy_Reporting_Portal_Backend/.env.example` when documenting.

## Webhooks & Callbacks

**Incoming:**
- **Advertiser / network postbacks** — `GET`/`POST` `/postback` registered in `Pulpy_Reporting_Portal_Backend/src/routes/postback.js` → `postbackController.handlePostback` (rate limit disabled for this route in plugin config).
- **Tracking:** `/click`, `/imp`, `/event` in `Pulpy_Reporting_Portal_Backend/src/routes/tracking.js` (some routes disable global rate limit where configured).
- **Contact form** — under `/api` via `Pulpy_Reporting_Portal_Backend/src/routes/contact.js`.
- **Health:** `GET /health` in `Pulpy_Reporting_Portal_Backend/src/server.js`.

**Outgoing:**
- **Publisher postback URLs** — fired from `Pulpy_Reporting_Portal_Backend/src/services/postbackService.js` to URLs stored per publisher/assignment (macros, idempotency, and status rules implemented in service layer).
- **ISP lookup** — outbound GET to ip-api as above.

---

*Integration audit: 2026-04-03*
