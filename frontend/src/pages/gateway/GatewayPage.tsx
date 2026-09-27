// Government registries: an officer-friendly landing page (one card per registry) and a page per
// registry with its records and a "Check a number" box. How it is wired (API calls, JSON, the call
// log) stays available under "For developers".

import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, Database, Globe2, KeyRound, Loader2, Search, Server, UserCheck, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, PageHeader } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { formatDateTime } from '../../lib/format';
import { api, type GatewayCall, type GatewayOverview, type RegistryAnswer } from '../../state/api';
import { useApp } from '../../state/appContext';
import { mapPortalRow } from '@shared/domain/portal';
import { PORTAL_STATUS } from '../../domain/labels';
import { subscribeToTables } from '../../state/realtime';
import { display, LABEL, REGISTRIES, verdictOf, type RegistryMeta, type Verdict } from './registryMeta';

type TryResult = Awaited<ReturnType<typeof api.gatewayTry>>;
type Records = Awaited<ReturnType<typeof api.gatewayRecords>>;

const json = (v: unknown) => JSON.stringify(v, null, 2);

const DevDetails: React.FC<{ summary: string; children: React.ReactNode }> = ({ summary, children }) => (
  <details className="group rounded-md border border-slate-200 bg-white">
    <summary className="cursor-pointer list-none px-4 py-3 text-xs font-semibold text-slate-600 hover:text-slate-900">
      <span className="mr-1 inline-block transition-transform group-open:rotate-90">›</span> {summary}
    </summary>
    <div className="space-y-4 border-t border-slate-100 p-4">{children}</div>
  </details>
);

const FlowStep: React.FC<{ icon: React.ReactNode; title: string; body: React.ReactNode }> = ({ icon, title, body }) => (
  <div className="min-w-0 flex-1 rounded border border-slate-200 bg-white p-3">
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
      {icon}
      {title}
    </div>
    <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{body}</div>
  </div>
);
const Arrow = () => <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 self-center text-slate-400 lg:block" />;

const CallLog: React.FC<{ registry?: string }> = ({ registry }) => {
  const [calls, setCalls] = useState<GatewayCall[] | null>(null);
  const load = useCallback(() => api.gatewayCalls().then(setCalls).catch(() => setCalls([])), []);
  useEffect(() => {
    void load();
  }, [load]);
  const shown = (calls ?? []).filter((c) => !registry || c.registry.toLowerCase() === registry.toLowerCase());
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-900">Calls CSAP made during verification</p>
        <Button size="sm" onClick={() => void load()}>Refresh</Button>
      </div>
      {calls === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-xs text-slate-500">No calls yet. Run portal checks on a bid, then refresh.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded border border-slate-200">
          {shown.map((c) => (
            <li key={c.id}>
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs hover:bg-slate-50">
                  <span className="w-36 shrink-0 text-slate-500">{formatDateTime(c.at)}</span>
                  <span className="w-16 shrink-0 font-mono text-slate-600">{c.bidId}</span>
                  <span className="w-24 shrink-0 font-semibold text-slate-900">{c.registry}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{c.method} {c.url}</span>
                  <Badge tone={c.httpStatus && c.httpStatus < 400 ? 'success' : 'warning'}>HTTP {c.httpStatus ?? '—'}</Badge>
                </summary>
                <div className="grid gap-2 bg-slate-50/60 px-3 pb-3 pt-1 lg:grid-cols-2">
                  <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`${c.source}\n${c.method} ${c.url}\n\n${json(c.requestBody)}`}</pre>
                  <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`HTTP ${c.httpStatus} · ${c.latencyMs ?? '—'} ms\n\n${json(c.responseBody)}`}</pre>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface LiveRow {
  id: string;
  at: string;
  bidId: string | null;
  registry: string;
  identifier: string | null;
  outcome: string | null;
}

/** Checks as they happen ("scanning"): newest first, streamed through Supabase Realtime. */
const LiveChecks: React.FC<{ registry?: string }> = ({ registry }) => {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [live, setLive] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .gatewayCalls()
      .then((calls) =>
        active &&
        setRows(
          calls
            .filter((c) => c.source === 'Portal verification' && (!registry || c.registry === registry))
            .slice(0, 12)
            .map((c) => ({ id: c.id, at: c.at, bidId: c.bidId, registry: c.registry, identifier: c.identifier ?? null, outcome: c.outcome })),
        ),
      )
      .catch(() => {});
    const stop = subscribeToTables(
      `live-${registry ?? 'all'}`,
      [{ table: 'portal_verifications', ...(registry ? { filter: `registry=eq.${registry}` } : {}) }],
      (_t, row) => {
        const p = mapPortalRow(row);
        setRows((prev) => [{ id: p.id, at: p.checkedAt, bidId: p.bidId, registry: p.registry, identifier: p.identifier ?? null, outcome: p.status }, ...prev.filter((r) => r.id !== p.id)].slice(0, 12));
        setFresh((f) => new Set(f).add(p.id));
        window.setTimeout(() => setFresh((f) => { const n = new Set(f); n.delete(p.id); return n; }), 2500);
      },
      setLive,
    );
    return () => {
      active = false;
      stop();
    };
  }, [registry]);
  return (
    <Card
      title={registry ? 'Live checks on this registry' : 'Live checks across all registries'}
      subtitle="Every lookup CSAP runs appears here the moment it happens (portal checks and automatic GeM intake)."
      actions={
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-slate-600">
          <span className={`h-2 w-2 rounded-full ${live ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} /> {live ? 'Live' : 'Connecting…'}
        </span>
      }
      padded={false}
    >
      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500"><Activity className="h-4 w-4" /> Waiting for checks. Run portal checks on a bid or submit a bid on GeM.</p>
      ) : (
        <ul className="divide-y divide-slate-100" aria-live="polite">
          {rows.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs transition-colors ${fresh.has(r.id) ? 'bg-blue-50' : ''}`}>
              <span className="w-36 shrink-0 text-slate-500">{formatDateTime(r.at)}</span>
              {r.bidId && <Link to={`/bids/${r.bidId}/portal`} className="w-16 shrink-0 font-mono text-blue-700 hover:underline">{r.bidId}</Link>}
              {!registry && <span className="w-24 shrink-0 font-semibold text-slate-800">{REGISTRIES.find((m) => m.key.toUpperCase() === r.registry)?.title ?? r.registry}</span>}
              <span className="min-w-0 flex-1 font-mono text-slate-700">{r.identifier ?? '—'}</span>
              {r.outcome && PORTAL_STATUS[r.outcome] && <Badge tone={PORTAL_STATUS[r.outcome].tone} dot>{PORTAL_STATUS[r.outcome].label}</Badge>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

/** Landing page: one card per registry. */
export const GatewayPage: React.FC = () => {
  const { source } = useApp();
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (source === 'api') api.gateway().then(setOverview).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [source]);
  if (source !== 'api') return <PageHeader title="Government registries" subtitle="Needs the CSAP backend." />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Government registries"
        subtitle="CSAP confirms every bidder with these registries. In this prototype each registry is simulated with its own records; GST can also be checked live for real GSTINs."
        actions={<Badge tone={overview?.healthy ? 'success' : error ? 'danger' : 'neutral'} dot>{overview ? (overview.healthy ? 'All registries online' : 'Unreachable') : error ? 'Unreachable' : 'Checking…'}</Badge>}
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {REGISTRIES.map((r) => (
          <Link key={r.key} to={`/gateway/${r.key}`} className="group rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-blue-300 hover:bg-blue-50/40">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{r.title}</p>
                <p className="text-[11px] text-slate-500">{r.authority}</p>
              </div>
              <ArrowRight aria-hidden className="h-4 w-4 text-slate-300 group-hover:text-blue-600" />
            </div>
            <p className="mt-2 text-xs text-slate-700">{r.checks}</p>
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              <Badge tone="neutral">Simulated service</Badge>
              {r.key === 'gstn' && overview?.liveGstinProvider && <Badge tone="info">Live for real GSTINs</Badge>}
            </div>
          </Link>
        ))}
      </div>
      <LiveChecks />
      <DevDetails summary="For developers: how CSAP connects to the registries">
        <div className="flex flex-col gap-2 lg:flex-row">
          <FlowStep icon={<UserCheck className="h-4 w-4 text-slate-500" />} title="1. Officer clicks" body="Run portal checks or Verify PAN, or GeM intake runs automatically." />
          <Arrow />
          <FlowStep icon={<Server className="h-4 w-4 text-slate-500" />} title="2. CSAP adapter" body="One adapter per registry builds the request from the bid." />
          <Arrow />
          <FlowStep icon={<KeyRound className="h-4 w-4 text-slate-500" />} title="3. HTTPS + API key" body={<>POST with header <span className="font-mono">x-api-key</span>.</>} />
          <Arrow />
          <FlowStep icon={<Globe2 className="h-4 w-4 text-slate-500" />} title="4. Gateway API" body={<span className="break-all font-mono">{overview?.baseUrl ?? '…'}</span>} />
          <Arrow />
          <FlowStep icon={<Database className="h-4 w-4 text-slate-500" />} title="5. Registry dataset" body="Each simulated registry answers only from its own data file." />
        </div>
        <p className="text-xs text-slate-600">Going live changes one address and one key per adapter; this is already done for GST (gstinapi.in).</p>
        <CallLog />
      </DevDetails>
    </div>
  );
};

const VerdictCard: React.FC<{ verdict: Verdict }> = ({ verdict }) => {
  const style = { good: 'border-emerald-200 bg-emerald-50 text-emerald-900', warn: 'border-amber-200 bg-amber-50 text-amber-900', bad: 'border-rose-200 bg-rose-50 text-rose-900' }[verdict.tone];
  const Icon = verdict.tone === 'good' ? CheckCircle2 : verdict.tone === 'warn' ? AlertTriangle : XCircle;
  return (
    <div className={`rounded border p-3 ${style}`} role="status">
      <p className="flex items-center gap-2 text-sm font-semibold"><Icon aria-hidden className="h-5 w-5" /> {verdict.headline}</p>
      {verdict.fields.length > 0 && (
        <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
          {verdict.fields.map(([k, v]) => (
            <div key={k} className="flex gap-2"><dt className="shrink-0 text-slate-600">{k}:</dt><dd className="font-medium text-slate-900">{v}</dd></div>
          ))}
        </dl>
      )}
    </div>
  );
};

/** A verification's result as a receipt: what the service answered, when, with its reference. */
const Receipt: React.FC<{ meta: RegistryMeta; verdict: Verdict; at: string; reference?: string; latencyMs?: number; source: string }> = ({ meta, verdict, at, reference, latencyMs, source }) => (
  <div className="space-y-2">
    <VerdictCard verdict={verdict} />
    <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
      <span>
        Checked {formatDateTime(at)}
        {reference && (
          <>
            {' '}· reference <span className="font-mono">{reference}</span>
          </>
        )}
        {latencyMs != null && <> · {latencyMs} ms</>} · source: {source}
      </span>
      <a href={meta.official.url} target="_blank" rel="noreferrer" className="font-medium text-blue-700 hover:underline">
        Cross-check on {meta.official.name} ↗
      </a>
    </div>
  </div>
);

/** One registry: verify a number through the registry's service and get a receipt. */
export const RegistryPage: React.FC = () => {
  const { registry = '' } = useParams();
  const [params] = useSearchParams();
  const linked = (params.get('q') ?? '').trim().toUpperCase();
  const meta = REGISTRIES.find((r) => r.key === registry) as RegistryMeta | undefined;
  const [records, setRecords] = useState<Records | null>(null);
  const [identifier, setIdentifier] = useState(linked);
  const [checking, setChecking] = useState<string | null>(null);
  const [result, setResult] = useState<TryResult | null>(null);
  const [live, setLive] = useState<RegistryAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    let active = true;
    api
      .gatewayRecords(meta.key)
      .then((r) => active && setRecords(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [meta]);

  // Opened from a bid (…?q=<number>): verify that number straight away.
  useEffect(() => {
    if (!meta || !linked) return;
    let active = true;
    api
      .gatewayTry(meta.key, linked)
      .then((r) => active && setResult(r))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [meta, linked]);

  if (!meta) return <PageHeader title="Registry not found" breadcrumbs={[{ label: 'Government registries', to: '/gateway' }]} />;

  const check = async (value = identifier) => {
    const v = value.trim().toUpperCase();
    if (!v) return;
    setIdentifier(v);
    setChecking(v);
    setError(null);
    setLive(null);
    try {
      setResult(await api.gatewayTry(meta.key, v));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(null);
    }
  };
  const checkLive = async () => {
    setChecking(identifier);
    setError(null);
    try {
      setLive(await api.gstinLive(identifier));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(null);
    }
  };

  const body = (result?.response.body ?? {}) as Record<string, unknown>;
  const verdict = result ? verdictOf(meta, result.response.httpStatus, body) : null;
  const notFoundGst = meta.key === 'gstn' && body.status === 'NOT_FOUND';
  const examples = (records?.records ?? []).map((r) => String(r[meta.idField] ?? '')).filter(Boolean).slice(0, 3);
  const liveTone = (s: string): Verdict['tone'] => (s === 'VERIFIED' ? 'good' : s === 'NOT_FOUND' || s === 'FAILED' ? 'bad' : 'warn');

  return (
    <div className="space-y-5">
      <div>
        <Link to="/gateway" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
          <ChevronLeft className="h-3.5 w-3.5" /> Government registries
        </Link>
        <PageHeader
          title={`${meta.title} registry`}
          subtitle={`${meta.authority}. What CSAP checks here: ${meta.checks}`}
          actions={
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="neutral">Simulated service</Badge>
              {meta.key === 'gstn' && <Badge tone="info">Live for real GSTINs</Badge>}
            </div>
          }
        />
      </div>

      <Card title={`Verify a ${meta.idLabel}`} subtitle={`CSAP sends the number to the ${meta.service} and shows its answer. This is the same call CSAP makes for every bid.`}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <label className="sr-only" htmlFor="registry-id">
            {meta.idLabel}
          </label>
          <input
            id="registry-id"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
            placeholder={`Enter ${meta.idLabel}`}
            className={`${inputClass} flex-1 font-mono`}
          />
          <Button type="submit" variant="primary" disabled={!identifier.trim() || !!checking}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Verify
          </Button>
        </form>
        {examples.length > 0 && (
          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
            Demo numbers:
            {examples.map((x) => (
              <button key={x} type="button" onClick={() => void check(x)} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-slate-700 hover:bg-slate-100">
                {x}
              </button>
            ))}
          </p>
        )}
        <div className="mt-3" aria-live="polite">
          {checking && (
            <p className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-900">
              <Loader2 className="h-4 w-4 animate-spin" /> Connecting to the {meta.service}… verifying <span className="font-mono">{checking}</span>
            </p>
          )}
          {error && !checking && (
            <p role="alert" className="text-xs text-rose-700">
              {error}
            </p>
          )}
          {!checking && live && (
            <Receipt
              meta={meta}
              verdict={{ tone: liveTone(live.status), headline: live.summary, fields: live.facts.filter((f) => f.label !== 'Source').map((f) => [f.label, f.value]) }}
              at={new Date().toISOString()}
              latencyMs={live.latencyMs ?? undefined}
              source="GST portal data via licensed provider (live)"
            />
          )}
          {!checking && !live && verdict && result && (
            <>
              <Receipt
                meta={meta}
                verdict={verdict}
                at={String(body.timestamp ?? result.request.sentAt)}
                reference={body.request_id ? String(body.request_id) : undefined}
                latencyMs={result.response.latencyMs}
                source={`${meta.service} (simulated endpoint)`}
              />
              {notFoundGst && (
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2 text-xs">
                  <span>Not a demo GSTIN. If it is a real one, check it on live GST portal data (uses a provider credit unless checked before).</span>
                  <Button size="sm" onClick={() => void checkLive()}>
                    Check live
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      <LiveChecks registry={meta.key.toUpperCase()} />

      <DevDetails summary="For developers: the API call, the simulated test data and the call log">
        {result ? (
          <div className="grid gap-2 lg:grid-cols-2">
            <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{`${result.request.method} ${result.request.url}\n${Object.entries(result.request.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')}\n\n${json(result.request.body)}`}</pre>
            <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{`HTTP ${result.response.httpStatus} · ${result.response.latencyMs} ms\n\n${json(result.response.body)}`}</pre>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Verify a number above to see the raw request and response.</p>
        )}
        {records && (
          <div>
            <p className="mb-1 text-xs font-semibold text-slate-900">
              Simulated registry test data ({records.records.length} records in {records.file})
            </p>
            <div className="relative max-h-72 overflow-auto rounded border border-slate-200">
              <table className="w-full min-w-[720px] text-left text-[11px] text-slate-700">
                <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 font-semibold text-slate-600">
                  <tr>
                    {meta.columns.map((k) => (
                      <th key={k} scope="col" className="px-3 py-1.5">
                        {LABEL[k] ?? k}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {records.records.map((r, i) => (
                    <tr key={i}>
                      {meta.columns.map((k) => (
                        <td key={k} className={`px-3 py-1.5 ${k === meta.idField ? 'font-mono' : ''}`}>
                          {display(k, r[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <CallLog registry={meta.key.toUpperCase()} />
      </DevDetails>
    </div>
  );
};
