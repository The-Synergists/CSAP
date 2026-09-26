import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { formatDate } from '../../lib/format';
import { GemCard, gemPrimary } from './GemLayout';
import { crore, gemApi, gemTenderPath, inr, type GemTender } from './gemApi';

const Row: React.FC<{ k: string; v: React.ReactNode }> = ({ k, v }) => (
  <tr className="border-b border-slate-100 last:border-0">
    <th scope="row" className="w-1/3 bg-slate-50 px-3 py-2 text-left text-xs font-medium text-slate-600">{k}</th>
    <td className="px-3 py-2 text-sm text-slate-900">{v}</td>
  </tr>
);

/** Bid document: the details a seller reads before participating. */
export const GemBidPage: React.FC = () => {
  const { tenderId = '' } = useParams();
  const id = decodeURIComponent(tenderId);
  const [t, setT] = useState<GemTender | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gemApi
      .tenders()
      .then((ts) => {
        const found = ts.find((x) => x.id === id);
        if (found) setT(found);
        else setError('This bid is not open for participation.');
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);
  if (error) return <p role="alert" className="text-sm text-rose-700">{error} <Link to="/gem" className="underline">All bids</Link></p>;
  if (!t) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/gem" className="text-xs text-[#1b3a6b] hover:underline">← Bids</Link>
          <h1 className="mt-1 text-xl font-semibold text-slate-900">Bid document</h1>
          <p className="font-mono text-sm text-slate-600">{t.id}</p>
        </div>
        <Link to={`${gemTenderPath(t.id)}/participate`} className={gemPrimary}>Participate in this bid</Link>
      </div>

      <GemCard title="Bid details">
        <table className="w-full">
          <tbody>
            <Row k="Bid end date / time" v={`${formatDate(t.deadlineDate)}, 15:00`} />
            <Row k="Bid opening date / time" v="On the next working day after the end date, 15:30" />
            <Row k="Bid offer validity" v="120 days from end date" />
            <Row k="Ministry" v="Ministry of Petroleum and Natural Gas" />
            <Row k="Organisation" v={t.buyer} />
            <Row k="Office" v={t.division} />
            <Row k="Item category" v={`${t.title} (${t.category})`} />
            <Row k="Estimated bid value" v={crore(t.estimatedValue)} />
            <Row k="Evaluation method" v="Total value wise; technical evaluation by the buyer's CSAP system and procurement officer" />
          </tbody>
        </table>
      </GemCard>

      <GemCard title="EMD detail">
        <table className="w-full">
          <tbody>
            <Row k="EMD amount" v={inr(t.emdAmount)} />
            <Row k="Payment" v="Online transfer (NEFT/RTGS) or bank guarantee from a scheduled bank" />
            <Row k="EMD exemption" v="Micro and small enterprises registered on Udyam, as per the MSE policy" />
          </tbody>
        </table>
      </GemCard>

      <GemCard title="Eligibility and documents required from the seller">
        <ol className="space-y-2">
          {t.requirements.map((r) => (
            <li key={r.code} className="text-sm">
              <span className="font-mono text-xs text-slate-500">{r.code}</span> <span className="font-medium">{r.title}</span>
              {!r.mandatory && <span className="text-xs text-slate-500"> (only if claiming MSE benefits)</span>}
              <p className="text-xs text-slate-600">{r.criterion}</p>
            </li>
          ))}
        </ol>
      </GemCard>

      <p className="text-xs text-slate-600">
        After the end date the buyer's system (CPCL CSAP) receives each bid, reads the documents and checks registrations automatically. The evaluation result and report appear under My Bids.
      </p>
    </div>
  );
};
