import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { Store } from 'lucide-react';

/** Frame of the simulated GeM portal: visibly a different system from CSAP, and labelled as a simulation. */
export const GemLayout: React.FC = () => (
  <div className="min-h-screen bg-stone-50 text-stone-900">
    <div className="bg-amber-100 px-4 py-1.5 text-center text-[11px] font-medium text-amber-900">
      Simulation for the CSAP prototype. This is not the Government e-Marketplace (GeM); no real bids are placed here.
    </div>
    <header className="border-b border-stone-200 bg-teal-900 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/gem" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded bg-teal-600">
            <Store aria-hidden className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold">e-Marketplace (simulated)</span>
            <span className="block text-[11px] text-teal-100">Bidder portal · buyer: Chennai Petroleum Corporation Limited</span>
          </span>
        </Link>
        <Link to="/login" className="text-[11px] text-teal-100 underline-offset-2 hover:underline">
          CPCL officer? Open CSAP
        </Link>
      </div>
    </header>
    <main className="mx-auto max-w-5xl px-4 py-6">
      <Outlet />
    </main>
  </div>
);

export const GemCard: React.FC<{ title?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode }> = ({ title, children, actions }) => (
  <section className="rounded-lg border border-stone-200 bg-white">
    {title && (
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-900">{title}</h2>
        {actions}
      </div>
    )}
    <div className="p-4">{children}</div>
  </section>
);

export const gemInput =
  'w-full rounded border border-stone-300 bg-white px-2.5 py-1.5 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20';
export const gemButton =
  'inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50';
