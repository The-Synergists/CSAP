// The simulated GeM portal (bidder side). It stands in for the Government e-Marketplace, which
// offers no public API for third parties: it lists CPCL tenders that are open for bids, takes a
// bidder's submission and documents into its own table and storage folder, and then delivers the
// bid to CSAP through a signed webhook, as a real marketplace integration would.

import { randomUUID } from 'node:crypto';
import { GEM_DEMO_KIT } from '../../../shared/demo/gemDemoKit.js';
import { config } from '../config/env.js';
import { HttpError, must } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';
import { sign, type GemBidPayload } from './gemIntake.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const BUCKET = 'bid-documents';
const MAX_FILE = 3 * 1024 * 1024; // request bodies on the hosting platform are limited to 4.5 MB (base64 adds a third)
const MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'application/pdf': 'pdf' };

export async function openTenders() {
  const tenders = must<any[]>(await serviceClient.from('tenders').select('*').eq('status', 'OPEN_FOR_BIDS').order('deadline_date'), 'tenders');
  const reqs = must<any[]>(await serviceClient.from('tender_requirements').select('*').in('tender_id', tenders.map((t) => t.id)), 'requirements');
  return tenders.map((t) => ({
    id: t.id,
    title: t.title,
    buyer: 'Chennai Petroleum Corporation Limited',
    division: t.division,
    category: t.category,
    description: t.description,
    estimatedValue: Number(t.estimated_value),
    emdAmount: Number(t.emd_amount),
    publishDate: t.publish_date,
    deadlineDate: t.deadline_date,
    requirements: reqs
      .filter((r) => r.tender_id === t.id)
      .sort((a, b) => String(a.display_code).localeCompare(b.display_code))
      .map((r) => ({ code: r.display_code, title: r.title, criterion: r.criterion, benchmark: r.benchmark_value, mandatory: r.mandatory, category: r.category })),
  }));
}

/** A fictitious bidder with a complete specimen document set, for demonstrations. */
export function demoKit() {
  return { ...GEM_DEMO_KIT, documents: GEM_DEMO_KIT.documents.map((d) => ({ ...d, path: `gem/demo-kit/${d.requirement}.png`, fileName: `${d.requirement}_${d.name.replace(/[^\w]+/g, '_')}.png` })) };
}

/** Stores one uploaded document in GeM's own storage area. */
export async function uploadDocument(input: { draftId: string; requirementCode: string; fileName: string; mimeType: string; contentBase64: string }) {
  if (!/^[0-9a-f-]{36}$/.test(input.draftId)) throw new HttpError(400, 'Invalid draft.', 'VALIDATION');
  if (!/^REQ-\d{2}$/.test(input.requirementCode)) throw new HttpError(400, 'Invalid requirement.', 'VALIDATION');
  if (!MIME.has(input.mimeType)) throw new HttpError(415, 'Upload the document as a PDF, or a scan or photo (PNG or JPEG).', 'UNSUPPORTED_TYPE');
  const bytes = Buffer.from(input.contentBase64 ?? '', 'base64');
  if (!bytes.length || bytes.length > MAX_FILE) throw new HttpError(413, 'Each document must be under 3 MB.', 'FILE_SIZE');
  const path = `gem/submissions/${input.draftId}/${input.requirementCode}.${EXT[input.mimeType]}`;
  const { error } = await serviceClient.storage.from(BUCKET).upload(path, bytes, { contentType: input.mimeType, upsert: true });
  if (error) throw new HttpError(502, `Storage error: ${error.message}`, 'STORAGE_ERROR');
  return { path, sizeBytes: bytes.length };
}

const mapSubmission = (r: any) => ({
  id: r.id,
  gemBidNo: r.gem_bid_no,
  tenderId: r.tender_id,
  company: r.company,
  declared: r.declared,
  documents: r.documents,
  status: r.status,
  csapBidId: r.csap_bid_id,
  delivery: r.delivery,
  submittedAt: r.submitted_at,
  deliveredAt: r.delivered_at,
});

/** Saves the bid on the GeM side, then delivers it to CSAP's intake webhook (signed). */
export async function submitBid(input: { tenderId: string; company: GemBidPayload['company']; declared: GemBidPayload['declared']; documents: GemBidPayload['documents'] }) {
  const tenders = await openTenders();
  const tender = tenders.find((t) => t.id === input.tenderId);
  if (!tender) throw new HttpError(409, 'This tender is not open for bids.', 'TENDER_CLOSED');
  const allowed = (p: string) => /^gem\/(submissions\/[0-9a-f-]{36}|demo-kit)\/REQ-\d{2}\.(png|jpg|pdf)$/.test(p);
  if (!input.documents?.length || input.documents.some((d) => !allowed(d.path))) throw new HttpError(400, 'Attach the documents before submitting.', 'VALIDATION');

  const company = { ...input.company, pan: input.company.pan?.trim().toUpperCase(), gstin: input.company.gstin?.trim().toUpperCase(), udyamNumber: input.company.udyamNumber?.trim().toUpperCase() || undefined };
  const gemBidNo = `GEM/2026/B/${String(Date.now()).slice(-7)}`;
  const submittedAt = new Date().toISOString();
  const row = must<any>(
    await serviceClient
      .from('gem_bid_submissions')
      .insert({ gem_bid_no: gemBidNo, tender_id: tender.id, company, declared: input.declared, documents: input.documents, submitted_at: submittedAt })
      .select('*')
      .single(),
    'submission',
  );

  const payload: GemBidPayload = { gemBidNo, tenderId: tender.id, submittedAt, company, declared: input.declared, documents: input.documents };
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const url = `${config.selfUrl}/api/integrations/gem/bids`;
  const headers = { 'Content-Type': 'application/json', 'X-GeM-Timestamp': timestamp, 'X-GeM-Signature': `sha256=${sign(timestamp, body)}`, 'X-GeM-Delivery': randomUUID() };
  let delivery: any;
  let status = 'DELIVERY_FAILED';
  let csapBidId: string | null = null;
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(45_000) });
    const json = (await res.json().catch(() => ({}))) as any;
    delivery = { request: { url, headers: { ...headers, 'X-GeM-Signature': `${headers['X-GeM-Signature'].slice(0, 19)}…` } }, response: { httpStatus: res.status, body: json } };
    if (res.ok && json?.data?.csapBidId) {
      status = 'DELIVERED';
      csapBidId = json.data.csapBidId;
    }
  } catch (err) {
    delivery = { request: { url }, error: err instanceof Error ? err.message : String(err) };
  }
  const updated = must<any>(
    await serviceClient
      .from('gem_bid_submissions')
      .update({ status, csap_bid_id: csapBidId, delivery, delivered_at: status === 'DELIVERED' ? new Date().toISOString() : null })
      .eq('id', row.id)
      .select('*')
      .single(),
    'submission',
  );
  return mapSubmission(updated);
}

/** The bidder's bids ("My Bids"); the simulated portal identifies a seller by PAN. */
export async function myBids(pan: string) {
  const p = (pan ?? '').trim().toUpperCase();
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p)) throw new HttpError(400, 'Enter a valid PAN.', 'VALIDATION');
  const rows = must<any[]>(await serviceClient.from('gem_bid_submissions').select('*').eq('company->>pan', p).order('submitted_at', { ascending: false }), 'submissions');
  return rows.map(mapSubmissionWithEvaluation);
}

const mapSubmissionWithEvaluation = (r: any) => ({
  ...mapSubmission(r),
  evaluationStatus: r.evaluation_status,
  evaluation: r.evaluation,
  evaluationReceivedAt: r.evaluation_received_at,
});

export async function getSubmissionWithEvaluation(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'Submission not found.', 'NOT_FOUND');
  const r = must<any>(await serviceClient.from('gem_bid_submissions').select('*').eq('id', id).maybeSingle(), 'submission');
  if (!r) throw new HttpError(404, 'Submission not found.', 'NOT_FOUND');
  return mapSubmissionWithEvaluation(r);
}

/** CSAP -> GeM: the buyer's evaluation outcome and report summary for one bid (signed by CSAP). */
export async function receiveEvaluation(payload: any) {
  if (!payload?.gemBidNo || !payload?.status) throw new HttpError(400, 'gemBidNo and status are required.', 'VALIDATION');
  const row = must<any>(await serviceClient.from('gem_bid_submissions').select('id').eq('gem_bid_no', payload.gemBidNo).maybeSingle(), 'submission');
  if (!row) throw new HttpError(404, `GeM bid ${payload.gemBidNo} not found.`, 'NOT_FOUND');
  must(
    await serviceClient
      .from('gem_bid_submissions')
      .update({ evaluation_status: payload.status, evaluation: payload, evaluation_received_at: new Date().toISOString() })
      .eq('id', row.id),
    'submission',
  );
  return { received: true, gemBidNo: payload.gemBidNo, status: payload.status };
}
