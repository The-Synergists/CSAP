import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Menu, Search, Bell, User, LogOut, Settings, FileText, Users, ChevronDown } from 'lucide-react';
import { useProcurement } from '../../context/ProcurementContext';
import { useNavigate } from 'react-router-dom';
import { toTenderSlug } from '../../types';
import { getActiveAlerts } from '../../utils/alerts';

interface TopHeaderProps {
  onToggleSidebar: () => void;
}

export const TopHeader: React.FC<TopHeaderProps> = ({ onToggleSidebar }) => {
  const { currentUser, logout, activeTender, tenders, bids, selectBid, selectTender } = useProcurement();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  const alerts = getActiveAlerts(bids);

  // Close any open dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchFocused(false);
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) setNotificationsOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchResults = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return { tenderMatches: [], bidMatches: [] };

    const tenderMatches = tenders
      .filter((t) => t.id.toLowerCase().includes(q) || t.title.toLowerCase().includes(q))
      .slice(0, 4);

    const bidMatches = bids
      .filter(
        (b) =>
          b.companyName.toLowerCase().includes(q) ||
          b.id.toLowerCase().includes(q) ||
          b.gstin.toLowerCase().includes(q)
      )
      .slice(0, 4);

    return { tenderMatches, bidMatches };
  }, [searchTerm, tenders, bids]);

  const hasResults = searchResults.tenderMatches.length > 0 || searchResults.bidMatches.length > 0;

  const handleOpenTender = (tenderId: string) => {
    selectTender(tenderId);
    navigate(`/tenders/${toTenderSlug(tenderId)}`);
    setSearchTerm('');
    setSearchFocused(false);
  };

  const handleOpenBid = (bidId: string, tenderId: string) => {
    selectBid(bidId, tenderId);
    navigate(`/bids/${bidId}`);
    setSearchTerm('');
    setSearchFocused(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleOpenActiveTender = () => {
    if (activeTender) {
      navigate(`/tenders/${toTenderSlug(activeTender.id)}`);
    }
  };

  const initials = currentUser.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
      {/* Left side: Hamburger & Active Tender Context */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-1.5 rounded-md text-slate-600 hover:bg-slate-100 lg:hidden focus:outline-hidden focus:ring-2 focus:ring-blue-500"
          aria-label="Toggle navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {activeTender ? (
          <div
            onClick={handleOpenActiveTender}
            className="hidden md:flex items-center gap-2 text-xs cursor-pointer hover:opacity-80 transition-opacity"
            title="Open active tender workspace"
          >
            <span className="text-slate-400 font-medium">Active Case:</span>
            <span className="font-mono bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-semibold hover:bg-blue-100 transition-colors">
              {activeTender.id}
            </span>
            <span className="text-slate-500 truncate max-w-xs">{activeTender.title}</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => navigate('/tenders')}
            className="hidden md:flex items-center gap-2 text-xs"
            title="Select a tender case"
          >
            <span className="text-slate-400 font-medium">No tender case selected</span>
            <span className="font-semibold text-blue-700 hover:underline">Select a Case</span>
          </button>
        )}
      </div>

      {/* Center: Search input */}
      <div className="flex-1 max-w-md mx-4 hidden sm:block relative" ref={searchRef}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search tenders, bidders, GSTIN, GEM ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            className="w-full pl-9 pr-4 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-blue-600 focus:border-blue-600 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {searchFocused && searchTerm.trim() && (
          <div className="absolute top-full mt-1.5 left-0 right-0 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden z-40 text-xs">
            {!hasResults ? (
              <div className="p-3 text-slate-500">No matches for "{searchTerm}".</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {searchResults.tenderMatches.length > 0 && (
                  <div>
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Tenders
                    </div>
                    {searchResults.tenderMatches.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => handleOpenTender(t.id)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                      >
                        <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-mono font-semibold text-blue-700">{t.id}</div>
                          <div className="text-slate-600">{t.title}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searchResults.bidMatches.length > 0 && (
                  <div className="border-t border-slate-100">
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Bidders
                    </div>
                    {searchResults.bidMatches.map((b) => (
                      <div
                        key={b.id}
                        onClick={() => handleOpenBid(b.id, b.tenderId)}
                        className="px-3 py-2 hover:bg-blue-50 cursor-pointer flex items-center gap-2"
                      >
                        <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <div>
                          <div className="font-semibold text-slate-800">{b.companyName}</div>
                          <div className="text-slate-400 font-mono">
                            {b.id} • {b.gstin}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right side: Officer Badge, Notifications, Actions */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            type="button"
            onClick={() => setNotificationsOpen((prev) => !prev)}
            className="relative p-2 rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 focus:outline-hidden"
            title="Notifications"
            aria-label="Notifications"
            aria-expanded={notificationsOpen}
          >
            <Bell className="w-4 h-4" />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500"></span>
            )}
          </button>

          {notificationsOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-slate-200 rounded-md shadow-lg z-40 text-xs overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-100 font-bold uppercase tracking-wider text-[11px] text-slate-600 flex items-center justify-between">
                <span>Alerts</span>
                <span className="text-slate-400 font-normal normal-case">{alerts.length} open</span>
              </div>
              {alerts.length === 0 ? (
                <div className="p-3 text-slate-500">No open alerts.</div>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                  {alerts.slice(0, 5).map((alert) => (
                    <div
                      key={alert.id}
                      onClick={() => {
                        selectBid(alert.bidId, alert.tenderId);
                        navigate(`/bids/${alert.bidId}/${alert.actionTab}`);
                        setNotificationsOpen(false);
                      }}
                      className="px-3 py-2 hover:bg-slate-50 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className={`font-semibold ${alert.severity === 'HIGH' ? 'text-rose-800' : 'text-amber-800'}`}>
                          {alert.title}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">{alert.bidId}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{alert.companyName}</div>
                    </div>
                  ))}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  navigate('/alerts');
                  setNotificationsOpen(false);
                }}
                className="w-full text-center py-2 text-blue-700 hover:bg-blue-50 font-semibold border-t border-slate-100"
              >
                View All Alerts
              </button>
            </div>
          )}
        </div>

        {/* Officer Profile Pill */}
        <div className="relative flex items-center gap-1 pl-3 border-l border-slate-200" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            aria-expanded={profileOpen}
            className="flex items-center gap-2.5 hover:bg-slate-50 rounded p-1 -m-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-[#0A2540] text-white flex items-center justify-center font-bold text-xs shrink-0">
              {initials || <User className="w-4 h-4" />}
            </div>
            <div className="hidden xl:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.name}
              </span>
              <span className="text-[10px] text-slate-500 leading-tight">
                {currentUser.designation}
              </span>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden xl:block" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-md shadow-lg z-40 text-xs overflow-hidden">
              <div className="p-3 border-b border-slate-100">
                <div className="font-semibold text-slate-900">{currentUser.name}</div>
                <div className="text-slate-500">{currentUser.designation}</div>
                <div className="text-slate-400 font-mono mt-1">{currentUser.badgeId}</div>
                <div className="text-slate-400 mt-0.5 truncate">{currentUser.email}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  navigate('/settings');
                  setProfileOpen(false);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-50 text-slate-700 font-medium"
              >
                <Settings className="w-3.5 h-3.5 text-slate-400" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-rose-50 text-rose-600 font-medium border-t border-slate-100"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
