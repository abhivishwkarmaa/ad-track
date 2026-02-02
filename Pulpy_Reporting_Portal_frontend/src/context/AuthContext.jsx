import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { authAPI, setAccessToken, clearAccessToken } from '../services/api';
import { startActivityTracking, onLogoutEvent, getLastActivity, broadcastLogout } from '../utils/activityTracker';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const isLoggingOutRef = useRef(false);
    const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

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
                setUser(parsedUser);
                setIsAuthenticated(true);
            } catch (e) {
                console.error('Failed to parse saved user:', e);
                localStorage.removeItem('track-myads_user');
            }
        }

        const unsubscribe = onLogoutEvent(() => {
            if (isLoggingOutRef.current) return;
            setUser(null);
            setIsAuthenticated(false);
            clearAccessToken();
            localStorage.removeItem('track-myads_user');
            window.location.href = '/login';
        });

        const refreshIfNeeded = async () => {
            if (!parsedUser) {
                setLoading(false);
                return;
            }
            try {
                await authAPI.refresh();
            } catch (err) {
                await handleLogout({ redirect: true, broadcast: true });
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

    const handleLogout = async ({ redirect = true, broadcast = true } = {}) => {
        if (isLoggingOutRef.current) return;
        isLoggingOutRef.current = true;
        try {
            await authAPI.logout();
        } catch (error) {
            // Ignore logout errors - session may already be expired
        }
        if (broadcast) {
            broadcastLogout();
        }
        setUser(null);
        setIsAuthenticated(false);
        clearAccessToken();
        localStorage.removeItem('track-myads_user');
        // localStorage.removeItem('bng_token');
        if (redirect) {
            window.location.href = '/login';
        }
        isLoggingOutRef.current = false;
    };

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
                    tenant_id: response.data.tenant_id || null // 🔒 STRICT: Only for super admin role checks, NOT for tenant resolution
                };

                setUser(userData);
                setIsAuthenticated(true);
                localStorage.setItem('track-myads_user', JSON.stringify(userData));
                return { success: true };
            } else {
                return { success: false, error: response.message || 'Login failed' };
            }
        } catch (error) {
            console.error('Login error:', error);
            return {
                success: false,
                error: error.message || 'An error occurred during login. Please try again.'
            };
        }
    };

    const logout = () => handleLogout({ redirect: true, broadcast: true });

    const updateProfile = (updates) => {
        const updatedUser = { ...user, ...updates };
        setUser(updatedUser);
        localStorage.setItem('track-myads_user', JSON.stringify(updatedUser));
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
