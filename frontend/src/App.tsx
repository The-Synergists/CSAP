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
import { GatewayPage, RegistryPage } from './pages/gateway/GatewayPage';
import { GemLayout } from './pages/gem/GemLayout';
import { GemHomePage } from './pages/gem/GemHomePage';
import { GemSubmitPage } from './pages/gem/GemSubmitPage';
import { GemReceiptPage } from './pages/gem/GemReceiptPage';
import { GemBidPage } from './pages/gem/GemBidPage';
import { GemMyBidsPage } from './pages/gem/GemMyBidsPage';
import { EvaluationReportPage } from './pages/bids/EvaluationReportPage';
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
  // After signing in the officer always lands on the dashboard.
  return signedIn ? <Navigate to="/dashboard" replace /> : children;
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
          {/* Simulated GeM portal: the bidder side, no officer login. */}
          <Route path="/gem" element={<GemLayout />}>
            <Route index element={<GemHomePage />} />
            <Route path="tenders/:tenderId" element={<GemBidPage />} />
            <Route path="tenders/:tenderId/participate" element={<GemSubmitPage />} />
            <Route path="my-bids" element={<GemMyBidsPage />} />
            <Route path="submissions/:id" element={<GemReceiptPage />} />
          </Route>
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />
          <Route
            path="/reports/evaluation/:id"
            element={
              <RequireAuth>
                <EvaluationReportPage />
              </RequireAuth>
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
            <Route path="gateway/:registry" element={<RegistryPage />} />
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
