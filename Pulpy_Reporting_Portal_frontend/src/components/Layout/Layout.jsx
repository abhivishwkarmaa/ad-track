import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { DataProvider } from '../../context/DataContext';
import { subscriptionAPI } from '../../services/api';
import './Layout.css';

function Layout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSuspended, setIsSuspended] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    const getCountdownText = (status) => {
        const subscription = status?.subscription;
        if (!subscription || subscription.days_left === null) return null;

        if (subscription.is_trial) {
            return `Trial: ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} left`;
        }

        if (subscription.is_active) {
            return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
        }

        return null;
    };

    const getWarningMessage = (status) => {
        const subscription = status?.subscription;
        if (!subscription) return null;

        if (subscription.is_expired) {
            return 'Your access has expired. Please contact billing@track-myads.com to continue.';
        }

        if (subscription.is_warning && subscription.days_left !== null) {
            if (subscription.is_trial) {
                return `Trial ending in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''} — upgrade to avoid interruption`;
            }
            return `Subscription expires in ${subscription.days_left} day${subscription.days_left !== 1 ? 's' : ''}`;
        }

        return null;
    };

    // Fetch subscription status on mount
    useEffect(() => {
        const checkTenantStatus = async () => {
            try {
                const response = await subscriptionAPI.getStatus();
                if (response?.success) {
                    const status = response.data;
                    setSubscriptionStatus(status);
                    setIsSuspended(Boolean(status?.subscription?.is_suspended));
                } else {
                    setSubscriptionStatus(null);
                }
            } catch (err) {
                const errorMessage = err?.message || err?.toString() || '';
                const isForbidden = errorMessage.includes('Forbidden') || 
                                   errorMessage.includes('403') || 
                                   errorMessage.includes('suspended') ||
                                   errorMessage.includes('tenant subdomain');
                
                if (isForbidden) {
                    setIsSuspended(true);
                }
            } finally {
                setCheckingStatus(false);
            }
        };

        checkTenantStatus();
    }, []);

    // Show loading while checking status
    if (checkingStatus) {
        return (
            <div className="layout-checking">
                <div className="spinner"></div>
            </div>
        );
    }

    // Show suspended message if tenant is suspended
    if (isSuspended) {
        return (
            <div className="layout-suspended">
                <div className="suspended-container">
                    <div className="suspended-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="10" />
                            <line x1="15" y1="9" x2="9" y2="15" />
                            <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                    </div>
                    <h2>Account Suspended</h2>
                    <p>Your account has been suspended.</p>
                    <p>Please contact your administrator for assistance.</p>
                </div>
            </div>
        );
    }

    return (
        <DataProvider>
            <div className={`layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
                <Sidebar
                    collapsed={sidebarCollapsed}
                    mobileOpen={mobileMenuOpen}
                    onCloseMobile={() => setMobileMenuOpen(false)}
                />
                <div className="layout-main">
                    {subscriptionStatus && (
                        <div className={`subscription-banner ${subscriptionStatus.subscription?.is_expired ? 'expired' : ''}`}>
                            <div className="subscription-banner-content">
                                <div className="subscription-banner-title">
                                    {getWarningMessage(subscriptionStatus) || getCountdownText(subscriptionStatus)}
                                </div>
                                {subscriptionStatus.subscription?.is_warning && getCountdownText(subscriptionStatus) && (
                                    <div className="subscription-banner-countdown">
                                        {getCountdownText(subscriptionStatus)}
                                    </div>
                                )}
                            </div>
                            <a
                                href="mailto:billing@track-myads.com"
                                className="subscription-banner-action"
                            >
                                Contact Billing
                            </a>
                        </div>
                    )}
                    <Header
                        onToggleSidebar={toggleSidebar}
                        onToggleMobileMenu={toggleMobileMenu}
                    />
                    <main className="layout-content">
                        <Outlet />
                    </main>
                </div>
            </div>
        </DataProvider>
    );
}

export default Layout;
