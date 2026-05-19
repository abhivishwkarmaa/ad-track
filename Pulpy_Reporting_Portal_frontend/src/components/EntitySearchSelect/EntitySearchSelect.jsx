import { useState, useEffect, useRef, useCallback } from 'react';
import { offersAPI, publishersAPI, advertisersAPI } from '../../services/api';
import './EntitySearchSelect.css';

const LIST_LIMIT = 100;
const SEARCH_LIMIT = 50;

function formatOfferLabel(item) {
    const displayId = item.display_id ?? item.public_offer_id ?? item.id;
    return `${displayId} — ${item.name}`;
}

function formatPublisherLabel(item) {
    const pubId = item.public_publisher_id ?? item.public_id;
    const name = item.company_name || item.first_name || item.email || `Publisher #${item.id}`;
    const base = pubId ? `${pubId} — ${name}` : name;
    return item.email && !base.includes(item.email) ? `${base} (${item.email})` : base;
}

function formatAdvertiserLabel(item) {
    const name = item.name || item.company_name || `Advertiser #${item.id}`;
    const pubId = item.public_advertiser_id;
    return pubId ? `${pubId} — ${name}` : name;
}

/** Empty query → full list; non-empty → server-side search */
async function fetchEntities(type, query) {
    const q = query.trim();
    const hasQuery = q.length > 0;

    if (type === 'offer') {
        const params = hasQuery ? { search: q, limit: SEARCH_LIMIT } : { limit: LIST_LIMIT };
        const res = await offersAPI.getOffers(params);
        return res.success ? (res.data || []) : [];
    }
    if (type === 'publisher') {
        const params = hasQuery ? { search: q, limit: SEARCH_LIMIT } : { limit: LIST_LIMIT };
        const res = await publishersAPI.getPublishers(params);
        return res.success ? (res.data || []) : [];
    }
    if (type === 'advertiser') {
        const params = hasQuery ? { search: q, limit: SEARCH_LIMIT } : { limit: LIST_LIMIT };
        const res = await advertisersAPI.getAdvertisers(params);
        return res.success ? (res.data || []) : [];
    }
    return [];
}

async function fetchEntityLabel(type, id) {
    if (!id || id === 'all') return null;
    try {
        if (type === 'offer') {
            const res = await offersAPI.getOffer(id);
            if (res.success && res.data) return formatOfferLabel(res.data);
        }
        if (type === 'publisher') {
            const res = await publishersAPI.getPublisher(id);
            if (res.success && res.data) return formatPublisherLabel(res.data);
        }
        if (type === 'advertiser') {
            const res = await advertisersAPI.getAdvertiser(id);
            if (res.success && res.data) return formatAdvertiserLabel(res.data);
        }
    } catch {
        return null;
    }
    return null;
}

function EntitySearchSelect({
    type,
    value = 'all',
    onChange,
    label,
    placeholder,
    className = '',
}) {
    const [inputValue, setInputValue] = useState('');
    const [selectedLabel, setSelectedLabel] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const containerRef = useRef(null);

    const allLabel =
        type === 'offer' ? 'All offers' : type === 'publisher' ? 'All publishers' : 'All advertisers';

    const resolvedPlaceholder =
        placeholder ||
        (type === 'offer'
            ? 'Type to search, or pick from list...'
            : type === 'publisher'
              ? 'Type to search publishers, or pick from list...'
              : 'Type to search advertisers, or pick from list...');

    useEffect(() => {
        let cancelled = false;
        if (value === 'all') {
            setSelectedLabel('');
            return undefined;
        }
        fetchEntityLabel(type, value).then((lbl) => {
            if (!cancelled) setSelectedLabel(lbl || `ID: ${value}`);
        });
        return () => {
            cancelled = true;
        };
    }, [type, value]);

    useEffect(() => {
        const onDocClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, []);

    useEffect(() => {
        if (!open || value !== 'all') return undefined;

        const timer = setTimeout(async () => {
            try {
                setLoading(true);
                const items = await fetchEntities(type, inputValue);
                setResults(items);
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [inputValue, type, open, value]);

    const handleSelect = useCallback(
        (nextValue, labelText = '') => {
            onChange(nextValue);
            setSelectedLabel(labelText);
            setInputValue('');
            setResults([]);
            setOpen(false);
        },
        [onChange]
    );

    const formatItem = (item) => {
        if (type === 'offer') return formatOfferLabel(item);
        if (type === 'publisher') return formatPublisherLabel(item);
        return formatAdvertiserLabel(item);
    };

    const showDropdown = open && value === 'all';
    const hasQuery = inputValue.trim().length > 0;

    return (
        <div className={`entity-search-select ${className}`.trim()}>
            {label ? <label className="entity-search-label">{label}</label> : null}
            <div ref={containerRef} className="entity-search-wrap">
                {value !== 'all' && selectedLabel ? (
                    <div className="entity-search-selected">
                        <span className="entity-search-selected-text" title={selectedLabel}>
                            {selectedLabel}
                        </span>
                        <button
                            type="button"
                            className="entity-search-clear-btn"
                            onClick={() => handleSelect('all')}
                            aria-label="Clear selection"
                        >
                            ×
                        </button>
                    </div>
                ) : (
                    <input
                        type="text"
                        className="form-control entity-search-input"
                        placeholder={resolvedPlaceholder}
                        value={inputValue}
                        onChange={(e) => {
                            setInputValue(e.target.value);
                            setOpen(true);
                        }}
                        onFocus={() => setOpen(true)}
                    />
                )}
                {showDropdown && (
                    <div className="entity-search-dropdown" role="listbox">
                        <button
                            type="button"
                            className="entity-search-option entity-search-option-all"
                            role="option"
                            onClick={() => handleSelect('all')}
                        >
                            {allLabel}
                        </button>
                        {loading && <div className="entity-search-hint">Loading...</div>}
                        {!loading && hasQuery && results.length === 0 && (
                            <div className="entity-search-hint">No matches found</div>
                        )}
                        {!loading && !hasQuery && results.length === 0 && (
                            <div className="entity-search-hint">No items available</div>
                        )}
                        {!loading &&
                            results.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className="entity-search-option"
                                    role="option"
                                    onClick={() => handleSelect(String(item.id), formatItem(item))}
                                >
                                    {formatItem(item)}
                                </button>
                            ))}
                        {!loading && !hasQuery && results.length >= LIST_LIMIT && (
                            <div className="entity-search-hint">Showing first {LIST_LIMIT}. Type to narrow down.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

export default EntitySearchSelect;
