import { useEffect, useMemo, useState } from 'react';
import { offersAPI, publishersAPI, advertisersAPI } from '../../services/api';
import { isAbortError } from '../../hooks/useAbortableRequest';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import SearchableSelect from './SearchableSelect';

function offerLabel(item) {
    const publicId = item.public_offer_id;
    return publicId != null && publicId !== '' ? `#${publicId} — ${item.name}` : item.name;
}

function publisherLabel(item) {
    const name = item.company_name || item.first_name || item.email || 'Publisher';
    const publicId = item.public_publisher_id;
    const base = publicId != null && publicId !== '' ? `#${publicId} — ${name}` : name;
    return item.email && !base.includes(item.email) ? `${base} (${item.email})` : base;
}

function advertiserLabel(item) {
    const name = item.name || item.company_name || 'Advertiser';
    const publicId = item.public_advertiser_id;
    return publicId != null && publicId !== '' ? `#${publicId} — ${name}` : name;
}

function itemValue(type, valueField, item) {
    if (type === 'offer') {
        return valueField === 'public' ? item.public_offer_id : item.id;
    }
    if (type === 'publisher') {
        return valueField === 'public' ? item.public_publisher_id : item.id;
    }
    return valueField === 'public' ? item.public_advertiser_id : item.id;
}

function itemLabel(type, item) {
    if (type === 'offer') return offerLabel(item);
    if (type === 'publisher') return publisherLabel(item);
    return advertiserLabel(item);
}

export default function EntityPicker({
    type,
    value = '',
    onChange,
    valueField = 'id',
    placeholder,
    emptyLabel = 'Select...',
    disabled = false,
    required = false,
    status,
    excludeValues = [],
    excludePublicOfferId,
    selectedLabel = '',
}) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pickedLabel, setPickedLabel] = useState('');
    const excludeKey = excludeValues.map(String).join('|');

    const resolvedPlaceholder = placeholder
        || (type === 'offer'
            ? 'Search name or public offer ID'
            : type === 'publisher'
                ? 'Search name, email, or public publisher ID'
                : 'Search name or public advertiser ID');

    useEffect(() => {
        if (!value) setPickedLabel('');
    }, [value]);

    useEffect(() => {
        if (valueField !== 'public' || !value || selectedLabel) return undefined;
        const controller = new AbortController();
        const loadLabel = async () => {
            try {
                const requestOptions = { signal: controller.signal };
                let response;
                if (type === 'offer') response = await offersAPI.getOffer(value, requestOptions);
                else if (type === 'publisher') response = await publishersAPI.getPublisher(value, requestOptions);
                else response = await advertisersAPI.getAdvertiser(value, requestOptions);
                if (!controller.signal.aborted && response?.success && response.data) {
                    setPickedLabel(itemLabel(type, response.data));
                }
            } catch (error) {
                if (!isAbortError(error) && !controller.signal.aborted) setPickedLabel('');
            }
        };
        loadLabel();
        return () => controller.abort();
    }, [value, type, valueField, selectedLabel]);

    useEffect(() => {
        const controller = new AbortController();
        const run = async () => {
            try {
                setLoading(true);
                const params = { limit: LIST_PAGE_SIZE, page: 1 };
                const term = query.trim();
                if (term) params.search = term;
                if (status) {
                    if (type === 'offer') params.type = status;
                    else params.status = status;
                }
                const requestOptions = { signal: controller.signal };
                let response;
                if (type === 'offer') response = await offersAPI.getOffers(params, requestOptions);
                else if (type === 'publisher') response = await publishersAPI.getPublishers(params, requestOptions);
                else response = await advertisersAPI.getAdvertisers(params, requestOptions);
                if (!controller.signal.aborted) {
                    setRows(response?.success ? (response.data || []) : []);
                }
            } catch (error) {
                if (!isAbortError(error) && !controller.signal.aborted) setRows([]);
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };
        run();
        return () => controller.abort();
    }, [query, type, status]);

    const options = useMemo(() => {
        const excluded = new Set(excludeKey ? excludeKey.split('|') : []);
        return rows
            .map((item) => ({
                value: itemValue(type, valueField, item),
                label: itemLabel(type, item),
                item,
            }))
            .filter((option) => {
                if (option.value == null || option.value === '' || excluded.has(String(option.value))) return false;
                if (excludePublicOfferId != null && excludePublicOfferId !== ''
                    && String(option.item?.public_offer_id) === String(excludePublicOfferId)) {
                    return false;
                }
                return true;
            });
    }, [rows, type, valueField, excludeKey, excludePublicOfferId]);

    return (
        <SearchableSelect
            value={value}
            selectedLabel={pickedLabel || selectedLabel}
            options={options}
            placeholder={resolvedPlaceholder}
            emptyLabel={emptyLabel}
            disabled={disabled}
            required={required}
            loading={loading}
            remote
            onQueryChange={setQuery}
            onChange={(nextValue, option) => {
                setPickedLabel(option?.label || '');
                onChange(nextValue, option?.item || null);
            }}
        />
    );
}
