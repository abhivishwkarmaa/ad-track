import { useEffect, useState } from 'react';
import './SubscriptionExpiryModal.css';

function SubscriptionExpiryModal({ open, onClose }) {
    const [secondsRemaining, setSecondsRemaining] = useState(10);

    useEffect(() => {
        if (!open) return undefined;

        setSecondsRemaining(10);

        const intervalId = setInterval(() => {
            setSecondsRemaining((prev) => {
                if (prev <= 1) {
                    clearInterval(intervalId);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(intervalId);
    }, [open]);

    if (!open) return null;

    return (
        <div className="subscription-expiry-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="subscription-expiry-title">
            <div className="subscription-expiry-modal-card">
                <h3 id="subscription-expiry-title">Your Plan Has Expired</h3>
                <p>
                    Your trial or subscription period has ended. Please renew your plan to avoid service interruption.
                </p>
                <div className="subscription-expiry-modal-actions">
                    <button
                        type="button"
                        className="subscription-expiry-modal-ok"
                        onClick={onClose}
                        disabled={secondsRemaining > 0}
                    >
                        {secondsRemaining > 0 ? `Wait for ${secondsRemaining} seconds` : 'OK'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SubscriptionExpiryModal;
