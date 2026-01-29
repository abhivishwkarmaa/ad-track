import React from 'react';
import './Maintenance.css';

const MaintenanceIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="maintenance-icon">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
    </svg>
);

const Maintenance = () => {
    return (
        <div className="maintenance-page">
            <div className="maintenance-content">
                <MaintenanceIcon />
                <h1 className="maintenance-title">Server Under Maintenance</h1>
                <p className="maintenance-text">
                    We are currently performing scheduled maintenance to improve our services.
                    Please check back soon.
                </p>
                <button
                    className="retry-button"
                    onClick={() => window.location.reload()}
                >
                    Retry Connection
                </button>
            </div>
        </div>
    );
};

export default Maintenance;
