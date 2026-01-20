import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import { DataProvider } from '../../context/DataContext';
import { dashboardAPI } from '../../services/api';
import './Layout.css';

function Layout() {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSuspended, setIsSuspended] = useState(false);
    const [checkingStatus, setCheckingStatus] = useState(true);

    const toggleSidebar = () => {
        setSidebarCollapsed(!sidebarCollapsed);
    };

    const toggleMobileMenu = () => {
        setMobileMenuOpen(!mobileMenuOpen);
    };

    // Check if tenant is suspended on mount
    useEffect(() => {
        const checkTenantStatus = async () => {
            try {
                // Make a lightweight API call to check if tenant is accessible
                await dashboardAPI.getDashboardCards();
                setIsSuspended(false);
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
