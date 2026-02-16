import './SubscriptionExpiryModal.css';

function SubscriptionExpiryModal({ open, onClose }) {
    if (!open) return null;

    return (
        <div className="subscription-expiry-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="subscription-expiry-title">
            <div className="subscription-expiry-modal-card">
                <button
                    type="button"
                    className="subscription-expiry-modal-close"
                    onClick={onClose}
                    aria-label="Close expiry warning"
                >
                    ×
                </button>
                <h3 id="subscription-expiry-title">Your Plan Has Expired</h3>
                <p>
                    Your trial or subscription period has ended. Please renew your plan to avoid service interruption.
                </p>
                <div className="subscription-expiry-modal-actions">
                    <button
                        type="button"
                        className="subscription-expiry-modal-ok"
                        onClick={onClose}
                    >
                        OK
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SubscriptionExpiryModal;
