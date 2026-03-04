import { BrowserRouter as Router, Routes, Route, Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Layout from './components/Layout/Layout';
import Login from './pages/Login/Login';
import ForgotPassword from './pages/Login/ForgotPassword';
import Dashboard from './pages/Dashboard/Dashboard';
import OfferList from './pages/Offer/OfferList';
import NewOffer from './pages/Offer/NewOffer';
import EditOffer from './pages/Offer/EditOffer';
import OfferDetail from './pages/Offer/OfferDetail';
import ManageAffiliate from './pages/Affiliate/ManageAffiliate';
import NewAffiliate from './pages/Affiliate/NewAffiliate';
import EditAffiliate from './pages/Affiliate/EditAffiliate';
import AffiliateDetail from './pages/Affiliate/AffiliateDetail';
import PostbackTest from './pages/Affiliate/PostbackTest';
import ManageAdvertiser from './pages/Advertiser/ManageAdvertiser';
import NewAdvertiser from './pages/Advertiser/NewAdvertiser';
import EditAdvertiser from './pages/Advertiser/EditAdvertiser';
import AdvertiserDetail from './pages/Advertiser/AdvertiserDetail';
import ManageAssignment from './pages/Assignment/ManageAssignment';
import NewAssignment from './pages/Assignment/NewAssignment';
import EditAssignment from './pages/Assignment/EditAssignment';
import DetailedReports from './pages/Reports/DetailedReports';
import UpdateProfile from './pages/Settings/UpdateProfile';
import LiveLogs from './pages/LiveLogs/LiveLogs';
import ImportData from './pages/Import/ImportData';
import ManageTenant from './pages/Tenant/ManageTenant';
import NewTenant from './pages/Tenant/NewTenant';
import EditTenant from './pages/Tenant/EditTenant';
import TenantDetail from './pages/Tenant/TenantDetail';
import ManageContactSubmissions from './pages/ContactSubmissions/ManageContactSubmissions';
import Maintenance from './pages/Maintenance/Maintenance';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { ThemeProvider } from './context/ThemeContext';
import { RefreshProvider } from './context/RefreshContext';
import RefreshButton from './components/RefreshButton/RefreshButton';
import './App.css';

function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function ChangePasswordPrompt() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setOpen(Boolean(user?.mustChangePassword));
  }, [user?.mustChangePassword]);

  if (!open) return null;

  return (
    <div className="password-prompt-backdrop" role="dialog" aria-modal="true">
      <div className="password-prompt-card">
        <h3>Change Your Password</h3>
        <p>
          This is your first login. For security, please change your password now.
        </p>
        <div className="password-prompt-actions">
          <button
            className="password-prompt-primary"
            onClick={() => {
              setOpen(false);
              navigate('/settings');
            }}
          >
            Go to Settings
          </button>
          <button
            className="password-prompt-secondary"
            onClick={() => setOpen(false)}
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();

  // Check domain context
  const hostname = window.location.hostname;
  const isAdminDomain = hostname.startsWith('admin');
  const { user } = useAuth();

  useEffect(() => {
    const brandName = user?.companyName || 'Track MyAds';
    document.title = `${brandName} | Performance Marketing Platform`;
  }, [user?.companyName]);

  return (
    <>
      {isAuthenticated && <ChangePasswordPrompt />}
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to="/" />} />
        <Route path="/forgot-password" element={!isAuthenticated ? <ForgotPassword /> : <Navigate to="/" />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          {/* Helper to redirect based on domain if accessing root */}
          <Route index element={!isAdminDomain ? <Dashboard /> : <Navigate to="/tenant/manage" replace />} />

          {/* Tenant Only Routes - Redirect to Tenant Manage if accessed by Admin */}
          <Route element={!isAdminDomain ? <Outlet /> : <Navigate to="/tenant/manage" replace />}>
            <Route path="offer">
              <Route index element={<OfferList />} />
              <Route path="list" element={<OfferList />} />
              <Route path="new" element={<NewOffer />} />
              <Route path="edit/:id" element={<EditOffer />} />
              <Route path="detail/:id" element={<OfferDetail />} />
            </Route>
            <Route path="affiliate">
              <Route index element={<ManageAffiliate />} />
              <Route path="manage" element={<ManageAffiliate />} />
              <Route path="new" element={<NewAffiliate />} />
              <Route path="edit/:id" element={<EditAffiliate />} />
              <Route path="detail/:id" element={<AffiliateDetail />} />
              <Route path="postback-test" element={<PostbackTest />} />
            </Route>
            <Route path="advertiser">
              <Route index element={<ManageAdvertiser />} />
              <Route path="manage" element={<ManageAdvertiser />} />
              <Route path="new" element={<NewAdvertiser />} />
              <Route path="edit/:id" element={<EditAdvertiser />} />
              <Route path="detail/:id" element={<AdvertiserDetail />} />
            </Route>
            <Route path="assignment">
              <Route index element={<ManageAssignment />} />
              <Route path="manage" element={<ManageAssignment />} />
              <Route path="new" element={<NewAssignment />} />
              <Route path="edit/:id" element={<EditAssignment />} />
            </Route>
            <Route path="reports">
              <Route index element={<DetailedReports />} />
              <Route path="detailed" element={<DetailedReports />} />
            </Route>
            <Route path="live-logs" element={<LiveLogs />} />
            {/* <Route path="import" element={<ImportData />} /> */}
          </Route>

          {/* Admin Only Routes - Redirect to Dashboard (which redirects to login or 404?) if accessed by Tenant */}
          {/* If Tenant access /tenant, fallback to / (Dashboard) */}
          <Route element={isAdminDomain ? <Outlet /> : <Navigate to="/" replace />}>
            <Route path="tenant">
              <Route index element={<ManageTenant />} />
              <Route path="manage" element={<ManageTenant />} />
              <Route path="new" element={<NewTenant />} />
              <Route path="edit/:id" element={<EditTenant />} />
              <Route path="detail/:id" element={<TenantDetail />} />
            </Route>
            <Route path="contact-submissions" element={<ManageContactSubmissions />} />
          </Route>

          {/* Shared Routes */}
          <Route path="settings">
            <Route index element={<UpdateProfile />} />
            <Route path="profile" element={<UpdateProfile />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}



function App() {
  const [isMaintenance, setIsMaintenance] = useState(false);

  useEffect(() => {
    const handleMaintenance = () => {
      setIsMaintenance(true);
    };

    window.addEventListener('server-maintenance', handleMaintenance);

    return () => {
      window.removeEventListener('server-maintenance', handleMaintenance);
    };
  }, []);

  if (isMaintenance) {
    return <Maintenance />;
  }

  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <RefreshProvider>
              <AppRoutes />
              <RefreshButton />
            </RefreshProvider>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
}

export default App;
