import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import logoImage from '../../assets/logo.png';
import './Sidebar.css';

// Icons as SVG components - matching the image style (outline icons)
const DashboardIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="14" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
    </svg>
);

const OfferIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
);

const AffiliateIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const AdvertiserIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <circle cx="18" cy="7" r="2" />
    </svg>
);

const AssignmentIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
);

const ReportsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <path d="M10 9h1" />
    </svg>
);

const SettingsIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
);

const TenantIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
);

const ImportIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
);

const ContactIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
        <polyline points="22,6 12,13 2,6" />
    </svg>
);

const LogoutIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
);

const AccountIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
        <circle cx="18" cy="7" r="2" />
    </svg>
);

const PostbackIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
);

function Sidebar({ collapsed, mobileOpen, onCloseMobile }) {
    const { user, logout } = useAuth();
    const location = useLocation();
    const navigate = useNavigate();

    // Check if on admin subdomain
    const hostname = window.location.hostname;
    const isAdminDomain = hostname.startsWith('admin');

    const isActive = (path) => {
        return location.pathname.startsWith(path);
    };

    const LogsIcon = () => (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <path d="M10 9h1" />
        </svg>
    );

    const handleNavClick = (item) => {
        navigate(item.path);
        onCloseMobile();
    };

    const menuItems = [
        // Tenant Specific Items (Hide on Admin Domain)
        ...(!isAdminDomain ? [
            {
                type: 'link',
                path: '/',
                icon: <DashboardIcon />,
                text: 'Dashboard',
                exact: true
            },
            {
                type: 'link',
                path: '/offer/list',
                icon: <OfferIcon />,
                text: 'Offers'
            },
            {
                type: 'link',
                path: '/reports',
                icon: <ReportsIcon />,
                text: 'Reports / Logs'
            },
            {
                type: 'link',
                path: '/affiliate/manage',
                icon: <AffiliateIcon />,
                text: 'Publishers'
            },
            {
                type: 'link',
                path: '/affiliate/postback-test',
                icon: <PostbackIcon />,
                text: 'Test Postback'
            },
            {
                type: 'link',
                path: '/advertiser/manage',
                icon: <AdvertiserIcon />,
                text: 'Advertisers'
            },
            {
                type: 'link',
                path: '/assignment/manage',
                icon: <AssignmentIcon />,
                text: 'Assignment'
            },
            // {
            //     type: 'link',
            //     path: '/import',
            //     icon: <ImportIcon />,
            //     text: 'Import'
            // }
        ] : []),

        // Admin Specific Items (Show ONLY on Admin Domain)
        ...(isAdminDomain ? [
            {
                type: 'link',
                path: '/tenant/manage',
                icon: <TenantIcon />,
                text: 'Tenants'
            },
            {
                type: 'link',
                path: '/contact-submissions',
                icon: <ContactIcon />,
                text: 'Contact Submissions'
            }
        ] : []),

        {
            type: 'link',
            path: '/settings/profile',
            icon: <AccountIcon />,
            text: 'Account'
        }
    ];

    const handleLogout = () => {
        logout();
        onCloseMobile();
    };

    return (
        <>
            {/* Overlay only for desktop side drawer, not for mobile top nav */}
            <div className={`sidebar-overlay ${mobileOpen ? 'show' : ''}`} onClick={onCloseMobile}></div>
            <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
                <div className="sidebar-header">
                    <div className="sidebar-logo">
                        {logoImage ? (
                            <img src={logoImage} alt="Track MyAds Logo" />
                        ) : (
                            <span className="sidebar-logo-text">TM</span>
                        )}
                    </div>
                    <span className="sidebar-brand">Track MyAds</span>
                </div>

                <nav className="sidebar-nav">
                    <div className="nav-section-title">NAVIGATION</div>
                    {menuItems.map((item, index) => {
                        const isItemActive = item.exact
                            ? location.pathname === item.path
                            : location.pathname.startsWith(item.path);

                        return (
                            <NavLink
                                key={index}
                                to={item.path}
                                className={({ isActive: active }) =>
                                    `nav-item ${item.exact ? (location.pathname === item.path ? 'active' : '') : (active ? 'active' : '')}`
                                }
                                data-tooltip={item.text}
                                onClick={() => onCloseMobile()}
                                end={item.exact}
                            >
                                <span className="nav-item-icon">{item.icon}</span>
                                <span className="nav-item-text">{item.text}</span>
                            </NavLink>
                        );
                    })}
                </nav>

                <div className="sidebar-footer">
                    <div className="sidebar-user">
                        <div className="sidebar-avatar">
                            {user?.fullName?.charAt(0) || 'U'}
                        </div>
                        <div className="sidebar-user-info">
                            <div className="sidebar-user-name">{user?.fullName || 'User'}</div>
                            <div className="sidebar-user-role">{user?.role || 'Admin'}</div>
                        </div>
                    </div>
                    <div
                        className="nav-item"
                        onClick={handleLogout}
                        style={{ marginTop: '12px', cursor: 'pointer' }}
                        data-tooltip="Logout"
                    >
                        <span className="nav-item-icon"><LogoutIcon /></span>
                        <span className="nav-item-text">Logout</span>
                    </div>
                </div>
            </aside>
        </>
    );
}

export default Sidebar;
