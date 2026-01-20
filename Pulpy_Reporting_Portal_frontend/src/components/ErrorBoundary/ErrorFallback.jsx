import { useNavigate } from 'react-router-dom';
import './ErrorFallback.css';

const ErrorFallback = ({ error, resetError, type = 'general' }) => {
    const navigate = useNavigate();

    const getErrorContent = () => {
        const errorMessage = error?.message || error?.toString() || 'An unexpected error occurred';

        // Tenant Subdomain Mismatch
        if (errorMessage.includes('tenant subdomain') || errorMessage.includes('Tenant admin access requires')) {
            return {
                icon: '🔒',
                title: 'Wrong Subdomain',
                message: 'You are logged in as a tenant admin but accessing from the wrong subdomain.',
                suggestion: 'Please access via your tenant subdomain (e.g., yourcompany.domain.com)',
                action: () => {
                    localStorage.removeItem('track-myads_user');
                    window.location.href = '/login';
                },
                actionText: 'Logout & Login Again'
            };
        }

        // Tenant Suspended
        if (errorMessage.includes('suspended') || errorMessage.includes('Tenant Suspended')) {
            return {
                icon: '⚠️',
                title: 'Account Suspended',
                message: 'Your tenant account has been suspended.',
                suggestion: 'Please contact support for assistance.',
                action: () => {
                    localStorage.removeItem('track-myads_user');
                    window.location.href = '/login';
                },
                actionText: 'Logout'
            };
        }

        // Token Expired
        if (errorMessage.includes('expired') || errorMessage.includes('Token has expired')) {
            return {
                icon: '⏰',
                title: 'Session Expired',
                message: 'Your session has expired.',
                suggestion: 'Please login again to continue.',
                action: () => {
                    localStorage.removeItem('track-myads_user');
                    navigate('/login');
                },
                actionText: 'Go to Login'
            };
        }

        // Unauthorized
        if (errorMessage.includes('Unauthorized') || errorMessage.includes('401')) {
            return {
                icon: '🔐',
                title: 'Authentication Required',
                message: 'You need to be logged in to access this page.',
                suggestion: 'Please login to continue.',
                action: () => {
                    localStorage.removeItem('track-myads_user');
                    navigate('/login');
                },
                actionText: 'Go to Login'
            };
        }

        // Forbidden
        if (errorMessage.includes('Forbidden') || errorMessage.includes('403')) {
            return {
                icon: '🚫',
                title: 'Access Denied',
                message: 'You do not have permission to access this resource.',
                suggestion: 'Please contact your administrator if you believe this is an error.',
                action: () => navigate('/'),
                actionText: 'Go to Dashboard'
            };
        }

        // Super Admin on Tenant Subdomain
        if (errorMessage.includes('Super admin access') || errorMessage.includes('admin subdomain')) {
            return {
                icon: '🔒',
                title: 'Wrong Subdomain',
                message: 'Super admin access is only allowed via admin subdomain.',
                suggestion: 'Please access via admin.domain.com',
                action: () => {
                    localStorage.removeItem('track-myads_user');
                    window.location.href = '/login';
                },
                actionText: 'Logout & Login Again'
            };
        }

        // Network Error
        if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
            return {
                icon: '📡',
                title: 'Network Error',
                message: 'Unable to connect to the server.',
                suggestion: 'Please check your internet connection and try again.',
                action: resetError || (() => window.location.reload()),
                actionText: 'Retry'
            };
        }

        // Generic Error
        return {
            icon: '❌',
            title: 'Something went wrong',
            message: errorMessage,
            suggestion: 'Please try again or contact support if the problem persists.',
            action: resetError || (() => window.location.reload()),
            actionText: 'Reload Page'
        };
    };

    const errorContent = getErrorContent();

    return (
        <div className="error-fallback">
            <div className="error-fallback-card">
                <div className="error-fallback-icon">{errorContent.icon}</div>
                <h1 className="error-fallback-title">{errorContent.title}</h1>
                <p className="error-fallback-message">{errorContent.message}</p>
                <p className="error-fallback-suggestion">{errorContent.suggestion}</p>
                
                {process.env.NODE_ENV === 'development' && error?.stack && (
                    <details className="error-fallback-details">
                        <summary>Error Details (Development Only)</summary>
                        <pre>{error.stack}</pre>
                    </details>
                )}

                <div className="error-fallback-actions">
                    <button className="btn btn-primary" onClick={errorContent.action}>
                        {errorContent.actionText}
                    </button>
                    {resetError && resetError !== errorContent.action && (
                        <button className="btn btn-outline" onClick={() => navigate('/')}>
                            Go to Home
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ErrorFallback;
