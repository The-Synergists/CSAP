// Registry adapters: one per government portal. Each adapter calls its registry (today the
// simulated Government Gateway; later a real API with the same interface), then CSAP compares
// the registry's answer with what the bid declares and returns a normalised result.

import type { BidView } from '../../../shared/domain/selectors.js';
import type { PortalCheck, PortalStatus, RegistryId, RegistryMode } from '../../../shared/domain/types.js';
import { config } from '../config/env.js';

export interface RegistryResult {
  registry: RegistryId;
  mode: RegistryMode;
  identifier: string | null;
  status: PortalStatus;
  summary: string;
  facts: { label: string; value: string }[];
  checks: PortalCheck[];
  request: { method: string; url: string; body: unknown } | null;
  response: { httpStatus: number; body: unknown } | null;
  latencyMs: number | null;
}

export interface RegistryAdapter {
  registry: RegistryId;
  mode: RegistryMode;
  /** Returns null when the registry does not apply to this bidder (e.g. no CIN for a firm). */
  identifier(view: BidView): string | null;
  verify(view: BidView, identifier: string): Promise<RegistryResult>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

// ---------------------------------------------------------------- helpers

const SUFFIX: Record<string, string> = { PVT: 'PRIVATE', LTD: 'LIMITED', CO: 'COMPANY', '&': 'AND' };
const tokens = (s: string) =>
  new Set(
    s
      .toUpperCase()
      .replace(/[^A-Z0-9& ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((t) => SUFFIX[t] ?? t),
  );
export const nameMatches = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  const ta = tokens(a);
  const tb = tokens(b);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  return inter / new Set([...ta, ...tb]).size >= 0.8;
};

const monthKey = (iso: string) => iso.slice(0, 7); // YYYY-MM
const addMonths = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
/** Latest monthly return (ECR / contribution) that was already due on `date` (due on the 15th of the next month). */
const latestDueMonth = (iso: string) => addMonths(monthKey(iso), Number(iso.slice(8, 10)) > 15 ? -1 : -2);

const check = (label: string, ok: boolean | null, expected?: string | null, actual?: string | null): PortalCheck => ({ label, ok, expected, actual });
const worst = (checks: PortalCheck[], failOn: string[] = []): PortalStatus =>
  checks.some((c) => c.ok === false && failOn.includes(c.label)) ? 'FAILED' : checks.some((c) => c.ok === false) ? 'REVIEW' : 'VERIFIED';

async function gateway(path: string, body: unknown): Promise<{ httpStatus: number; body: Json; latencyMs: number; url: string }> {
  const url = `${config.govGatewayUrl}${path}`;
  const started = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': config.govGatewayKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (res.status === 401 || res.status >= 500) throw new Error(`Government Gateway returned HTTP ${res.status}.`);
  return { httpStatus: res.status, body: res.status === 400 ? (json.detail ?? json) : json, latencyMs: Math.round(performance.now() - started), url };
}

/** Standard flow for registries looked up by identifier. */
async function lookup(
  registry: RegistryId,
  path: string,
  identifier: string,
  evaluate: (record: Json) => Omit<RegistryResult, 'registry' | 'mode' | 'identifier' | 'request' | 'response' | 'latencyMs'>,
): Promise<RegistryResult> {
  const body = { identifier };
  const r = await gateway(path, body);
  const base = { registry, mode: 'SIMULATED' as const, identifier, request: { method: 'POST', url: r.url, body }, response: { httpStatus: r.httpStatus, body: r.body }, latencyMs: r.latencyMs };
  if (r.body.status === 'INVALID_FORMAT') return { ...base, status: 'FAILED', summary: `${identifier} is not a valid identifier for this registry.`, facts: [], checks: [check('Identifier format', false, 'Valid format', identifier)] };
  if (r.body.status === 'NOT_FOUND') return { ...base, status: 'NOT_FOUND', summary: `${identifier} was not found in the registry.`, facts: [], checks: [check('Record exists', false, 'Registered', 'Not found')] };
  return { ...base, ...evaluate(r.body.record as Json) };
}

// ---------------------------------------------------------------- adapters

const pan: RegistryAdapter = {
  registry: 'PAN',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.pan,
  async verify(v, id) {
    const body = { pan: id, name: v.bidder.companyName };
    const r = await gateway('/v1/pan/verify', body);
    const b = r.body;
    const base = { registry: 'PAN' as const, mode: 'SIMULATED' as const, identifier: id, request: { method: 'POST', url: r.url, body }, response: { httpStatus: r.httpStatus, body: b }, latencyMs: r.latencyMs };
    if (b.status === 'NOT_FOUND') return { ...base, status: 'NOT_FOUND', summary: `PAN ${id} not found in the PAN registry.`, facts: [], checks: [check('PAN exists', false, 'Registered', 'Not found')] };
    const checks = [check('PAN status', b.status === 'VALID', 'VALID', b.status), check('Name matches bid', b.name_match === 'MATCH', v.bidder.companyName, b.registered_name)];
    const status = b.status !== 'VALID' ? 'FAILED' : worst(checks);
    return {
      ...base,
      status,
      summary: status === 'VERIFIED' ? `PAN valid and registered to ${b.registered_name}.` : b.status !== 'VALID' ? `PAN is ${b.status}. ${b.remarks ?? ''}` : `PAN valid but registered to ${b.registered_name}.`,
      facts: [
        { label: 'Registered name', value: b.registered_name },
        { label: 'Category', value: b.category },
        { label: 'Status', value: b.status },
      ],
      checks,
    };
  },
};

const gstn: RegistryAdapter = {
  registry: 'GSTN',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.gstin,
  verify: (v, id) =>
    lookup('GSTN', '/v1/gstn/lookup', id, (rec) => {
      const filings = (rec.filings ?? []) as Json[];
      const missed = filings.filter((f) => f.status === 'NOT_FILED');
      const late = filings.filter((f) => f.status === 'LATE');
      const checks = [
        check('Registration active', rec.status === 'Active', 'Active', rec.status),
        check('Legal name matches bid', nameMatches(rec.legal_name, v.bidder.companyName) || nameMatches(rec.trade_name, v.bidder.companyName), v.bidder.companyName, rec.legal_name),
        check('PAN embedded in GSTIN', id.slice(2, 12) === v.bidder.pan, v.bidder.pan, id.slice(2, 12)),
        check('GSTR-3B filed (last 6 months)', missed.length === 0, '6 of 6 filed', `${filings.length - missed.length} of ${filings.length} filed`),
        check('GSTR-3B filed on time', late.length === 0, 'On time', late.length ? `${late.length} late (${late.map((f) => f.period).join(', ')})` : 'On time'),
      ];
      const status = worst(checks, ['Registration active', 'GSTR-3B filed (last 6 months)', 'PAN embedded in GSTIN']);
      return {
        status,
        summary:
          rec.status !== 'Active'
            ? `GST registration is ${rec.status}.`
            : missed.length
              ? `Active, but ${missed.length} GSTR-3B return(s) not filed in the last 6 months.`
              : late.length
                ? `Active; all returns filed, ${late.length} filed late.`
                : 'Active; all GSTR-3B returns for the last 6 months filed on time.',
        facts: [
          { label: 'Legal name', value: rec.legal_name },
          { label: 'Status', value: rec.status },
          { label: 'Constitution', value: rec.constitution },
          { label: 'Registered', value: rec.registration_date },
          { label: 'State', value: rec.state },
          { label: 'Filing history', value: filings.map((f) => `${f.period}: ${String(f.status).replace('_', ' ').toLowerCase()}`).join(' · ') },
        ],
        checks,
      };
    }),
};

const udyam: RegistryAdapter = {
  registry: 'UDYAM',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.udyamNumber || null,
  verify: (v, id) =>
    lookup('UDYAM', '/v1/udyam/lookup', id, (rec) => {
      const claimsExemption = v.emd?.instrument === 'MSME_EXEMPTION';
      const mse = rec.type === 'Micro' || rec.type === 'Small';
      const checks = [
        check('Registration active', rec.status === 'Active', 'Active', rec.status),
        check('Name matches bid', nameMatches(rec.enterprise_name, v.bidder.companyName), v.bidder.companyName, rec.enterprise_name),
        ...(claimsExemption ? [check('Eligible for EMD exemption (Micro/Small)', mse, 'Micro or Small', rec.type)] : []),
      ];
      const status = worst(checks, ['Registration active', 'Eligible for EMD exemption (Micro/Small)']);
      return {
        status,
        summary: `${rec.type} enterprise (${rec.major_activity}), ${String(rec.status).toLowerCase()}.${claimsExemption ? (mse ? ' Supports the EMD exemption claim.' : ' Not eligible for the EMD exemption claimed.') : ''}`,
        facts: [
          { label: 'Enterprise', value: rec.enterprise_name },
          { label: 'Type', value: rec.type },
          { label: 'Activity', value: rec.major_activity },
          { label: 'NIC', value: (rec.nic_codes ?? []).join(', ') },
          { label: 'Registered', value: rec.date_of_registration },
          ...(rec.remarks ? [{ label: 'Remarks', value: rec.remarks }] : []),
        ],
        checks,
      };
    }),
};

const mca21: RegistryAdapter = {
  registry: 'MCA21',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.cin ?? null,
  verify: (v, id) =>
    lookup('MCA21', '/v1/mca21/lookup', id, (rec) => {
      const checks = [
        check('Company active', rec.company_status === 'Active', 'Active', rec.company_status),
        check('Name matches bid', nameMatches(rec.company_name, v.bidder.companyName), v.bidder.companyName, rec.company_name),
        check('Incorporation date matches', rec.date_of_incorporation === v.bidder.incorporationDate, v.bidder.incorporationDate, rec.date_of_incorporation),
      ];
      return {
        status: worst(checks, ['Company active']),
        summary: `${rec.company_status} ${String(rec.company_class).toLowerCase()} company, incorporated ${rec.date_of_incorporation}.`,
        facts: [
          { label: 'Company', value: rec.company_name },
          { label: 'Status', value: rec.company_status },
          { label: 'Directors', value: (rec.directors ?? []).map((d: Json) => `${d.name} (DIN ${d.din})`).join(', ') || '—' },
          { label: 'Paid-up capital', value: `₹${Number(rec.paid_up_capital_inr).toLocaleString('en-IN')}` },
          { label: 'Last AGM', value: rec.last_agm_date },
        ],
        checks,
      };
    }),
};

const monthly = (registry: 'EPFO' | 'ESIC', path: string, field: string, statusOk: string, idOf: (v: BidView) => string | null): RegistryAdapter => ({
  registry,
  mode: 'SIMULATED',
  identifier: idOf,
  verify: (v, id) =>
    lookup(registry, path, id, (rec) => {
      const expected = latestDueMonth(v.bid.submittedAt);
      const latest = rec[field] as string;
      const checks = [
        check('Establishment active', rec.status === statusOk, statusOk, rec.status),
        check('Name matches bid', nameMatches(rec.establishment_name ?? rec.employer_name, v.bidder.companyName), v.bidder.companyName, rec.establishment_name ?? rec.employer_name),
        check('Latest return up to date', latest >= expected, `${expected} or later`, latest),
      ];
      return {
        status: worst(checks, ['Establishment active']),
        summary:
          rec.status !== statusOk
            ? `Establishment is ${rec.status}.`
            : latest >= expected
              ? `Active; latest return for ${latest} is up to date.`
              : `Active, but latest return is for ${latest} (expected ${expected}).`,
        facts: [
          { label: 'Name', value: rec.establishment_name ?? rec.employer_name },
          { label: 'Status', value: rec.status },
          { label: 'Latest return', value: latest },
          { label: 'Employees covered', value: String(rec.employees_covered) },
        ],
        checks,
      };
    }),
});

const certificate = (registry: 'STARTUP_INDIA' | 'NSIC', path: string, okStatus: string, idOf: (v: BidView) => string | null): RegistryAdapter => ({
  registry,
  mode: 'SIMULATED',
  identifier: idOf,
  verify: (v, id) =>
    lookup(registry, path, id, (rec) => {
      const validOn = rec.valid_until >= v.bid.submittedAt.slice(0, 10);
      const checks = [
        check('Certificate valid', rec.status === okStatus && validOn, `Valid on ${v.bid.submittedAt.slice(0, 10)}`, `${rec.status}, until ${rec.valid_until}`),
        check('Name matches bid', nameMatches(rec.entity_name, v.bidder.companyName), v.bidder.companyName, rec.entity_name),
      ];
      return {
        status: worst(checks, ['Certificate valid']),
        summary: rec.status === okStatus && validOn ? `${rec.status}; valid until ${rec.valid_until}.` : `${rec.status}; validity ended ${rec.valid_until}.`,
        facts: [
          { label: 'Entity', value: rec.entity_name },
          { label: 'Status', value: rec.status },
          { label: 'Valid until', value: rec.valid_until },
          ...(rec.items_covered ? [{ label: 'Items covered', value: rec.items_covered.join(', ') }] : []),
          ...(rec.sector ? [{ label: 'Sector', value: rec.sector }] : []),
        ],
        checks,
      };
    }),
});

const debarment: RegistryAdapter = {
  registry: 'DEBARMENT',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.pan,
  async verify(v, id) {
    const body = { pan: id, gstin: v.bidder.gstin, name: v.bidder.companyName, as_of: v.bid.submittedAt.slice(0, 10) };
    const r = await gateway('/v1/debarment/check', body);
    const matches = (r.body.matches ?? []) as Json[];
    const active = matches.filter((m) => m.active);
    const past = matches.filter((m) => !m.active);
    const checks = [
      check('No active debarment', active.length === 0, 'None', active.length ? active.map((m) => `${m.authority} until ${m.debarred_until}`).join('; ') : 'None'),
      check('No past debarment', past.length === 0, 'None', past.length ? past.map((m) => `${m.authority} ${m.debarred_from} – ${m.debarred_until}`).join('; ') : 'None'),
    ];
    return {
      registry: 'DEBARMENT',
      mode: 'SIMULATED',
      identifier: id,
      status: active.length ? 'FAILED' : past.length ? 'REVIEW' : 'VERIFIED',
      summary: active.length
        ? `Debarred by ${active[0].authority} until ${active[0].debarred_until}: ${active[0].reason}.`
        : past.length
          ? `Not currently debarred; past debarment by ${past[0].authority} ended ${past[0].debarred_until}.`
          : 'Not on the CPPP / GeM / MoPNG / CPCL debarment lists.',
      facts: [{ label: 'Checked against', value: 'CPPP, GeM, MoPNG, CPCL debarment lists' }, { label: 'As of', value: r.body.as_of }],
      checks,
      request: { method: 'POST', url: r.url, body },
      response: { httpStatus: r.httpStatus, body: r.body },
      latencyMs: r.latencyMs,
    };
  },
};

const digilocker: RegistryAdapter = {
  registry: 'DIGILOCKER',
  mode: 'SIMULATED',
  identifier: (v) => v.bidder.pan,
  async verify(v) {
    const wanted = [
      { type: 'PANCR', label: 'PAN record', id: v.bidder.pan },
      { type: 'GSTRC', label: 'GST registration certificate', id: v.bidder.gstin },
      ...(v.bidder.udyamNumber ? [{ type: 'UDCER', label: 'Udyam certificate', id: v.bidder.udyamNumber }] : []),
    ];
    const body = { identifiers: wanted.map((w) => w.id) };
    const r = await gateway('/v1/digilocker/issued', body);
    const docs = (r.body.documents ?? []) as Json[];
    const checks = wanted.map((w) => {
      const d = docs.find((x) => x.doc_type === w.type && x.identifier === w.id);
      return check(`${w.label} issued by authority`, !!d && nameMatches(d.name_on_record, v.bidder.companyName), `${w.id} · ${v.bidder.companyName}`, d ? `${d.issuer}: ${d.name_on_record}` : 'Not available in DigiLocker');
    });
    const found = checks.filter((c) => c.ok).length;
    return {
      registry: 'DIGILOCKER',
      mode: 'SIMULATED',
      identifier: v.bidder.pan,
      status: found === checks.length ? 'VERIFIED' : 'REVIEW',
      summary: `${found} of ${checks.length} documents confirmed against issuer records.`,
      facts: docs.map((d) => ({ label: d.doc_name, value: `${d.issuer} · issued ${d.issued_on} · ${d.uri}` })),
      checks,
      request: { method: 'POST', url: r.url, body },
      response: { httpStatus: r.httpStatus, body: r.body },
      latencyMs: r.latencyMs,
    };
  },
};

/** All registries, in display order. */
export const ADAPTERS: RegistryAdapter[] = [
  pan,
  gstn,
  udyam,
  mca21,
  monthly('EPFO', '/v1/epfo/lookup', 'latest_ecr_month', 'Live', (v) => v.bidder.epfoCode ?? null),
  monthly('ESIC', '/v1/esic/lookup', 'latest_contribution_month', 'Active', (v) => v.bidder.esicCode ?? null),
  certificate('STARTUP_INDIA', '/v1/startup_india/lookup', 'Recognised', (v) => v.bidder.dpiitNumber ?? null),
  certificate('NSIC', '/v1/nsic/lookup', 'Valid', (v) => v.bidder.nsicNumber ?? null),
  debarment,
  digilocker,
];

export const NOT_APPLICABLE_REASON: Partial<Record<RegistryId, string>> = {
  UDYAM: 'Bidder has not declared a Udyam registration.',
  MCA21: 'Not a company registered under the Companies Act (no CIN declared).',
  EPFO: 'No EPFO establishment code declared.',
  ESIC: 'No ESIC employer code declared.',
  STARTUP_INDIA: 'Bidder does not claim Startup India recognition.',
  NSIC: 'Bidder does not claim NSIC registration.',
};
