export const TIMELINE_OPTIONS = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: 'this_week', label: 'This Week' },
    { id: 'last_week', label: 'Last Week' },
    { id: 'this_month', label: 'This Month' },
    { id: 'last_month', label: 'Last Month' },
    { id: 'custom', label: 'Custom Range' },
];

const toYmd = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
};

export const getTimelineRange = (preset, customRange = {}) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (preset === 'today') return { from: toYmd(today), to: toYmd(today) };

    if (preset === 'yesterday') {
        const d = new Date(today);
        d.setDate(d.getDate() - 1);
        return { from: toYmd(d), to: toYmd(d) };
    }

    if (preset === 'this_week') {
        const start = new Date(today);
        start.setDate(start.getDate() - start.getDay());
        return { from: toYmd(start), to: toYmd(today) };
    }

    if (preset === 'last_week') {
        const end = new Date(today);
        end.setDate(end.getDate() - end.getDay() - 1);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        return { from: toYmd(start), to: toYmd(end) };
    }

    if (preset === 'this_month') {
        const start = new Date(today.getFullYear(), today.getMonth(), 1);
        return { from: toYmd(start), to: toYmd(today) };
    }

    if (preset === 'last_month') {
        const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const end = new Date(today.getFullYear(), today.getMonth(), 0);
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
