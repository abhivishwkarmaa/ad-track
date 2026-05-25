import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI, clearAccessToken } from '../services/api';
import { startActivityTracking, onLogoutEvent, getLastActivity, broadcastLogout } from '../utils/activityTracker';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const isLoggingOutRef = useRef(false);
    const IDLE_TIMEOUT_MS = 180 * 60 * 1000; // 180 minutes (3 hours) of inactivity before logout

    const clearLocalSession = ({ redirect = true, broadcast = false } = {}) => {
        setUser(null);
        setIsAuthenticated(false);
        clearAccessToken();
        localStorage.removeItem('track-myads_user');
        if (broadcast) {
            broadcastLogout();
        }
        if (redirect) {
            window.location.href = '/login';
        }
    };

    const handleLogout = async ({ redirect = true, broadcast = true, revokeServerSession = true } = {}) => {
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        if (revokeServerSession) {
            try {
                await authAPI.logout();
            } catch (error) {
                // Ignore logout errors - session may already be expired
            }
        }
        clearLocalSession({ redirect: false, broadcast: false });
        if (broadcast) {
            broadcastLogout();
        }
        if (redirect) {
            window.location.href = '/login';
        }
        isLoggingOutRef.current = false;
    };

    useEffect(() => {
        startActivityTracking();

        // Check for saved user in localStorage
        const savedUser = localStorage.getItem('track-myads_user');
        let parsedUser = null;
        if (savedUser) {
            try {
                parsedUser = JSON.parse(savedUser);
                // 🔒 STRICT: tenant_id in localStorage is ONLY for super admin role checks
                // It is NEVER used for tenant resolution - tenant comes from subdomain (Host header)
                // Ensure tenant_id is included (for backward compatibility with super admin checks)
                if (parsedUser.tenant_id === undefined) {
                    parsedUser.tenant_id = null;
                }
                if (parsedUser.mustChangePassword === undefined) {
                    parsedUser.mustChangePassword = false;
                }
                // Do not set isAuthenticated until refresh succeeds — avoids stale-session refresh on /login
            } catch (e) {
                console.error('Failed to parse saved user:', e);
                localStorage.removeItem('track-myads_user');
            }
        }

        const unsubscribe = onLogoutEvent(() => {
            if (isLoggingOutRef.current) return;
            clearLocalSession({ redirect: true });
        });

        const refreshIfNeeded = async () => {
            if (!parsedUser) {
                setLoading(false);
                return;
            }
            const isPublicAuthRoute = ['/login', '/forgot-password'].includes(window.location.pathname);
            if (isPublicAuthRoute) {
                localStorage.removeItem('track-myads_user');
                setLoading(false);
                return;
            }
            try {
                await authAPI.refresh();
                setUser(parsedUser);
                setIsAuthenticated(true);
            } catch (err) {
                // Do not call server logout — keeps Redis session for retry after transient failures
                clearLocalSession({ redirect: true, broadcast: true });
            } finally {
                setLoading(false);
            }
        };

        refreshIfNeeded();

        return () => {
            unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!isAuthenticated) return undefined;
        const interval = setInterval(() => {
            if (Date.now() - getLastActivity() > IDLE_TIMEOUT_MS) {
                handleLogout({ redirect: true, broadcast: true });
            }
        }, 30000);
        return () => clearInterval(interval);
    }, [isAuthenticated]);

    const login = async (email, password) => {
        try {
            const response = await authAPI.login(email, password);

            if (response.success && response.data) {
                const userData = {
                    id: response.data.id,
                    email: response.data.email,
                    name: response.data.name,
                    fullName: response.data.name,
                    role: response.data.role,
                    tenant_id: response.data.tenant_id || null, // 🔒 STRICT: Only for super admin role checks, NOT for tenant resolution
                    mustChangePassword: Boolean(response.data.must_change_password),
                    companyName: response.data.company_name || null,
                    phone: response.data.phone || null
                };

                setUser(userData);
                setIsAuthenticated(true);
                localStorage.setItem('track-myads_user', JSON.stringify(userData));
                return { success: true };
            } else {
                return { success: false, error: response.message || 'Login failed' };
            }
        } catch (error) {
            return {
                success: false,
                error: error.message || 'An error occurred during login. Please try again.'
            };
        }
    };

    const logout = () => handleLogout({ redirect: true, broadcast: true });

    const updateProfile = async (updates) => {
        try {
            // If it's just a local state update (e.g. password change complete flag)
            // with no actual profile fields, we can skip the API call if desired.
            // But here we check if any main profile fields are being updated.
            const profileFields = ['fullName', 'name', 'companyName', 'phone'];
            const hasProfileFields = Object.keys(updates).some(key => profileFields.includes(key));

            if (hasProfileFields) {
                const response = await authAPI.updateProfile(updates);
                if (response.success && response.data) {
                    const updatedUser = {
                        ...user,
                        ...updates,
                        fullName: response.data.name || updates.fullName || user.fullName,
                        companyName: response.data.company_name || updates.companyName || user.companyName,
                        phone: response.data.phone || updates.phone || user.phone
                    };
                    setUser(updatedUser);
                    localStorage.setItem('track-myads_user', JSON.stringify(updatedUser));
                    return { success: true };
                }
            } else {
                // Local only update (e.g. for mustChangePassword flag)
                const updatedUser = { ...user, ...updates };
                setUser(updatedUser);
                localStorage.setItem('track-myads_user', JSON.stringify(updatedUser));
                return { success: true };
            }
        } catch (error) {
            console.error('Update profile error:', error);
            throw error;
        }
    };

    if (loading) {
        return (
            <div className="app-loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout, updateProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
