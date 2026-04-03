import { TIMELINE_OPTIONS } from '../../utils/timelineRange';
import { REPORT_TIMEZONE_OPTIONS } from '../../utils/reportTimezone';
import './TimelineFilter.css';

function TimelineFilter({
    value,
    customRange,
    options = TIMELINE_OPTIONS,
    onPresetChange,
    onCustomRangeChange,
    disabled = false,
    className = '',
    align = 'right',
    reportTimezone,
    onReportTimezoneChange,
}) {
    const showCustomInputs = value === 'custom';
    const showTimezone =
        typeof reportTimezone === 'string' && typeof onReportTimezoneChange === 'function';

    return (
        <div className={`timeline-filter ${align === 'right' ? 'timeline-filter-right' : ''} ${className}`.trim()}>
            {showTimezone && (
                <div className="timeline-filter-group">
                    <label htmlFor="report-timezone-select">Timezone</label>
                    <select
                        id="report-timezone-select"
                        className="timeline-filter-select timeline-filter-select-tz"
                        value={reportTimezone}
                        onChange={(e) => onReportTimezoneChange?.(e.target.value)}
                        disabled={disabled}
                        title="Date presets use this zone; server queries use IST day boundaries."
                    >
                        {REPORT_TIMEZONE_OPTIONS.map((option) => (
                            <option key={option.id} value={option.id}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="timeline-filter-group">
                <label htmlFor="timeline-filter-select">Timeline</label>
                <select
                    id="timeline-filter-select"
                    className="timeline-filter-select"
                    value={value}
                    onChange={(e) => onPresetChange?.(e.target.value)}
                    disabled={disabled}
                >
                    {options.map((option) => (
                        <option key={option.id} value={option.id}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            {showCustomInputs && (
                <div className="timeline-filter-custom-range">
                    <input
                        type="date"
                        value={customRange?.from || ''}
                        onChange={(e) => onCustomRangeChange?.({ ...customRange, from: e.target.value })}
                        disabled={disabled}
                    />
                    <span>to</span>
                    <input
                        type="date"
                        value={customRange?.to || ''}
                        onChange={(e) => onCustomRangeChange?.({ ...customRange, to: e.target.value })}
                        disabled={disabled}
                    />
                </div>
            )}
        </div>
    );
}

export default TimelineFilter;
