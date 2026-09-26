import React from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppProvider } from './state/AppProvider';
import { useApp } from './state/appContext';
import { ToastProvider } from './components/ui/toast';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { TenderListPage } from './pages/tenders/TenderListPage';
import { TenderWorkspacePage } from './pages/tenders/TenderWorkspacePage';
import { BidderListPage } from './pages/bidders/BidderListPage';
import { BidWorkspacePage } from './pages/bids/BidWorkspacePage';
import { MyReviewsPage } from './pages/work/MyReviewsPage';
import { AlertsPage } from './pages/work/AlertsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AuditTrailPage } from './pages/audit/AuditTrailPage';
import { GatewayPage } from './pages/gateway/GatewayPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { NotFoundPage } from './pages/common/NotFoundPage';
import { bidPath } from './lib/format';

/** Protected pages never render for a signed-out user; the requested URL is kept so the
 *  officer lands back on it after signing in. */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { signedIn } = useApp();
  const location = useLocation();
  if (!signedIn) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
};

/** Once signed in, the login page forwards to the page the officer originally asked for. */
const RedirectIfAuthenticated: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { signedIn } = useApp();
  const from = (useLocation().state as { from?: string } | null)?.from;
  return signedIn ? <Navigate to={from && from !== '/login' ? from : '/dashboard'} replace /> : children;
};

/** /bidders/:bidderId opens that bidder's bid (one bid per bidder in the demo dataset). */
const BidderRedirect: React.FC = () => {
  const { bidderId } = useParams();
  const { db } = useApp();
  const bid = db.bids.find((b) => b.bidderId.toLowerCase() === bidderId?.toLowerCase());
  return bid ? <Navigate to={bidPath(bid.id)} replace /> : <NotFoundPage what="bidder" />;
};

export const App: React.FC = () => (
  <AppProvider>
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="tenders" element={<TenderListPage />} />
            <Route path="tenders/:tenderId/:tab?" element={<TenderWorkspacePage />} />
            <Route path="bidders" element={<BidderListPage />} />
            <Route path="bidders/:bidderId" element={<BidderRedirect />} />
            <Route path="bids" element={<Navigate to="/bidders" replace />} />
            <Route path="bids/:bidId/:tab?" element={<BidWorkspacePage />} />
            <Route path="reviews" element={<MyReviewsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="gateway" element={<GatewayPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="profile" element={<Navigate to="/settings" replace />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  </AppProvider>
);

export default App;
