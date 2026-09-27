import React from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { Store, UserCircle2 } from 'lucide-react';
import { useSellerPan } from './gemSeller';

/**
 * Frame of the simulated e-Marketplace: a GeM-like bidder flow for CPCL bids. Deliberately not a
 * copy of GeM's logo or emblem, and labelled as a simulation on every page.
 */
export const GemLayout: React.FC = () => {
  const [pan] = useSellerPan();
  const nav = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 px-3 py-2.5 text-sm font-medium ${isActive ? 'border-orange-500 text-white' : 'border-transparent text-slate-200 hover:text-white'}`;
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-900">
        Simulation for a prototype demonstration. This is not the Government e-Marketplace (GeM); no real bids are placed here.
      </div>
      <header className="bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/gem" className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-white">
              <Store aria-hidden className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-base font-bold tracking-tight text-[#1b3a6b]">e-Marketplace</span>
              <span className="block text-[11px] text-slate-500">Public procurement portal · simulated</span>
            </span>
          </Link>
          <div className="flex items-center gap-3 text-xs">
            {pan ? (
              <Link to="/gem/my-bids" className="flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1 text-slate-700 hover:bg-slate-50">
                <UserCircle2 aria-hidden className="h-4 w-4 text-[#1b3a6b]" /> Seller <span className="font-mono">{pan}</span>
              </Link>
            ) : (
              <Link to="/gem/my-bids" className="rounded-full border border-[#1b3a6b] px-3 py-1 font-medium text-[#1b3a6b] hover:bg-slate-50">
                Seller login
              </Link>
            )}
          </div>
        </div>
        <nav aria-label="Marketplace" className="bg-[#1b3a6b]">
          <div className="mx-auto flex max-w-6xl gap-1 px-4">
            <NavLink to="/gem" end className={nav}>Bids</NavLink>
            <NavLink to="/gem/my-bids" className={nav}>My Bids</NavLink>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
      <footer className="mx-auto max-w-6xl px-4 pb-6 text-[11px] text-slate-500">
        Simulated marketplace for a prototype demonstration. Buyer: a public sector undertaking under the Ministry of Petroleum and Natural Gas.
      </footer>
    </div>
  );
};

export const GemCard: React.FC<{ title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }> = ({ title, children, actions }) => (
  <section className="rounded border border-slate-200 bg-white">
    {title && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-[#1b3a6b]">{title}</h2>
        {actions}
      </div>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const gemInput =
  'w-full rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';
export const gemButton =
  'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';
export const gemPrimary = `${gemButton} bg-orange-500 text-white hover:bg-orange-600`;
export const gemSecondary = `${gemButton} border border-[#1b3a6b] bg-white text-[#1b3a6b] hover:bg-slate-50`;
