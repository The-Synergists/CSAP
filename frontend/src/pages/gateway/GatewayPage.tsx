import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Database, Globe2, KeyRound, Loader2, Send, Server, UserCheck } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, PageHeader } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { formatDateTime } from '../../lib/format';
import { api, type GatewayCall, type GatewayOverview } from '../../state/api';
import { useApp } from '../../state/appContext';

type TryResult = Awaited<ReturnType<typeof api.gatewayTry>>;

/** Which field of each dataset is the identifier CSAP sends. */
const ID_FIELD: Record<string, string> = {
  pan: 'pan',
  gstn: 'gstin',
  udyam: 'udyam_number',
  mca21: 'cin',
  epfo: 'establishment_code',
  esic: 'employer_code',
  startup_india: 'dpiit_number',
  nsic: 'registration_number',
  debarment: 'pan',
  digilocker: 'identifier',
};

const json = (v: unknown) => JSON.stringify(v, null, 2);
const cell = (v: unknown) => (v == null ? '—' : Array.isArray(v) ? `${v.length} item${v.length === 1 ? '' : 's'}` : typeof v === 'object' ? '{…}' : String(v));

const FlowStep: React.FC<{ icon: React.ReactNode; title: string; body: React.ReactNode; accent?: boolean }> = ({ icon, title, body, accent }) => (
  <div className={`min-w-0 flex-1 rounded border p-3 ${accent ? 'border-blue-300 bg-blue-50' : 'border-slate-200 bg-white'}`}>
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
      {icon}
      {title}
    </div>
    <div className="mt-1 text-[11px] leading-relaxed text-slate-600">{body}</div>
  </div>
);
const Arrow = () => <ArrowRight aria-hidden className="hidden h-4 w-4 shrink-0 self-center text-slate-400 lg:block" />;

const RecordsTable: React.FC<{ registry: string }> = ({ registry }) => {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.gatewayRecords>> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    api
      .gatewayRecords(registry)
      .then((d) => active && setData(d))
      .catch((e) => active && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      active = false;
    };
  }, [registry]);
  if (error) return <p className="px-4 py-3 text-xs text-rose-700">{error}</p>;
  if (!data) return <p className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading records…</p>;
  const keys = [...new Set(data.records.flatMap((r) => Object.keys(r)))].filter((k) => k !== 'remarks');
  return (
    <div className="bg-slate-50/60 px-4 pb-4 pt-2">
      <p className="mb-2 text-[11px] text-slate-600">
        <span className="font-mono">{data.file}</span> · {data.dataset} · version {data.version} · {data.records.length} records. Every answer this registry gives comes from these rows.
      </p>
      <div className="relative max-h-80 overflow-auto rounded border border-slate-200 bg-white">
        <table className="w-full text-left text-[11px]">
          <thead className="sticky top-0 border-b border-slate-200 bg-slate-100 font-semibold text-slate-600">
            <tr>{keys.map((k) => <th key={k} scope="col" className="whitespace-nowrap px-2.5 py-1.5">{k}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.records.map((r, i) => (
              <tr key={i}>{keys.map((k) => <td key={k} className="whitespace-nowrap px-2.5 py-1.5 font-mono text-slate-700">{cell(r[k])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const GatewayPage: React.FC = () => {
  const { source } = useApp();
  const [overview, setOverview] = useState<GatewayOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [calls, setCalls] = useState<GatewayCall[] | null>(null);
  const [openRegistry, setOpenRegistry] = useState<string | null>(null);
  const [registry, setRegistry] = useState('pan');
  const [identifier, setIdentifier] = useState('');
  const [examples, setExamples] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<TryResult | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);

  const loadCalls = useCallback(() => api.gatewayCalls().then(setCalls).catch(() => setCalls([])), []);
  useEffect(() => {
    if (source !== 'api') return;
    api.gateway().then(setOverview).catch((e) => setError(e instanceof Error ? e.message : String(e)));
    void loadCalls();
  }, [source, loadCalls]);

  useEffect(() => {
    if (source !== 'api') return;
    let active = true;
    api
      .gatewayRecords(registry)
      .then((d) => active && setExamples(d.records.map((r) => String(r[ID_FIELD[registry]] ?? '')).filter(Boolean).slice(0, 4)))
      .catch(() => active && setExamples([]));
    return () => {
      active = false;
    };
  }, [registry, source]);

  if (source !== 'api') return <PageHeader title="Government Gateway" subtitle="Needs the CSAP backend." />;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setTryError(null);
    try {
      setResult(await api.gatewayTry(registry, identifier));
    } catch (err) {
      setResult(null);
      setTryError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Government Gateway"
        subtitle="How CSAP verifies a bidder with government registries: the APIs it calls, the data behind each simulated registry, and every call made during verification."
      />

      <Card title="How verification is connected" subtitle="The same path runs for every registry when you click Run portal checks or Verify PAN.">
        <div className="flex flex-col gap-2 lg:flex-row">
          <FlowStep icon={<UserCheck className="h-4 w-4 text-slate-500" />} title="1. Officer clicks" body="Run portal checks (Portal verification tab) or Verify PAN (PAN tab)." />
          <Arrow />
          <FlowStep icon={<Server className="h-4 w-4 text-slate-500" />} title="2. CSAP backend adapter" body="One adapter per registry builds the request from the bid (PAN, GSTIN, Udyam no., …)." accent />
          <Arrow />
          <FlowStep icon={<KeyRound className="h-4 w-4 text-slate-500" />} title="3. HTTPS request + API key" body={<>POST with header <span className="font-mono">x-api-key</span>, exactly like a real government API call.</>} />
          <Arrow />
          <FlowStep icon={<Globe2 className="h-4 w-4 text-slate-500" />} title="4. Government Gateway API" body={<>A separate service: <span className="break-all font-mono">{overview?.baseUrl ?? '…'}</span></>} />
          <Arrow />
          <FlowStep icon={<Database className="h-4 w-4 text-slate-500" />} title="5. Registry dataset" body="Each simulated registry answers only from its own data file (below). CSAP then compares the answer with the bid." />
        </div>
        <p className="mt-3 text-xs text-slate-700">
          <strong>Simulated vs real:</strong> the registries below are simulations because government APIs need an organisation's credentials. The adapter and the HTTPS call are real; going live means changing the adapter's address and key, nothing else.
          {overview?.liveGstinProvider && <> This is already done for GST: a real GSTIN is checked on live GST portal data through <strong>{overview.liveGstinProvider}</strong>.</>}
        </p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone={overview?.healthy ? 'success' : error ? 'danger' : 'neutral'} dot>{overview ? (overview.healthy ? 'Gateway online' : 'Gateway unreachable') : error ? 'Gateway unreachable' : 'Checking…'}</Badge>
          {overview && <Badge tone="neutral">Authentication: {overview.auth}</Badge>}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-rose-700">{error}</p>}
      </Card>

      <Card title="Registries" subtitle="Open a row to see every record the simulated registry holds." padded={false}>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2.5">Registry</th>
                <th scope="col" className="px-4 py-2.5">API endpoint</th>
                <th scope="col" className="px-4 py-2.5">Data source</th>
                <th scope="col" className="px-4 py-2.5">Mode</th>
                <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {(overview?.registries ?? []).map((r) => (
                  <tr key={r.registry}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">{r.endpoint}</td>
                    <td className="px-4 py-2.5 text-[11px]">
                      <span className="font-mono">{r.file}</span> · {r.records} records · v{r.version}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone="neutral">Simulated registry</Badge>
                        {r.registry === 'gstn' && overview?.liveGstinProvider && <Badge tone="info">Live for real GSTINs</Badge>}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" onClick={() => setOpenRegistry(openRegistry === r.registry ? null : r.registry)} aria-expanded={openRegistry === r.registry}>
                          {openRegistry === r.registry ? 'Hide records' : 'View records'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { setRegistry(r.registry); setIdentifier(''); setResult(null); document.getElementById('try-call')?.scrollIntoView({ behavior: 'smooth' }); }}>
                          Try it
                        </Button>
                      </div>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
        {openRegistry && (
          <div className="border-t border-slate-200">
            <p className="px-4 pt-3 text-xs font-semibold text-slate-900">{overview?.registries.find((r) => r.registry === openRegistry)?.name}: records</p>
            <RecordsTable key={openRegistry} registry={openRegistry} />
          </div>
        )}
      </Card>

      <div id="try-call">
        <Card title="Try an API call" subtitle="Sends one real HTTPS request to the gateway, exactly as the verification adapter does, and shows the raw request and response.">
          <form onSubmit={(e) => void send(e)} className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="text-xs font-medium text-slate-700">
              Registry
              <select value={registry} onChange={(e) => { setRegistry(e.target.value); setIdentifier(''); setResult(null); }} className={`${inputClass} mt-1 w-auto py-1.5`}>
                {(overview?.registries ?? []).map((r) => <option key={r.registry} value={r.registry}>{r.name}</option>)}
              </select>
            </label>
            <label className="flex-1 text-xs font-medium text-slate-700">
              Identifier
              <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="e.g. a PAN, GSTIN or Udyam number" className={`${inputClass} mt-1 font-mono`} />
            </label>
            <Button type="submit" variant="primary" size="sm" disabled={!identifier.trim() || sending}>
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send request
            </Button>
          </form>
          {examples.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
              Examples from the dataset:
              {examples.map((x) => (
                <button key={x} type="button" onClick={() => setIdentifier(x)} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-slate-700 hover:bg-slate-100">{x}</button>
              ))}
            </div>
          )}
          {tryError && <p role="alert" className="mt-3 text-xs text-rose-700">{tryError}</p>}
          {result && (
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Request CSAP sent</p>
                <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{`${result.request.method} ${result.request.url}\n${Object.entries(result.request.headers).map(([k, v]) => `${k}: ${v}`).join('\n')}\n\n${json(result.request.body)}`}</pre>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">Response from the registry · HTTP {result.response.httpStatus} · {result.response.latencyMs} ms</p>
                <pre className="max-h-80 overflow-auto rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px]">{json(result.response.body)}</pre>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Calls CSAP made during verification"
        subtitle="Every registry request sent when an officer ran portal checks or PAN verification, newest first."
        padded={false}
        actions={<Button size="sm" onClick={() => void loadCalls()}>Refresh</Button>}
      >
        {calls === null ? (
          <p className="flex items-center gap-2 px-4 py-3 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
        ) : calls.length === 0 ? (
          <p className="px-4 py-3 text-xs text-slate-500">No calls yet. Run portal checks on a bid, then refresh.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {calls.map((c) => (
              <li key={c.id}>
                <details className="group">
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-xs hover:bg-slate-50">
                    <span className="w-36 shrink-0 text-slate-500">{formatDateTime(c.at)}</span>
                    <span className="w-16 shrink-0 font-mono text-slate-600">{c.bidId}</span>
                    <span className="w-24 shrink-0 font-semibold text-slate-900">{c.registry}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600">{c.method} {c.url}</span>
                    <Badge tone={c.httpStatus && c.httpStatus < 400 ? 'success' : 'warning'}>HTTP {c.httpStatus ?? '—'}</Badge>
                    <span className="w-24 shrink-0 text-right text-slate-500">{c.latencyMs != null ? `${c.latencyMs} ms` : ''}</span>
                  </summary>
                  <div className="grid gap-2 bg-slate-50/60 px-4 pb-3 pt-1 lg:grid-cols-2">
                    <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`${c.source}\n${c.method} ${c.url}\n\n${json(c.requestBody)}`}</pre>
                    <pre className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 font-mono text-[11px]">{`HTTP ${c.httpStatus} · ${c.mode === 'LIVE_PROVIDER' ? 'live provider' : 'simulated registry'}\n\n${json(c.responseBody)}`}</pre>
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
