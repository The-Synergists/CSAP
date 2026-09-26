import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { GemCard, gemPrimary, gemSecondary } from './GemLayout';
import { EVALUATION_STATUS, gemApi, inr, type GemSubmission } from './gemApi';

/** The buyer's (CPCL via CSAP) evaluation of one bid, as the seller sees it. */
export const EvaluationPanel: React.FC<{ sub: GemSubmission }> = ({ sub }) => {
  const st = EVALUATION_STATUS[sub.evaluationStatus ?? 'UNDER_EVALUATION'] ?? EVALUATION_STATUS.UNDER_EVALUATION;
  const ev = sub.evaluation;
  return (
    <GemCard title="Buyer's evaluation" actions={<span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>}>
      {!ev ? (
        <p className="text-sm text-slate-600">The buyer is evaluating your bid. The result and the evaluation report appear here when the procurement officer decides.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {ev.remarks && (
            <p>
              <span className="font-semibold">Buyer's remarks: </span>
              {ev.remarks}
            </p>
          )}
          <p className="text-slate-700">
            Evaluation report <span className="font-mono font-semibold">{ev.report.reportNo}</span> · {ev.report.requirementsMet} requirements met · received{' '}
            {sub.evaluationReceivedAt ? formatDateTime(sub.evaluationReceivedAt) : '—'}
          </p>
          {ev.report.issues.length > 0 && (
            <div>
              <p className="font-semibold text-slate-900">Points raised by the buyer</p>
              <ul className="mt-1 space-y-1.5">
                {ev.report.issues.map((i) => (
                  <li key={i.id} className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="font-medium">{i.title}</p>
                    <p className="text-xs text-slate-600">What to do: {i.requiredAction}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="break-all font-mono text-[11px] text-slate-500">Report fingerprint (SHA-256): {ev.report.sha256}</p>
        </div>
      )}
    </GemCard>
  );
};

export const GemReceiptPage: React.FC = () => {
  const { id = '' } = useParams();
  const [sub, setSub] = useState<GemSubmission | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gemApi.submission(id).then(setSub).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p role="alert" className="text-sm text-rose-700">{error}</p>;
  if (!sub) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const delivered = sub.status === 'DELIVERED';
  const emd = sub.declared.emd;

  return (
    <div className="space-y-5">
      <GemCard>
        <div className="flex items-start gap-3">
          {delivered ? <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-emerald-600" /> : <XCircle aria-hidden className="h-8 w-8 shrink-0 text-rose-700" />}
          <div>
            <h1 className="text-lg font-semibold">{delivered ? 'Bid submitted' : 'Bid saved, but not yet delivered to the buyer'}</h1>
            <p className="mt-0.5 text-sm text-slate-700">
              GeM bid number <span className="font-mono font-semibold">{sub.gemBidNo}</span> · bid <span className="font-mono">{sub.tenderId}</span> · {formatDateTime(sub.submittedAt)}
            </p>
            {delivered ? (
              <p className="mt-2 text-sm text-slate-700">
                Delivered to the buyer's verification system (CPCL CSAP) at {sub.deliveredAt ? formatDateTime(sub.deliveredAt) : '—'}. Buyer reference{' '}
                <span className="font-mono font-semibold">{sub.csapBidId}</span>.
              </p>
            ) : (
              <p className="mt-2 text-sm text-rose-800">{sub.delivery?.error ?? `The buyer's system answered HTTP ${sub.delivery?.response?.httpStatus ?? '—'}.`}</p>
            )}
          </div>
        </div>
      </GemCard>

      {delivered && <EvaluationPanel sub={sub} />}

      <GemCard title="What you submitted">
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Company: </dt><dd className="inline font-medium">{sub.company.name}</dd></div>
          <div><dt className="inline text-slate-500">PAN / GSTIN: </dt><dd className="inline font-mono">{sub.company.pan} / {sub.company.gstin}</dd></div>
          <div><dt className="inline text-slate-500">EMD: </dt><dd className="inline">{emd.instrument === 'MSME_EXEMPTION' ? 'MSE exemption claimed' : `${inr(emd.amount)} (${emd.reference})`}</dd></div>
          <div><dt className="inline text-slate-500">Documents: </dt><dd className="inline">{sub.documents.length}</dd></div>
        </dl>
      </GemCard>

      <div className="flex flex-wrap gap-2">
        <Link to="/gem/my-bids" className={gemSecondary}>My Bids</Link>
        {delivered && (
          <Link to={`/bids/${sub.csapBidId}`} className={gemPrimary}>
            Demo: open this bid in CSAP (officer view)
          </Link>
        )}
      </div>
    </div>
  );
};
