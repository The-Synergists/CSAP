// Re-evaluation: a bidder responds to a clarification or asks for a decided bid to be evaluated
// again (from GeM, with any replacement documents). Nothing changes until the officer decides:
//   accept  -> the replacement documents take the place of the old ones, the bid reopens (if its
//              decision was final) and the full verification runs again automatically;
//   decline -> recorded with the officer's note, and the bidder is told on GeM.

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { config } from '../config/env.js';
import { docClauseRef, parseClauseRef } from '../db/conventions.js';
import { HttpError, must, mustOne } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';
import { clearResults, runIntakePipeline, sign } from './gemIntake.service.js';
import { GEM_STATUS } from './report.service.js';
import { confirmPassword } from './auth.service.js';
import { isFinal } from './bidRules.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface BidderResponsePayload {
  gemBidNo: string;
  kind: 'CLARIFICATION_RESPONSE' | 'REEVALUATION';
  reason: string;
  documents: { requirementCode: string; name: string; path: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** CSAP -> GeM status message (signed), e.g. that a re-evaluation started or was declined. */
export async function notifyGem(payload: { gemBidNo: string; status: string; remarks: string }) {
  const body = JSON.stringify({ ...payload, decidedAt: new Date().toISOString() });
  const timestamp = new Date().toISOString();
  await fetch(`${config.selfUrl}/api/gem/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSAP-Timestamp': timestamp, 'X-CSAP-Signature': `sha256=${sign(timestamp, body)}`, 'X-CSAP-Delivery': randomUUID() },
    body,
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {});
}

/** Webhook: the bidder's response arrived from GeM. It waits for the officer. */
export async function receiveBidderResponse(p: BidderResponsePayload) {
  if (!p?.gemBidNo || !['CLARIFICATION_RESPONSE', 'REEVALUATION'].includes(p.kind)) throw new HttpError(400, 'gemBidNo and kind are required.', 'VALIDATION');
  const reason = String(p.reason ?? '').trim();
  if (reason.length < 10) throw new HttpError(400, 'A reason of at least 10 characters is required.', 'VALIDATION');
  const bid = mustOne<any>(await serviceClient.from('bids').select('id, tender_id').eq('gem_bid_no', p.gemBidNo).maybeSingle(), 'bid');
  if (!bid) throw new HttpError(404, `No bid for GeM bid ${p.gemBidNo}.`, 'NOT_FOUND');
  const documents = (p.documents ?? []).filter((d) => /^gem\/submissions\/[0-9a-f-]{36}\/REQ-\d{2}\.(png|jpg|pdf)$/.test(d.path)).slice(0, 12);
  const row = must<any>(
    await serviceClient.from('reevaluation_requests').insert({ bid_id: bid.id, gem_bid_no: p.gemBidNo, kind: p.kind, reason, documents }).select('id').single(),
    'request',
  );
  await serviceClient.from('audit_events').insert({
    bid_id: bid.id,
    tender_id: bid.tender_id,
    actor_profile_id: null,
    actor_display_name: 'Bidder (via GeM)',
    actor_role: 'Bidder (via GeM)',
    action_type: 'BIDDER_SUBMISSION',
    summary: p.kind === 'CLARIFICATION_RESPONSE' ? 'Bidder responded to the clarification' : 'Bidder requested re-evaluation',
    details: `${reason}${documents.length ? ` · ${documents.length} new document(s): ${documents.map((d) => d.name).join(', ')}` : ''}. Waiting for the officer.`,
  });
  return { requestId: row.id, csapBidId: bid.id };
}

async function openRequest(db: SupabaseClient, requestId: string) {
  const req = mustOne<any>(await db.from('reevaluation_requests').select('*').eq('id', requestId).maybeSingle(), 'request');
  if (!req) throw new HttpError(404, 'Request not found.', 'NOT_FOUND');
  if (req.status !== 'OPEN') throw new HttpError(409, 'This request has already been handled.', 'ALREADY_HANDLED');
  return req;
}

/** Officer accepts: replacement documents are applied and the bid is verified again. */
export async function acceptRequest(db: SupabaseClient, userId: string, officerName: string, requestId: string, note?: string, password?: string) {
  const req = await openRequest(db, requestId);
  const bidId: string = req.bid_id;
  const { data: bid } = await serviceClient.from('bids').select('id, tender_id').eq('id', bidId).single();

  // A locked bid (final decision) is reopened only by the officer who decided it, after typing
  // their password again. A failed attempt is recorded in the audit trail.
  if (await isFinal(db, bidId)) {
    const { data: last } = await serviceClient
      .from('officer_decisions')
      .select('officer_profile_id, decision, created_at')
      .eq('bid_id', bidId)
      .order('created_at', { ascending: false })
      .limit(1);
    const owner = last?.[0]?.officer_profile_id;
    if (owner && owner !== userId) {
      const { data: p } = await serviceClient.from('profiles').select('full_name').eq('id', owner).maybeSingle();
      throw new HttpError(403, `Only ${p?.full_name ?? 'the officer who recorded the final decision'} can reopen this bid.`, 'NOT_DECISION_OWNER');
    }
    try {
      await confirmPassword(userId, password ?? '');
    } catch (err) {
      await serviceClient.from('audit_events').insert({
        bid_id: bidId,
        tender_id: bid!.tender_id,
        actor_profile_id: userId,
        actor_display_name: officerName,
        actor_role: 'Procurement officer',
        action_type: 'OFFICER_ACTION',
        summary: 'Reopening refused: password not confirmed',
        details: 'An attempt to reopen the locked bid for re-evaluation was refused because the password was not confirmed.',
      });
      throw err;
    }
  }

  must(await db.from('reevaluation_requests').update({ status: 'ACCEPTED', decided_at: new Date().toISOString(), decided_by: userId, decision_note: note ?? null }).eq('id', requestId), 'request');

  // Apply replacement documents: CSAP keeps its own copy, under a new name so previews refresh.
  const rows = must<any[]>(await serviceClient.from('bid_documents').select('id, display_code, tender_clause_reference').eq('bid_id', bidId), 'documents');
  const reqs = must<any[]>(await serviceClient.from('tender_requirements').select('display_code, title, category').eq('tender_id', bid!.tender_id), 'requirements');
  const n = bidId.replace('BID-', '').replace(/^0+/, '');
  let added = rows.length;
  for (const d of req.documents as BidderResponsePayload['documents']) {
    const existing = rows.find((r) => parseClauseRef(r.tender_clause_reference).code === d.requirementCode);
    const code = existing?.display_code ?? `DOC-${n}${String(++added).padStart(2, '0')}`;
    const target = `${bidId}/${code}-r${Date.now().toString(36)}.${d.path.split('.').pop()}`;
    const { error } = await serviceClient.storage.from('bid-documents').copy(d.path, target);
    if (error) throw new HttpError(502, `Could not copy ${d.fileName}: ${error.message}`, 'STORAGE_ERROR');
    const fields = {
      file_name: d.fileName,
      file_size: sizeLabel(d.sizeBytes),
      upload_timestamp: req.requested_at,
      storage_path: target,
      mime_type: d.mimeType,
      ocr_status: 'PROCESSING',
      verification_status: 'PENDING',
      status_message: 'Replacement submitted by the bidder; waiting for CSAP AI reading.',
      extracted_snippet: '',
    };
    if (existing) {
      must(await serviceClient.from('bid_documents').update(fields).eq('id', existing.id), 'document');
    } else {
      const r = reqs.find((x) => x.display_code === d.requirementCode);
      must(
        await serviceClient.from('bid_documents').insert({ ...fields, bid_id: bidId, display_code: code, name: d.name, doc_type: r?.category ?? 'POLICY', tender_clause_reference: docClauseRef(d.requirementCode, '') }),
        'document',
      );
    }
  }

  await db.from('audit_events').insert({
    bid_id: bidId,
    tender_id: bid!.tender_id,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: 'Procurement officer',
    action_type: 'OFFICER_ACTION',
    summary: req.kind === 'CLARIFICATION_RESPONSE' ? 'Clarification response accepted' : 'Re-evaluation opened',
    details: `${req.kind === 'REEVALUATION' ? 'Locked bid reopened by the officer who decided it (identity re-confirmed with password). ' : ''}${req.documents.length} replacement document(s) applied; the bid is being verified again.${note ? ` Note: ${note}` : ''}`,
  });
  if (req.gem_bid_no) {
    await notifyGem({ gemBidNo: req.gem_bid_no, status: 'UNDER_EVALUATION', remarks: 'The buyer received your response and is evaluating your bid again.' });
  }
  await clearResults(bidId); // the old figures disappear at once
  waitUntil(runIntakePipeline(bidId, { reverify: true }).catch(() => {}));
  return { bidId, status: 'ACCEPTED' };
}

/** Officer declines: nothing on the bid changes; the bidder is told why. */
export async function declineRequest(db: SupabaseClient, userId: string, officerName: string, requestId: string, note: string) {
  const text = String(note ?? '').trim();
  if (text.length < 10) throw new HttpError(400, 'Give the bidder a reason (at least 10 characters).', 'VALIDATION');
  const req = await openRequest(db, requestId);
  must(await db.from('reevaluation_requests').update({ status: 'DECLINED', decided_at: new Date().toISOString(), decided_by: userId, decision_note: text }).eq('id', requestId), 'request');
  const { data: bid } = await serviceClient.from('bids').select('tender_id').eq('id', req.bid_id).single();
  const { data: last } = await serviceClient.from('officer_decisions').select('decision').eq('bid_id', req.bid_id).order('created_at', { ascending: false }).limit(1);
  await db.from('audit_events').insert({
    bid_id: req.bid_id,
    tender_id: bid?.tender_id ?? null,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: 'Procurement officer',
    action_type: 'OFFICER_ACTION',
    summary: req.kind === 'CLARIFICATION_RESPONSE' ? 'Clarification response declined' : 'Re-evaluation declined',
    details: text,
  });
  if (req.gem_bid_no) {
    await notifyGem({ gemBidNo: req.gem_bid_no, status: GEM_STATUS[last?.[0]?.decision] ?? 'UNDER_EVALUATION', remarks: `Your request was not accepted: ${text}` });
  }
  return { bidId: req.bid_id, status: 'DECLINED' };
}
