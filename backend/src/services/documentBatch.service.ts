// Document intelligence over a whole bid package ("Read all documents"):
//
//   every stored bid document → NVIDIA Nemotron OCR V2 → NVIDIA extraction (schema per document type)
//     → compare with the bid record (PAN documents also go to the PAN registry)
//   then one cross-document consistency check: name, PAN, GSTIN, Udyam number and EPFO code must
//   agree across all documents and the bid record.
//
// Each document gets its own document_verification_runs row (grouped by batch_id) that is updated
// after every stage, and the batch row gets the consistency result, so the officer's screen
// streams everything through Supabase Realtime.

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { mapBatchRow, mapRunRow } from '../../../shared/domain/pipeline.js';
import { getBidView, type BidView } from '../../../shared/domain/selectors.js';
import type {
  BidDocument,
  ComparisonRow,
  ConsistencyCheck,
  DocumentType,
  DocumentVerdict,
  ExtractionResult,
  OcrResult,
  PipelineDocument,
} from '../../../shared/domain/types.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { nameMatches } from '../registries/adapters.js';
import { callPanApi, compare as comparePan, download, engine } from './documentPipeline.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Which extraction schema reads the document that supports each tender requirement. */
export const DOCUMENT_TYPE_BY_REQUIREMENT: Record<string, DocumentType> = {
  'REQ-01': 'FINANCIAL_STATEMENTS',
  'REQ-02': 'GST_CERTIFICATE',
  'REQ-03': 'UDYAM_CERTIFICATE',
  'REQ-04': 'MAKE_IN_INDIA',
  'REQ-05': 'OEM_AUTHORIZATION',
  'REQ-06': 'EMD',
  'REQ-07': 'PAN',
  'REQ-08': 'EPFO_ESIC',
  'REQ-09': 'PAST_PERFORMANCE',
  'REQ-10': 'TEST_REPORT',
  'REQ-11': 'AFFIDAVIT',
  'REQ-12': 'LAND_BORDER',
};

/** The field that carries the bidder's name on each document type. */
const NAME_FIELD: Record<DocumentType, string> = {
  PAN: 'name',
  GST_CERTIFICATE: 'legal_name',
  UDYAM_CERTIFICATE: 'enterprise_name',
  OEM_AUTHORIZATION: 'authorized_partner',
  FINANCIAL_STATEMENTS: 'entity_name',
  MAKE_IN_INDIA: 'entity_name',
  EMD: 'entity_name',
  EPFO_ESIC: 'entity_name',
  PAST_PERFORMANCE: 'entity_name',
  TEST_REPORT: 'entity_name',
  AFFIDAVIT: 'entity_name',
  LAND_BORDER: 'entity_name',
};

const CONCURRENCY = 3;

/** Network calls from a serverless function occasionally drop ("fetch failed"); retry each step. */
async function retry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 700 * i));
    }
  }
}

const num = (s: string | null | undefined): number | null => {
  const m = (s ?? '').replace(/,/g, '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const code = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Names read by OCR can carry a stray line (a stamp, a heading); the name matches if any line does. */
const sameName = (value: string | null | undefined, expected: string) => (value ?? '').split(/[\r\n]+/).some((line) => nameMatches(line, expected));
const row = (field: string, document: string | null | undefined, bidderRecord: string | null | undefined, same: boolean | null, note?: string): ComparisonRow => ({
  field,
  document: document ?? null,
  apiRegistry: null,
  bidderRecord: bidderRecord ?? null,
  result: !document || !bidderRecord || same === null ? 'NOT_AVAILABLE' : same ? 'MATCH' : 'MISMATCH',
  note,
});

const requirementCode = (view: BidView, d: BidDocument) => view.requirements.find((r) => r.id === d.requirementId)?.code ?? '';

/** What a (non-PAN) document says, compared with the bid record. */
export function compareWithBid(view: BidView, type: DocumentType, f: Record<string, string | null>): ComparisonRow[] {
  const b = view.bidder;
  const nameValue = f[NAME_FIELD[type]];
  const nameRow = row('Name', nameValue, b.companyName, nameValue ? sameName(nameValue, b.companyName) : null);
  switch (type) {
    case 'GST_CERTIFICATE':
      return [
        row('GSTIN', f.gstin, b.gstin, f.gstin ? code(f.gstin) === code(b.gstin) : null),
        row('Legal name', f.legal_name, b.companyName, f.legal_name ? sameName(f.legal_name, b.companyName) || sameName(f.trade_name, b.companyName) : null),
      ];
    case 'UDYAM_CERTIFICATE':
      return [row('Udyam number', f.udyam_number, b.udyamNumber, f.udyam_number ? code(f.udyam_number) === code(b.udyamNumber) : null), row('Enterprise name', f.enterprise_name, b.companyName, f.enterprise_name ? sameName(f.enterprise_name, b.companyName) : null)];
    case 'FINANCIAL_STATEMENTS':
      return [
        ...(['2022-23', '2023-24', '2024-25'] as const).map((fy) => {
          const doc = f[`turnover_fy_${fy.replace('-', '_')}`];
          const rec = b.turnover.find((t) => t.financialYear.includes(fy));
          const d = num(doc);
          return row(`Turnover FY ${fy}`, doc, rec ? `₹${rec.amountCr.toFixed(2)} Cr` : null, d === null || !rec ? null : Math.abs(d - rec.amountCr) < 0.005);
        }),
        ...(nameValue ? [nameRow] : []),
      ];
    case 'MAKE_IN_INDIA': {
      const d = num(f.local_content_percent);
      const rec = view.bid.makeInIndiaPercentage;
      return [row('Local content', f.local_content_percent, rec != null ? `${rec}%` : null, d === null || rec == null ? null : Math.abs(d - rec) < 0.5), ...(nameValue ? [nameRow] : [])];
    }
    case 'OEM_AUTHORIZATION':
      return [row('Authorized partner', f.authorized_partner, b.companyName, f.authorized_partner ? sameName(f.authorized_partner, b.companyName) : null), row('Warranty undertaking', f.warranty, null, null)];
    case 'EMD': {
      const emd = view.emd;
      const d = num(f.amount);
      return [
        ...(emd && emd.instrument !== 'MSME_EXEMPTION' ? [row('Amount', f.amount, `₹${emd.submittedAmount.toLocaleString('en-IN')}`, d === null ? null : d === emd.submittedAmount)] : []),
        row('Reference', f.reference, emd?.reference ?? null, f.reference && emd?.reference ? code(f.reference) === code(emd.reference) : null),
        ...(nameValue ? [nameRow] : []),
      ];
    }
    case 'EPFO_ESIC':
      return [
        row('EPFO code', f.epfo_code, b.epfoCode, f.epfo_code && b.epfoCode ? code(f.epfo_code) === code(b.epfoCode) : null),
        ...(f.esic_code ? [row('ESIC code', f.esic_code, b.esicCode, b.esicCode ? code(f.esic_code) === code(b.esicCode) : null)] : []),
        ...(nameValue ? [nameRow] : []),
      ];
    default:
      return [nameRow];
  }
}

/** Name, PAN, GSTIN, Udyam number and EPFO code across every document and the bid record. */
export function consistencyChecks(view: BidView, reads: { type: DocumentType; code: string; title: string; fields: Record<string, string | null> }[]): ConsistencyCheck[] {
  const b = view.bidder;
  const bid = { source: 'Bid record' };
  const of = (t: DocumentType) => reads.filter((r) => r.type === t);
  const build = (field: string, values: ConsistencyCheck['values'], same: (a: string, b: string) => boolean): ConsistencyCheck => {
    const [ref, ...rest] = values;
    if (!ref || rest.length === 0) return { field, values, result: 'NOT_AVAILABLE', note: 'Not printed on enough documents to compare.' };
    const off = rest.filter((v) => !same(v.value, ref.value));
    return {
      field,
      values,
      result: off.length ? 'MISMATCH' : 'MATCH',
      note: off.length ? off.map((v) => `${v.source}${v.documentCode ? ` (${v.documentCode})` : ''} shows "${v.value}"`).join('; ') + ` instead of "${ref.value}".` : `Same on ${values.length} sources.`,
    };
  };
  const sameCode = (x: string, y: string) => code(x) === code(y);

  const names = reads
    .map((r) => ({ source: r.title, documentCode: r.code, value: r.fields[NAME_FIELD[r.type]] }))
    .filter((v): v is { source: string; documentCode: string; value: string } => !!v.value);
  const gst = of('GST_CERTIFICATE').find((r) => r.fields.gstin);
  const pans = [
    { ...bid, value: b.pan },
    ...of('PAN').flatMap((r) => (r.fields.pan ? [{ source: r.title, documentCode: r.code, value: r.fields.pan }] : [])),
    ...(gst ? [{ source: 'PAN inside GSTIN (GST certificate)', documentCode: gst.code, value: gst.fields.gstin!.slice(2, 12) }] : []),
  ];
  const udyams = [
    { ...bid, value: b.udyamNumber },
    ...reads.flatMap((r) => {
      const v = r.type === 'UDYAM_CERTIFICATE' ? r.fields.udyam_number : r.type === 'EMD' && /^UDYAM/i.test(r.fields.reference ?? '') ? r.fields.reference : null;
      return v ? [{ source: r.title, documentCode: r.code, value: v }] : [];
    }),
  ].filter((v) => v.value);

  return [
    build('Bidder name', [{ ...bid, value: b.companyName }, ...names], (x, y) => sameName(x, y)),
    build('PAN', pans, sameCode),
    build('GSTIN', [{ ...bid, value: b.gstin }, ...(gst ? [{ source: gst.title, documentCode: gst.code, value: gst.fields.gstin! }] : [])], sameCode),
    build('Udyam number', udyams, sameCode),
    build(
      'EPFO code',
      [{ ...bid, value: b.epfoCode ?? '' }, ...of('EPFO_ESIC').flatMap((r) => (r.fields.epfo_code ? [{ source: r.title, documentCode: r.code, value: r.fields.epfo_code }] : []))].filter((v) => v.value),
      sameCode,
    ),
  ];
}

export async function listBatches(db: SupabaseClient, bidId: string) {
  const rows = must<any[]>(await db.from('document_batches').select('*').eq('bid_id', bidId).order('started_at', { ascending: false }).limit(10), 'document batches');
  return rows.map(mapBatchRow);
}

export async function listBatchRuns(db: SupabaseClient, batchId: string) {
  const rows = must<any[]>(await db.from('document_verification_runs').select('*').eq('batch_id', batchId).order('started_at'), 'batch runs');
  return rows.map(mapRunRow);
}

/** Creates the batch and one queued run per stored document, returns at once; reading continues in the background. */
export async function startDocumentBatch(db: SupabaseClient, userId: string, officerName: string, bidId: string) {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');
  const docs = view.documents.filter((d) => d.storagePath && DOCUMENT_TYPE_BY_REQUIREMENT[requirementCode(view, d)]);
  if (!docs.length) throw new HttpError(404, 'This bid has no stored documents to read.', 'NO_DOCUMENT');

  const batch = must<any>(await db.from('document_batches').insert({ bid_id: bidId, initiated_by: userId, total: docs.length }).select('*').single(), 'document batch');
  const runs = must<any[]>(
    await db
      .from('document_verification_runs')
      .insert(
        docs.map((d) => ({
          bid_id: bidId,
          batch_id: batch.id,
          document_type: DOCUMENT_TYPE_BY_REQUIREMENT[requirementCode(view, d)],
          initiated_by: userId,
          status: 'QUEUED',
          document: { path: d.storagePath, fileName: d.fileName, mimeType: d.mimeType ?? 'image/png', sizeBytes: 0, sha256: '', source: 'bid_package', code: d.id, title: d.name, requirement: requirementCode(view, d) },
        })),
      )
      .select('*'),
    'document runs',
  );
  waitUntil(processBatch(db, view, batch.id, runs.map(mapRunRow), officerName));
  return { batch: mapBatchRow(batch), runs: runs.map(mapRunRow) };
}

async function processBatch(db: SupabaseClient, view: BidView, batchId: string, runs: ReturnType<typeof mapRunRow>[], officerName: string) {
  const audit = (summary: string, details: string) =>
    db.from('audit_events').insert({
      bid_id: view.bid.id,
      tender_id: view.tender.id,
      actor_profile_id: null,
      actor_display_name: 'Document intelligence (NVIDIA)',
      actor_role: 'Automated service',
      action_type: 'SYSTEM_AI',
      summary,
      details,
    });
  try {
    await audit('Document reading started', `${officerName} started NVIDIA reading of ${runs.length} documents in the bid package.`);
    const reads: { type: DocumentType; code: string; title: string; fields: Record<string, string | null>; verdict: DocumentVerdict }[] = [];
    const queue = [...runs];
    const worker = async () => {
      for (let run = queue.shift(); run; run = queue.shift()) {
        const r = await readOne(db, view, run);
        if (r) reads.push(r);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, runs.length) }, worker));

    const consistency = consistencyChecks(view, reads);
    const mismatches = consistency.filter((c) => c.result === 'MISMATCH');
    const discrepancies = reads.filter((r) => r.verdict !== 'CONSISTENT' && r.verdict !== 'VERIFIED');
    const failed = runs.length - reads.length;
    const summary =
      `${reads.length} of ${runs.length} documents read by NVIDIA.` +
      (discrepancies.length ? ` ${discrepancies.length} ${discrepancies.length === 1 ? 'differs' : 'differ'} from the bid record (${discrepancies.map((d) => d.code).join(', ')}).` : ' All agree with the bid record.') +
      (mismatches.length ? ` Cross-document check: ${mismatches.map((m) => `${m.field.toLowerCase()} differs`).join(', ')}.` : ' Names and identifiers agree across documents.') +
      (failed ? ` ${failed} could not be read.` : '');
    await db.from('document_batches').update({ status: 'COMPLETED', consistency, summary, completed_at: new Date().toISOString() }).eq('id', batchId);
    for (const m of mismatches) await audit(`Cross-document inconsistency: ${m.field}`, m.note ?? '');
    await audit('Document reading completed', summary);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.from('document_batches').update({ status: 'FAILED', error: message, completed_at: new Date().toISOString() }).eq('id', batchId);
    await audit('Document reading failed', message);
  }
}

/** One document through OCR → extraction → comparison. Returns null when it could not be read. */
async function readOne(db: SupabaseClient, view: BidView, run: ReturnType<typeof mapRunRow>) {
  const update = (patch: Record<string, unknown>) =>
    retry(async () => {
      const { error } = await db.from('document_verification_runs').update(patch).eq('id', run.id);
      if (error) throw new Error(`Could not save progress: ${error.message}`);
    });
  const meta = run.document as PipelineDocument;
  try {
    const bytes = await retry(() => download(meta.path));
    const doc = { ...meta, sizeBytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    await update({ status: 'OCR_RUNNING', document: doc });
    const ocr = await retry(() => engine<OcrResult>('/api/v1/documents/ocr', { fileName: doc.fileName, mimeType: doc.mimeType, contentBase64: bytes.toString('base64') }));
    await update({ ocr_result: ocr, status: 'EXTRACTING' });
    const extraction = await retry(() => engine<ExtractionResult>('/api/v1/documents/extract', { documentType: run.documentType, ocrText: ocr.text }));
    await update({ extraction_result: extraction });

    let rows: ComparisonRow[];
    let verdict: DocumentVerdict;
    let summary: string;
    if (run.documentType === 'PAN') {
      if (!extraction.fields.pan) throw new Error('The extraction model did not find a PAN in the document.');
      await update({ status: 'CALLING_API' });
      const pan = extraction.fields.pan;
      const { request, response } = await retry(() => callPanApi(pan, extraction.fields.name));
      await db.from('external_api_calls').insert({
        run_id: run.id,
        bid_id: view.bid.id,
        api_name: request.apiName,
        method: request.method,
        url: request.url,
        request_body: request.body,
        response_status: response.httpStatus,
        response_body: response.body,
        latency_ms: response.latencyMs,
      });
      await update({ api_request: request, api_response: response });
      ({ rows, verdict, summary } = comparePan(view, extraction, response));
    } else {
      rows = compareWithBid(view, run.documentType, extraction.fields);
      const off = rows.filter((r) => r.result === 'MISMATCH');
      verdict = off.length ? 'DISCREPANCY' : 'CONSISTENT';
      summary = off.length
        ? off.map((r) => `${r.field}: document says "${r.document}", bid record says "${r.bidderRecord}".`).join(' ')
        : `Agrees with the bid record (${rows.filter((r) => r.result === 'MATCH').length} ${rows.filter((r) => r.result === 'MATCH').length === 1 ? 'field' : 'fields'} compared).`;
      if (extraction.warnings.length) summary += ` Note: ${extraction.warnings.join('; ')}.`;
    }
    await update({ comparison: { rows, summary }, verdict, status: 'COMPLETED', completed_at: new Date().toISOString() });
    return { type: run.documentType, code: meta.code ?? '', title: meta.title ?? meta.fileName, fields: extraction.fields, verdict };
  } catch (err) {
    await update({ status: 'FAILED', verdict: 'ERROR', error: err instanceof Error ? err.message : String(err), completed_at: new Date().toISOString() }).catch(() => {});
    return null;
  }
}
