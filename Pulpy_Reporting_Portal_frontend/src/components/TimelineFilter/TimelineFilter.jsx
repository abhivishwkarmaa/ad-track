import { TIMELINE_OPTIONS } from '../../utils/timelineRange';
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
}) {
    const showCustomInputs = value === 'custom';

    return (
        <div className={`timeline-filter ${align === 'right' ? 'timeline-filter-right' : ''} ${className}`.trim()}>
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
