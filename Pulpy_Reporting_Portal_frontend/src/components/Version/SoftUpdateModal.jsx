import './VersionGuard.css';

function SoftUpdateModal({ latestVersion, releaseNotes, onRefreshNow, onLater }) {
    return (
        <div className="version-soft-update-backdrop" role="dialog" aria-modal="true" aria-labelledby="soft-update-title">
            <div className="version-soft-update-card">
                <h3 id="soft-update-title">New update available</h3>
                <p>A newer release is ready. Refresh now to keep data and UI fully in sync.</p>
                {latestVersion && <p className="version-meta">Latest version: {latestVersion}</p>}
                {releaseNotes && <p className="version-notes">{releaseNotes}</p>}
                <div className="version-actions">
                    <button className="version-primary" onClick={onRefreshNow}>Refresh Now</button>
                    <button className="version-secondary" onClick={onLater}>Later</button>
                </div>
            </div>
        </div>
    );
}

export default SoftUpdateModal;

