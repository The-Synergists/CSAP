import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Users,
  CheckSquare,
  AlertTriangle,
  BarChart3,
  History,
  Settings,
  Shield,
} from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { getActiveAlerts } from '../../utils/alerts';

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, setIsOpen }) => {
  const { bids, metrics } = useProcurement();

  const pendingReviewsCount = metrics.pendingReviews;
  const alertsCount = getActiveAlerts(bids).length;

  const navItemClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-3 py-2 rounded text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-700 text-white font-semibold'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 bottom-0 left-0 z-50 w-64 bg-[#0A2540] text-slate-100 flex flex-col transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } border-r border-slate-800`}
      >
        {/* Brand Header */}
        <div className="h-16 px-4 flex items-center gap-3 border-b border-slate-800/80 bg-[#07192C]">
          <div className="w-9 h-9 rounded bg-blue-600 flex items-center justify-center text-white font-black text-lg shadow-xs">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-wider text-white uppercase">
              CSAP
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-wide">
              CPCL Procurement Portal
            </span>
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto">
          {/* Main */}
          <div>
            <NavLink to="/dashboard" className={navItemClass} onClick={() => setIsOpen(false)}>
              <LayoutDashboard className="w-4 h-4 text-slate-400" />
              <span>Dashboard</span>
            </NavLink>
          </div>

          {/* Procurement Section */}
          <div className="space-y-1">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Procurement
            </div>
            <NavLink to="/tenders" className={navItemClass} onClick={() => setIsOpen(false)}>
              <FileText className="w-4 h-4 text-slate-400" />
              <span>Tenders</span>
            </NavLink>
            <NavLink to="/bidders" className={navItemClass} onClick={() => setIsOpen(false)}>
              <Users className="w-4 h-4 text-slate-400" />
              <span>Bidders</span>
            </NavLink>
          </div>

          {/* Work Section */}
          <div className="space-y-1">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Work
            </div>
            <NavLink to="/reviews" className={navItemClass} onClick={() => setIsOpen(false)}>
              <CheckSquare className="w-4 h-4 text-slate-400" />
              <div className="flex items-center justify-between w-full">
                <span>My Reviews</span>
                <span className="text-[11px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded">
                  {pendingReviewsCount}
                </span>
              </div>
            </NavLink>
            <NavLink to="/alerts" className={navItemClass} onClick={() => setIsOpen(false)}>
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              <div className="flex items-center justify-between w-full">
                <span>Alerts</span>
                <span className="text-[11px] bg-rose-500/20 text-rose-300 border border-rose-500/30 px-1.5 py-0.2 rounded">
                  {alertsCount}
                </span>
              </div>
            </NavLink>
            <NavLink to="/reports" className={navItemClass} onClick={() => setIsOpen(false)}>
              <BarChart3 className="w-4 h-4 text-slate-400" />
              <span>Reports</span>
            </NavLink>
          </div>

          {/* System Section */}
          <div className="space-y-1 pt-2 border-t border-slate-800">
            <div className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              System
            </div>
            <NavLink to="/audit" className={navItemClass} onClick={() => setIsOpen(false)}>
              <History className="w-4 h-4 text-slate-400" />
              <span>Audit Trail</span>
            </NavLink>
            <NavLink to="/settings" className={navItemClass} onClick={() => setIsOpen(false)}>
              <Settings className="w-4 h-4 text-slate-400" />
              <span>Settings</span>
            </NavLink>
          </div>
        </nav>

        {/* Footer info */}
        <div className="p-3 border-t border-slate-800 bg-[#07192C]/80 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">v1.0.4</span>
            <span className="text-emerald-400 flex items-center gap-1 font-medium text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              CPCL Portal
            </span>
          </div>
          <p className="text-[10px] text-slate-400 mt-1">
            Chennai Petroleum Corporation Limited (Govt of India Enterprise)
          </p>
        </div>
      </aside>
    </>
  );
};
