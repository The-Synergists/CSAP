import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopHeader } from './TopHeader';
import { FloatingAssistant } from '../assistant/FloatingAssistant';
import { useProcurement } from '../../context/ProcurementContext';

export const AppLayout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { dataLoaded } = useProcurement();

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <TopHeader onToggleSidebar={() => setSidebarOpen((prev) => !prev)} />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {dataLoaded ? (
            <Outlet />
          ) : (
            <div className="flex items-center justify-center gap-2 py-24 text-slate-500 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Loading procurement data…</span>
            </div>
          )}
        </main>
      </div>

      {dataLoaded && <FloatingAssistant />}
    </div>
  );
};
