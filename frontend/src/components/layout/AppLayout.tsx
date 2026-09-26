import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { AssistantPanel } from '../assistant/AssistantPanel';
import { Button } from '../ui/primitives';
import { useApp } from '../../state/appContext';

/** Loading / failure states for the workspace data, so pages never render half-empty. */
const DataGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { status, loadError, reload, logout, currentUser } = useApp();
  if (status === 'error') {
    return (
      <div role="alert" className="mx-auto mt-16 max-w-lg rounded-md border border-rose-200 bg-white p-6 text-center">
        <AlertTriangle className="mx-auto mb-2 h-6 w-6 text-rose-600" />
        <p className="font-semibold text-slate-900">Could not load procurement data</p>
        <p className="mt-1 text-sm text-slate-600">{loadError}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="primary" onClick={() => void reload()}>
            Try again
          </Button>
          <Button onClick={logout}>Sign out</Button>
        </div>
      </div>
    );
  }
  if (status === 'loading' || !currentUser) {
    return (
      <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-500" role="status">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading procurement data…
      </div>
    );
  }
  return <>{children}</>;
};

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { pathname } = useLocation();
  const { status, currentUser } = useApp();
  const ready = status === 'ready' && !!currentUser;

  // Start each page at the top rather than keeping the previous page's scroll position.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader onToggleSidebar={() => setSidebarOpen((o) => !o)} />
        <main id="main" className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <DataGate>
            <Outlet />
          </DataGate>
        </main>
      </div>
      {ready && <AssistantPanel />}
    </div>
  );
};
