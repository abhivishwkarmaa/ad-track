export const IST_TIMEZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;

const DEFAULT_LOCALE = 'en-IN';

function parseDate(value) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateIST(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;

    return date.toLocaleDateString(locale, {
        timeZone: IST_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        ...options,
    });
}

export function formatDateTimeIST(value, options = {}, locale = DEFAULT_LOCALE) {
    const date = parseDate(value);
    if (!date) return null;

    return date.toLocaleString(locale, {
        timeZone: IST_TIMEZONE,
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

    return date.toLocaleTimeString(locale, {
        timeZone: IST_TIMEZONE,
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

    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: IST_TIMEZONE,
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
