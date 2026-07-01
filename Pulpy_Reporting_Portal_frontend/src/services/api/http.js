import { getLastActivity, markActivity, broadcastLogout } from '../../utils/activityTracker';

// 🔒 STRICT SUBDOMAIN-BASED MULTI-TENANCY — relative paths only; tenant from Host header.

if (import.meta.env.PROD && import.meta.env.VITE_API_URL) {
    throw new Error(
        '❌ CRITICAL CONFIG ERROR: VITE_API_URL must NOT be set in production. The app must use relative paths (/api/...) to allow NGINX to handle tenant resolution via Host header.'
    );
}

export const BASE_URL = '';
const IDLE_TIMEOUT_MS = 180 * 60 * 1000;

let accessToken = null;

export const setAccessToken = (token) => {
    accessToken = token || null;
};

export const clearAccessToken = () => {
    accessToken = null;
};

export const getAccessToken = () => accessToken;

const getStoredUser = () => {
    const user = localStorage.getItem('track-myads_user');
    if (!user) return null;
    try {
        return JSON.parse(user);
    } catch {
        return null;
    }
};

const isIdle = () => Date.now() - getLastActivity() > IDLE_TIMEOUT_MS;

const clearClientSession = () => {
    clearAccessToken();
    localStorage.removeItem('track-myads_user');
    localStorage.removeItem('bng_token');
    broadcastLogout();
};

const redirectToLogin = () => {
    window.location.href = '/login';
};

export const refreshAccessToken = async () => {
    try {
        const response = await fetch(`${BASE_URL}/api/auth/refresh`, {
            method: 'POST',
            credentials: 'include',
        });

        const contentType = response.headers.get('content-type');
        const data =
            contentType && contentType.includes('application/json') ? await response.json() : null;

        if (!response.ok || !data?.success || !data?.data?.token) {
            return false;
        }

        setAccessToken(data.data.token);
        return true;
    } catch {
        return false;
    }
};

export const apiRequest = async (endpoint, options = {}, meta = {}) => {
    const {
        trackActivity = true,
        skipAuth = false,
        skipIdleCheck = false,
        allowUnauthorized = false,
        isRetry = false,
    } = meta;

    const url = `${BASE_URL}${endpoint}`;
    const storedUser = getStoredUser();

    if (!skipIdleCheck && storedUser && isIdle()) {
        clearClientSession();
        redirectToLogin();
        throw new Error('SESSION_EXPIRED');
    }

    if (trackActivity) {
        markActivity();
    }

    const hasBody = options.body !== undefined && options.body !== null;
    const needsContentType =
        hasBody &&
        (options.method === 'POST' ||
            options.method === 'PUT' ||
            options.method === 'PATCH' ||
            !options.method);
    const token = accessToken;

    const config = {
        ...options,
        credentials: 'include',
        cache: 'no-store',
        headers: {
            ...(needsContentType && { 'Content-Type': 'application/json' }),
            ...(!skipAuth && token && { Authorization: `Bearer ${token}` }),
            ...(trackActivity && { 'X-User-Activity': '1' }),
            ...options.headers,
        },
    };

    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type');
        let data;

        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            try {
                data = JSON.parse(text);
            } catch {
                data = {
                    message: text || `HTTP ${response.status} ${response.statusText}`,
                    error: 'Invalid response format',
                };
            }
        }

        if (response.status === 401 && !allowUnauthorized) {
            if (!skipAuth && !isRetry && endpoint !== '/api/auth/refresh') {
                const refreshed = await refreshAccessToken();
                if (refreshed) {
                    return apiRequest(endpoint, options, { ...meta, isRetry: true });
                }
            }

            clearClientSession();
            redirectToLogin();
            throw new Error('SESSION_EXPIRED');
        }

        if (response.status === 502) {
            window.dispatchEvent(new CustomEvent('server-maintenance'));
            throw new Error('SERVER_MAINTENANCE');
        }

        if (!response.ok) {
            const errorMessage = data?.message || data?.error || `API request failed (${response.status})`;
            throw new Error(errorMessage);
        }

        return data;
    } catch (error) {
        if (error?.name === 'AbortError') {
            throw error;
        }
        if (error.message === 'SESSION_EXPIRED') {
            throw error;
        }
        if (error instanceof Error) {
            throw error;
        }
        throw new Error(error?.toString() || 'API request failed');
    }
};
