// Document intelligence on the Documents tab: "Read all documents" sends every stored bid document
// through NVIDIA OCR and extraction, compares each with the bid record, and checks names and
// identifiers across documents. Progress streams in through Supabase Realtime (polling fallback).

import React, { useEffect, useState } from 'react';
import { DocPreview } from '../../components/DocPreview';
import { CheckCircle2, Loader2, MinusCircle, ScanText, XCircle } from 'lucide-react';
import type { ComparisonRow, DocumentVerificationRun } from '@shared/domain/types';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, Modal } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';
import { formatDateTime } from '../../lib/format';
import { api } from '../../state/api';
import type { DocumentIntelligence } from './useDocumentIntelligence';
import { LOCKED_HINT } from './ReevaluationPanel';

const done = (r: DocumentVerificationRun) => r.status === 'COMPLETED' || r.status === 'FAILED';

/** The per-document status shown in the Documents table. */
export const ReadingBadge: React.FC<{ run?: DocumentVerificationRun; onOpen: () => void }> = ({ run, onOpen }) => {
  if (!run) return <span className="text-[11px] text-slate-400">Not read yet</span>;
  if (!done(run))
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-blue-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> {run.status === 'QUEUED' ? 'Waiting…' : run.status === 'OCR_RUNNING' ? 'OCR…' : run.status === 'EXTRACTING' ? 'Extracting…' : 'Checking…'}
      </span>
    );
  const v = run.verdict;
  const tone = v === 'CONSISTENT' || v === 'VERIFIED' ? 'success' : v === 'ERROR' ? 'warning' : 'danger';
  const label = v === 'CONSISTENT' ? 'Agrees with bid' : v === 'VERIFIED' ? 'PAN verified' : v === 'ERROR' ? 'Could not read' : v === 'DISCREPANCY' ? 'Differs from bid' : (v ?? '').replace(/_/g, ' ').toLowerCase();
  return (
    <button type="button" onClick={onOpen} className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`CSAP AI reading: ${label}. Show details`}>
      <Badge tone={tone} dot>{label}</Badge>
    </button>
  );
};

const RESULT_ICON = {
  MATCH: <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label="Match" />,
  MISMATCH: <XCircle className="h-4 w-4 text-rose-600" aria-label="Mismatch" />,
  NOT_AVAILABLE: <MinusCircle className="h-4 w-4 text-slate-400" aria-label="Not compared" />,
};

/** "turnover_fy_2022_23" -> "Turnover FY 2022-23" */
const fieldLabel = (k: string) =>
  k
    .replace(/_fy_(\d{4})_(\d{2})$/, ' FY $1-$2')
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/\b(Pan|Gstin|Udin|Epfo|Esic|Oem)\b/g, (w) => w.toUpperCase());

/** Top card: start the reading, see progress, the summary and the cross-document check. */
export const IntelligenceCard: React.FC<{ state: DocumentIntelligence; stored: number; locked?: boolean }> = ({ state, stored, locked }) => {
  const toast = useToast();
  const [starting, setStarting] = useState(false);
  const { batch, runs, running, live } = state;
  const finished = runs.filter(done).length;
  const go = async () => {
    setStarting(true);
    try {
      await state.start();
    } catch (err) {
      toast({ kind: 'error', title: 'Document reading not started', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setStarting(false);
    }
  };
  const mismatches = batch?.consistency?.filter((c) => c.result === 'MISMATCH') ?? [];

  return (
    <Card
      title="Read documents with CSAP AI"
      subtitle="CSAP AI reads each document (image or PDF) and extracts its fields. CSAP compares every field with the bid record, and names and identifiers across all documents."
      actions={
        <>
          <Badge tone={live ? 'success' : 'neutral'} dot>{live ? 'Live' : 'Polling'}</Badge>
          <Button variant="primary" size="sm" disabled={running || starting || stored === 0 || locked} title={locked ? LOCKED_HINT : undefined} onClick={() => void go()}>
            {running || starting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
            {running ? `Reading ${finished} of ${batch?.total ?? runs.length}…` : batch ? 'Read all documents again' : `Read all ${stored} documents`}
          </Button>
        </>
      }
    >
      {!batch ? (
        <p className="text-xs text-slate-600">Not read yet. Reading takes about 20 seconds for a full bid package; each document's result appears in the table below as soon as it is ready.</p>
      ) : (
        <div className="space-y-3">
          {running && (
            <div className="h-1.5 w-full overflow-hidden rounded bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={finished} aria-label="Documents read">
              <div className="h-full bg-blue-600 transition-all" style={{ width: `${(finished / Math.max(batch.total, 1)) * 100}%` }} />
            </div>
          )}
          {batch.summary && (
            <p className={`text-xs ${mismatches.length || batch.summary.includes('differ') ? 'text-rose-800' : 'text-slate-800'}`}>
              {batch.summary} <span className="text-slate-500">· {formatDateTime(batch.completedAt ?? batch.startedAt)}</span>
            </p>
          )}
          {batch.error && <p role="alert" className="text-xs text-rose-700">Reading failed: {batch.error}</p>}
          {batch.consistency && (
            <div className="relative overflow-x-auto rounded border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-xs">
                <caption className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Cross-document check</caption>
                <thead className="border-b border-slate-200 text-[11px] font-semibold text-slate-600">
                  <tr>
                    <th scope="col" className="px-3 py-2">Field</th>
                    <th scope="col" className="px-3 py-2">What each source says</th>
                    <th scope="col" className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {batch.consistency.map((c) => (
                    <tr key={c.field} className={c.result === 'MISMATCH' ? 'bg-rose-50/60' : undefined}>
                      <td className="px-3 py-2 font-medium text-slate-800">{c.field}</td>
                      <td className="px-3 py-2">
                        {c.result === 'MISMATCH' ? (
                          <span className="text-rose-800">{c.note}</span>
                        ) : (
                          <span className="text-slate-600">
                            {c.values[0]?.value ? <span className="font-mono">{c.values[0].value}</span> : '—'} · {c.note}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {c.result === 'MATCH' ? <Badge tone="success" dot>Consistent</Badge> : c.result === 'MISMATCH' ? <Badge tone="danger" dot>Inconsistent</Badge> : <Badge tone="neutral">Not compared</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

const ComparisonTable: React.FC<{ rows: ComparisonRow[]; registry: boolean }> = ({ rows, registry }) => (
  <div className="relative overflow-x-auto rounded border border-slate-200">
    <table className="w-full min-w-[480px] text-left text-xs">
      <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
        <tr>
          <th scope="col" className="px-3 py-2">Field</th>
          <th scope="col" className="px-3 py-2">Document says</th>
          {registry && <th scope="col" className="px-3 py-2">PAN registry</th>}
          <th scope="col" className="px-3 py-2">Bid record</th>
          <th scope="col" className="px-3 py-2"><span className="sr-only">Result</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 align-top">
        {rows.map((r) => (
          <tr key={r.field} className={r.result === 'MISMATCH' ? 'bg-rose-50/60' : undefined}>
            <td className="px-3 py-2 font-medium text-slate-700">{r.field}</td>
            <td className="px-3 py-2 text-slate-800">{r.document ?? '—'}</td>
            {registry && <td className="px-3 py-2 text-slate-800">{r.apiRegistry ?? '—'}</td>}
            <td className="px-3 py-2 text-slate-800">{r.bidderRecord ?? '—'}</td>
            <td className="px-3 py-2">{RESULT_ICON[r.result]}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

/** Everything NVIDIA read from one document, and how it compares with the bid. */
export const ReadingModal: React.FC<{ run: DocumentVerificationRun | null; onClose: () => void }> = ({ run, onClose }) => {
  const [preview, setPreview] = useState<string | null>(null);
  const path = run?.document.path;
  useEffect(() => {
    if (!path) return;
    let active = true;
    api
      .documentUrl(path)
      .then((r) => active && setPreview(r.url))
      .catch(() => active && setPreview(null));
    return () => {
      active = false;
    };
  }, [path]);

  const fields = run?.extraction ? Object.entries(run.extraction.fields) : [];
  return (
    <Modal
      open={!!run}
      onClose={onClose}
      size="lg"
      title={run ? `${run.document.title ?? run.document.fileName} — CSAP AI reading` : ''}
      description={run && `${run.document.code} · ${run.document.requirement} · ${run.document.fileName}${run.document.sha256 ? ` · SHA-256 ${run.document.sha256.slice(0, 12)}…` : ''}`}
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}
    >
      {run && (
        <div className="space-y-4 text-xs">
          {run.comparison && (
            <p className={`rounded border px-3 py-2 ${run.verdict === 'CONSISTENT' || run.verdict === 'VERIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
              {run.comparison.summary}
            </p>
          )}
          {run.error && <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Could not read this document: {run.error}</p>}
          {run.comparison && <ComparisonTable rows={run.comparison.rows} registry={run.documentType === 'PAN'} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              {preview ? <DocPreview url={preview} mimeType={run.document.mimeType} title={`Document ${run.document.title ?? ''}`} /> : <p className="p-6 text-center text-slate-500">Loading preview…</p>}
            </div>
            {fields.length > 0 && (
              <div className="relative overflow-x-auto rounded border border-slate-200 self-start">
                <table className="w-full text-left text-xs">
                  <caption className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-600">Fields extracted by CSAP AI</caption>
                  <tbody className="divide-y divide-slate-100">
                    {fields.map(([k, v]) => (
                      <tr key={k}>
                        <th scope="row" className="w-2/5 px-3 py-1.5 text-left font-medium text-slate-500">{fieldLabel(k)}</th>
                        <td className="px-3 py-1.5 text-slate-800">{v ?? '—'}</td>
                        <td className="w-24 px-3 py-1.5 text-[11px]">
                          {v == null ? null : run.extraction!.grounding[k] ? <span className="text-emerald-700">In OCR text</span> : <span className="text-amber-700">Not in OCR text</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {run.ocr && (
            <details>
              <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-900">
                Technical details: OCR text and model output · OCR {run.ocr.latencyMs} ms{run.extraction ? ` · extraction ${run.extraction.latencyMs} ms` : ''}
              </summary>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`${run.ocr.model}\n\n${run.ocr.text}`}</pre>
                <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{run.extraction ? `${run.extraction.model}\n\n${run.extraction.rawOutput}` : '—'}</pre>
              </div>
            </details>
          )}
        </div>
      )}
    </Modal>
  );
};
