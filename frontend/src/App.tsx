import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProcurementProvider, useProcurement } from './context/ProcurementContext';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './pages/auth/LoginPage';
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { TenderListPage } from './pages/tenders/TenderListPage';
import { TenderWorkspacePage } from './pages/tenders/TenderWorkspacePage';
import { BidderListPage } from './pages/bidders/BidderListPage';
import { BidderWorkspacePage } from './pages/bidders/BidderWorkspacePage';
import { MyReviewsPage } from './pages/work/MyReviewsPage';
import { AlertsPage } from './pages/work/AlertsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { AuditTrailPage } from './pages/audit/AuditTrailPage';
import { SettingsPage } from './pages/settings/SettingsPage';
import { NotFoundPage } from './pages/common/NotFoundPage';

/** Blocks the authenticated shell from rendering at all when logged out. */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, authChecked } = useProcurement();
  // Wait for the initial Supabase session check before deciding to redirect —
  // otherwise a hard reload of a deep link (e.g. /reviews) races the async
  // check, bounces to /login, and loses the original destination.
  if (!authChecked) return null;
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return children;
};

/** Keeps an already-authenticated officer from being sent back to the login screen. */
const RedirectIfAuthenticated: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { isAuthenticated, authChecked } = useProcurement();
  if (!authChecked) return null;
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  return children;
};

export const App: React.FC = () => {
  return (
    <ProcurementProvider>
      <BrowserRouter>
        <Routes>
          {/* Public Auth Route */}
          <Route
            path="/login"
            element={
              <RedirectIfAuthenticated>
                <LoginPage />
              </RedirectIfAuthenticated>
            }
          />

          {/* Authenticated Procurement Officer Shell */}
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

            {/* Procurement: Tenders & Tender Workspaces */}
            <Route path="tenders" element={<TenderListPage />} />
            <Route path="tenders/:tenderId" element={<TenderWorkspacePage />} />
            <Route path="tenders/:tenderId/:tab" element={<TenderWorkspacePage />} />
            <Route path="tenders/*" element={<TenderWorkspacePage />} />

            {/* Procurement: Bids & Bid Workspaces (Primary Verification Case) */}
            <Route path="bids" element={<BidderListPage />} />
            <Route path="bids/:bidId" element={<BidderWorkspacePage />} />
            <Route path="bids/:bidId/:tab" element={<BidderWorkspacePage />} />

            {/* Procurement: Bidders & Bidder Workspaces (Backward Compatibility) */}
            <Route path="bidders" element={<BidderListPage />} />
            <Route path="bidders/:bidderId" element={<BidderWorkspacePage />} />
            <Route path="bidders/:bidderId/:tab" element={<BidderWorkspacePage />} />

            {/* Officer Work Streams */}
            <Route path="reviews" element={<MyReviewsPage />} />
            <Route path="alerts" element={<AlertsPage />} />

            {/* Reporting, Audit, Settings */}
            <Route path="reports" element={<ReportsPage />} />
            <Route path="audit" element={<AuditTrailPage />} />
            <Route path="settings" element={<SettingsPage />} />

            {/* Unmatched routes inside the authenticated shell get a real 404, not a silent bounce */}
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ProcurementProvider>
  );
};

export default App;
