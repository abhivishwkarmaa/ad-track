import { DateTime } from 'luxon';

export const TIMEZONE_STORAGE_KEY = 'track-myads_timezone';
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const IST_TIMEZONE = 'Asia/Kolkata';

export const SUPPORTED_TIMEZONES = [
    'Asia/Kolkata',
    'UTC',
    'Europe/London',
    'Europe/Berlin',
    'America/New_York',
    'America/Los_Angeles',
    'Asia/Dubai',
    'Asia/Singapore',
    'Asia/Tokyo',
];

const SUPPORTED_SET = new Set(SUPPORTED_TIMEZONES);

export const getUserTimezone = () => {
    try {
        const tz = localStorage.getItem(TIMEZONE_STORAGE_KEY);
        return SUPPORTED_SET.has(tz) ? tz : DEFAULT_TIMEZONE;
    } catch {
        return DEFAULT_TIMEZONE;
    }
};

export const setUserTimezone = (timezone) => {
    const resolved = SUPPORTED_SET.has(timezone) ? timezone : DEFAULT_TIMEZONE;
    try {
        localStorage.setItem(TIMEZONE_STORAGE_KEY, resolved);
    } catch {
        // Ignore storage failures and keep app functional.
    }
    return resolved;
};

const toIstBoundaryDateTime = (ymd, sourceTimezone, boundary = 'start') => {
    if (!ymd) return '';
    const srcTz = SUPPORTED_SET.has(sourceTimezone) ? sourceTimezone : DEFAULT_TIMEZONE;
    const local = DateTime.fromISO(`${ymd}T00:00:00`, { zone: srcTz });
    if (!local.isValid) return '';
    const withBoundary = boundary === 'end' ? local.endOf('day') : local.startOf('day');
    return withBoundary.setZone(IST_TIMEZONE).toFormat('yyyy-LL-dd HH:mm:ss');
};

export const convertDateParamsToIST = (params = {}) => {
    const tz = getUserTimezone();
    const next = { ...params };

    const hasConvertibleDate = Boolean(
        next.date_from ||
        next.date_to ||
        next.previous_from ||
        next.previous_to
    );
    if (!hasConvertibleDate) {
        return next;
    }

    if (next.date_from) {
        const fromDt = toIstBoundaryDateTime(next.date_from, tz, 'start');
        if (fromDt) {
            next.datetime_from = fromDt;
            next.date_from = fromDt.slice(0, 10);
        }
    }
    if (next.date_to) {
        const toDt = toIstBoundaryDateTime(next.date_to, tz, 'end');
        if (toDt) {
            next.datetime_to = toDt;
            next.date_to = toDt.slice(0, 10);
        }
    }
    if (next.previous_from) {
        const prevFromDt = toIstBoundaryDateTime(next.previous_from, tz, 'start');
        if (prevFromDt) {
            next.previous_datetime_from = prevFromDt;
            next.previous_from = prevFromDt.slice(0, 10);
        }
    }
    if (next.previous_to) {
        const prevToDt = toIstBoundaryDateTime(next.previous_to, tz, 'end');
        if (prevToDt) {
            next.previous_datetime_to = prevToDt;
            next.previous_to = prevToDt.slice(0, 10);
        }
    }

    return next;
};
