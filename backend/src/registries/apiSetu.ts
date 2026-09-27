// Calls in the formats of the production integrations:
//  - API Setu certificate APIs (apisetu.gov.in, OpenAPI v3): POST <server>/<issuer>/v3/<doctype>/certificate
//    with X-APISETU-APIKEY / X-APISETU-CLIENTID, a UUID txnId, format "xml", issuer-specific
//    certificateParameters and a consent artifact; the answer is an XML certificate, errors are
//    {"error", "errorDescription"}.
//  - GSTN public APIs through a GST Suvidha Provider: Search Taxpayer (action=TP) and Track
//    Return (action=RETTRACK).
// Today both point at the simulated Government Gateway, which implements the same formats.

import { createHmac, randomUUID } from 'node:crypto';
import { config } from '../config/env.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CLIENT_ID = 'CSAP-BID-VERIFICATION';
const unescapeXml = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Attributes of the first element named `tag` in a certificate XML. */
export function xmlElement(xml: string, tag: string): Record<string, string> | null {
  const m = xml.match(new RegExp(`<${tag}\\s+([^>]*?)\\/?>`));
  if (!m) return null;
  const out: Record<string, string> = {};
  for (const a of m[1].matchAll(/([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g)) out[a[1]] = unescapeXml(a[2]);
  return out;
}

/** The consent artifact API Setu expects: who asks for which data, why, and for how long. */
function consentArtifact(provider: string, doc: string, user: { idType: string; idNumber: string }, purpose: string) {
  const now = new Date();
  const consent = {
    consentId: randomUUID(),
    timestamp: now.toISOString(),
    dataConsumer: { id: CLIENT_ID },
    dataProvider: { id: provider },
    purpose: { description: purpose },
    user: { idType: user.idType, idNumber: user.idNumber, mobile: '', email: '' },
    data: { id: doc },
    permission: {
      access: 'VIEW',
      dateRange: { from: now.toISOString(), to: new Date(now.getTime() + 24 * 3600_000).toISOString() },
      frequency: { unit: 'DAY', value: 1, repeats: 0 },
    },
  };
  // Signed with CSAP's key so the provider can check the consent was not altered.
  const signature = createHmac('sha256', config.govGatewayKey).update(JSON.stringify(consent)).digest('base64');
  return { consent, signature: { signature } };
}

export interface SetuCall {
  url: string;
  requestBody: Json;
  httpStatus: number;
  /** XML certificate on success. */
  xml: string | null;
  /** {"error","errorDescription"} on failure. */
  error: Json | null;
  latencyMs: number;
}
type Json = Record<string, any>;

export async function apiSetuCertificate(
  issuerPath: string,
  provider: string,
  doc: string,
  certificateParameters: Record<string, string>,
  user: { idType: string; idNumber: string },
  purpose: string,
): Promise<SetuCall> {
  const url = `${config.govGatewayUrl}${issuerPath}`;
  const requestBody = { txnId: randomUUID(), format: 'xml', certificateParameters, consentArtifact: consentArtifact(provider, doc, user, purpose) };
  const started = performance.now();
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-APISETU-APIKEY': config.govGatewayKey, 'X-APISETU-CLIENTID': CLIENT_ID },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(15_000),
  });
  const latencyMs = Math.round(performance.now() - started);
  const text = await res.text();
  if (res.status === 401 || res.status >= 500) throw new Error(`API Setu (${provider}) returned HTTP ${res.status}.`);
  if (res.ok) return { url, requestBody, httpStatus: res.status, xml: text, error: null, latencyMs };
  let error: Json = { error: 'unknown', errorDescription: text.slice(0, 200) };
  try {
    error = JSON.parse(text);
  } catch {
    /* keep the text */
  }
  return { url, requestBody, httpStatus: res.status, xml: null, error, latencyMs };
}

/** GSTN public API through a GSP (GET with query parameters). */
export async function gstnPublic(path: string, query: Record<string, string>): Promise<{ url: string; httpStatus: number; body: Json; latencyMs: number }> {
  const url = `${config.govGatewayUrl}${path}?${new URLSearchParams(query)}`;
  const started = performance.now();
  const res = await fetch(url, { headers: { 'x-api-key': config.govGatewayKey }, signal: AbortSignal.timeout(15_000) });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (res.status === 401 || res.status >= 500) throw new Error(`GSTN returned HTTP ${res.status}.`);
  return { url, httpStatus: res.status, body, latencyMs: Math.round(performance.now() - started) };
}

/** A masked copy of the request for display (keys never leave the server). */
export const shownHeaders = { 'X-APISETU-APIKEY': '••••••••', 'X-APISETU-CLIENTID': CLIENT_ID };

/** DD-MM-YYYY from an ISO date. */
export const ddmmyyyy = (iso?: string | null) => (iso && iso.length >= 10 ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
