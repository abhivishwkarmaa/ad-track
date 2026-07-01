import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter as Router } from 'react-router-dom';
import { queryClient } from '../lib/queryClient';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { ThemeProvider } from '../context/ThemeContext';
import { RefreshProvider } from '../context/RefreshContext';
import { ReportTimezoneProvider } from '../context/ReportTimezoneContext';
import RefreshButton from '../components/RefreshButton/RefreshButton';
import ErrorBoundary from '../components/ErrorBoundary/ErrorBoundary';
import AppRoutes from './routes/AppRoutes';

export default function AppProviders() {
    return (
        <QueryClientProvider client={queryClient}>
            <Router>
                <ErrorBoundary>
                    <ThemeProvider>
                        <AuthProvider>
                            <ToastProvider>
                                <RefreshProvider>
                                    <ReportTimezoneProvider>
                                        <AppRoutes />
                                        <RefreshButton />
                                    </ReportTimezoneProvider>
                                </RefreshProvider>
                            </ToastProvider>
                        </AuthProvider>
                    </ThemeProvider>
                </ErrorBoundary>
            </Router>
        </QueryClientProvider>
    );
}
