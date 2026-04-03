# Port and rate limits

## Port (single source of truth)

| Location | Value |
|----------|--------|
| `src/server.js` | `process.env.PORT \|\| '5000'` |
| `Dockerfile` | `ENV PORT=5000`, `EXPOSE 5000` |
| `.env.example` | `PORT=5000` |

Run containers with `-p 5000:5000` or set `PORT` to match your reverse proxy upstream.

## Rate limits

Configured in `src/config/rateLimits.js` and registered in `src/server.js` (global) plus per-route overrides in `src/routes/tracking.js` and `src/routes/postback.js`.

- **Global** (`RATE_LIMIT_GLOBAL_*`): default for JSON APIs and routes without a custom limit.
- **Hot paths**: click, impression, event, and advertiser postback use `RATE_LIMIT_CLICK_MAX`, `RATE_LIMIT_IMP_MAX`, `RATE_LIMIT_EVENT_MAX`, `RATE_LIMIT_POSTBACK_MAX` so high-volume traffic is still bounded (not unlimited).

Tune via environment variables; see `.env.example`.
