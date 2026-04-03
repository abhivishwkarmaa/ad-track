# Technology Stack

**Analysis Date:** 2026-04-03

## Languages

**Primary:**
- JavaScript (ES modules, `"type": "module"`) — entire backend (`Pulpy_Reporting_Portal_Backend/`) and frontend (`Pulpy_Reporting_Portal_frontend/`); no TypeScript source in either app (frontend includes `@types/react` / `@types/react-dom` for editor/type tooling only).

**Secondary:**
- SQL — migrations and queries via `mysql2` in `Pulpy_Reporting_Portal_Backend/src/db/`.

## Runtime

**Environment:**
- Node.js — backend `Pulpy_Reporting_Portal_Backend/package.json` scripts use `node` directly; `Pulpy_Reporting_Portal_Backend/Dockerfile` bases on `node:20-alpine`. No `engines` field in `package.json` to pin a minor version.

**Package Manager:**
- npm — lockfiles present: `Pulpy_Reporting_Portal_Backend/package-lock.json`, `Pulpy_Reporting_Portal_frontend/package-lock.json`. A root `package-lock.json` exists without a root `package.json` in-repo; treat backend and frontend as independent install roots.

## Frameworks

**Core:**
- **Fastify** `^4.26.2` — HTTP API and route registration in `Pulpy_Reporting_Portal_Backend/src/server.js`; plugins: `@fastify/cors`, `@fastify/cookie`, `@fastify/helmet`, `@fastify/rate-limit`.
- **React** `^19.2.0` + **React DOM** — SPA in `Pulpy_Reporting_Portal_frontend/src/`.
- **React Router** `react-router-dom` `^7.10.1` — client routing.

**Testing:**
- **Jest** `^29.7.0` — `Pulpy_Reporting_Portal_Backend/jest.config.js`, tests under `Pulpy_Reporting_Portal_Backend/src/tests/**/*.test.js`.
- **Supertest** `^7.0.0` — HTTP assertions in tests.

**Build/Dev:**
- **Vite** `^7.2.4` + `@vitejs/plugin-react` — dev server, HMR, production build for the frontend (`Pulpy_Reporting_Portal_frontend/vite.config.js`).
- **ESLint** `^9.39.1` — frontend lint (`Pulpy_Reporting_Portal_frontend/eslint.config.js`, script `lint` in `Pulpy_Reporting_Portal_frontend/package.json`).
- **PM2** `^6.0.14` — devDependency on backend; referenced in comments for worker processes (e.g. `Pulpy_Reporting_Portal_Backend/worker.js`).

## Key Dependencies

**Critical:**
- **mysql2** `^3.11.5` — MySQL connection pool in `Pulpy_Reporting_Portal_Backend/src/db/connection.js`.
- **ioredis** `^5.9.1` — Redis client in `Pulpy_Reporting_Portal_Backend/src/config/redis.js`, workers, and streams.
- **jsonwebtoken** `^9.0.2` + **bcrypt** `^5.1.1` — auth in `Pulpy_Reporting_Portal_Backend/src/middleware/auth.js`, `Pulpy_Reporting_Portal_Backend/src/controllers/authController.js`.
- **joi** `^17.13.3` — request validation (e.g. `Pulpy_Reporting_Portal_Backend/src/validators/`).
- **pino** `^9.4.0` / **pino-pretty** `^11.2.2` — structured logging in `Pulpy_Reporting_Portal_Backend/src/utils/logger.js`.
- **nodemailer** `^7.0.12` — outbound email in `Pulpy_Reporting_Portal_Backend/src/services/emailService.js`.
- **axios** `^1.13.2` — outbound HTTP in `Pulpy_Reporting_Portal_Backend/src/utils/ispLookup.js`, tests and ad-hoc scripts.
- **dayjs** `^1.11.19` — date handling on backend.
- **luxon** `^3.7.2` — date/time on frontend.
- **recharts** `^3.6.0` — charts on frontend.
- **geoip-lite** `^1.4.10` — IP geolocation in `Pulpy_Reporting_Portal_Backend/src/utils/countryLookup.js`.
- **ua-parser-js** `^2.0.7` — user-agent parsing (`Pulpy_Reporting_Portal_Backend/src/utils/deviceParser.js`).
- **fastq** `^1.20.1` — queue used in click pipeline (`Pulpy_Reporting_Portal_Backend/src/workers/clickQueue.js`).
- **node-cron** `^3.0.3` — scheduled jobs (e.g. `Pulpy_Reporting_Portal_Backend/worker.js`).
- **uuid** `^9.0.1` — ID generation across services/workers.
- **dotenv** `^16.4.5` — loads `.env` at process start (`Pulpy_Reporting_Portal_Backend/src/server.js` and other entrypoints).

**Infrastructure:**
- **@fastify/*** plugins — security and cross-cutting HTTP behavior in `server.js`.

## Configuration

**Environment:**
- Variables loaded via `dotenv` (typically a `.env` file in `Pulpy_Reporting_Portal_Backend/` — do not commit secrets). Example template file exists: `Pulpy_Reporting_Portal_Backend/.env.example` (do not paste values into docs).
- Key areas: `DB_*`, `REDIS_*`, `JWT_SECRET` / `ADMIN_JWT_SECRET` / `TENANT_JWT_SECRET`, `SMTP_*`, `PORT` / `HOST`, `NODE_ENV`, `LOG_LEVEL`, tracking toggles (`TRACKING_*`), worker flags (`START_WORKERS_WITH_API`, `ENABLE_REDIS_HYGIENE`, etc.) — see `grep` on `process.env` under `Pulpy_Reporting_Portal_Backend/`.

**Build:**
- Frontend: `Pulpy_Reporting_Portal_frontend/vite.config.js` (dev server port `5173`, proxy to backend for `/api`, `/click`, `/event`, `/postback`, `/imp`, `/health`).
- Backend: no bundler; run `node src/server.js` or `npm run dev` (`node --watch`).

## Platform Requirements

**Development:**
- Node.js compatible with dependencies (Dockerfile uses 20); MySQL server, Redis instance, and env configuration for DB/Redis/JWT/SMTP as needed for full flows.

**Production:**
- **Docker:** `Pulpy_Reporting_Portal_Backend/Dockerfile` — `npm ci --only=production`, `EXPOSE 3000`, `CMD ["npm","start"]`. Default app port in `src/server.js` is `5000` unless `PORT` is set — align `PORT`/`EXPOSE` with deployment. Reverse proxy (e.g. NGINX) and `trustProxy: true` in `server.js` expected for correct host/subdomain routing.

---

*Stack analysis: 2026-04-03*
