import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, Upload, XCircle } from 'lucide-react';
import { mapRunRow } from '@shared/domain/pipeline';
import type { DocumentVerificationRun, PipelineStatus } from '@shared/domain/types';
import { api } from '../../../state/api';
import { useApp } from '../../../state/appContext';
import { subscribeToTables } from '../../../state/realtime';
import { Badge } from '../../../components/ui/Badge';
import { Button, Card, EmptyState } from '../../../components/ui/primitives';
import { inputClass } from '../../../components/ui/styles';
import { useToast } from '../../../components/ui/toast';
import { PAN_VERDICT } from '../../../domain/labels';
import { formatDateTime } from '../../../lib/format';
import type { TabProps } from '../bidTabs';

type StageState = 'pending' | 'running' | 'done' | 'failed';

/** Order in which the pipeline advances; used to derive each stage's state from run.status. */
const PROGRESS: PipelineStatus[] = ['QUEUED', 'OCR_RUNNING', 'EXTRACTING', 'CALLING_API', 'COMPLETED'];

const stageState = (run: DocumentVerificationRun, stage: number, hasOutput: boolean): StageState => {
  if (hasOutput) return 'done';
  if (run.status === 'FAILED') return 'failed';
  const reached = PROGRESS.indexOf(run.status);
  return reached === stage ? 'running' : reached > stage ? 'done' : 'pending';
};

const ICON: Record<StageState, React.ReactNode> = {
  pending: <Circle className="h-4 w-4 text-slate-300" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
  done: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  failed: <XCircle className="h-4 w-4 text-rose-600" />,
};

const Stage: React.FC<{ n: number; title: string; source?: string; state: StageState; children?: React.ReactNode }> = ({ n, title, source, state, children }) => (
  <li className="relative grid grid-cols-[2rem_1fr] gap-3 pb-5 last:pb-0">
    <div className="flex flex-col items-center">
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white">{ICON[state]}</span>
      <span aria-hidden className="mt-1 w-px flex-1 bg-slate-200" />
    </div>
    <div className="min-w-0 rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <h3 className="text-xs font-semibold text-slate-900">
          <span className="text-slate-400">{n}.</span> {title}
        </h3>
        {source && <span className="text-xs text-slate-500">{source}</span>}
      </div>
      <div className="px-3 py-2.5 text-xs">
        {state === 'pending' ? <span className="text-slate-400">Waiting…</span> : state === 'running' && !children ? <span className="text-blue-700">In progress…</span> : children}
      </div>
    </div>
  </li>
);

const Json: React.FC<{ value: unknown }> = ({ value }) => (
  <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs leading-relaxed text-slate-800">
    {JSON.stringify(value, null, 2)}
  </pre>
);

const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Could not read the file.'));
    reader.readAsDataURL(file);
  });

const RunView: React.FC<{ run: DocumentVerificationRun }> = ({ run }) => {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api.documentUrl(run.document.path).then((r) => active && setPreview(r.url)).catch(() => active && setPreview(null));
    return () => {
      active = false;
    };
  }, [run.document.path]);

  const ocr = run.ocr;
  const ex = run.extraction;
  const failedAt = run.status === 'FAILED';
  const body = (run.apiResponse?.body ?? {}) as Record<string, unknown>;
  const source = body.source as { dataset?: string; file?: string; version?: string } | undefined;

  return (
    <ol aria-live="polite">
      <Stage n={1} title="Bidder document" source={run.document.source.replace('_', ' ')} state="done">
        <div className="grid gap-3 sm:grid-cols-[220px_1fr]">
          {preview ? (
            <a href={preview} target="_blank" rel="noreferrer" className="block overflow-hidden rounded border border-slate-200">
              <img src={preview} alt={`Uploaded document ${run.document.fileName}`} className="w-full" />
            </a>
          ) : (
            <div className="flex h-28 items-center justify-center rounded border border-dashed border-slate-300 text-xs text-slate-400">Preview unavailable</div>
          )}
          <dl className="space-y-1 text-xs text-slate-600">
            <div><dt className="inline text-slate-500">File: </dt><dd className="inline font-medium text-slate-900">{run.document.fileName}</dd></div>
            <div><dt className="inline text-slate-500">Type / size: </dt><dd className="inline">{run.document.mimeType} · {(run.document.sizeBytes / 1024).toFixed(1)} KB</dd></div>
            <div><dt className="inline text-slate-500">Stored at: </dt><dd className="inline font-mono">bid-documents/{run.document.path}</dd></div>
            <div><dt className="inline text-slate-500">SHA-256: </dt><dd className="inline break-all font-mono">{run.document.sha256.slice(0, 24)}…</dd></div>
          </dl>
        </div>
      </Stage>

      <Stage n={2} title="OCR — NVIDIA Nemotron OCR V2" source={ocr ? `${ocr.model} · ${ocr.latencyMs} ms` : 'nvidia/nemotron-ocr-v2'} state={stageState(run, 1, !!ocr)}>
        {ocr ? (
          <>
            <p className="mb-1.5 text-xs text-slate-500">
              {ocr.blocks.length} text regions detected · mean confidence {(ocr.meanConfidence * 100).toFixed(1)}%
            </p>
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded border border-slate-200 bg-slate-50 p-2.5 font-mono text-xs text-slate-800">{ocr.text}</pre>
          </>
        ) : failedAt ? <p className="text-rose-700">{run.error}</p> : null}
      </Stage>

      <Stage n={3} title="Information extraction — NVIDIA model" source={ex ? `${ex.model} · ${ex.latencyMs} ms` : undefined} state={stageState(run, 2, !!ex)}>
        {ex ? (
          <>
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500"><tr><th className="py-1 pr-3 font-medium">Field</th><th className="py-1 pr-3 font-medium">Extracted value</th><th className="py-1 font-medium">Found in OCR text</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {Object.entries(ex.fields).map(([k, v]) => (
                  <tr key={k}>
                    <td className="py-1 pr-3 text-slate-600">{k.replace(/_/g, ' ')}</td>
                    <td className="py-1 pr-3 font-mono font-medium text-slate-900">{v ?? '—'}</td>
                    <td className="py-1">{ex.grounding[k] ? <span className="text-emerald-700">Yes</span> : <span className="font-medium text-rose-700">No — check</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ex.warnings.length > 0 && <p className="mt-2 text-xs text-amber-800">{ex.warnings.join('; ')}</p>}
            <details className="mt-2 text-xs"><summary className="cursor-pointer text-slate-500">Model output (raw)</summary><pre className="mt-1 whitespace-pre-wrap rounded bg-slate-50 p-2 font-mono">{ex.rawOutput}</pre></details>
          </>
        ) : failedAt && ocr ? <p className="text-rose-700">{run.error}</p> : null}
      </Stage>

      <Stage n={4} title="PAN obtained from the document" state={ex ? (ex.fields.pan ? 'done' : 'failed') : stageState(run, 2, false)}>
        {ex && (ex.fields.pan ? <p className="font-mono text-lg font-semibold tracking-wider text-slate-900">{ex.fields.pan}</p> : <p className="text-rose-700">No PAN found in the document.</p>)}
      </Stage>

      <Stage n={5} title="Request sent to PAN Verification API" source="External service (dummy, CSAP prototype)" state={run.apiRequest ? 'done' : stageState(run, 3, false)}>
        {run.apiRequest && (
          <>
            <p className="mb-1.5 font-mono text-xs text-slate-700">{run.apiRequest.method} {run.apiRequest.url}</p>
            <Json value={{ headers: run.apiRequest.headers, body: run.apiRequest.body }} />
          </>
        )}
      </Stage>

      <Stage n={6} title="Response from PAN Verification API" source={source ? `Data source: ${source.file} (${source.dataset}, v${source.version})` : undefined} state={run.apiResponse ? 'done' : run.status === 'CALLING_API' ? 'running' : failedAt && run.apiRequest ? 'failed' : 'pending'}>
        {run.apiResponse ? (
          <>
            <p className="mb-1.5 text-xs text-slate-600">
              HTTP {run.apiResponse.httpStatus} · {run.apiResponse.latencyMs} ms · status{' '}
              <span className="font-semibold text-slate-900">{String(body.status ?? '—')}</span>
              {body.record_id ? <> · matched record <span className="font-mono">{String(body.record_id)}</span></> : null}
            </p>
            <Json value={body} />
          </>
        ) : failedAt && run.apiRequest ? <p className="text-rose-700">{run.error}</p> : null}
      </Stage>

      <Stage n={7} title="Verification result" state={run.comparison ? 'done' : failedAt ? 'failed' : 'pending'}>
        {run.comparison ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              {run.verdict && <Badge tone={PAN_VERDICT[run.verdict].tone} dot>{PAN_VERDICT[run.verdict].label}</Badge>}
              <span className="text-slate-800">{run.comparison.summary}</span>
            </div>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr><th className="py-1.5 pr-3 font-medium">Field</th><th className="py-1.5 pr-3 font-medium">Document (NVIDIA)</th><th className="py-1.5 pr-3 font-medium">PAN registry (API)</th><th className="py-1.5 pr-3 font-medium">Bid record</th><th className="py-1.5 font-medium">Result</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {run.comparison.rows.map((r) => (
                    <tr key={r.field} className="align-top">
                      <td className="py-1.5 pr-3 text-slate-600">{r.field}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-900">{r.document ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-900">{r.apiRegistry ?? '—'}</td>
                      <td className="py-1.5 pr-3 font-mono text-slate-900">{r.bidderRecord ?? '—'}</td>
                      <td className="py-1.5">
                        <Badge tone={r.result === 'MATCH' ? 'success' : r.result === 'MISMATCH' ? 'danger' : 'neutral'}>{r.result.replace('_', ' ').toLowerCase()}</Badge>
                        {r.note && <div className="mt-0.5 text-slate-500">{r.note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-slate-500">Advisory result. The officer decides how it affects the bid.</p>
          </>
        ) : failedAt ? (
          <p className="flex items-start gap-1.5 text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Pipeline stopped: {run.error}</p>
        ) : null}
      </Stage>
    </ol>
  );
};

export const PanVerificationTab: React.FC<TabProps> = ({ view }) => {
  const { source } = useApp();
  const toast = useToast();
  const bidId = view.bid.id;
  const [runs, setRuns] = useState<DocumentVerificationRun[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [samples, setSamples] = useState<string[]>([]);
  const [sample, setSample] = useState('');
  const [starting, setStarting] = useState(false);
  const [live, setLive] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => api.documentRuns(bidId).then(setRuns).catch(() => setRuns([])), [bidId]);

  useEffect(() => {
    if (source !== 'api') return;
    void load();
    api.documentSamples().then((s) => { setSamples(s); setSample(s[0] ?? ''); }).catch(() => {});
    // Live stage updates via Supabase Realtime.
    return subscribeToTables(
      `pan-${bidId}`,
      [{ table: 'document_verification_runs', filter: `bid_id=eq.${bidId}` }],
      (_t, row) => {
        const incoming = mapRunRow(row);
        setRuns((prev) => {
          const list = prev ?? [];
          const existing = list.find((r) => r.id === incoming.id);
          if (!existing) return [incoming, ...list];
          // Merge: never let a partial event erase a stage result already shown.
          const merged = { ...existing };
          for (const [k, v] of Object.entries(incoming)) if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
          return list.map((r) => (r.id === incoming.id ? merged : r));
        });
      },
      setLive,
    );
  }, [bidId, source, load]);

  // Fallback when Realtime is not connected: poll while a run is in progress.
  const inProgress = runs?.some((r) => r.status !== 'COMPLETED' && r.status !== 'FAILED') ?? false;
  useEffect(() => {
    if (live || !inProgress) return;
    const t = window.setInterval(() => void load(), 1200);
    return () => window.clearInterval(t);
  }, [live, inProgress, load]);

  if (source !== 'api') {
    return <Card><EmptyState title="Needs the CSAP backend" description="PAN verification calls the NVIDIA models and the PAN Verification API through the backend. Switch VITE_DATA_SOURCE to api." /></Card>;
  }

  const start = async (body: Parameters<typeof api.startDocumentRun>[1]) => {
    setStarting(true);
    try {
      const run = await api.startDocumentRun(bidId, body);
      setRuns((prev) => [run, ...(prev ?? []).filter((r) => r.id !== run.id)]);
      setSelected(run.id);
    } catch (err) {
      toast({ kind: 'error', title: 'PAN verification not started', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setStarting(false);
    }
  };

  const onUpload = async (file: File | undefined) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      toast({ kind: 'error', title: 'Unsupported file', message: 'Upload a PNG or JPEG image of the PAN document.' });
      return;
    }
    await start({ source: 'upload', fileName: file.name, mimeType: file.type, contentBase64: await fileToBase64(file) });
    if (fileRef.current) fileRef.current.value = '';
  };

  const current = runs?.find((r) => r.id === selected) ?? runs?.[0];
  const panDoc = view.checks.find((c) => c.requirement.code === 'REQ-07')?.document;

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <Card
          title="PAN verification"
          subtitle="Document → NVIDIA OCR → NVIDIA information extraction → PAN Verification API → result. Each stage appears as it completes."
          actions={<Badge tone={live ? 'success' : 'neutral'} dot>{live ? 'Live' : 'Polling'}</Badge>}
        >
          <div className="flex flex-wrap items-end gap-2">
            <Button variant="primary" disabled={starting || !panDoc?.storagePath} onClick={() => void start({ source: 'bid_package' })} title={panDoc?.storagePath ? undefined : 'No stored PAN document for this bid'}>
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Verify PAN from bid package
            </Button>
            <Button disabled={starting} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Upload PAN document
            </Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" aria-label="Upload PAN document" onChange={(e) => void onUpload(e.target.files?.[0])} />
            {samples.length > 0 && (
              <div className="flex items-end gap-2">
                <label className="text-xs text-slate-600">
                  Demo sample
                  <select value={sample} onChange={(e) => setSample(e.target.value)} className={`${inputClass} mt-0.5 w-auto py-1.5`}>
                    {samples.map((s) => <option key={s} value={s}>{s.replace('SAMPLE_PAN_', '').replace('.png', '').replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
                <Button disabled={starting || !sample} onClick={() => void start({ source: 'sample', fileName: sample })}>Run sample</Button>
              </div>
            )}
          </div>
        </Card>

        {runs === null ? (
          <Card><p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading verification runs…</p></Card>
        ) : !current ? (
          <Card><EmptyState title="No PAN verification run yet" description="Run it on the bid's PAN document, a demo sample, or an uploaded image." /></Card>
        ) : (
          <RunView key={current.id} run={current} />
        )}
      </div>

      <Card title="Run history" padded={false}>
        {!runs?.length ? (
          <p className="px-4 py-3 text-xs text-slate-500">No runs.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setSelected(r.id)} className={`w-full px-4 py-2.5 text-left text-xs hover:bg-slate-50 ${current?.id === r.id ? 'bg-blue-50' : ''}`}>
                  <span className="block truncate font-medium text-slate-900">{r.document.fileName}</span>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {formatDateTime(r.startedAt)} ·{' '}
                    {r.verdict ? <Badge tone={PAN_VERDICT[r.verdict].tone}>{PAN_VERDICT[r.verdict].label}</Badge> : <span className="text-blue-700">{r.status.replace('_', ' ').toLowerCase()}…</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
