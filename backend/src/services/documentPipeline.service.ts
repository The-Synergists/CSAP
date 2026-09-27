// PAN document verification pipeline:
//
//   document (storage) → NVIDIA Nemotron OCR V2 → NVIDIA extraction model → PAN
//     → dummy PAN Verification API (separate service, own dataset) → comparison → verdict
//
// The run row in document_verification_runs is created first and then updated after every
// stage, so Supabase Realtime streams each stage to the officer's screen as it happens.

import { createHash } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapRunRow } from '../../../shared/domain/pipeline.js';
import { getBidView, type BidView } from '../../../shared/domain/selectors.js';
import type {
  ApiRequestRecord,
  ApiResponseRecord,
  ComparisonRow,
  ExtractionResult,
  OcrResult,
  PanVerdict,
  PipelineDocument,
} from '../../../shared/domain/types.js';
import { config } from '../config/env.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must, mustOne } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';

export const BUCKET = 'bid-documents';
const MAX_UPLOAD = 3 * 1024 * 1024; // the hosting platform limits request bodies to 4.5 MB (base64 adds a third)
const MIME = new Set(['image/png', 'image/jpeg', 'application/pdf']);
const PAN_API_NAME = 'PAN Verification API (dummy)';

export type DocumentSource =
  | { kind: 'bid_package' }
  | { kind: 'sample'; fileName: string }
  | { kind: 'upload'; fileName: string; mimeType: string; contentBase64: string };

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapRun = mapRunRow;

export async function listRuns(db: SupabaseClient, bidId: string) {
  const rows = must<any[]>(
    await db.from('document_verification_runs').select('*').eq('bid_id', bidId).eq('document_type', 'PAN').order('started_at', { ascending: false }).limit(20),
    'document verification runs',
  );
  return rows.map(mapRun);
}

export async function listSamples(): Promise<string[]> {
  const { data, error } = await serviceClient.storage.from(BUCKET).list('samples', { limit: 50 });
  if (error) throw new HttpError(502, `Storage error: ${error.message}`, 'STORAGE_ERROR');
  return (data ?? []).map((f) => f.name).filter((n) => /\.(png|jpe?g|pdf)$/i.test(n));
}

/** Short-lived signed URL for previewing a stored document. Only bid and sample paths are allowed. */
export async function signedUrl(path: string): Promise<string> {
  if (!/^(BID-\d{3}|samples|uploads\/BID-\d{3}|gem\/demo-kit|gem\/submissions\/[0-9a-f-]{36})\//.test(path) || path.includes('..')) {
    throw new HttpError(400, 'Invalid document path.', 'VALIDATION');
  }
  const { data, error } = await serviceClient.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data) throw new HttpError(404, 'Document not found in storage.', 'NOT_FOUND');
  return data.signedUrl;
}

export async function download(path: string): Promise<Buffer> {
  const { data, error } = await serviceClient.storage.from(BUCKET).download(path);
  if (error || !data) throw new HttpError(404, `Document ${path} could not be downloaded from storage (${error?.message || 'no data'}).`, 'NOT_FOUND');
  return Buffer.from(await data.arrayBuffer());
}

/** Resolves which file the pipeline runs on and returns its bytes plus metadata. */
async function resolveDocument(view: BidView, source: DocumentSource): Promise<{ bytes: Buffer; doc: PipelineDocument; bidDocumentId?: string }> {
  let bytes: Buffer;
  let doc: Omit<PipelineDocument, 'sizeBytes' | 'sha256'>;
  if (source.kind === 'bid_package') {
    const panDoc = view.checks.find((c) => c.requirement.code === 'REQ-07')?.document;
    if (!panDoc?.storagePath) throw new HttpError(404, 'This bid has no stored PAN document. Upload one to run the check.', 'NO_DOCUMENT');
    bytes = await download(panDoc.storagePath);
    doc = { path: panDoc.storagePath, fileName: panDoc.storagePath.split('/').pop()!, mimeType: panDoc.mimeType ?? 'image/png', source: 'bid_package' };
  } else if (source.kind === 'sample') {
    if (!/^[\w.-]+\.(png|jpe?g|pdf)$/i.test(source.fileName)) throw new HttpError(400, 'Invalid sample name.', 'VALIDATION');
    const path = `samples/${source.fileName}`;
    bytes = await download(path);
    const lower = source.fileName.toLowerCase();
    doc = { path, fileName: source.fileName, mimeType: lower.endsWith('.png') ? 'image/png' : lower.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg', source: 'sample' };
  } else {
    if (!MIME.has(source.mimeType)) throw new HttpError(415, 'Upload the PAN document as a PDF, PNG or JPEG file.', 'UNSUPPORTED_TYPE');
    bytes = Buffer.from(source.contentBase64, 'base64');
    if (!bytes.length || bytes.length > MAX_UPLOAD) throw new HttpError(413, 'File must be between 1 byte and 3 MB.', 'FILE_SIZE');
    const safe = source.fileName.replace(/[^\w.-]+/g, '_').slice(-80);
    const path = `uploads/${view.bid.id}/${Date.now()}-${safe}`;
    const { error } = await serviceClient.storage.from(BUCKET).upload(path, bytes, { contentType: source.mimeType, upsert: false });
    if (error) throw new HttpError(502, `Could not store the upload: ${error.message}`, 'STORAGE_ERROR');
    doc = { path, fileName: source.fileName, mimeType: source.mimeType, source: 'officer_upload' };
  }
  return {
    bytes,
    doc: { ...doc, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
  };
}

export async function engine<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${config.aiEngineUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-engine-key': config.engineApiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(150_000),
    });
  } catch {
    throw new Error(`Verification engine not reachable at ${config.aiEngineUrl}.`);
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) throw new Error(json?.detail?.message ?? `Engine returned HTTP ${res.status}.`);
  return json as T;
}

const norm = (s: string | null | undefined) =>
  (s ?? '')
    .toUpperCase()
    .replace(/\bPVT\b/g, 'PRIVATE')
    .replace(/\bLTD\b/g, 'LIMITED')
    .replace(/[^A-Z0-9]/g, '');

/** Compares what the document says, what the PAN registry says, and what the bid declares. */
export function compare(view: BidView, extraction: ExtractionResult, api: ApiResponseRecord): { rows: ComparisonRow[]; verdict: PanVerdict; summary: string } {
  const b = api.body as Record<string, any>;
  const status = String(b.status ?? (api.httpStatus === 400 ? 'INVALID_FORMAT' : 'ERROR'));
  const docPan = extraction.fields.pan;
  const docName = extraction.fields.name;
  const registryName = (b.registered_name as string) ?? null;

  const rows: ComparisonRow[] = [
    {
      field: 'PAN',
      document: docPan,
      apiRegistry: status === 'NOT_FOUND' || status === 'INVALID_FORMAT' ? null : (b.pan as string) ?? null,
      bidderRecord: view.bidder.pan,
      result: !docPan ? 'NOT_AVAILABLE' : docPan === view.bidder.pan ? 'MATCH' : 'MISMATCH',
      note: docPan && docPan !== view.bidder.pan ? 'PAN on the document differs from the PAN declared in the bid' : undefined,
    },
    {
      field: 'PAN status',
      document: null,
      apiRegistry: status,
      bidderRecord: null,
      result: status === 'VALID' ? 'MATCH' : status === 'NOT_FOUND' ? 'NOT_AVAILABLE' : 'MISMATCH',
      note: (b.remarks as string) ?? (b.message as string) ?? undefined,
    },
    {
      field: 'Name',
      document: docName,
      apiRegistry: registryName,
      bidderRecord: view.bidder.companyName,
      result: !registryName ? 'NOT_AVAILABLE' : b.name_match === 'MATCH' ? 'MATCH' : 'MISMATCH',
      note: b.name_match_score !== undefined ? `Registry name-match score ${b.name_match_score}` : undefined,
    },
    {
      field: 'Category',
      document: extraction.fields.category,
      apiRegistry: (b.category as string) ?? null,
      bidderRecord: null,
      result: !b.category || !extraction.fields.category ? 'NOT_AVAILABLE' : norm(b.category) === norm(extraction.fields.category) ? 'MATCH' : 'MISMATCH',
    },
  ];

  // Registry-level results take precedence; every issue found is listed in the summary.
  const issues: string[] = [];
  let verdict: PanVerdict = 'VERIFIED';
  if (status === 'NOT_FOUND') {
    verdict = 'PAN_NOT_FOUND';
    issues.push(`PAN ${docPan} was not found in the PAN registry.`);
  } else if (status === 'INVALID_FORMAT') {
    verdict = 'PAN_INVALID';
    issues.push(`The extracted value "${docPan}" is not a valid PAN format; the registry rejected the request.`);
  } else if (status !== 'VALID') {
    verdict = 'PAN_INVALID';
    issues.push(`The registry reports PAN ${docPan} as ${status}. ${b.remarks ?? ''}`.trim());
  } else if (b.name_match !== 'MATCH') {
    verdict = 'NAME_MISMATCH';
    issues.push(`PAN is VALID, but it is registered to "${registryName}", not "${docName}" as printed on the document.`);
  }
  if (docPan && docPan !== view.bidder.pan) {
    if (verdict === 'VERIFIED') verdict = 'PAN_MISMATCH';
    issues.push(`The document's PAN (${docPan}) differs from the PAN declared in the bid (${view.bidder.pan}).`);
  }
  let summary = issues.length
    ? issues.join(' ')
    : `PAN ${docPan} is VALID and registered to ${registryName}, matching the document and the bid.`;
  if (extraction.warnings.length) summary += ` Note: ${extraction.warnings.join('; ')}.`;
  return { rows, verdict, summary };
}

export async function callPanApi(pan: string, name: string | null): Promise<{ request: ApiRequestRecord; response: ApiResponseRecord }> {
  const url = `${config.govGatewayUrl}/v1/pan/verify`;
  const body = { pan, name };
  const request: ApiRequestRecord = {
    apiName: PAN_API_NAME,
    method: 'POST',
    url,
    headers: { 'content-type': 'application/json', 'x-api-key': '••••••••' },
    body,
    sentAt: new Date().toISOString(),
  };
  const started = performance.now();
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': config.govGatewayKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`PAN Verification API not reachable at ${config.govGatewayUrl}.`);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (res.status === 401) throw new Error('PAN Verification API rejected the API key.');
  if (res.status >= 500) throw new Error(`PAN Verification API returned HTTP ${res.status}.`);
  return {
    request,
    response: {
      httpStatus: res.status,
      latencyMs: Math.round(performance.now() - started),
      receivedAt: new Date().toISOString(),
      body: res.status === 400 ? (json.detail ?? json) : json,
    },
  };
}

/** Creates the run and returns it immediately; the stages then continue in the background. */
export async function startPanVerification(db: SupabaseClient, userId: string, officerName: string, bidId: string, source: DocumentSource) {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');
  const { bytes, doc } = await resolveDocument(view, source);

  const inserted = must<any>(
    await db
      .from('document_verification_runs')
      .insert({ bid_id: bidId, document_type: 'PAN', initiated_by: userId, status: 'QUEUED', document: doc })
      .select('*')
      .single(),
    'document verification run',
  );
  // On Vercel, waitUntil keeps the function alive until the pipeline finishes; locally the
  // promise simply runs in the long-lived server.
  waitUntil(processRun(db, view, inserted.id, bytes, doc, officerName));
  return mapRun(inserted);
}

async function processRun(db: SupabaseClient, view: BidView, runId: string, bytes: Buffer, doc: PipelineDocument, officerName: string) {
  const update = async (patch: Record<string, unknown>) => {
    const { error } = await db.from('document_verification_runs').update(patch).eq('id', runId);
    if (error) throw new Error(`Could not save pipeline progress: ${error.message}`);
  };
  const audit = (summary: string, details: string, actor = 'Document verification pipeline') =>
    db.from('audit_events').insert({
      bid_id: view.bid.id,
      tender_id: view.tender.id,
      actor_profile_id: null,
      actor_display_name: actor,
      actor_role: 'Automated service',
      action_type: 'SYSTEM_AI',
      summary,
      details,
    });

  try {
    await audit('PAN verification started', `${officerName} started PAN verification on ${doc.fileName} (${doc.source.replace('_', ' ')}).`);

    await update({ status: 'OCR_RUNNING' });
    const ocr = await engine<OcrResult & { fileName: string }>('/api/v1/documents/ocr', {
      fileName: doc.fileName,
      mimeType: doc.mimeType,
      contentBase64: bytes.toString('base64'),
    });
    await update({ ocr_result: ocr, status: 'EXTRACTING' });

    const extraction = await engine<ExtractionResult>('/api/v1/documents/extract', { documentType: 'PAN', ocrText: ocr.text });
    await update({ extraction_result: extraction });
    if (!extraction.fields.pan) throw new Error('The extraction model did not find a PAN in the document.');

    await update({
      status: 'CALLING_API',
      api_request: {
        apiName: PAN_API_NAME,
        method: 'POST',
        url: `${config.govGatewayUrl}/v1/pan/verify`,
        headers: { 'content-type': 'application/json', 'x-api-key': '••••••••' },
        body: { pan: extraction.fields.pan, name: extraction.fields.name },
        sentAt: new Date().toISOString(),
      } satisfies ApiRequestRecord,
    });
    const { request, response } = await callPanApi(extraction.fields.pan, extraction.fields.name);
    await db.from('external_api_calls').insert({
      run_id: runId,
      bid_id: view.bid.id,
      api_name: PAN_API_NAME,
      method: request.method,
      url: request.url,
      request_body: request.body,
      response_status: response.httpStatus,
      response_body: response.body,
      latency_ms: response.latencyMs,
    });
    await update({ api_request: request, api_response: response });

    const result = compare(view, extraction, response);
    await update({
      comparison: { rows: result.rows, summary: result.summary },
      verdict: result.verdict,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
    });
    await audit(`PAN verification: ${result.verdict.replace(/_/g, ' ').toLowerCase()}`, result.summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('document_verification_runs')
      .update({ status: 'FAILED', verdict: 'ERROR', error: message, completed_at: new Date().toISOString() })
      .eq('id', runId);
    await audit('PAN verification failed', message);
  }
}

/** Deletes an officer-uploaded file from storage (e.g. a personal PAN card used for a test); the run keeps its results. */
export async function deleteUpload(db: SupabaseClient, userId: string, runId: string, officerName: string) {
  const run = mustOne<any>(await db.from('document_verification_runs').select('id, bid_id, document').eq('id', runId).maybeSingle(), 'document verification run');
  if (!run) throw new HttpError(404, 'Verification run not found.', 'NOT_FOUND');
  const doc = run.document as PipelineDocument;
  if (doc.source !== 'officer_upload') throw new HttpError(400, 'Only files uploaded by an officer can be deleted.', 'VALIDATION');
  if (doc.deletedAt) return mapRun(run);
  const { error } = await serviceClient.storage.from(BUCKET).remove([doc.path]);
  if (error) throw new HttpError(502, `Storage error: ${error.message}`, 'STORAGE_ERROR');
  const updated = must<any>(
    await db.from('document_verification_runs').update({ document: { ...doc, deletedAt: new Date().toISOString() } }).eq('id', runId).select('*').single(),
    'document verification run',
  );
  const { data: bid } = await db.from('bids').select('tender_id').eq('id', run.bid_id).maybeSingle();
  await db.from('audit_events').insert({
    bid_id: run.bid_id,
    tender_id: bid?.tender_id ?? null,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: 'Procurement officer',
    action_type: 'OFFICER_ACTION',
    summary: 'Uploaded document deleted',
    details: `${officerName} deleted the uploaded file ${doc.fileName} from storage (SHA-256 ${doc.sha256.slice(0, 16)}…). The verification result is kept.`,
  });
  return mapRun(updated);
}
