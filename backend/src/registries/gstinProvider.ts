// Live GSTIN provider (gstinapi.in). Every successful or not-found lookup costs a credit, so:
//  - a GSTIN is only sent when its format and check digit are valid (malformed input is free
//    to reject locally);
//  - every charged answer (200 and 404) is cached in gstin_live_cache and reused for
//    GSTIN_CACHE_DAYS, so re-running a check or a demo costs nothing;
//  - fictitious demo GSTINs never reach the provider: the GSTN adapter asks the simulated
//    registry first and only goes live for GSTINs the simulation does not hold.

import { config } from '../config/env.js';
import { serviceClient } from '../lib/supabase.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Json = Record<string, any>;

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Format plus the GSTN check digit (mod-36 Luhn variant). */
export function isValidGstin(gstin: string): boolean {
  const g = gstin.trim().toUpperCase();
  if (!GSTIN_RE.test(g)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36] === g[14];
}

export const providerConfigured = () => Boolean(config.gstinProviderKey);
/** Backup provider (gstinapi.com), used only when the primary cannot answer. */
export const backupConfigured = () => Boolean(config.gstinFallbackKey);

type Source = 'primary' | 'backup';

export interface ProviderCall {
  endpoint: string;
  url: string;
  httpStatus: number;
  body: Json;
  /** true when served from gstin_live_cache (no credit spent). */
  cached: boolean;
  fetchedAt: string;
  latencyMs: number;
}

/** Thrown for answers that must not be read as a registry result (auth, credits, rate limit, outage). */
export class ProviderUnavailable extends Error {}

const CHARGED = new Set([200, 404]);

// Concurrent requests for the same answer (e.g. a double click) share one provider call.
const inFlight = new Map<string, Promise<ProviderCall>>();

function call(gstin: string, endpoint: string, path: string, source: Source = 'primary'): Promise<ProviderCall> {
  const key = `${gstin}|${endpoint}`;
  const pending = inFlight.get(key);
  if (pending) return pending;
  const p = fetchOnce(gstin, endpoint, path, source).finally(() => inFlight.delete(key));
  inFlight.set(key, p);
  return p;
}

async function fetchOnce(gstin: string, endpoint: string, path: string, source: Source): Promise<ProviderCall> {
  const cutoff = new Date(Date.now() - config.gstinCacheDays * 86_400_000).toISOString();
  const { data: hit } = await serviceClient
    .from('gstin_live_cache')
    .select('http_status, body, fetched_at')
    .eq('gstin', gstin)
    .eq('endpoint', endpoint)
    .gte('fetched_at', cutoff)
    .maybeSingle();
  const url = `${source === 'primary' ? config.gstinProviderUrl : config.gstinFallbackUrl}${path}`;
  const apiKey = source === 'primary' ? config.gstinProviderKey : config.gstinFallbackKey;
  const name = source === 'primary' ? 'GST provider' : 'Backup GST provider';
  if (hit) return { endpoint, url, httpStatus: hit.http_status, body: hit.body, cached: true, fetchedAt: hit.fetched_at, latencyMs: 0 };

  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'x-api-key': apiKey }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new ProviderUnavailable(`${name} unreachable (${err instanceof Error ? err.message : String(err)}).`);
  }
  const body = (await res.json().catch(() => ({}))) as Json;
  const latencyMs = Math.round(performance.now() - started);
  let httpStatus = res.status;
  // gstinapi.com answers HTTP 200 with taxpayer_data.error for GSTINs it cannot return.
  // Account-level errors ("Invalid or Inactive apikey") also arrive as HTTP 200, at the top level.
  if (source === 'backup' && res.ok && !body.taxpayer_data?.gstin && !body.taxpayer_data?.error) {
    throw new ProviderUnavailable(`${name}: ${body.error ?? body.message ?? 'no taxpayer data in the answer'}`);
  }
  const backupError = source === 'backup' && res.ok ? (body.taxpayer_data?.error as Json | undefined) : undefined;
  if (backupError) {
    if (/NOT_FOUND|NO_RECORD|NOT_REGISTERED/i.test(String(backupError.error_cd ?? ''))) httpStatus = 404;
    else throw new ProviderUnavailable(`${name}: ${backupError.message ?? backupError.error_cd}`);
  }
  if (!CHARGED.has(httpStatus)) {
    const reason =
      httpStatus === 402 ? `no credits available (${body.code ?? 'insufficient credits'})` : httpStatus === 429 ? 'rate limit reached, try again in a minute' : `HTTP ${httpStatus}`;
    throw new ProviderUnavailable(`${name}: ${reason}. ${body.error ?? body.message ?? ''}`.trim());
  }
  const fetchedAt = new Date().toISOString();
  await serviceClient.from('gstin_live_cache').upsert({ gstin, endpoint, http_status: httpStatus, body, fetched_at: fetchedAt });
  return { endpoint, url, httpStatus, body, cached: false, fetchedAt, latencyMs };
}

/** Financial year label (e.g. 2026-27) for an ISO date. */
export const financialYear = (iso: string) => {
  const y = Number(iso.slice(0, 4));
  const start = Number(iso.slice(5, 7)) >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

export const fetchProfile = (gstin: string) => call(gstin, 'profile', `/v1/gstin/${gstin}`);
export const fetchReturns = (gstin: string, fy: string) => call(gstin, `returns:${fy}`, `/v1/gstin/${gstin}/returns?fy=${fy}`);

/** gstinapi.com: registration and filings in one call (cached like the primary). */
export const fetchBackup = (gstin: string) => call(gstin, 'backup', `/get-taxpayer-info/${gstin}`, 'backup');

/** Maps a gstinapi.com answer onto the primary provider's shapes (profile + returns). */
export function fromBackup(body: Json): { profile: Json; returns: Json } {
  const t = (body.taxpayer_data ?? {}) as Json;
  const addr = (t.pradr?.addr ?? t.pradr ?? {}) as Json;
  const address =
    typeof t.pradr === 'string'
      ? t.pradr
      : [addr.bno, addr.flno, addr.bnm, addr.st, addr.loc, addr.city, addr.dst].filter((x) => x && String(x).trim() && x !== 'NA').join(', ');
  const filings = (Array.isArray(body.filing_data) ? body.filing_data : (body.filing_data?.filingStatus ?? []).flat()) as Json[];
  return {
    profile: {
      data: {
        gstin: t.gstin,
        legal_name: t.name ?? t.lgnm ?? null,
        trade_name: t.tradename ?? t.tradeNam ?? null,
        status: t.status ?? t.sts ?? null,
        taxpayer_type: t.dty ?? t.taxpayerType ?? null,
        registration_date: t.registrationDate ?? t.rgdt ?? null,
        cancellation_date: t.cancellationDate ?? t.cxdt ?? null,
        constitution: t.constitution ?? t.ctb ?? null,
        address: address || null,
        pincode: addr.pncd ?? null,
      },
    },
    returns: { returns: filings },
  };
}

/** Usage from the provider (this call is free). */
export async function providerUsage(): Promise<Json | null> {
  if (!providerConfigured()) return null;
  const res = await fetch(`${config.gstinProviderUrl}/v1/gstin/stats/me`, { headers: { 'x-api-key': config.gstinProviderKey }, signal: AbortSignal.timeout(8_000) }).catch(() => null);
  if (!res) return { ok: false, message: 'Provider unreachable.' };
  const body = (await res.json().catch(() => ({}))) as Json;
  return res.ok ? { ok: true, ...body } : { ok: false, httpStatus: res.status, code: body.code ?? null, message: body.error ?? `HTTP ${res.status}` };
}

// ---------------------------------------------------------------- normalising returns

/** Provider periods come as YYYY-MM or MMYYYY; returns YYYY-MM. */
export const normalisePeriod = (p: string) => (/^\d{6}$/.test(p) ? `${p.slice(2)}-${p.slice(0, 2)}` : p.slice(0, 7));

export interface Gstr3b {
  period: string; // YYYY-MM
  filedOn: string | null;
  onTime: boolean | null;
}

/** GSTR-3B is due by the 20th (monthly) or 22nd/24th (quarterly) of the following month; the 24th is used as the limit. */
export function gstr3bFilings(returnsBody: Json): Gstr3b[] {
  const rows = (returnsBody.returns ?? returnsBody.data?.returns ?? []) as Json[];
  return rows
    .filter((r) => String(r.return_type ?? r.rtntype ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '') === 'GSTR3B')
    .map((r) => {
      const period = normalisePeriod(String(r.return_period ?? r.ret_prd ?? r.taxp ?? ''));
      const st = r.filing_status ?? r.status;
      const filed = !st || /^filed$/i.test(String(st).trim());
      const filedOn = filed ? ((r.filing_date ?? r.dof ?? null) as string | null) : null;
      const [y, m] = period.split('-').map(Number);
      const due = new Date(Date.UTC(y, m, 24)).toISOString().slice(0, 10);
      const filedIso = filedOn && /^\d{2}-\d{2}-\d{4}$/.test(filedOn) ? `${filedOn.slice(6)}-${filedOn.slice(3, 5)}-${filedOn.slice(0, 2)}` : filedOn;
      return { period, filedOn: filedIso, onTime: filedIso ? filedIso <= due : null };
    })
    .sort((a, b) => a.period.localeCompare(b.period));
}
