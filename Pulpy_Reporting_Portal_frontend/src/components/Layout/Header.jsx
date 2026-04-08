import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import './Header.css';

const MenuIcon = () => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <line x1="3" y1="12" x2="21" y2="12" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
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
