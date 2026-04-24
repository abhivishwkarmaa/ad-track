import {
    formatYmdInTimeZone,
    addDaysToYmdInTimeZone,
    zonedDayStartUtcMs,
    dayOfWeekInTimeZone,
    DEFAULT_REPORT_TIMEZONE,
} from './reportTimezone.js';

export const TIMELINE_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom Range' },
];

/**
 * Calendar range in the user's report timezone (YYYY-MM-DD).
 * Backend still receives IST dates via userRangeYmdToBackendIstRange before API calls.
 */
export const getTimelineRange = (preset, customRange = {}, timeZone = DEFAULT_REPORT_TIMEZONE) => {
    const now = new Date();
    const todayYmd = formatYmdInTimeZone(now, timeZone);

    if (preset === 'today') return { from: todayYmd, to: todayYmd };

    if (preset === 'yesterday') {
        const y = addDaysToYmdInTimeZone(todayYmd, -1, timeZone);
        return { from: y, to: y };
    }

    if (preset === 'this_week') {
        const t0 = zonedDayStartUtcMs(todayYmd, timeZone);
        const dow = dayOfWeekInTimeZone(new Date(t0 + 43200000), timeZone);
        const startYmd = addDaysToYmdInTimeZone(todayYmd, -dow, timeZone);
        return { from: startYmd, to: todayYmd };
    }

    if (preset === 'last_week') {
        const t0 = zonedDayStartUtcMs(todayYmd, timeZone);
        const dow = dayOfWeekInTimeZone(new Date(t0 + 43200000), timeZone);
        const thisWeekStart = addDaysToYmdInTimeZone(todayYmd, -dow, timeZone);
        const lastWeekEnd = addDaysToYmdInTimeZone(thisWeekStart, -1, timeZone);
        const lastWeekStart = addDaysToYmdInTimeZone(lastWeekEnd, -6, timeZone);
        return { from: lastWeekStart, to: lastWeekEnd };
    }

    if (preset === 'this_month') {
        const [y, m] = todayYmd.split('-');
        const monthStart = `${y}-${m}-01`;
        return { from: monthStart, to: todayYmd };
    }

    if (preset === 'last_month') {
        const [y, m] = todayYmd.split('-').map(Number);
        const thisMonthStart = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastMonthEnd = addDaysToYmdInTimeZone(thisMonthStart, -1, timeZone);
        const lm = m === 1 ? 12 : m - 1;
        const ly = m === 1 ? y - 1 : y;
        const lastMonthStart = `${ly}-${String(lm).padStart(2, '0')}-01`;
        return { from: lastMonthStart, to: lastMonthEnd };
    }

    if (preset === 'custom') {
        return {
            from: customRange.from || '',
            to: customRange.to || '',
        };
    }

    return { from: todayYmd, to: todayYmd };
};

/** Detailed Reports presets include 'all' (no date filter). */
export function getDetailedReportsPresetRange(preset, timeZone = DEFAULT_REPORT_TIMEZONE) {
    if (preset === 'all') return { from: '', to: '', allDates: true };
    if (preset === 'custom') return { from: '', to: '', allDates: false };
    const r = getTimelineRange(preset, {}, timeZone);
    return { ...r, allDates: false };
}
