import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    DEFAULT_REPORT_TIMEZONE,
    getStoredReportTimezone,
    REPORT_TIMEZONE_OPTIONS,
    REPORT_TIMEZONE_STORAGE_KEY,
    setStoredReportTimezone,
} from '../utils/reportTimezone';

const ReportTimezoneContext = createContext({
    reportTimezone: DEFAULT_REPORT_TIMEZONE,
    setReportTimezone: () => {},
    timezoneRevision: 0,
});

export function ReportTimezoneProvider({ children }) {
    const [reportTimezone, setReportTimezoneState] = useState(() => getStoredReportTimezone());
    /** Increments on every timezone change so data effects always re-run even if mapped IST dates match. */
    const [timezoneRevision, setTimezoneRevision] = useState(0);

    const setReportTimezone = useCallback((tz) => {
        setReportTimezoneState(tz);
        setStoredReportTimezone(tz);
        setTimezoneRevision((r) => r + 1);
    }, []);

    useEffect(() => {
        const onStorage = (e) => {
            if (e.key !== REPORT_TIMEZONE_STORAGE_KEY || !e.newValue) return;
            if (REPORT_TIMEZONE_OPTIONS.some((o) => o.id === e.newValue)) {
                setReportTimezoneState(e.newValue);
                setTimezoneRevision((r) => r + 1);
            }
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    const value = useMemo(
        () => ({ reportTimezone, setReportTimezone, timezoneRevision }),
        [reportTimezone, setReportTimezone, timezoneRevision]
    );

    return (
        <ReportTimezoneContext.Provider value={value}>
            {children}
        </ReportTimezoneContext.Provider>
    );
}

export function useReportTimezone() {
    return useContext(ReportTimezoneContext);
}
