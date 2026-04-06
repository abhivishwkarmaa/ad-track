/**
 * Client-side resilience after deploys:
 * - Release migration + chunk error → one reload
 * - Idle → automatic reload (fresh HTML/assets; login kept via localStorage)
 * Manual full reset: resetAppClientData() (Login or Settings).
 */

const RELEASE_STORAGE_KEY = 'pulpy_spa_release';
const CHUNK_RELOAD_FLAG = 'pulpy_chunk_reload_once';

/** Parse Vite env ms; <=0 disables that branch. */
function envMs(key, fallback) {
  try {
    const raw = import.meta.env?.[key];
    if (raw === undefined || raw === '') return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return n;
  } catch {
    return fallback;
  }
}

/** After tab was in background this long, reload when user returns (fresh HTML + chunks). */
const IDLE_RELOAD_AFTER_HIDDEN_MS = envMs('VITE_IDLE_RELOAD_HIDDEN_MS', 20 * 60 * 1000);
/** While tab is visible, reload if no pointer/key/scroll for this long. */
const IDLE_RELOAD_AFTER_VISIBLE_MS = envMs('VITE_IDLE_RELOAD_VISIBLE_MS', 45 * 60 * 1000);

const IDLE_CHECK_INTERVAL_MS = 60 * 1000;
const ACTIVITY_THROTTLE_MS = 30 * 1000;

/** Keys safe to clear on new build (stale UI state); keeps login + theme unless full reset. */
const NON_AUTH_KEYS_TO_RESET_ON_RELEASE = [
  'track-myads_last_activity',
  'track-myads_logout_event',
  'pulpy_report_timezone',
  'expired_modal_last_shown_at',
  'refresh_button_position',
];

function getCurrentRelease() {
  return typeof __APP_RELEASE__ !== 'undefined' ? __APP_RELEASE__ : '0';
}

function clearNonAuthLocalState() {
  for (const k of NON_AUTH_KEYS_TO_RESET_ON_RELEASE) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
}

/**
 * On new deploy (VITE_APP_RELEASE or package version), drop stale client-only keys.
 * Avoids logging everyone out while clearing bad UI state.
 */
export function runReleaseMigration() {
  try {
    const current = getCurrentRelease();
    const prev = localStorage.getItem(RELEASE_STORAGE_KEY);
    if (prev === current) return;
    clearNonAuthLocalState();
    localStorage.setItem(RELEASE_STORAGE_KEY, current);
  } catch {
    /* ignore */
  }
}

function isChunkOrModuleLoadError(reason) {
  const msg =
    typeof reason === 'string'
      ? reason
      : reason?.message || reason?.toString?.() || '';
  return /Loading chunk [\d]+ failed|ChunkLoadError|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    String(msg)
  );
}

/**
 * After deploy, old tab may still run old JS; dynamic import of new chunk can fail → one hard reload.
 */
function installChunkLoadRecovery() {
  const tryReloadOnce = () => {
    try {
      if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
      sessionStorage.setItem(CHUNK_RELOAD_FLAG, '1');
      window.location.reload();
    } catch {
      window.location.reload();
    }
  };

  window.addEventListener('unhandledrejection', (e) => {
    if (isChunkOrModuleLoadError(e.reason)) {
      e.preventDefault();
      tryReloadOnce();
    }
  });

  window.addEventListener(
    'error',
    (e) => {
      const msg = e.message || '';
      if (isChunkOrModuleLoadError({ message: msg })) tryReloadOnce();
    },
    true
  );
}

function throttle(fn, ms) {
  let last = 0;
  return () => {
    const t = Date.now();
    if (t - last < ms) return;
    last = t;
    fn();
  };
}

/**
 * Periodically reload after user idleness so they never need to clear cache manually.
 * - Tab hidden for a while → reload when they focus back (picks up new deploy).
 * - Tab visible but no interaction for a while → reload (same).
 * Auth stays in localStorage; user remains logged in after reload.
 */
function installIdleFreshReload() {
  if (IDLE_RELOAD_AFTER_HIDDEN_MS <= 0 && IDLE_RELOAD_AFTER_VISIBLE_MS <= 0) return;

  let lastActivity = Date.now();
  let lastHiddenAt = null;

  const bump = () => {
    lastActivity = Date.now();
  };
  const throttledBump = throttle(bump, ACTIVITY_THROTTLE_MS);

  for (const evt of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    document.addEventListener(evt, throttledBump, { capture: true, passive: true });
  }
  window.addEventListener('scroll', throttledBump, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      lastHiddenAt = Date.now();
      return;
    }
    const now = Date.now();
    if (
      lastHiddenAt != null &&
      IDLE_RELOAD_AFTER_HIDDEN_MS > 0 &&
      now - lastHiddenAt >= IDLE_RELOAD_AFTER_HIDDEN_MS
    ) {
      window.location.reload();
      return;
    }
    lastHiddenAt = null;
    lastActivity = now;
  });

  if (IDLE_RELOAD_AFTER_VISIBLE_MS > 0) {
    window.setInterval(() => {
      if (document.hidden) return;
      if (Date.now() - lastActivity >= IDLE_RELOAD_AFTER_VISIBLE_MS) {
        window.location.reload();
      }
    }, IDLE_CHECK_INTERVAL_MS);
  }
}

/**
 * User-triggered: clear auth + app storage and go to login (fixes corrupt profile/cache without Chrome settings).
 */
export function resetAppClientData() {
  if (!window.confirm('This will sign you out and clear saved app data on this device. Continue?')) {
    return;
  }
  try {
    localStorage.removeItem('track-myads_user');
    localStorage.removeItem('bng_token');
    localStorage.removeItem('track-myads_theme');
    clearNonAuthLocalState();
    localStorage.removeItem(RELEASE_STORAGE_KEY);
    sessionStorage.clear();
  } catch {
    /* ignore */
  }
  window.location.href = '/login';
}

runReleaseMigration();
installChunkLoadRecovery();
installIdleFreshReload();
