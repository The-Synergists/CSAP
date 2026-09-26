// Government registries: an officer-friendly landing page (one card per registry) and a page per
// registry with its records and a "Check a number" box. How it is wired (API calls, JSON, the call
// log) stays available under "For developers".

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronLeft, Database, Globe2, KeyRound, Loader2, Search, Server, UserCheck, XCircle } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, PageHeader } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { formatDateTime } from '../../lib/format';
import { api, type GatewayCall, type GatewayOverview } from '../../state/api';
import { useApp } from '../../state/appContext';
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

/** Landing page: one card per registry. */
export const GatewayPage: React.FC = () => {
  const { source } = useApp();
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (source === 'api') api.gateway().then(setOverview).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [source]);
  if (source !== 'api') return <PageHeader title="Government registries" subtitle="Needs the CSAP backend." />;
  const count = (key: string) => overview?.registries.find((r) => r.registry === key)?.records;

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
              <Badge tone="neutral">Simulated</Badge>
              {r.key === 'gstn' && overview?.liveGstinProvider && <Badge tone="info">Live for real GSTINs</Badge>}
              {count(r.key) != null && <span className="text-slate-500">{count(r.key)} records</span>}
            </div>
          </Link>
        ))}
      </div>
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

/** One registry: check a number, browse its records. */
export const RegistryPage: React.FC = () => {
  const { registry = '' } = useParams();
  const meta = REGISTRIES.find((r) => r.key === registry) as RegistryMeta | undefined;
  const [records, setRecords] = useState<Records | null>(null);
  const [query, setQuery] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!meta) return;
    let active = true;
    api.gatewayRecords(meta.key).then((r) => active && setRecords(r)).catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [meta]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (records?.records ?? []).filter((r) => !q || Object.values(r).some((v) => typeof v === 'string' && v.toLowerCase().includes(q)));
  }, [records, query]);

  if (!meta) return <PageHeader title="Registry not found" breadcrumbs={[{ label: 'Government registries', to: '/gateway' }]} />;

  const check = async (value = identifier) => {
    if (!value.trim()) return;
    setIdentifier(value);
    setChecking(true);
    setError(null);
    try {
      setResult(await api.gatewayTry(meta.key, value.trim()));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };
  const verdict = result ? verdictOf(meta, result.response.httpStatus, result.response.body as Record<string, unknown>) : null;

  return (
    <div className="space-y-5">
      <div>
        <Link to="/gateway" className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline"><ChevronLeft className="h-3.5 w-3.5" /> Government registries</Link>
        <PageHeader title={`${meta.title} registry`} subtitle={`${meta.authority}. What CSAP checks here: ${meta.checks}`} actions={<Badge tone="neutral">Simulated registry</Badge>} />
      </div>

      <Card title={`Check a ${meta.idLabel}`} subtitle="The same check CSAP runs on every bid. Pick a number from the list below or type one.">
        <form onSubmit={(e) => { e.preventDefault(); void check(); }} className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="registry-id">{meta.idLabel}</label>
          <input id="registry-id" value={identifier} onChange={(e) => setIdentifier(e.target.value.toUpperCase())} placeholder={`Enter ${meta.idLabel}`} className={`${inputClass} flex-1 font-mono`} />
          <Button type="submit" variant="primary" disabled={!identifier.trim() || checking}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Check
          </Button>
        </form>
        {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
        {verdict && <div className="mt-3"><VerdictCard verdict={verdict} /></div>}
      </Card>

      <Card
        title={`${records?.records.length ?? '…'} records in this registry`}
        subtitle="Fictitious demo data. Every answer this registry gives comes from these records."
        padded={false}
        actions={<input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search" aria-label="Search records" className={`${inputClass} w-44 py-1`} />}
      >
        {!records ? (
          <p className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  {meta.columns.map((k) => <th key={k} scope="col" className="px-4 py-2.5">{LABEL[k] ?? k}</th>)}
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Check</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i}>
                    {meta.columns.map((k) => (
                      <td key={k} className={`px-4 py-2 ${k === meta.idField ? 'font-mono' : ''}`}>{display(k, r[k])}</td>
                    ))}
                    <td className="px-4 py-2 text-right">
                      {r[meta.idField] != null && (
                        <Button size="sm" variant="ghost" onClick={() => { void check(String(r[meta.idField])); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Check</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <DevDetails summary="For developers: the API call and the calls CSAP made">
        {result ? (
          <div className="grid gap-2 lg:grid-cols-2">
            <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{`${result.request.method} ${result.request.url}\n${Object.entries(result.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${json(result.request.body)}`}</pre>
            <pre className="max-h-72 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{`HTTP ${result.response.httpStatus} · ${result.response.latencyMs} ms\n\n${json(result.response.body)}`}</pre>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Run a check above to see the raw request and response.</p>
        )}
        <CallLog registry={meta.key === 'gstn' ? 'GSTN' : meta.key.toUpperCase()} />
      </DevDetails>
    </div>
  );
};
