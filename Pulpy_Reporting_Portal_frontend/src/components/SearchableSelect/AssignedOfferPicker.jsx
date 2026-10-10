import { useEffect, useMemo, useState } from 'react';
import { assignmentsAPI } from '../../services/api';
import { isAbortError } from '../../hooks/useAbortableRequest';
import { LIST_PAGE_SIZE } from '../../constants/listLimits';
import SearchableSelect from './SearchableSelect';

function assignmentLabel(assignment) {
    const publicId = assignment.public_offer_id;
    const name = assignment.offer_name || 'Offer';
    return publicId != null && publicId !== '' ? `#${publicId} — ${name}` : name;
}

/**
 * Fallback picker: only active offers already assigned to this publisher.
 * Search matches offer name and public offer ID.
 */
export default function AssignedOfferPicker({
    publisherId,
    excludeOfferId,
    value = '',
    onChange,
    required = false,
    disabled = false,
    selectedLabel = '',
}) {
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [pickedLabel, setPickedLabel] = useState('');

    useEffect(() => {
        if (!value) setPickedLabel('');
    }, [value]);

    useEffect(() => {
        if (!publisherId) {
            setRows([]);
            return undefined;
        }
        const controller = new AbortController();
        const run = async () => {
            try {
                setLoading(true);
                const params = {
                    publisher_id: publisherId,
                    status: 'active',
                    limit: LIST_PAGE_SIZE,
                    page: 1,
                };
                const term = query.trim();
                if (term) params.search = term;
                const response = await assignmentsAPI.getAssignments(params, { signal: controller.signal });
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
    }, [publisherId, query]);

    const options = useMemo(() => {
        return rows
            .filter((assignment) => String(assignment.offer_id) !== String(excludeOfferId))
            .map((assignment) => ({
                value: String(assignment.offer_id),
                label: assignmentLabel(assignment),
                item: assignment,
            }));
    }, [rows, excludeOfferId]);

    return (
        <SearchableSelect
            value={value}
            selectedLabel={pickedLabel || selectedLabel}
            options={options}
            placeholder="Search assigned offers by name or public offer ID"
            emptyLabel="Select offer…"
            required={required}
            disabled={disabled || !publisherId}
            loading={loading}
            remote
            onQueryChange={setQuery}
            onChange={(nextValue, option) => {
                setPickedLabel(option?.label || '');
                onChange(nextValue || '', option?.item || null);
            }}
        />
    );
}
