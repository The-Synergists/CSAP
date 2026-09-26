import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { GemCard, gemInput, gemPrimary } from './GemLayout';
import { EVALUATION_STATUS, gemApi, type GemSubmission } from './gemApi';
import { useSellerPan } from './gemSeller';

/** Seller dashboard: every bid the seller submitted and what the buyer decided. */
export const GemMyBidsPage: React.FC = () => {
  const [pan, setPan] = useSellerPan();
  const [input, setInput] = useState(pan);
  const [bids, setBids] = useState<GemSubmission[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pan) return;
    let active = true;
    gemApi
      .myBids(pan)
      .then((b) => active && setBids(b))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [pan]);

  if (!pan) {
    return (
      <GemCard title="Seller login">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (/^[A-Z]{5}\d{4}[A-Z]$/.test(input)) setPan(input);
          }}
          className="flex max-w-md flex-col gap-2 sm:flex-row"
        >
          <label className="sr-only" htmlFor="seller-pan">Seller PAN</label>
          <input id="seller-pan" value={input} onChange={(e) => setInput(e.target.value.toUpperCase())} maxLength={10} placeholder="Your company PAN" className={`${gemInput} font-mono`} />
          <button type="submit" className={gemPrimary} disabled={!/^[A-Z]{5}\d{4}[A-Z]$/.test(input)}>Sign in</button>
        </form>
        <p className="mt-2 text-xs text-slate-500">Simulation: sellers are identified by PAN, with no password. Submitting a bid signs you in automatically.</p>
      </GemCard>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">My Bids</h1>
        <button type="button" onClick={() => { setPan(''); setBids(null); setInput(''); }} className="text-xs text-slate-500 hover:underline">
          Sign out (<span className="font-mono">{pan}</span>)
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!bids && !error && <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>}
      {bids?.length === 0 && (
        <GemCard>
          <p className="text-sm text-slate-600">No bids yet. <Link to="/gem" className="text-[#1b3a6b] underline">Find a bid to participate in.</Link></p>
        </GemCard>
      )}
      {bids && bids.length > 0 && (
        <div className="overflow-x-auto rounded border border-slate-200 bg-white">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>{['GeM bid number', 'Bid', 'Submitted', 'Status', ''].map((h) => <th key={h} scope="col" className="px-4 py-2.5">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bids.map((b) => {
                const st = EVALUATION_STATUS[b.evaluationStatus ?? 'UNDER_EVALUATION'] ?? EVALUATION_STATUS.UNDER_EVALUATION;
                return (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-mono">{b.gemBidNo}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{b.tenderId}</td>
                    <td className="px-4 py-2.5 text-xs">{formatDateTime(b.submittedAt)}</td>
                    <td className="px-4 py-2.5"><span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.className}`}>{b.status === 'DELIVERED' ? st.label : 'Not delivered'}</span></td>
                    <td className="px-4 py-2.5 text-right"><Link to={`/gem/submissions/${b.id}`} className="text-xs font-medium text-[#1b3a6b] hover:underline">View</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
