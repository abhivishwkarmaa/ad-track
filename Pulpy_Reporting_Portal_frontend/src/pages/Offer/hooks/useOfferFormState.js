import { useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { DEFAULT_TOKEN_MAPPINGS } from '../utils/offerFormState';

/**
 * Shared form UI state + handlers for NewOffer and EditOffer.
 */
export function useOfferFormState(initialFormData) {
    const toast = useToast();
    const [formData, setFormData] = useState(initialFormData);
    const [showTokenTable, setShowTokenTable] = useState(false);
    const [showMacrosInfo, setShowMacrosInfo] = useState(false);
    const [tokenMappings, setTokenMappings] = useState([]);
    const [showCustomCategory, setShowCustomCategory] = useState(false);
    const [showCustomCountry, setShowCustomCountry] = useState(false);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (type === 'checkbox') {
            setFormData((prev) => ({ ...prev, [name]: checked }));
        } else if (type === 'select-multiple') {
            const selectedValues = Array.from(e.target.selectedOptions, (option) => option.value);
            setFormData((prev) => ({ ...prev, [name]: selectedValues }));
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }));
            if (name === 'token_type' && value) {
                setShowTokenTable(true);
                if (tokenMappings.length === 0) {
                    setTokenMappings(DEFAULT_TOKEN_MAPPINGS);
                }
            } else if (name === 'token_type' && !value) {
                setShowTokenTable(false);
            }
        }
    };

    const handleTokenMappingChange = (id, field, value) => {
        setTokenMappings((prev) =>
            prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    const handleTestOfferLink = () => {
        const urlToTest = formData.preview_url || formData.offer_url;
        if (urlToTest) {
            window.open(urlToTest, '_blank');
        } else {
            toast.error('Please enter an Offer URL first');
        }
    };

    return {
        formData,
        setFormData,
        showTokenTable,
        setShowTokenTable,
        showMacrosInfo,
        setShowMacrosInfo,
        tokenMappings,
        setTokenMappings,
        showCustomCategory,
        setShowCustomCategory,
        showCustomCountry,
        setShowCustomCountry,
        handleChange,
        handleTokenMappingChange,
        handleTestOfferLink,
    };
}
