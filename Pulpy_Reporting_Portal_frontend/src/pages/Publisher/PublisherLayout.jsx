import { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logoImage from '../../assets/logo.png';
import './PublisherLayout.css';

export default function PublisherLayout() {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    useEffect(() => {
        document.body.style.overflow = mobileMenuOpen ? 'hidden' : '';
        return () => {
            document.body.style.overflow = '';
        };
    }, [mobileMenuOpen]);

    const handleLogout = async () => {
        await logout();
        navigate('/login');
    };

    const getPageTitle = () => {
        const path = location.pathname;
        if (path.includes('/offers')) return 'Assigned Offers & Links';
        if (path.includes('/reports')) return 'Performance Reports';
        if (path.includes('/settings')) return 'Postback & Settings';
        return 'Publisher Dashboard';
    };

    return (
        <div className="pub-portal">
            {/* Left Sidebar */}
            <aside className={`pub-sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
                <div className="pub-sidebar-brand">
                    <div className="pub-logo-box">
                        {logoImage ? (
                            <img src={logoImage} alt="Logo" />
                        ) : (
                            <span className="pub-logo-initial">TM</span>
                        )}
                    </div>
                    <div className="pub-brand-text">
                        <span className="pub-brand-name">{user?.companyName || 'Track MyAds'}</span>
                        <span className="pub-brand-tag">Publisher Portal</span>
                    </div>
                </div>

                <nav className="pub-nav-menu">
                    <NavLink
                        to="/"
                        end
                        className={({ isActive }) => `pub-nav-link ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pub-nav-icon">
                            <rect x="3" y="3" width="7" height="9" rx="1" />
                            <rect x="14" y="3" width="7" height="5" rx="1" />
                            <rect x="14" y="12" width="7" height="9" rx="1" />
                            <rect x="3" y="16" width="7" height="5" rx="1" />
                        </svg>
                        <span>Dashboard</span>
                    </NavLink>

                    <NavLink
                        to="/offers"
                        className={({ isActive }) => `pub-nav-link ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pub-nav-icon">
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                        </svg>
                        <span>My Offers</span>
                    </NavLink>

                    <NavLink
                        to="/reports"
                        className={({ isActive }) => `pub-nav-link ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pub-nav-icon">
                            <line x1="18" y1="20" x2="18" y2="10" />
                            <line x1="12" y1="20" x2="12" y2="4" />
                            <line x1="6" y1="20" x2="6" y2="14" />
                        </svg>
                        <span>Reports</span>
                    </NavLink>

                    <NavLink
                        to="/settings"
                        className={({ isActive }) => `pub-nav-link ${isActive ? 'active' : ''}`}
                        onClick={() => setMobileMenuOpen(false)}
                    >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pub-nav-icon">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                        <span>Postback & Settings</span>
                    </NavLink>
                </nav>

                <div className="pub-sidebar-footer">
                    <div className="pub-user-card">
                        <div className="pub-user-avatar">
                            {(user?.name || user?.email || 'P').charAt(0).toUpperCase()}
                        </div>
                        <div className="pub-user-meta">
                            <span className="pub-user-name" title={user?.name || user?.email}>
                                {user?.name || user?.email}
                            </span>
                            <span className="pub-user-id">Pub #{user?.public_publisher_id || user?.id}</span>
                        </div>
                    </div>

                    <button type="button" className="pub-logout-btn" onClick={handleLogout} title="Sign Out">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="pub-logout-icon">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                            <polyline points="16 17 21 12 16 7" />
                            <line x1="21" y1="12" x2="9" y2="12" />
                        </svg>
                        <span>Sign Out</span>
                    </button>
                </div>
            </aside>

            {/* Mobile backdrop */}
            {mobileMenuOpen && (
                <div className="pub-mobile-backdrop" onClick={() => setMobileMenuOpen(false)} />
            )}

            {/* Main Area */}
            <div className="pub-main-area">
                <header className="pub-top-header">
                    <div className="pub-header-left">
                        <button
                            type="button"
                            className="pub-mobile-toggle"
                            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                            aria-label="Toggle menu"
                        >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="3" y1="12" x2="21" y2="12" />
                                <line x1="3" y1="6" x2="21" y2="6" />
                                <line x1="3" y1="18" x2="21" y2="18" />
                            </svg>
                        </button>
                        <h1 className="pub-page-title">{getPageTitle()}</h1>
                    </div>

                    <div className="pub-header-right">
                        <span className="pub-partner-badge">
                            <span className="pub-pulse-dot" />
                            Active Affiliate
                        </span>
                    </div>
                </header>

                <main className="pub-content-body">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
