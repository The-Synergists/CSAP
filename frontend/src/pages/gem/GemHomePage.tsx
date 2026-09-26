import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Search } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { gemInput, gemPrimary, gemSecondary } from './GemLayout';
import { crore, gemApi, gemTenderPath, inr, type GemTender } from './gemApi';

/** Bid list: search and filters like a marketplace bid listing. */
export const GemHomePage: React.FC = () => {
  const [tenders, setTenders] = useState<GemTender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    gemApi.tenders().then(setTenders).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  const shown = useMemo(() => (tenders ?? []).filter((t) => !q.trim() || `${t.id} ${t.title} ${t.category} ${t.description}`.toLowerCase().includes(q.trim().toLowerCase())), [tenders, q]);

  return (
    <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
      <aside className="space-y-4 rounded border border-slate-200 bg-white p-4 text-xs">
        <p className="text-sm font-semibold text-[#1b3a6b]">Filters</p>
        <div>
          <p className="font-semibold text-slate-700">Ministry</p>
          <label className="mt-1 flex items-center gap-2 text-slate-700"><input type="checkbox" checked readOnly /> Ministry of Petroleum and Natural Gas</label>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Organisation</p>
          <label className="mt-1 flex items-center gap-2 text-slate-700"><input type="checkbox" checked readOnly /> Chennai Petroleum Corporation Limited</label>
        </div>
        <div>
          <p className="font-semibold text-slate-700">Bid status</p>
          <label className="mt-1 flex items-center gap-2 text-slate-700"><input type="checkbox" checked readOnly /> Active (open for participation)</label>
        </div>
        <p className="text-[11px] text-slate-500">Only CPCL bids are listed in this simulation.</p>
      </aside>

      <div className="space-y-4">
        <div className="flex flex-col gap-2 rounded border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <Search aria-hidden className="hidden h-4 w-4 text-slate-400 sm:block" />
          <label className="sr-only" htmlFor="gem-search">Search bids</label>
          <input id="gem-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by bid number, item or category" className={gemInput} />
          <span className="shrink-0 text-xs text-slate-500">{shown.length} active bid{shown.length === 1 ? '' : 's'}</span>
        </div>
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        {!tenders && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading bids…</p>}
        {tenders && shown.length === 0 && <p className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">No bids match.</p>}
        {shown.map((t) => (
          <article key={t.id} className="rounded border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2">
              <p className="text-xs">
                <span className="font-semibold text-slate-500">BID NO: </span>
                <Link to={gemTenderPath(t.id)} className="font-mono font-semibold text-[#1b3a6b] hover:underline">{t.id}</Link>
              </p>
              <span className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">Active</span>
            </div>
            <div className="grid gap-4 px-4 py-3 text-xs md:grid-cols-3">
              <div className="md:col-span-2">
                <p className="text-slate-500">Items</p>
                <p className="text-sm font-semibold text-slate-900">{t.title}</p>
                <p className="mt-1 text-slate-600">{t.description}</p>
                <p className="mt-2 text-slate-500">Department</p>
                <p className="text-slate-800">Ministry of Petroleum and Natural Gas · {t.buyer} · {t.division}</p>
              </div>
              <dl className="space-y-1.5">
                <div><dt className="text-slate-500">Start date</dt><dd className="font-medium">{formatDate(t.publishDate)}</dd></div>
                <div><dt className="text-slate-500">End date</dt><dd className="font-medium text-orange-700">{formatDate(t.deadlineDate)}</dd></div>
                <div><dt className="text-slate-500">Estimated value · EMD</dt><dd className="font-medium">{crore(t.estimatedValue)} · {inr(t.emdAmount)}</dd></div>
              </dl>
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
              <Link to={gemTenderPath(t.id)} className={gemSecondary}>View bid details</Link>
              <Link to={`${gemTenderPath(t.id)}/participate`} className={gemPrimary}>Participate</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};
