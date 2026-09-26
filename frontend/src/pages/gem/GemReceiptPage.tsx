import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { GemCard, gemButton } from './GemLayout';
import { gemApi, inr, type GemSubmission } from './gemApi';

export const GemReceiptPage: React.FC = () => {
  const { id = '' } = useParams();
  const [sub, setSub] = useState<GemSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gemApi.submission(id).then(setSub).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (!sub) return <p className="flex items-center gap-2 text-sm text-stone-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const delivered = sub.status === 'DELIVERED';
  const emd = sub.declared.emd;

  return (
    <div className="space-y-5">
      <GemCard>
        <div className="flex items-start gap-3">
          {delivered ? <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-teal-700" /> : <XCircle aria-hidden className="h-8 w-8 shrink-0 text-rose-700" />}
          <div>
            <h1 className="text-lg font-semibold">{delivered ? 'Bid submitted' : 'Bid saved, but not yet delivered to the buyer'}</h1>
            <p className="mt-0.5 text-sm text-stone-700">
              GeM bid number <span className="font-mono font-semibold">{sub.gemBidNo}</span> · tender <span className="font-mono">{sub.tenderId}</span> · {formatDateTime(sub.submittedAt)}
            </p>
            {delivered ? (
              <p className="mt-2 text-sm text-stone-700">
                Delivered to the buyer's verification system (CPCL CSAP) at {sub.deliveredAt ? formatDateTime(sub.deliveredAt) : '—'}. Buyer reference{' '}
                <span className="font-mono font-semibold">{sub.csapBidId}</span>.
              </p>
            ) : (
              <p className="mt-2 text-sm text-rose-800">{sub.delivery?.error ?? `The buyer's system answered HTTP ${sub.delivery?.response?.httpStatus ?? '—'}.`}</p>
            )}
          </div>
        </div>
      </GemCard>

      <GemCard title="What you submitted">
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div><dt className="inline text-stone-500">Company: </dt><dd className="inline font-medium">{sub.company.name}</dd></div>
          <div><dt className="inline text-stone-500">PAN / GSTIN: </dt><dd className="inline font-mono">{sub.company.pan} / {sub.company.gstin}</dd></div>
          <div><dt className="inline text-stone-500">EMD: </dt><dd className="inline">{emd.instrument === 'MSME_EXEMPTION' ? 'MSE exemption claimed' : `${inr(emd.amount)} (${emd.reference})`}</dd></div>
          <div><dt className="inline text-stone-500">Documents: </dt><dd className="inline">{sub.documents.length}</dd></div>
        </dl>
      </GemCard>

      <GemCard title="What happens next">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-stone-700">
          <li>The buyer's system reads every document and checks it against the tender's requirements.</li>
          <li>It confirms your registrations with the government registries.</li>
          <li>A CPCL procurement officer reviews the results and decides. You may be asked for a clarification.</li>
        </ol>
        {delivered && (
          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
            <Link to={`/bids/${sub.csapBidId}`} className={`${gemButton} bg-teal-700 text-white hover:bg-teal-800`}>
              Demo: open this bid in CSAP (officer view)
            </Link>
            <Link to="/gem" className={`${gemButton} border border-stone-300 bg-white text-stone-800 hover:bg-stone-50`}>
              Back to tenders
            </Link>
          </div>
        )}
      </GemCard>
    </div>
  );
};
