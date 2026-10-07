import React from 'react';

/**
 * Chip-based interactive selector for targeting rules (Browsers, Devices, OS).
 * Supports toggle selection, "All" shortcut, case-insensitive comparison, and custom value formatting.
 */
export default function TargetingChipSelect({
    label,
    items = [],
    selected = [],
    onChange,
    formatValue = (item) => (item.toLowerCase() === 'all' ? 'all' : item.toLowerCase()),
    icon = null,
    helperText = '',
}) {
    const safeSelected = Array.isArray(selected) ? selected : [];

    const isAllSelected =
        safeSelected.length === 0 ||
        safeSelected.some((v) => String(v).toLowerCase() === 'all');

    const handleToggleItem = (item) => {
        const value = formatValue(item);
        const isAllValue = String(value).toLowerCase() === 'all';

        if (isAllValue) {
            onChange(['all']);
            return;
        }

        // Remove 'all' when toggling individual items
        let newSelected = safeSelected.filter(
            (v) => String(v).toLowerCase() !== 'all'
        );

        const alreadyExists = newSelected.some(
            (v) => String(v).toLowerCase() === String(value).toLowerCase()
        );

        if (alreadyExists) {
            newSelected = newSelected.filter(
                (v) => String(v).toLowerCase() !== String(value).toLowerCase()
            );
            // If none left, default back to 'all'
            if (newSelected.length === 0) {
                newSelected = ['all'];
            }
        } else {
            newSelected = [...newSelected, value];
            // Check if all non-all items are now selected
            const nonAllItems = items.filter(
                (i) => formatValue(i).toLowerCase() !== 'all'
            );
            if (newSelected.length >= nonAllItems.length) {
                newSelected = ['all'];
            }
        }

        onChange(newSelected);
    };

    const handleSelectAll = () => {
        onChange(['all']);
    };

    const handleClearAll = () => {
        onChange([]);
    };

    return (
        <div className="targeting-chip-select-container">
            <div className="targeting-chip-select-header">
                <div className="targeting-chip-header-left">
                    {icon && <span className="targeting-chip-header-icon">{icon}</span>}
                    <span className="targeting-chip-header-label">{label}</span>
                    <span className="targeting-chip-count-badge">
                        {isAllSelected ? 'All Selected' : `${safeSelected.length} Selected`}
                    </span>
                </div>
                <div className="targeting-chip-quick-actions">
                    <button
                        type="button"
                        className="targeting-quick-btn"
                        onClick={handleSelectAll}
                    >
                        Select All
                    </button>
                    <button
                        type="button"
                        className="targeting-quick-btn"
                        onClick={handleClearAll}
                    >
                        Clear
                    </button>
                </div>
            </div>

            <div className="targeting-chips-group">
                {items.map((item) => {
                    const value = formatValue(item);
                    const isAll = String(value).toLowerCase() === 'all';
                    const active = isAll
                        ? isAllSelected
                        : safeSelected.some(
                              (v) => String(v).toLowerCase() === String(value).toLowerCase()
                          );

                    return (
                        <button
                            key={item}
                            type="button"
                            className={`targeting-chip ${active ? 'active' : ''} ${isAll ? 'chip-all' : ''}`}
                            onClick={() => handleToggleItem(item)}
                        >
                            <span className="chip-indicator" />
                            <span className="chip-label">{item}</span>
                        </button>
                    );
                })}
            </div>

            {helperText && (
                <div className="targeting-chip-helper-text">{helperText}</div>
            )}
        </div>
    );
}
