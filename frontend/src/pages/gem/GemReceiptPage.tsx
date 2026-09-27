import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, FileUp, Loader2 } from 'lucide-react';
import { formatDateTime } from '../../lib/format';
import { GemCard, gemInput, gemPrimary, gemSecondary } from './GemLayout';
import { EVALUATION_STATUS, fileToBase64, gemApi, inr, type GemDocument, type GemSubmission } from './gemApi';

const DECIDED = ['TECHNICALLY_QUALIFIED', 'DISQUALIFIED', 'UNDER_COMMITTEE_REVIEW'];

/** The seller answers a clarification, or asks the buyer to evaluate a decided bid again. */
const ResponseForm: React.FC<{ sub: GemSubmission; onSent: (s: GemSubmission) => void }> = ({ sub, onSent }) => {
  const clarification = sub.evaluationStatus === 'CLARIFICATION_SOUGHT';
  const draftId = useMemo(() => crypto.randomUUID(), []);
  const [open, setOpen] = useState(clarification);
  const [reason, setReason] = useState('');
  const [docs, setDocs] = useState<Record<string, GemDocument>>({});
  const [reqs, setReqs] = useState<{ code: string; title: string }[]>(sub.documents.map((d) => ({ code: d.requirementCode, title: d.name })));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    gemApi
      .tenders()
      .then((ts) => {
        const t = ts.find((x) => x.id === sub.tenderId);
        if (t) setReqs(t.requirements.map((r) => ({ code: r.code, title: r.title })));
      })
      .catch(() => {});
  }, [sub.tenderId]);

  const upload = async (code: string, title: string, file?: File) => {
    if (!file) return;
    setError(null);
    setBusy(code);
    try {
      const r = await gemApi.upload({ draftId, requirementCode: code, fileName: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) });
      setDocs((d) => ({ ...d, [code]: { requirementCode: code, name: title, path: r.path, fileName: file.name, mimeType: file.type, sizeBytes: r.sizeBytes } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const send = async () => {
    setError(null);
    setBusy('send');
    try {
      onSent(await gemApi.respond(sub.id, { reason, documents: Object.values(docs) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  if (!open)
    return (
      <button type="button" className={gemSecondary} onClick={() => setOpen(true)}>
        Request re-evaluation
      </button>
    );
  return (
    <div className="space-y-2 rounded border border-slate-200 p-3">
      <p className="font-semibold text-slate-900">{clarification ? 'Respond to the clarification' : 'Request re-evaluation'}</p>
      <p className="text-xs text-slate-600">
        {clarification
          ? 'Explain your response and attach corrected or missing documents. The buyer reviews it before evaluating your bid again.'
          : 'Explain why the buyer should evaluate your bid again, and attach any corrected documents. The buyer decides whether to reopen the evaluation.'}
      </p>
      <label className="block text-xs font-medium text-slate-700">
        Your response
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={`${gemInput} mt-1`} />
      </label>
      <div className="space-y-1">
        <p className="text-xs font-medium text-slate-700">Replacement documents (optional) · PDF, PNG or JPEG, under 3 MB</p>
        {reqs.map((r) => (
          <label key={r.code} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-60 truncate"><span className="font-mono text-slate-500">{r.code}</span> {r.title}</span>
            <span className="inline-flex cursor-pointer items-center gap-1 text-[#1b3a6b] hover:underline">
              {busy === r.code ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              {docs[r.code] ? docs[r.code].fileName : 'Attach'}
              <input type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" aria-label={`Replacement for ${r.title}`} onChange={(e) => void upload(r.code, r.title, e.target.files?.[0])} />
            </span>
          </label>
        ))}
      </div>
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      <button type="button" className={gemPrimary} disabled={!!busy || reason.trim().length < 10} onClick={() => void send()}>
        {busy === 'send' ? 'Sending…' : 'Send to the buyer'}
      </button>
    </div>
  );
};

/** The buyer's evaluation of one bid, as the seller sees it. */
export const EvaluationPanel: React.FC<{ sub: GemSubmission; onChange?: (s: GemSubmission) => void }> = ({ sub, onChange }) => {
  const responses = sub.responses ?? [];
  const last = responses[responses.length - 1];
  const waiting = !!last && (!sub.evaluationReceivedAt || last.sentAt > sub.evaluationReceivedAt);
  const canRespond = !!onChange && !waiting && (sub.evaluationStatus === 'CLARIFICATION_SOUGHT' || DECIDED.includes(sub.evaluationStatus ?? ''));
  const st = EVALUATION_STATUS[sub.evaluationStatus ?? 'UNDER_EVALUATION'] ?? EVALUATION_STATUS.UNDER_EVALUATION;
  const ev = sub.evaluation;
  return (
    <GemCard title="Buyer's evaluation" actions={<span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>}>
      {!ev ? (
        <p className="text-sm text-slate-600">The buyer is evaluating your bid. The result appears here once the buyer has decided.</p>
      ) : (
        <div className="space-y-3 text-sm">
          {ev.remarks && (
            <p>
              <span className="font-semibold">Buyer's remarks: </span>
              {ev.remarks}
            </p>
          )}
          {ev.report && (
          <p className="text-slate-700">
            Evaluation report <span className="font-mono font-semibold">{ev.report.reportNo}</span> · {ev.report.requirementsMet} requirements met · received{' '}
            {sub.evaluationReceivedAt ? formatDateTime(sub.evaluationReceivedAt) : '—'}
          </p>
          )}
          {ev.report && ev.report.issues.length > 0 && (
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
          {ev.report && <p className="break-all font-mono text-[11px] text-slate-500">Report fingerprint (SHA-256): {ev.report.sha256}</p>}
        </div>
      )}
      {responses.length > 0 && (
        <div className="mt-3 space-y-1 border-t border-slate-100 pt-2 text-xs">
          <p className="font-semibold text-slate-900">Your responses</p>
          {responses.map((r, i) => (
            <p key={i} className="text-slate-700">
              {formatDateTime(r.sentAt)} · {r.kind === 'CLARIFICATION_RESPONSE' ? 'Clarification response' : 'Re-evaluation request'}: “{r.reason}”
              {r.documents.length > 0 && ` (${r.documents.length} document${r.documents.length > 1 ? 's' : ''})`}
            </p>
          ))}
          {waiting && <p className="font-medium text-amber-800">Your latest response is with the buyer.</p>}
        </div>
      )}
      {canRespond && (
        <div className="mt-3 text-sm">
          <ResponseForm key={sub.evaluationReceivedAt ?? ''} sub={sub} onSent={onChange!} />
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
    gemApi
      .submission(id)
      .then((s) => (s?.gemBidNo ? setSub(s) : setError('This bid could not be found. It may have been removed when the demo was reset.')))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error)
    return (
      <GemCard>
        <p role="alert" className="text-sm text-rose-700">{error}</p>
        <div className="mt-3 flex gap-2">
          <Link to="/gem/my-bids" className={gemSecondary}>My Bids</Link>
          <Link to="/gem" className={gemPrimary}>Bids</Link>
        </div>
      </GemCard>
    );
  if (!sub) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>;
  const emd = sub.declared.emd;

  return (
    <div className="space-y-5">
      <GemCard>
        <div className="flex items-start gap-3">
          <CheckCircle2 aria-hidden className="h-8 w-8 shrink-0 text-emerald-600" />
          <div>
            <h1 className="text-lg font-semibold">Thank you. Your bid has been submitted.</h1>
            <p className="mt-0.5 text-sm text-slate-700">
              GeM bid number <span className="font-mono font-semibold">{sub.gemBidNo}</span> · bid <span className="font-mono">{sub.tenderId}</span> · {formatDateTime(sub.submittedAt)}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              The buyer, Chennai Petroleum Corporation Limited, will review your bid. You will see the result, and any clarification the buyer needs, under My Bids.
            </p>
          </div>
        </div>
      </GemCard>

      <EvaluationPanel sub={sub} onChange={setSub} />

      <GemCard title="What you submitted">
        <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          <div><dt className="inline text-slate-500">Company: </dt><dd className="inline font-medium">{sub.company.name}</dd></div>
          <div><dt className="inline text-slate-500">PAN / GSTIN: </dt><dd className="inline font-mono">{sub.company.pan} / {sub.company.gstin}</dd></div>
          <div><dt className="inline text-slate-500">EMD: </dt><dd className="inline">{emd.instrument === 'MSME_EXEMPTION' ? 'MSE exemption claimed' : `${inr(emd.amount)} (${emd.reference})`}</dd></div>
          <div><dt className="inline text-slate-500">Documents: </dt><dd className="inline">{sub.documents.length}</dd></div>
        </dl>
      </GemCard>

      <div className="flex flex-wrap gap-2">
        <Link to="/gem/my-bids" className={gemPrimary}>My Bids</Link>
        <Link to="/gem" className={gemSecondary}>Back to bids</Link>
      </div>
    </div>
  );
};
