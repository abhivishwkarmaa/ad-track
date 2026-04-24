# Frontend deploy notes

## `VITE_APP_RELEASE` (client migration + storage cleanup)

The build embeds `__APP_RELEASE__` (see `vite.config.js`) so the app can clear stale non-auth `localStorage` keys after each deploy without bumping `package.json` every time.

**Set a unique value per production deploy** before `npm run build`, for example the git commit:

```bash
export VITE_APP_RELEASE="$(git rev-parse HEAD)"
npm run build
```

Short SHA is also fine:

```bash
export VITE_APP_RELEASE="$(git rev-parse --short HEAD)"
npm run build
```

If `VITE_APP_RELEASE` is unset, the build falls back to `version` from `package.json`.

CI/CD should pass the same variable into the build step so every deployment gets a new release id.

## Automatic page refresh after idle (no manual cache clear)

The app reloads itself when the user has been away long enough so the browser picks up a fresh `index.html` and JS/CSS (you still need `Cache-Control: no-store` on HTML in nginx).

Optional build-time env (milliseconds). Set to `0` to disable that behavior:

| Variable | Default | Meaning |
|----------|---------|---------|
| `VITE_IDLE_RELOAD_HIDDEN_MS` | `1200000` (20 min) | Tab was in background at least this long → reload when user focuses the tab again. |
| `VITE_IDLE_RELOAD_VISIBLE_MS` | `2700000` (45 min) | Tab visible but no pointer/key/scroll for this long → reload. |

Set both to `0` to turn off idle reload entirely (manual “Clear app data” still works).

Example stricter prod build (15 min away / 30 min AFK):

```bash
export VITE_IDLE_RELOAD_HIDDEN_MS=900000
export VITE_IDLE_RELOAD_VISIBLE_MS=1800000
npm run build
```
