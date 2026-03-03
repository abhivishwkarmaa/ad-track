import './VersionGuard.css';

function ForceUpdateScreen({ retryMessage, onRefresh }) {
    return (
        <div className="version-force-screen" role="alert" aria-live="assertive">
            <div className="version-force-card">
                <h2>System updated. Please refresh to continue.</h2>
                <p>Your current session is no longer compatible with the latest backend updates.</p>
                <button className="version-primary" onClick={onRefresh}>Refresh</button>
                {retryMessage ? <p className="version-retry-message">{retryMessage}</p> : null}
            </div>
        </div>
    );
}

export default ForceUpdateScreen;

