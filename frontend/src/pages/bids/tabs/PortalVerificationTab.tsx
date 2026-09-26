import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ChevronRight, Globe2, Loader2, MinusCircle, RefreshCw, Search, XCircle } from 'lucide-react';
import { mapPortalRow } from '@shared/domain/portal';
import { latestPortalRun } from '@shared/domain/selectors';
import type { PortalVerification, RegistryId } from '@shared/domain/types';
import { api, type GstinProviderStatus, type RegistryAnswer } from '../../../state/api';
import { useApp } from '../../../state/appContext';
import { subscribeToTables } from '../../../state/realtime';
import { Badge } from '../../../components/ui/Badge';
import { Button, Card, EmptyState } from '../../../components/ui/primitives';
import { useToast } from '../../../components/ui/toast';
import { PORTAL_STATUS, REGISTRY, REGISTRY_MODE } from '../../../domain/labels';
import { formatDateTime } from '../../../lib/format';
import type { TabProps } from '../bidTabs';

const ORDER: RegistryId[] = ['PAN', 'GSTN', 'UDYAM', 'MCA21', 'EPFO', 'ESIC', 'STARTUP_INDIA', 'NSIC', 'DEBARMENT', 'DIGILOCKER'];

const CheckIcon: React.FC<{ ok: boolean | null }> = ({ ok }) =>
  ok === true ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : ok === false ? <XCircle className="h-4 w-4 text-rose-600" /> : <MinusCircle className="h-4 w-4 text-slate-400" />;

const RegistryRow: React.FC<{ row: RegistryAnswer; open?: boolean }> = ({ row, open }) => {
  const reg = REGISTRY[row.registry];
  const applicable = row.status !== 'NOT_APPLICABLE';
  return (
    <details open={open} className="group border-b border-slate-100 last:border-b-0">
      <summary className="flex cursor-pointer list-none flex-col gap-1.5 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:gap-3">
        <ChevronRight aria-hidden className="hidden h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90 sm:block" />
        <div className="min-w-0 sm:w-56 sm:shrink-0">
          <div className="text-xs font-semibold text-slate-900">{reg.name}</div>
          <div className="truncate text-[11px] text-slate-500">{reg.authority}</div>
        </div>
        <div className="font-mono text-[11px] text-slate-600 sm:w-44 sm:shrink-0">{row.identifier ?? '—'}</div>
        <div className="flex flex-wrap items-center gap-1.5 sm:w-52 sm:shrink-0">
          <Badge tone={PORTAL_STATUS[row.status].tone} dot>{PORTAL_STATUS[row.status].label}</Badge>
          {applicable && <Badge tone={REGISTRY_MODE[row.mode].tone}>{REGISTRY_MODE[row.mode].label}</Badge>}
        </div>
        <p className="min-w-0 flex-1 text-xs text-slate-700">{row.summary}</p>
      </summary>

      {applicable && (
        <div className="space-y-3 bg-slate-50/60 px-4 pb-4 pt-1 sm:pl-11">
          {row.facts.length > 0 && (
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
              {row.facts.map((f) => (
                <div key={f.label} className="grid grid-cols-5 gap-2">
                  <dt className="col-span-2 font-medium text-slate-500">{f.label}</dt>
                  <dd className="col-span-3 break-words font-semibold text-slate-800">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}
          {row.checks.length > 0 && (
            <div className="relative overflow-x-auto rounded border border-slate-200 bg-white">
              <table className="w-full min-w-[520px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th className="px-3 py-2">Check</th>
                    <th className="px-3 py-2">Bid declares / expected</th>
                    <th className="px-3 py-2">Registry says</th>
                    <th className="px-3 py-2"><span className="sr-only">Result</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {row.checks.map((c) => (
                    <tr key={c.label} className="align-top">
                      <td className="px-3 py-2 font-medium text-slate-700">{c.label}</td>
                      <td className="px-3 py-2 text-slate-800">{c.expected ?? '—'}</td>
                      <td className="px-3 py-2 text-slate-800">{c.actual ?? '—'}</td>
                      <td className="px-3 py-2"><CheckIcon ok={c.ok} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {row.request && (
            <details className="text-xs">
              <summary className="cursor-pointer font-semibold text-slate-600 hover:text-slate-900">
                Technical: request and response{row.latencyMs != null ? ` · ${row.latencyMs} ms` : ''}
              </summary>
              <div className="mt-2 grid gap-2 lg:grid-cols-2">
                <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`${row.request.method} ${row.request.url}\n\n${JSON.stringify(row.request.body, null, 2)}`}</pre>
                <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`HTTP ${row.response?.httpStatus}\n\n${JSON.stringify(row.response?.body, null, 2)}`}</pre>
              </div>
            </details>
          )}
        </div>
      )}
    </details>
  );
};

const GSTIN_FORMAT = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

const providerNote = (p: GstinProviderStatus | null): { tone: 'success' | 'warning' | 'neutral'; text: string } => {
  if (!p) return { tone: 'neutral', text: 'Checking provider…' };
  if (!p.configured) return { tone: 'neutral', text: 'Not configured' };
  if (p.usage?.ok) return { tone: 'success', text: `Connected · ${p.usage.credits_used ?? 0} credits used` };
  if (p.usage?.code === 'email_unverified_credits_held') return { tone: 'warning', text: 'Credits on hold: confirm the account email at gstinapi.in' };
  return { tone: 'warning', text: p.usage?.message ?? 'Provider not reachable' };
};

/** Officer's stand-alone lookup of any GSTIN against live GST portal data. */
const LiveGstinLookup: React.FC = () => {
  const [provider, setProvider] = useState<GstinProviderStatus | null>(null);
  const [gstin, setGstin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RegistryAnswer | null>(null);

  const refreshProvider = useCallback(() => api.gstinProvider().then(setProvider).catch(() => setProvider(null)), []);
  useEffect(() => {
    void refreshProvider();
  }, [refreshProvider]);

  const value = gstin.trim().toUpperCase();
  const formatOk = GSTIN_FORMAT.test(value);
  const note = providerNote(provider);

  const lookUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formatOk) return;
    setBusy(true);
    setError(null);
    try {
      setResult(await api.gstinLive(value));
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      void refreshProvider();
    }
  };

  return (
    <Card
      padded={false}
      title="Live GST portal lookup"
      subtitle={`Check any GSTIN against live GST portal data (gstinapi.in). Answers are kept for ${provider?.cacheDays ?? 30} days, so looking up the same GSTIN again uses no credit.`}
      actions={<Badge tone={note.tone} dot>{note.text}</Badge>}
    >
      <form onSubmit={(e) => void lookUp(e)} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <label htmlFor="live-gstin" className="sr-only">GSTIN</label>
          <div className="relative">
            <Globe2 aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              id="live-gstin"
              value={gstin}
              onChange={(e) => setGstin(e.target.value.toUpperCase())}
              maxLength={15}
              placeholder="Enter a 15-character GSTIN"
              className="w-full rounded border border-slate-300 bg-white py-2 pl-8 pr-3 font-mono text-xs uppercase text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              aria-describedby="live-gstin-help"
            />
          </div>
          <p id="live-gstin-help" className="mt-1 text-[11px] text-slate-500">
            {value && !formatOk
              ? 'Not a GSTIN format yet (2 digits, PAN, entity code, Z, check digit).'
              : 'Invalid GSTINs are rejected by CSAP before any provider call, so they never cost a credit.'}
          </p>
        </div>
        <Button type="submit" variant="primary" size="sm" disabled={!formatOk || busy || !provider?.configured}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          {busy ? 'Looking up…' : 'Look up'}
        </Button>
      </form>
      {error && <p role="alert" className="border-t border-slate-100 px-4 py-3 text-xs text-rose-700">{error}</p>}
      {result && (
        <div className="border-t border-slate-200">
          <RegistryRow row={result} open />
        </div>
      )}
    </Card>
  );
};

export const PortalVerificationTab: React.FC<TabProps> = ({ view }) => {
  const { source } = useApp();
  const toast = useToast();
  const bidId = view.bid.id;
  const [rows, setRows] = useState<PortalVerification[] | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [live, setLive] = useState(false);

  const load = useCallback(() => api.portalChecks(bidId).then(setRows).catch(() => setRows([])), [bidId]);

  useEffect(() => {
    if (source !== 'api') return;
    void load();
    return subscribeToTables(
      `portal-${bidId}`,
      [{ table: 'portal_verifications', filter: `bid_id=eq.${bidId}` }],
      (_t, row) => {
        const incoming = mapPortalRow(row);
        setRows((prev) => [incoming, ...(prev ?? []).filter((r) => r.id !== incoming.id)]);
      },
      setLive,
    );
  }, [bidId, source, load]);

  const latest = latestPortalRun(rows ?? [], bidId);
  // A run is in progress until every registry has reported for it.
  const inProgress = !!runningId && (rows ?? []).filter((r) => r.runId === runningId).length < ORDER.length;

  // Fallback when Realtime is not connected: poll while a run is in progress.
  useEffect(() => {
    if (live || !inProgress) return;
    const t = window.setInterval(() => void load(), 1000);
    return () => window.clearInterval(t);
  }, [live, inProgress, load]);

  if (source !== 'api') {
    return <Card><EmptyState title="Needs the CSAP backend" description="Portal verification queries the Government Gateway through the backend." /></Card>;
  }

  const start = async () => {
    try {
      const r = await api.startPortalChecks(bidId);
      setRunningId(r.runId);
    } catch (err) {
      toast({ kind: 'error', title: 'Portal checks not started', message: err instanceof Error ? err.message : String(err) });
    }
  };

  const shown = inProgress ? (rows ?? []).filter((r) => r.runId === runningId) : latest;
  const byRegistry = new Map(shown.map((r) => [r.registry, r]));
  const count = (s: string) => shown.filter((r) => r.status === s).length;

  return (
    <div className="space-y-4">
      <Card
        title="Government portal verification"
        subtitle="Each registry is queried with the bidder's identifiers; CSAP then compares the registry's answer with what the bid declares."
        actions={
          <>
            <Badge tone={live ? 'success' : 'neutral'} dot>{live ? 'Live' : 'Polling'}</Badge>
            <Button variant="primary" size="sm" disabled={inProgress} onClick={() => void start()}>
              {inProgress ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {inProgress ? 'Checking registries…' : shown.length ? 'Re-run portal checks' : 'Run portal checks'}
            </Button>
          </>
        }
      >
        {rows === null ? (
          <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : shown.length === 0 && !inProgress ? (
          <EmptyState title="Registries not checked yet" description="Run portal checks to query PAN, GSTN, Udyam, MCA21, EPFO, ESIC, Startup India, NSIC, the debarment lists and DigiLocker." />
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
            <span><strong className="text-emerald-700">{count('VERIFIED')}</strong> verified</span>
            <span><strong className="text-amber-700">{count('REVIEW')}</strong> need review</span>
            <span><strong className="text-rose-700">{count('FAILED') + count('NOT_FOUND')}</strong> failed / not found</span>
            <span><strong className="text-slate-600">{count('NOT_APPLICABLE')}</strong> not applicable</span>
            {count('UNAVAILABLE') > 0 && <span><strong>{count('UNAVAILABLE')}</strong> not verified (registry unreachable)</span>}
            {shown[0] && !inProgress && <span className="text-slate-500">· checked {formatDateTime(shown[0].checkedAt)}</span>}
          </div>
        )}
      </Card>

      {(shown.length > 0 || inProgress) && (
        <Card padded={false} title="Registry results" subtitle="Open a row to see what the registry returned and each comparison.">
          <div aria-live="polite">
            {ORDER.map((reg) => {
              const row = byRegistry.get(reg);
              if (row) return <RegistryRow key={reg} row={row} />;
              return inProgress ? (
                <div key={reg} className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 text-xs text-slate-500 last:border-b-0 sm:pl-11">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span className="font-semibold text-slate-700">{REGISTRY[reg].name}</span> Checking…
                </div>
              ) : null;
            })}
          </div>
        </Card>
      )}

      <LiveGstinLookup />
    </div>
  );
};
