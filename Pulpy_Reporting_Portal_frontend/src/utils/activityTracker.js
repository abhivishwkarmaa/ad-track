const ACTIVITY_STORAGE_KEY = 'track-myads_last_activity';
const LOGOUT_STORAGE_KEY = 'track-myads_logout_event';
const ACTIVITY_THROTTLE_MS = 5000;

let lastActivity = Date.now();
let lastWriteTime = 0;
let channel = null;
let listenersStarted = false;
const logoutListeners = new Set();

const now = () => Date.now();

const syncFromStorage = () => {
    const raw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed)) {
        lastActivity = Math.max(lastActivity, parsed);
    }
};

const broadcastActivity = (timestamp) => {
    localStorage.setItem(ACTIVITY_STORAGE_KEY, String(timestamp));
    if (channel) {
        channel.postMessage({ type: 'activity', timestamp });
    }
};

export const markActivity = (timestamp = now()) => {
    lastActivity = Math.max(lastActivity, timestamp);
    if (timestamp - lastWriteTime >= ACTIVITY_THROTTLE_MS) {
        lastWriteTime = timestamp;
        broadcastActivity(lastActivity);
    }
};

export const getLastActivity = () => {
    syncFromStorage();
    return lastActivity;
};

export const broadcastLogout = () => {
    const timestamp = now();
    localStorage.setItem(LOGOUT_STORAGE_KEY, String(timestamp));
    if (channel) {
        channel.postMessage({ type: 'logout', timestamp });
    }
    logoutListeners.forEach((handler) => handler());
};

export const onLogoutEvent = (handler) => {
    logoutListeners.add(handler);
    return () => logoutListeners.delete(handler);
};

export const startActivityTracking = () => {
    if (listenersStarted) return;
    listenersStarted = true;

    syncFromStorage();

    if ('BroadcastChannel' in window) {
        channel = new BroadcastChannel('track-myads-activity');
        channel.onmessage = (event) => {
            if (!event?.data) return;
            if (event.data.type === 'activity') {
                const timestamp = Number(event.data.timestamp);
                if (!Number.isNaN(timestamp)) {
                    lastActivity = Math.max(lastActivity, timestamp);
                }
            }
            if (event.data.type === 'logout') {
                logoutListeners.forEach((handler) => handler());
            }
        };
    }

    window.addEventListener('storage', (event) => {
        if (event.key === ACTIVITY_STORAGE_KEY && event.newValue) {
            const timestamp = parseInt(event.newValue, 10);
            if (!Number.isNaN(timestamp)) {
                lastActivity = Math.max(lastActivity, timestamp);
            }
        }
        if (event.key === LOGOUT_STORAGE_KEY && event.newValue) {
            logoutListeners.forEach((handler) => handler());
        }
    });

    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    const handleActivity = () => markActivity();
    activityEvents.forEach((event) => {
        window.addEventListener(event, handleActivity, { passive: true });
    });
};
