import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  AlertTriangle,
  BarChart3,
  CheckSquare,
  FileText,
  History,
  LayoutDashboard,
  Network,
  Settings,
  Users,
} from 'lucide-react';
import { useApp } from '../../state/appContext';
import { getAlerts, getDashboardMetrics } from '@shared/domain/selectors';
import { BrandMark } from './BrandMark';

const itemBase = 'flex w-full items-center gap-3 rounded px-3 py-2 text-left text-sm font-medium transition-colors';
const itemActive = 'bg-blue-700 font-semibold text-white';
const itemIdle = 'text-slate-300 hover:bg-slate-800 hover:text-white';

const NavItem: React.FC<{ to: string; icon: React.ReactNode; label: string; count?: number; tone?: 'warning' | 'danger'; onNavigate: () => void }> = ({
  to,
  icon,
  label,
  count,
  tone = 'warning',
  onNavigate,
}) => (
  <NavLink to={to} onClick={onNavigate} className={({ isActive }) => `${itemBase} ${isActive ? itemActive : itemIdle}`}>
    <span aria-hidden className="text-slate-400">
      {icon}
    </span>
    <span className="flex-1">{label}</span>
    {count !== undefined && count > 0 && (
      <span className={`rounded border px-1.5 text-[11px] ${tone === 'danger' ? 'border-rose-500/30 bg-rose-500/20 text-rose-300' : 'border-amber-500/30 bg-amber-500/20 text-amber-300'}`}>
        {count}
        <span className="sr-only"> items</span>
      </span>
    )}
  </NavLink>
);

export const Sidebar: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { db } = useApp();
  const metrics = getDashboardMetrics(db);
  const alertCount = getAlerts(db).length;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-xs lg:hidden" onClick={onClose} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-800 bg-[#0A2540] text-slate-100 transition-transform duration-200 ease-in-out lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center border-b border-slate-800/80 bg-[#07192C] px-4">
          <BrandMark />
        </div>

        <nav aria-label="Main navigation" className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            <NavItem to="/dashboard" icon={<LayoutDashboard className="h-4 w-4" />} label="Dashboard" onNavigate={onClose} />
            <NavItem to="/tenders" icon={<FileText className="h-4 w-4" />} label="Tenders" onNavigate={onClose} />
            <NavItem to="/bidders" icon={<Users className="h-4 w-4" />} label="Bidders" onNavigate={onClose} />
          </div>
          <div className="space-y-0.5 border-t border-slate-800/80 pt-4">
            <NavItem to="/reviews" icon={<CheckSquare className="h-4 w-4" />} label="My Reviews" count={metrics.awaitingDecision} onNavigate={onClose} />
            <NavItem to="/alerts" icon={<AlertTriangle className="h-4 w-4" />} label="Alerts" count={alertCount} tone="danger" onNavigate={onClose} />
            <NavItem to="/reports" icon={<BarChart3 className="h-4 w-4" />} label="Reports" onNavigate={onClose} />
          </div>
          <div className="space-y-0.5 border-t border-slate-800/80 pt-4">
            <NavItem to="/audit" icon={<History className="h-4 w-4" />} label="Audit Trail" onNavigate={onClose} />
            <NavItem to="/gateway" icon={<Network className="h-4 w-4" />} label="Govt. Registries" onNavigate={onClose} />
            <NavItem to="/settings" icon={<Settings className="h-4 w-4" />} label="Settings" onNavigate={onClose} />
          </div>
        </nav>

        <div className="border-t border-slate-800 bg-[#07192C]/80 p-3 text-xs">
          <div className="flex items-center justify-between text-slate-400">
            <span className="font-mono text-[11px]">v2.0 · prototype</span>
            <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              CPCL Portal
            </span>
          </div>
          <p className="mt-1 text-[10px] text-slate-400">Chennai Petroleum Corporation Limited (Govt of India Enterprise)</p>
        </div>
      </aside>
    </>
  );
};
