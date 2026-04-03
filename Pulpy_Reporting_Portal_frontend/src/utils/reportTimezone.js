import { IST_TIMEZONE } from './dateTime.js';

export const REPORT_TIMEZONE_STORAGE_KEY = 'pulpy_report_timezone';
export const DEFAULT_REPORT_TIMEZONE = IST_TIMEZONE;

/** IANA zones for the report picker (stored value = id). */
export const REPORT_TIMEZONE_OPTIONS = [
    { id: 'Asia/Kolkata', label: 'IST — Asia/Kolkata' },
    { id: 'UTC', label: 'UTC' },
];

export function getStoredReportTimezone() {
    try {
        const raw = localStorage.getItem(REPORT_TIMEZONE_STORAGE_KEY);
        if (raw && REPORT_TIMEZONE_OPTIONS.some((o) => o.id === raw)) return raw;
    } catch {
        /* ignore */
    }
    return DEFAULT_REPORT_TIMEZONE;
}

export function setStoredReportTimezone(tz) {
    try {
        localStorage.setItem(REPORT_TIMEZONE_STORAGE_KEY, tz);
    } catch {
        /* ignore */
    }
}

export function formatYmdInTimeZone(date, timeZone) {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    if (!map.year || !map.month || !map.day) return '';
    const m = String(map.month).padStart(2, '0');
    const day = String(map.day).padStart(2, '0');
    return `${map.year}-${m}-${day}`;
}

/**
 * First instant (ms) where the calendar day in `timeZone` is `ymd` (YYYY-MM-DD).
 */
export function zonedDayStartUtcMs(ymd, timeZone) {
    const [y, mo, d] = ymd.split('-').map(Number);
    if (!y || !mo || !d) return NaN;
    let t = Date.UTC(y, mo - 1, d, 0, 0, 0);
    const target = ymd;
    for (let i = 0; i < 14; i++) {
        const cur = formatYmdInTimeZone(new Date(t), timeZone);
        if (cur === target) break;
        const curParts = cur.split('-').map(Number);
        const tgtParts = target.split('-').map(Number);
        const diff = Math.round(
            (Date.UTC(tgtParts[0], tgtParts[1] - 1, tgtParts[2]) -
                Date.UTC(curParts[0], curParts[1] - 1, curParts[2])) /
                86400000
        );
        t += diff * 86400000;
    }
    if (formatYmdInTimeZone(new Date(t), timeZone) !== target) return NaN;

    let lo = t - 12 * 3600000;
    let hi = t + 12 * 3600000;
    while (lo <= hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (formatYmdInTimeZone(new Date(mid), timeZone) !== target) {
            lo = mid + 1;
        } else if (mid === 0 || formatYmdInTimeZone(new Date(mid - 1), timeZone) !== target) {
            return mid;
        } else {
            hi = mid - 1;
        }
    }
    return t;
}

export function addDaysToYmdInTimeZone(ymd, days, timeZone) {
    const start = zonedDayStartUtcMs(ymd, timeZone);
    if (Number.isNaN(start)) return ymd;
    const noon = start + 12 * 3600000;
    return formatYmdInTimeZone(new Date(noon + days * 86400000), timeZone);
}

export function zonedDayEndUtcMs(ymd, timeZone) {
    const nextYmd = addDaysToYmdInTimeZone(ymd, 1, timeZone);
    const nextStart = zonedDayStartUtcMs(nextYmd, timeZone);
    return nextStart - 1;
}

/** Sunday = 0 … Saturday = 6 in the given IANA zone. */
export function dayOfWeekInTimeZone(date, timeZone) {
    const fmt = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    const parts = fmt.formatToParts(date);
    const wd = parts.find((p) => p.type === 'weekday')?.value;
    const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[wd] ?? 0;
}

export function countInclusiveYmdRange(fromYmd, toYmd, userTz) {
    let a = fromYmd;
    let b = toYmd;
    if (a > b) [a, b] = [b, a];
    let count = 0;
    let cur = a;
    for (let i = 0; i < 400; i++) {
        count++;
        if (cur === b) break;
        cur = addDaysToYmdInTimeZone(cur, 1, userTz);
    }
    return Math.max(1, count);
}

/**
 * Backend expects date_from / date_to as IST calendar days (see dashboardService).
 * Map an inclusive user timezone YYYY-MM-DD range to IST YYYY-MM-DD for the API.
 */
export function userRangeYmdToBackendIstRange(fromYmd, toYmd, userTz) {
    if (!fromYmd || !toYmd) return { date_from: '', date_to: '' };
    let a = fromYmd;
    let b = toYmd;
    if (a > b) [a, b] = [b, a];

    if (userTz === IST_TIMEZONE) {
        return { date_from: a, date_to: b };
    }

    const startMs = zonedDayStartUtcMs(a, userTz);
    const endMs = zonedDayEndUtcMs(b, userTz);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return { date_from: a, date_to: b };
    }

    const d1 = formatYmdInTimeZone(new Date(startMs), IST_TIMEZONE);
    const d2 = formatYmdInTimeZone(new Date(endMs), IST_TIMEZONE);
    return d1 <= d2 ? { date_from: d1, date_to: d2 } : { date_from: d2, date_to: d1 };
}

/**
 * Attach `report_timezone` (IANA id) to dashboard API query params alongside IST `date_from` / `date_to`.
 * Use for every dashboard endpoint so requests stay consistent and URLs differ per client zone when needed.
 */
export function buildDashboardApiParams(params, reportTimezone) {
    if (!params || typeof params !== 'object') return params;
    return {
        ...params,
        ...(reportTimezone ? { report_timezone: reportTimezone } : {}),
    };
}

/** Same UTC → MySQL string convention as the backend (`toISOString` UTC, space separator). */
export function utcMsToMysqlUtcString(ms) {
    if (Number.isNaN(ms)) return '';
    return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Exact UTC window for an inclusive user-zone YYYY-MM-DD range (for `created_at BETWEEN`).
 * Sent as `range_start_utc` / `range_end_utc` alongside IST `date_from` / `date_to`.
 */
export function userRangeYmdToBackendUtcMysqlRange(fromYmd, toYmd, userTz) {
    if (!fromYmd || !toYmd) return { range_start_utc: '', range_end_utc: '' };
    let a = fromYmd;
    let b = toYmd;
    if (a > b) [a, b] = [b, a];
    const startMs = zonedDayStartUtcMs(a, userTz);
    const endMs = zonedDayEndUtcMs(b, userTz);
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return { range_start_utc: '', range_end_utc: '' };
    }
    return {
        range_start_utc: utcMsToMysqlUtcString(startMs),
        range_end_utc: utcMsToMysqlUtcString(endMs),
    };
}
