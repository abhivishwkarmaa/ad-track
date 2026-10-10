import { useEffect, useMemo, useRef, useState } from 'react';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import './SearchableSelect.css';

function optionText(option) {
    return `${option.label || ''} ${option.keywords || ''}`.toLowerCase();
}

export default function SearchableSelect({
    value,
    onChange,
    options = [],
    selectedLabel = '',
    placeholder = 'Search...',
    emptyLabel = 'Select...',
    disabled = false,
    required = false,
    loading = false,
    remote = false,
    limit = LIST_PAGE_SIZE,
    onQueryChange,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef(null);

    useEffect(() => {
        const onDocClick = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    useEffect(() => {
        if (!onQueryChange) return undefined;
        const timer = setTimeout(() => onQueryChange(query), 300);
        return () => clearTimeout(timer);
    }, [query, onQueryChange]);

    const selectedOption = options.find((option) => String(option.value) === String(value));
    const closedLabel = selectedOption?.label || (value ? selectedLabel : '') || '';

    const visibleOptions = useMemo(() => {
        const q = query.trim().toLowerCase();
        const source = remote || !q
            ? options
            : options.filter((option) => optionText(option).includes(q));
        return source.slice(0, limit);
    }, [options, query, remote, limit]);

    const choose = (option) => {
        onChange(option ? option.value : '', option || null);
        setQuery('');
        setOpen(false);
    };

    return (
        <div className={`searchable-select ${disabled ? 'is-disabled' : ''}`} ref={containerRef}>
            {required ? (
                <input
                    className="searchable-select-required"
                    value={value || ''}
                    required
                    readOnly
                    tabIndex={-1}
                    onChange={() => {}}
                />
            ) : null}
            <button
                type="button"
                className="form-control searchable-select-trigger"
                disabled={disabled}
                onClick={() => {
                    if (!disabled) setOpen((current) => !current);
                }}
            >
                <span className={closedLabel ? '' : 'is-placeholder'}>
                    {closedLabel || emptyLabel}
                </span>
            </button>
            {open && !disabled && (
                <div className="searchable-select-panel" role="listbox">
                    <input
                        type="text"
                        className="form-control searchable-select-query"
                        placeholder={placeholder}
                        value={query}
                        autoFocus
                        onChange={(event) => setQuery(event.target.value)}
                    />
                    <div className="searchable-select-options">
                        {!required && (
                            <button type="button" className="searchable-select-option" onClick={() => choose(null)}>
                                {emptyLabel}
                            </button>
                        )}
                        {loading && <div className="searchable-select-hint">Searching...</div>}
                        {!loading && visibleOptions.length === 0 && (
                            <div className="searchable-select-hint">No matches</div>
                        )}
                        {!loading && visibleOptions.map((option) => (
                            <button
                                key={String(option.value)}
                                type="button"
                                className={`searchable-select-option ${String(option.value) === String(value) ? 'is-active' : ''}`}
                                onClick={() => choose(option)}
                            >
                                {option.label}
                            </button>
                        ))}
                        {!loading && visibleOptions.length >= limit && (
                            <div className="searchable-select-hint">
                                Showing {limit}. Type to narrow the list.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
