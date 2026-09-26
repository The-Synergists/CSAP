// Government Gateway console: shows officers and reviewers exactly how registry verification is
// wired: which API each registry is, the dataset behind each simulated one, a way to send a
// real request and see the raw response, and the calls CSAP made during verification.

import type { SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import { HttpError, must } from '../lib/http.js';
import { providerConfigured } from '../registries/gstinProvider.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REGISTRIES = ['pan', 'gstn', 'udyam', 'mca21', 'epfo', 'esic', 'startup_india', 'nsic', 'debarment', 'digilocker'] as const;
type Registry = (typeof REGISTRIES)[number];

/** The request CSAP's adapter sends for each registry (same shape as in registries/adapters.ts). */
const REQUEST: Record<Registry, (id: string) => { path: string; body: Record<string, unknown> }> = {
  pan: (id) => ({ path: '/v1/pan/verify', body: { pan: id } }),
  gstn: (id) => ({ path: '/v1/gstn/lookup', body: { identifier: id } }),
  udyam: (id) => ({ path: '/v1/udyam/lookup', body: { identifier: id } }),
  mca21: (id) => ({ path: '/v1/mca21/lookup', body: { identifier: id } }),
  epfo: (id) => ({ path: '/v1/epfo/lookup', body: { identifier: id } }),
  esic: (id) => ({ path: '/v1/esic/lookup', body: { identifier: id } }),
  startup_india: (id) => ({ path: '/v1/startup_india/lookup', body: { identifier: id } }),
  nsic: (id) => ({ path: '/v1/nsic/lookup', body: { identifier: id } }),
  debarment: (id) => ({ path: '/v1/debarment/check', body: /^[A-Z]{5}\d{4}[A-Z]$/i.test(id) ? { pan: id } : { name: id } }),
  digilocker: (id) => ({ path: '/v1/digilocker/issued', body: { identifiers: [id] } }),
};

const isRegistry = (r: string): r is Registry => (REGISTRIES as readonly string[]).includes(r);

async function gatewayFetch(path: string, init?: RequestInit) {
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(`${config.govGatewayUrl}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.govGatewayKey, ...(init?.headers ?? {}) },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new HttpError(502, `Government Gateway not reachable at ${config.govGatewayUrl}.`, 'GATEWAY_UNAVAILABLE');
  }
  const body = (await res.json().catch(() => ({}))) as any;
  return { httpStatus: res.status, body, latencyMs: Math.round(performance.now() - started) };
}

export async function gatewayOverview() {
  const [health, catalogue] = await Promise.all([gatewayFetch('/v1/health'), gatewayFetch('/v1/registries')]);
  if (catalogue.httpStatus !== 200) throw new HttpError(502, 'Government Gateway did not return its registry list.', 'GATEWAY_UNAVAILABLE');
  return {
    baseUrl: config.govGatewayUrl,
    healthy: health.httpStatus === 200,
    auth: 'x-api-key header (shared secret)',
    liveGstinProvider: providerConfigured() ? 'gstinapi.in' : null,
    registries: (catalogue.body.registries as any[]).map((r) => {
      const key = String(r.registry);
      const req = isRegistry(key) ? REQUEST[key]('X') : null;
      return { ...r, endpoint: req ? `POST ${req.path}` : null };
    }),
  };
}

export async function registryRecords(registry: string) {
  if (!isRegistry(registry)) throw new HttpError(404, `Unknown registry ${registry}.`, 'NOT_FOUND');
  const r = await gatewayFetch(`/v1/${registry}/records`);
  if (r.httpStatus !== 200) throw new HttpError(502, 'Government Gateway did not return the dataset.', 'GATEWAY_UNAVAILABLE');
  return r.body;
}

/** Sends one real request to the gateway, exactly as the verification adapter does, and returns it raw. */
export async function tryRegistryCall(registry: string, identifier: string) {
  if (!isRegistry(registry)) throw new HttpError(404, `Unknown registry ${registry}.`, 'NOT_FOUND');
  const id = identifier.trim();
  if (!id || id.length > 80) throw new HttpError(400, 'Enter an identifier (up to 80 characters).', 'VALIDATION');
  const { path, body } = REQUEST[registry](id);
  const sentAt = new Date().toISOString();
  const r = await gatewayFetch(path, { method: 'POST', body: JSON.stringify(body) });
  return {
    request: { method: 'POST', url: `${config.govGatewayUrl}${path}`, headers: { 'content-type': 'application/json', 'x-api-key': '••••••••' }, body, sentAt },
    response: { httpStatus: r.httpStatus, body: r.httpStatus === 400 ? (r.body.detail ?? r.body) : r.body, latencyMs: r.latencyMs },
  };
}

/** The registry calls CSAP made during verification (newest first). */
export async function recentCalls(db: SupabaseClient) {
  const portal = must<any[]>(
    await db
      .from('portal_verifications')
      .select('id, bid_id, registry, mode, identifier, status, request, response, latency_ms, checked_at')
      .not('request', 'is', null)
      .order('checked_at', { ascending: false })
      .limit(30),
    'portal verifications',
  );
  const pan = must<any[]>(
    await db.from('external_api_calls').select('id, bid_id, api_name, method, url, request_body, response_status, response_body, latency_ms, called_at').order('called_at', { ascending: false }).limit(15),
    'external API calls',
  );
  const calls = [
    ...portal.map((p) => ({
      id: p.id,
      bidId: p.bid_id,
      source: 'Portal verification',
      registry: p.registry,
      mode: p.mode,
      method: p.request?.method ?? 'POST',
      url: p.request?.url ?? '',
      requestBody: p.request?.body ?? null,
      httpStatus: p.response?.httpStatus ?? null,
      responseBody: p.response?.body ?? null,
      latencyMs: p.latency_ms,
      at: p.checked_at,
      outcome: p.status,
    })),
    ...pan.map((c) => ({
      id: c.id,
      bidId: c.bid_id,
      source: 'PAN document verification',
      registry: 'PAN',
      mode: 'SIMULATED',
      method: c.method,
      url: c.url,
      requestBody: c.request_body,
      httpStatus: c.response_status,
      responseBody: c.response_body,
      latencyMs: c.latency_ms,
      at: c.called_at,
      outcome: (c.response_body?.status as string) ?? null,
    })),
  ];
  return calls.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 40);
}
