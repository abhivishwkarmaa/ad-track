import { DateTime } from 'luxon';
import { getUserTimezone } from './userTimezone';

export const TIMELINE_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom Range' },
];

const toYmd = (dt) => dt.toISODate();

export const getTimelineRange = (preset, customRange = {}) => {
    const zone = getUserTimezone();
    const today = DateTime.now().setZone(zone).startOf('day');

    if (preset === 'today') return { from: toYmd(today), to: toYmd(today) };

    if (preset === 'yesterday') {
        const d = today.minus({ days: 1 });
        return { from: toYmd(d), to: toYmd(d) };
    }

    if (preset === 'this_week') {
        const start = today.startOf('week');
        return { from: toYmd(start), to: toYmd(today) };
    }

    if (preset === 'last_week') {
        const end = today.startOf('week').minus({ days: 1 });
        const start = end.minus({ days: 6 });
        return { from: toYmd(start), to: toYmd(end) };
    }

    if (preset === 'this_month') {
        const start = today.startOf('month');
        return { from: toYmd(start), to: toYmd(today) };
    }

    if (preset === 'last_month') {
        const start = today.minus({ months: 1 }).startOf('month');
        const end = today.minus({ months: 1 }).endOf('month');
        return { from: toYmd(start), to: toYmd(end) };
    }

    if (preset === 'custom') {
        return {
            from: customRange.from || '',
            to: customRange.to || '',
        };
    }

    return { from: toYmd(today), to: toYmd(today) };
};
