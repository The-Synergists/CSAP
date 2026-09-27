import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronDown, FileText, LogOut, Menu, Search, Settings, Users } from 'lucide-react';
import { useApp } from '../../state/appContext';
import { getAlerts } from '@shared/domain/selectors';
import { bidPath, tenderPath } from '../../lib/format';
import { useToast } from '../ui/toast';

/** Closes a popover when the user clicks outside it or presses Escape. */
const useDismiss = (ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) => {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
};

export const TopHeader: React.FC<{ onToggleSidebar: () => void }> = ({ onToggleSidebar }) => {
  const { db, currentUser, logout, source, activeTenderId } = useApp();
  const activeTender = db.tenders.find((t) => t.id === activeTenderId);
  const navigate = useNavigate();
  const toast = useToast();

  const [term, setTerm] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  useDismiss(searchRef, searchOpen, () => setSearchOpen(false));
  useDismiss(bellRef, bellOpen, () => setBellOpen(false));
  useDismiss(profileRef, profileOpen, () => setProfileOpen(false));

  const alerts = getAlerts(db);

  const results = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return [];
    const tenders = db.tenders
      .filter((t) => [t.id, t.title, t.division].some((s) => s.toLowerCase().includes(q)))
      .slice(0, 4)
      .map((t) => ({ key: t.id, kind: 'Tender' as const, primary: t.title, secondary: t.id, to: tenderPath(t.id) }));
    const bids = db.bids
      .map((b) => ({ bid: b, bidder: db.bidders.find((x) => x.id === b.bidderId)! }))
      .filter(({ bid, bidder }) => [bid.id, bidder.companyName, bidder.gstin, bidder.id].some((s) => s.toLowerCase().includes(q)))
      .slice(0, 5)
      .map(({ bid, bidder }) => ({ key: bid.id, kind: 'Bid' as const, primary: bidder.companyName, secondary: `${bid.id} · ${bidder.gstin}`, to: bidPath(bid.id) }));
    return [...tenders, ...bids];
  }, [term, db]);

  const go = (to: string) => {
    navigate(to);
    setTerm('');
    setSearchOpen(false);
  };

  const handleLogout = () => {
    setProfileOpen(false);
    logout();
    navigate('/login', { replace: true });
    toast({ kind: 'info', title: 'Signed out', message: 'Your prototype session has ended.' });
  };

  const initials = (currentUser?.name ?? '')
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((p) => p[0])
    .slice(-2)
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-4 shadow-2xs sm:px-6">
      <button type="button" onClick={onToggleSidebar} aria-label="Open navigation" className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden">
        <Menu className="h-5 w-5" />
      </button>

      {activeTender ? (
        <button
          type="button"
          onClick={() => navigate(tenderPath(activeTender.id))}
          className="hidden shrink-0 items-center gap-2 text-xs transition-opacity hover:opacity-80 xl:flex"
          title="Open active tender workspace"
        >
          <span className="font-medium text-slate-400">Active Case:</span>
          <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 font-mono font-semibold text-blue-800">{activeTender.id}</span>
        </button>
      ) : null}

      <div ref={searchRef} className="relative mx-auto w-full max-w-md">
        <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          aria-label="Search tenders and bidders"
          placeholder="Search tenders, bidders, GSTIN, GEM ID..."
          value={term}
          onChange={(e) => {
            setTerm(e.target.value);
            setSearchOpen(true);
          }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0].to);
          }}
          className="w-full rounded border border-slate-300 bg-slate-50 py-1.5 pl-9 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-600 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
        />
        {searchOpen && term.trim() && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg">
            {results.length === 0 ? (
              <p className="px-3 py-3 text-slate-500">No tenders or bidders match “{term.trim()}”.</p>
            ) : (
              <ul className="max-h-80 overflow-y-auto py-1">
                {results.map((r) => (
                  <li key={r.key}>
                    <button type="button" onClick={() => go(r.to)} className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-slate-50">
                      {r.kind === 'Tender' ? <FileText className="h-4 w-4 shrink-0 text-slate-400" /> : <Users className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-900">{r.primary}</span>
                        <span className="block truncate font-mono text-xs text-slate-500">{r.secondary}</span>
                      </span>
                      <span className="ml-auto text-xs text-slate-400">{r.kind}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span
          className="hidden rounded border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 2xl:inline"
          title={source === 'api' ? 'Prototype connected to the CSAP test database. Tender data is illustrative.' : 'Prototype running on built-in demo data in this browser.'}
        >
          {source === 'api' ? 'Prototype · test database' : 'Prototype · demo data'}
        </span>

        <div ref={bellRef} className="relative">
          <button
            type="button"
            onClick={() => setBellOpen((o) => !o)}
            aria-label={`Alerts (${alerts.length} open)`}
            aria-expanded={bellOpen}
            className="relative rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
          >
            <Bell className="h-4 w-4" />
            {alerts.length > 0 && (
              <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-4 text-white">
                {alerts.length}
              </span>
            )}
          </button>
          {bellOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-80 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg">
              <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold text-slate-600">Open alerts</div>
              {alerts.length === 0 ? (
                <p className="px-3 py-3 text-slate-500">No open alerts.</p>
              ) : (
                <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                  {alerts.map((a) => (
                    <li key={a.bidId}>
                      <button
                        type="button"
                        onClick={() => {
                          setBellOpen(false);
                          navigate(`${bidPath(a.bidId, 'evidence')}?finding=${a.findingId}`);
                        }}
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                      >
                        <span className={`block font-medium ${a.severity === 'HIGH' ? 'text-rose-800' : 'text-slate-900'}`}>{a.title}</span>
                        <span className="block text-xs text-slate-500">
                          {a.companyName} · {a.bidId}
                          {a.openCount > 1 && ` · +${a.openCount - 1} more`}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <button
                type="button"
                onClick={() => {
                  setBellOpen(false);
                  navigate('/alerts');
                }}
                className="w-full border-t border-slate-100 py-2 text-center text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                View all alerts
              </button>
            </div>
          )}
        </div>

        <div ref={profileRef} className="relative border-l border-slate-200 pl-3">
          <button
            type="button"
            onClick={() => setProfileOpen((o) => !o)}
            aria-expanded={profileOpen}
            aria-label="Account menu"
            className="flex items-center gap-2 rounded p-1 hover:bg-slate-100"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0A2540] text-xs font-bold text-white">{initials}</span>
            <span className="hidden text-left leading-tight xl:block">
              <span className="block text-xs font-semibold leading-tight text-slate-900">{currentUser?.name}</span>
              <span className="block text-[10px] leading-tight text-slate-500">{currentUser?.designation}</span>
            </span>
            <ChevronDown aria-hidden className="hidden h-4 w-4 text-slate-400 xl:block" />
          </button>
          {profileOpen && currentUser && (
            <div className="absolute right-0 top-full z-40 mt-1 w-72 overflow-hidden rounded-md border border-slate-200 bg-white text-sm shadow-lg">
              <div className="space-y-0.5 border-b border-slate-100 px-3 py-3">
                <p className="font-semibold text-slate-900">{currentUser.name}</p>
                <p className="text-slate-600">{currentUser.designation}</p>
                <p className="text-xs text-slate-500">{currentUser.division}</p>
                <p className="pt-1 font-mono text-xs text-slate-500">
                  {currentUser.employeeId} · {currentUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setProfileOpen(false);
                  navigate('/settings');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
              >
                <Settings className="h-4 w-4 text-slate-400" /> Profile & settings
              </button>
              <button type="button" onClick={handleLogout} className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2 text-left text-rose-700 hover:bg-rose-50">
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
