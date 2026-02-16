import './SubscriptionWarningBanner.css';

function SubscriptionWarningBanner({ onClose }) {
    return (
        <div className="subscription-warning-banner" role="alert">
            <div className="subscription-warning-pill">
                <span className="subscription-warning-banner-text">
                    ⚠ Your subscription has expired. Please renew your plan.
                </span>
                <button
                    type="button"
                    className="subscription-warning-banner-close"
                    onClick={onClose}
                    aria-label="Dismiss subscription warning"
                >
                    ×
                </button>
            </div>
        </div>
    );
}

export default SubscriptionWarningBanner;
