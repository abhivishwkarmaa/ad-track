import { getUserTimezone } from './userTimezone';

export const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;

const DEFAULT_LOCALE = 'en-IN';

/**
 * Parse API / DB timestamps reliably.
 * DB stores IST wall time; DATETIME strings like "2026-03-22 14:35:24" are interpreted as Asia/Kolkata.
 * Browsers often parse space-separated datetimes incorrectly — normalize to UTC ISO.
 */
function parseDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date) {
        return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        // Date-only bucket (YYYY-MM-DD): parse explicitly as UTC to avoid browser-dependent parsing.
        const ymd = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (ymd) {
            const d = new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T00:00:00Z`);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        // MySQL DATETIME as string (space between date and time)
        const mysql = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?$/);
        if (mysql) {
            const frac = mysql[7] || '';
            const d = new Date(
                `${mysql[1]}-${mysql[2]}-${mysql[3]}T${mysql[4]}:${mysql[5]}:${mysql[6]}${frac}+05:30`
            );
            return Number.isNaN(d.getTime()) ? null : d;
        }
        // ISO "2026-03-22T14:35:24" without Z — treat as IST wall time (matches DB storage policy here)
        const isoNoTz = trimmed.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d{1,3})?$/);
        if (isoNoTz && !/[zZ]|[+-]\d{2}:\d{2}$/.test(trimmed)) {
            const d = new Date(`${isoNoTz[1]}${isoNoTz[2] || ''}+05:30`);
            return Number.isNaN(d.getTime()) ? null : d;
        }
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateIST(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;
    const activeTimezone = options.timeZone || getUserTimezone();

    return date.toLocaleDateString(locale, {
        timeZone: activeTimezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
    });
}

export function formatDateTimeIST(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;
    const activeTimezone = options.timeZone || getUserTimezone();

    return date.toLocaleString(locale, {
        timeZone: activeTimezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        ...options,
    });
}

export function formatTimeIST(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;
    const activeTimezone = options.timeZone || getUserTimezone();

    return date.toLocaleTimeString(locale, {
        timeZone: activeTimezone,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        ...options,
    });
}

export function formatDateTimeInputIST(value) {
    const date = parseDate(value);
    if (!date) return '';
    const activeTimezone = getUserTimezone();

    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: activeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

    return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}`;
}

export function inputISTToISO(value) {
    if (!value) return null;
    const [datePart, timePart] = value.split('T');
    if (!datePart || !timePart) return null;

    const [year, month, day] = datePart.split('-').map(Number);
    const [hour, minute] = timePart.split(':').map(Number);

    if ([year, month, day, hour, minute].some((part) => Number.isNaN(part))) {
        return null;
    }

    const utcMs = Date.UTC(year, month - 1, day, hour, minute) - (IST_OFFSET_MINUTES * 60 * 1000);
    return new Date(utcMs).toISOString();
}

/**
 * Extract YYYY-MM-DD in IST from API values (ISO string, Date). Uses IST calendar day, not UTC string prefix.
 */
export function extractYmdFromValue(value) {
    if (value === null || value === undefined || value === '') return null;
    const date = value instanceof Date ? value : parseDate(value);
    if (!date || Number.isNaN(date.getTime())) return null;
    const activeTimezone = getUserTimezone();
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: activeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    if (map.year && map.month && map.day) {
        return `${map.year}-${map.month}-${map.day}`;
    }
    return null;
}

/**
 * @deprecated Misleading for users (always showed 12:00 am). Use formatDateIST for day buckets.
 * Kept for any legacy callers.
 */
export function formatDateTimeAtISTDayStart(value) {
    const ymd = extractYmdFromValue(value);
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    if ([y, m, d].some((n) => Number.isNaN(n))) return null;
    const isoLocal = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}T00:00:00+05:30`;
    const instant = new Date(isoLocal);
    if (Number.isNaN(instant.getTime())) return null;
    return formatDateTimeIST(instant);
}

/**
 * Full datetime in IST with seconds (e.g. click timestamps).
 */
export function formatDateTimeISTWithSeconds(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;
    const activeTimezone = options.timeZone || getUserTimezone();

    return date.toLocaleString(locale, {
        timeZone: activeTimezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
        ...options,
    });
}

/**
 * Exact IST wall time as YYYY-MM-DD HH:mm:ss (24h), same style as MySQL DATETIME display.
 */
export function formatISTDateTimeNumeric(value) {
    const date = parseDate(value);
    if (!date) return null;
    const activeTimezone = getUserTimezone();
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: activeTimezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    if (!map.year || !map.month || !map.day) return null;
    return `${map.year}-${map.month}-${map.day} ${map.hour}:${map.minute}:${map.second}`;
}

/**
 * Hour-only group (no calendar date in row): wall-clock range in IST, 24h with seconds.
 */
export function formatHourSlotIST(hour) {
    const h = Number(hour);
    if (Number.isNaN(h) || h < 0 || h > 23) return null;
    const pad = (n) => String(n).padStart(2, '0');
    const start = new Date(`2000-01-01T${pad(h)}:00:00+05:30`);
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const timePart = (dt) => {
        const s = formatISTDateTimeNumeric(dt);
        return s ? s.split(' ')[1] : '';
    };
    return `${timePart(start)} – ${timePart(end)}`;
}

/**
 * Date + hour bucket (IST): exact start/end datetimes for that hour window in IST.
 */
export function formatExactHourBucketIST(dateGroupValue, hour) {
    const ymd = extractYmdFromValue(dateGroupValue);
    const h = Number(hour);
    if (!ymd || Number.isNaN(h) || h < 0 || h > 23) return null;
    const [y, mo, d] = ymd.split('-').map(Number);
    const pad = (n) => String(n).padStart(2, '0');
    const start = new Date(`${y}-${pad(mo)}-${pad(d)}T${pad(h)}:00:00+05:30`);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    const a = formatISTDateTimeNumeric(start);
    const b = formatISTDateTimeNumeric(end);
    if (!a || !b) return null;
    return `${a} → ${b}`;
}
