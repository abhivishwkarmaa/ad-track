import { CURRENT_APP_VERSION } from '../config/appVersion';

const VERSION_ENDPOINT = '/api/app/version';
const VERSION_HEADER = 'x-app-version';
const FORCE_AFTER_MS = 15 * 60 * 1000;
const RELOAD_GUARD_WINDOW_MS = 10000;
const LAST_RELOAD_KEY = 'app:last-version-reload-at';

let forceUpdateMode = false;
const listeners = new Set();

const normalizeVersion = (version) => String(version || '').trim();

const parseSemver = (version) => {
    const normalized = normalizeVersion(version).replace(/^v/i, '');
    const core = normalized.split('-')[0];
    const parts = core.split('.');

    if (!parts.length || parts.length > 3) {
        return null;
    }

    const parsed = parts.map((part) => Number.parseInt(part, 10));
    if (parsed.some((value) => Number.isNaN(value) || value < 0)) {
        return null;
    }

    while (parsed.length < 3) {
        parsed.push(0);
    }

    return parsed;
};

const compareSemver = (a, b) => {
    const aParts = parseSemver(a);
    const bParts = parseSemver(b);

    if (!aParts || !bParts) {
        return null;
    }

    for (let i = 0; i < 3; i += 1) {
        if (aParts[i] > bParts[i]) return 1;
        if (aParts[i] < bParts[i]) return -1;
    }

    return 0;
};

const emit = () => {
    const payload = { forceUpdateMode };
    listeners.forEach((listener) => listener(payload));
};

const setForceUpdateMode = (enabled) => {
    const nextValue = Boolean(enabled);
    if (nextValue !== forceUpdateMode) {
        forceUpdateMode = nextValue;
        emit();
    }
};

const shouldAllowReload = () => {
    const lastReloadRaw = localStorage.getItem(LAST_RELOAD_KEY);
    const lastReload = lastReloadRaw ? Number.parseInt(lastReloadRaw, 10) : 0;

    if (!lastReload) {
        return true;
    }

    return Date.now() - lastReload > RELOAD_GUARD_WINDOW_MS;
};

const reloadApp = () => {
    if (!shouldAllowReload()) {
        return false;
    }

    localStorage.setItem(LAST_RELOAD_KEY, String(Date.now()));
    window.location.reload(true);
    return true;
};

const fetchVersionContract = async () => {
    const response = await fetch(VERSION_ENDPOINT, {
        method: 'GET',
        credentials: 'include',
        headers: {
            [VERSION_HEADER]: CURRENT_APP_VERSION,
        },
    });

    if (!response.ok) {
        throw new Error(`VERSION_CHECK_FAILED_${response.status}`);
    }

    return response.json();
};

const checkVersion = async () => {
    const contract = await fetchVersionContract();
    const latestVersion = normalizeVersion(contract?.latest_version);
    const minRequiredVersion = normalizeVersion(contract?.min_required_version);
    const releaseNotes = normalizeVersion(contract?.release_notes);

    const belowMin = compareSemver(CURRENT_APP_VERSION, minRequiredVersion);
    const belowLatest = compareSemver(CURRENT_APP_VERSION, latestVersion);

    const isForceUpdateRequired = belowMin !== null && belowMin < 0;
    setForceUpdateMode(isForceUpdateRequired);

    return {
        currentVersion: CURRENT_APP_VERSION,
        latestVersion,
        minRequiredVersion,
        releaseNotes,
        isForceUpdateRequired,
        isUpdateAvailable: belowLatest !== null && belowLatest < 0,
        forceAfterMs: FORCE_AFTER_MS,
    };
};

const onForceUpdateFromServer = () => {
    setForceUpdateMode(true);
};

const goToUpdateRequiredScreen = () => {
    if (window.location.pathname !== '/update-required') {
        window.location.href = '/update-required';
    }
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const isApiBlockedByVersionGuard = () => forceUpdateMode;

export default {
    checkVersion,
    compareSemver,
    forceAfterMs: FORCE_AFTER_MS,
    getCurrentVersion: () => CURRENT_APP_VERSION,
    isApiBlockedByVersionGuard,
    goToUpdateRequiredScreen,
    onForceUpdateFromServer,
    reloadApp,
    subscribe,
};

