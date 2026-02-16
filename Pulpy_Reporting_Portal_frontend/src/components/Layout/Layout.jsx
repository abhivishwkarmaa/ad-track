import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import SubscriptionExpiryModal from './SubscriptionExpiryModal';
import { DataProvider } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { subscriptionAPI } from '../../services/api';
import { formatDateTimeIST } from '../../utils/dateTime';
import { isSubscriptionExpired } from '../../utils/subscription';
import './Layout.css';

const SUBSCRIPTION_POPUP_SHOWN_KEY = 'subscription_popup_shown';

function Layout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSuspended, setIsSuspended] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);
    const [subscriptionStatus, setSubscriptionStatus] = useState(null);
    const [isExpired, setIsExpired] = useState(false);
    const [showExpiryModal, setShowExpiryModal] = useState(false);
    const [isBannerDismissed, setIsBannerDismissed] = useState(false);
    const { user } = useAuth();

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    const formatTimeRemaining = (endDate) => {
        if (!endDate) return null;
        const end = new Date(endDate);
        if (Number.isNaN(end.getTime())) return null;
        const diffMs = end.getTime() - Date.now();
        if (diffMs <= 0) return null;
        const totalMinutes = Math.ceil(diffMs / (60 * 1000));
        const days = Math.floor(totalMinutes / (24 * 60));
        const hours = Math.floor((totalMinutes - days * 24 * 60) / 60);
        const minutes = totalMinutes - days * 24 * 60 - hours * 60;

        const parts = [];
        if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
        if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
        if (days === 0 && hours === 0) {
            parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
        }
        return parts.join(' ');
    };

    const getExpiringAlert = (status) => {
        const subscription = status?.subscription;
        if (!subscription || subscription.days_left === null) return null;

        const endDate = subscription.end_date;
        const remaining = formatTimeRemaining(endDate);
        const endDateIst = formatDateTimeIST(endDate, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
        }, 'en-US');
        if (!remaining || !endDateIst) {
            return null;
        }

        if (subscription.is_trial) {
            return `Trial: ${remaining} left (IST ${endDateIst})`;
        }

        if (!subscription.is_warning) {
            return null;
        }

        return `Subscription expires in ${remaining} (IST ${endDateIst})`;
    };

    const handleCloseExpiryModal = () => {
        setShowExpiryModal(false);
        localStorage.setItem(SUBSCRIPTION_POPUP_SHOWN_KEY, 'true');
    };

    // Fetch subscription status on mount
    useEffect(() => {
        const checkTenantStatus = async () => {
            if (!user?.tenant_id) {
                setCheckingStatus(false);
                return;
            }

            try {
                const response = await subscriptionAPI.getStatus();
                if (response?.success) {
                    const status = response.data;
                    setSubscriptionStatus(status);
                    setIsSuspended(Boolean(status?.subscription?.is_suspended));
                    const expired = isSubscriptionExpired(status?.tenant);
                    setIsExpired(expired);

                    if (!expired) {
                        setShowExpiryModal(false);
                        setIsBannerDismissed(false);
                        localStorage.removeItem(SUBSCRIPTION_POPUP_SHOWN_KEY);
                    } else {
                        const popupAlreadyShown = localStorage.getItem(SUBSCRIPTION_POPUP_SHOWN_KEY) === 'true';
                        setShowExpiryModal(!popupAlreadyShown);
                        setIsBannerDismissed(false);
                    }
                } else {
                    setSubscriptionStatus(null);
                    setIsExpired(false);
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
    }, [user?.tenant_id]);

    // Show loading while checking status
    if (checkingStatus) {
        return (
            <div className="layout-checking">
                <div className="spinner"></div>
            </div>
        );
    }

    // Show suspended message if tenant is suspended
    if (isSuspended && user?.tenant_id) {
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
                    <Header
                        onToggleSidebar={toggleSidebar}
                        onToggleMobileMenu={toggleMobileMenu}
                        subscriptionAlert={!isExpired ? getExpiringAlert(subscriptionStatus) : null}
                        expiredWarningAlert={isExpired && !isBannerDismissed ? '⚠ Your subscription has expired. Please renew your plan.' : null}
                        onDismissExpiredWarning={() => setIsBannerDismissed(true)}
                    />
                    <main className="layout-content">
                        <Outlet />
                    </main>
                </div>
            </div>
            <SubscriptionExpiryModal
                open={isExpired && showExpiryModal}
                onClose={handleCloseExpiryModal}
            />
        </DataProvider>
    );
}

export default Layout;
