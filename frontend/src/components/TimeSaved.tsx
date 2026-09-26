// Officer time saved by CSAP's automatic steps: measured CSAP time against a stated manual estimate.

import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Timer } from 'lucide-react';
import { api, type TimeSaved } from '../state/api';
import { useApp } from '../state/appContext';
import { Card } from './ui/primitives';

const hours = (min: number) => (min >= 90 ? `${(min / 60).toFixed(1)} h` : `${Math.round(min)} min`);
const duration = (s: number) => (s >= 90 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${Math.round(s)} s`);

function useTimeSaved() {
  const { source, db } = useApp();
  const [data, setData] = useState<TimeSaved | null>(null);
  useEffect(() => {
    if (source === 'api') api.timeSaved().then(setData).catch(() => setData(null));
  }, [source, db.auditEvents.length]);
  return data;
}

const Assumptions: React.FC<{ a: TimeSaved['assumptions'] }> = ({ a }) => (
  <p className="text-[11px] text-slate-500">
    Manual estimate (assumption, not measured): {a.perDocument} min to read and cross-check a document, {a.perRegistry} min per government portal lookup, {a.perRequirement} min per
    requirement, {a.report} min to write the evaluation note. CSAP time is measured from its own records.
  </p>
);

/** Dashboard: one line. */
export const TimeSavedBanner: React.FC = () => {
  const data = useTimeSaved();
  if (!data || !data.bids.length) return null;
  const t = data.totals;
  return (
    <section aria-label="Officer time saved" className="flex flex-col gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-center gap-2 text-sm text-emerald-950">
        <Timer aria-hidden className="h-5 w-5 text-emerald-700" />
        <span>
          <strong>About {hours(t.savedMinutes)} of officer time saved</strong> on {data.bids.length} bid{data.bids.length === 1 ? '' : 's'}: CSAP took {duration(t.automatedSeconds)} for work estimated at {hours(t.manualMinutes)} by hand.
        </span>
      </p>
      <Link to="/reports" className="shrink-0 text-xs font-medium text-emerald-800 hover:underline">How this is calculated</Link>
    </section>
  );
};

/** Reports page: per bid. */
export const TimeSavedCard: React.FC = () => {
  const data = useTimeSaved();
  if (!data) return null;
  return (
    <Card title="Officer time saved" subtitle="What CSAP did automatically for each bid, how long it took, and the estimated manual effort for the same work." padded={false}>
      {data.bids.length === 0 ? (
        <p className="px-4 py-3 text-xs text-slate-500">Nothing automated yet. Read documents, run portal checks or verification on a bid.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                {['Bid', 'Documents read', 'Registries checked', 'Requirements checked', 'CSAP time', 'Manual estimate'].map((h) => (
                  <th key={h} scope="col" className="px-4 py-2.5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.bids.map((b) => (
                <tr key={b.bidId}>
                  <td className="px-4 py-2 font-mono"><Link to={`/bids/${b.bidId}`} className="text-blue-700 hover:underline">{b.bidId}</Link></td>
                  <td className="px-4 py-2">{b.documentsRead || '—'}</td>
                  <td className="px-4 py-2">{b.registriesChecked || '—'}</td>
                  <td className="px-4 py-2">{b.requirementsChecked || '—'}</td>
                  <td className="px-4 py-2 font-mono">{duration(b.automatedSeconds)}</td>
                  <td className="px-4 py-2 font-mono">{hours(b.manualMinutes)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-900">
              <tr>
                <td className="px-4 py-2" colSpan={4}>Total · about {hours(data.totals.savedMinutes)} saved</td>
                <td className="px-4 py-2 font-mono">{duration(data.totals.automatedSeconds)}</td>
                <td className="px-4 py-2 font-mono">{hours(data.totals.manualMinutes)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <div className="border-t border-slate-100 px-4 py-2.5">
        <Assumptions a={data.assumptions} />
      </div>
    </Card>
  );
};
