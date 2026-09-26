import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Loader2 } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { GemCard, gemButton } from './GemLayout';
import { crore, gemApi, gemTenderPath, inr, type GemTender } from './gemApi';

export const GemHomePage: React.FC = () => {
  const [tenders, setTenders] = useState<GemTender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gemApi.tenders().then(setTenders).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Tenders open for bids</h1>
        <p className="mt-1 text-sm text-stone-600">
          Submit a bid with your company details and documents. The buyer's verification system receives it automatically once you submit.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!tenders && !error && (
        <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading tenders…</p>
      )}
      {tenders?.length === 0 && <p className="text-sm text-stone-600">No tenders are open for bids right now.</p>}
      {tenders?.map((t) => (
        <GemCard key={t.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="font-mono text-xs text-stone-500">{t.id}</p>
              <h2 className="text-base font-semibold text-stone-900">{t.title}</h2>
              <p className="text-xs text-stone-600">{t.buyer} · {t.division}</p>
              <p className="mt-2 max-w-2xl text-sm text-stone-700">{t.description}</p>
              <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-stone-600">
                <div><dt className="inline">Estimated value: </dt><dd className="inline font-semibold text-stone-900">{crore(t.estimatedValue)}</dd></div>
                <div><dt className="inline">EMD: </dt><dd className="inline font-semibold text-stone-900">{inr(t.emdAmount)}</dd></div>
                <div><dt className="inline">Requirements: </dt><dd className="inline font-semibold text-stone-900">{t.requirements.length}</dd></div>
                <div className="flex items-center gap-1 text-amber-800"><CalendarClock aria-hidden className="h-3.5 w-3.5" /><dt className="inline">Closes: </dt><dd className="inline font-semibold">{formatDate(t.deadlineDate)}</dd></div>
              </dl>
            </div>
            <Link to={gemTenderPath(t.id)} className={`${gemButton} shrink-0 bg-teal-700 text-white hover:bg-teal-800`}>
              View and submit bid
            </Link>
          </div>
        </GemCard>
      ))}
    </div>
  );
};
