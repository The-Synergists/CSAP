// One bid on the GeM buyer desk: its evaluation outcome and every evaluation report CSAP delivered
// for it, shown in full as GeM received it (with the fingerprint check done on arrival).

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { ReportArticle } from '../bids/EvaluationReportPage';
import { GemCard, gemSecondary } from './GemLayout';
import { GemBuyerLogin } from './GemBuyerPage';
import { buyerToken, EVALUATION_STATUS, gemBuyerApi, type BuyerSubmission } from './gemApi';

export const GemBuyerReportPage: React.FC = () => {
  const { id = '' } = useParams();
  const [signedIn, setSignedIn] = useState(!!buyerToken.get());
  const [sub, setSub] = useState<BuyerSubmission | null>(null);
  const [selected, setSelected] = useState(0);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return;
    gemBuyerApi
      .submission(id)
      .then(setSub)
      .catch((e) => {
        if ((e as { status?: number }).status === 401) {
          buyerToken.set(null);
          setSignedIn(false);
        } else setError(e instanceof Error ? e.message : String(e));
      });
  }, [id, signedIn]);

  if (!signedIn) return <GemBuyerLogin onSignedIn={() => setSignedIn(true)} />;
  if (error) return <p role="alert" className="text-sm text-rose-700">{error} <Link to="/gem/buyer" className="underline">Buyer desk</Link></p>;
  if (!sub) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const st = EVALUATION_STATUS[sub.evaluationStatus] ?? EVALUATION_STATUS.UNDER_EVALUATION;
  const report = sub.reportsReceived[selected];

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <Link to="/gem/buyer" className="text-xs text-[#1b3a6b] hover:underline">← Buyer desk</Link>
        <h1 className="mt-1 text-xl font-semibold text-slate-900">{sub.seller}</h1>
        <p className="text-sm text-slate-600"><span className="font-mono">{sub.gemBidNo}</span> · bid {sub.tenderId} · submitted {formatDateTime(sub.submittedAt)}</p>
      </div>

      <GemCard title="Technical evaluation" actions={<span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>}>
        <p className="text-sm text-slate-700"><span className="font-semibold">Next stage:</span> {sub.nextStage}</p>
        {sub.remarks && <p className="mt-1 text-sm text-slate-700"><span className="font-semibold">Evaluating officer's remarks:</span> {sub.remarks}</p>}
        {sub.requestPending && <p className="mt-1 text-sm font-medium text-amber-800">The seller's latest response is waiting for the buyer's review.</p>}
        {sub.reportsReceived.length > 1 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs print:hidden">
            <span className="text-slate-600">Reports received:</span>
            {sub.reportsReceived.map((r, i) => (
              <button key={r.reportNo} type="button" onClick={() => setSelected(i)} className={`rounded border px-2 py-1 font-mono ${i === selected ? 'border-[#1b3a6b] bg-[#1b3a6b] text-white' : 'border-slate-300 bg-white text-slate-700'}`}>
                {r.reportNo}{i === 0 ? ' (latest)' : ''}
              </button>
            ))}
          </div>
        )}
      </GemCard>

      {!report ? (
        <GemCard><p className="text-sm text-slate-600">No evaluation report has been received for this bid yet. It arrives from the buyer's evaluation system as soon as the evaluating officer records a decision.</p></GemCard>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <span className={`flex items-center gap-1.5 text-xs font-medium ${report.verified ? 'text-emerald-700' : 'text-rose-700'}`}>
              {report.verified ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
              {report.verified
                ? `Fingerprint verified on arrival: this is the report CSAP signed, unchanged (received ${formatDateTime(report.receivedAt)}).`
                : 'Fingerprint mismatch on arrival: the report does not match its signature.'}
            </span>
            <button type="button" onClick={() => window.print()} className={gemSecondary}>
              <Printer className="h-4 w-4" /> Print / Save as PDF
            </button>
          </div>
          <ReportArticle content={report.content} sha256={report.sha256} />
        </>
      )}
    </div>
  );
};
