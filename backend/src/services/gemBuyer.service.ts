// Buyer desk of the simulated GeM portal: the procurement officer, signed in on GeM, sees every bid
// received for the buyer's tenders, the technical evaluation outcome and the full evaluation reports
// that CSAP delivered to GeM (with their fingerprints checked on arrival).

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env.js';
import { HttpError, must, mustOne } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';
import { login } from './auth.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const TTL_MS = 8 * 3600_000;
const secret = () => config.gemWebhookSecret;
const b64 = (s: string) => Buffer.from(s).toString('base64url');

/** Signs the buyer in with their procurement account and returns a GeM buyer session token. */
export async function buyerLogin(identifier: string, password: string) {
  await login(identifier, password); // same credentials; Supabase checks the password
  const payload = b64(JSON.stringify({ sub: identifier.trim().toLowerCase(), exp: Date.now() + TTL_MS }));
  const sig = createHmac('sha256', secret()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
}

export function requireBuyer(header: string | undefined) {
  const token = (header ?? '').replace(/^Bearer\s+/i, '');
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw new HttpError(401, 'Sign in to the buyer desk.', 'GEM_BUYER_UNAUTHENTICATED');
  const expected = createHmac('sha256', secret()).update(payload).digest('base64url');
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) throw new HttpError(401, 'Sign in to the buyer desk.', 'GEM_BUYER_UNAUTHENTICATED');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!(claims.exp > Date.now())) throw new HttpError(401, 'Your buyer session has expired. Sign in again.', 'GEM_BUYER_UNAUTHENTICATED');
  return claims as { sub: string };
}

/** What happens next for a bid on GeM, from the technical evaluation outcome. */
const NEXT_STAGE: Record<string, string> = {
  UNDER_EVALUATION: 'Technical evaluation in progress',
  CLARIFICATION_SOUGHT: "Waiting for the seller's clarification",
  TECHNICALLY_QUALIFIED: 'Moves to financial evaluation (price bid opening)',
  DISQUALIFIED: 'Technically disqualified; not considered further',
  UNDER_COMMITTEE_REVIEW: 'With the evaluation committee',
};

const summary = (r: any) => {
  const reports = (r.buyer_reports ?? []) as any[];
  const last = reports[reports.length - 1];
  const responses = (r.responses ?? []) as any[];
  const lastResponse = responses[responses.length - 1];
  return {
    id: r.id,
    gemBidNo: r.gem_bid_no,
    tenderId: r.tender_id,
    seller: r.company?.name,
    pan: r.company?.pan,
    submittedAt: r.submitted_at,
    documents: (r.documents ?? []).length,
    evaluationStatus: r.evaluation_status,
    nextStage: NEXT_STAGE[r.evaluation_status] ?? 'Technical evaluation in progress',
    remarks: r.evaluation?.remarks ?? null,
    latestReport: last ? { reportNo: last.reportNo, receivedAt: last.receivedAt, verified: last.verified, complianceScore: last.content?.summary?.complianceScore ?? null } : null,
    reports: reports.length,
    requestPending: !!lastResponse && (!r.evaluation_received_at || lastResponse.sentAt > r.evaluation_received_at),
  };
};

/** Every tender with bids on GeM, and each bid's evaluation state. */
export async function buyerOverview() {
  const subs = must<any[]>(await serviceClient.from('gem_bid_submissions').select('*').order('submitted_at', { ascending: false }), 'submissions');
  const tenderIds = [...new Set(subs.map((s) => s.tender_id))];
  const tenders = tenderIds.length ? must<any[]>(await serviceClient.from('tenders').select('id, title, division, status, deadline_date, technical_opening_date').in('id', tenderIds), 'tenders') : [];
  return tenders
    .sort((a, b) => String(b.id).localeCompare(a.id))
    .map((t) => ({
      id: t.id,
      title: t.title,
      division: t.division,
      closes: t.deadline_date,
      technicalOpening: t.technical_opening_date,
      bids: subs.filter((s) => s.tender_id === t.id).map(summary),
    }));
}

/** One bid with every evaluation report GeM received for it (full content). */
export async function buyerSubmission(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'Bid not found.', 'NOT_FOUND');
  const r = mustOne<any>(await serviceClient.from('gem_bid_submissions').select('*').eq('id', id).maybeSingle(), 'submission');
  if (!r) throw new HttpError(404, 'Bid not found.', 'NOT_FOUND');
  return { ...summary(r), company: r.company, responses: r.responses ?? [], reportsReceived: [...(r.buyer_reports ?? [])].reverse() };
}
