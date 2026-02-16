import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import './Header.css';

const MenuIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
);

const SunIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
);

const MoonIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
);

const SearchIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
);


function Header({
    onToggleSidebar,
    onToggleMobileMenu,
    subscriptionAlert,
    expiredWarningAlert
}) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const { isDarkMode, toggleTheme } = useTheme();

    const handleAccountClick = () => {
        navigate('/settings/profile');
    };

    return (
        <header className="header">
            <div className="header-left">
                <button className="header-toggle" onClick={onToggleSidebar} title="Toggle Sidebar">
                    <MenuIcon />
                </button>
                <button
                    className="header-toggle mobile-only"
                    onClick={onToggleMobileMenu}
                    aria-label="Toggle Mobile Menu"
                >
                    <MenuIcon />
                </button>
                <div className="header-search">
                    <SearchIcon />
                    <input type="text" placeholder="Search..." />
                </div>
            </div>

            <div className="header-right">
                {(subscriptionAlert || expiredWarningAlert) && (
                    <div
                        className={`header-subscription-alert ${expiredWarningAlert ? 'header-subscription-alert-expired' : ''}`}
                        title={expiredWarningAlert || subscriptionAlert}
                    >
                        <span className="header-subscription-alert-text">
                            {expiredWarningAlert || subscriptionAlert}
                        </span>
                    </div>
                )}
                <button 
                    className="header-icon-btn theme-toggle-btn" 
                    onClick={toggleTheme}
                    title={isDarkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    aria-label="Toggle Theme"
                    type="button"
                >
                    {isDarkMode ? <SunIcon /> : <MoonIcon />}
                </button>
                <div className="header-user" onClick={handleAccountClick} style={{ cursor: 'pointer' }}>
                    <div className="header-avatar">
                        {user?.fullName?.charAt(0) || 'U'}
                    </div>
                    <div className="header-user-info">
                        <span className="header-user-name">{user?.fullName || 'User'}</span>
                        <span className="header-user-email">{user?.email || 'user@example.com'}</span>
                    </div>
                </div>
            </div>
        </header>
    );
}

export default Header;
