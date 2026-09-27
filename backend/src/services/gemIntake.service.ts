// CSAP side of the GeM integration: the intake webhook and the automatic verification pipeline.
//
//   GeM (simulated) --signed webhook--> /api/integrations/gem/bids
//     1. verify the HMAC signature and timestamp
//     2. create the bidder, bid, EMD record and documents (files copied into CSAP's own storage)
//     3. in the background: NVIDIA reads every document -> the extracted values become the
//        documents' text -> the rules engine checks all requirements -> findings, risk and the
//        recommendation are saved -> every government registry is checked
// Each stage writes an audit event, so the officer sees the bid appear and progress live.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { waitUntil } from '@vercel/functions';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEnginePayload } from '../../../shared/domain/enginePayload.js';
import { applyDocumentEvidence } from '../../../shared/domain/documentEvidence.js';
import { getBidView, type BidView } from '../../../shared/domain/selectors.js';
import type { CheckStatus, DocumentType, DocumentVerificationRun } from '../../../shared/domain/types.js';
import { buildSteps } from '../../../shared/domain/verification.js';
import { config } from '../config/env.js';
import { CHECK_TO_DB, complianceNotes, docClauseRef, evidenceRequirementTitle, SEVERITY_TO_FINDING_TYPE, type StoredRun } from '../db/conventions.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';
import { DOCUMENT_TYPE_BY_REQUIREMENT, readAllDocumentsNow } from './documentBatch.service.js';
import { engine } from './documentPipeline.service.js';
import { verifyWithEngine } from './engine.client.js';
import { runPortalChecksNow } from './portal.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface GemBidPayload {
  gemBidNo: string;
  tenderId: string;
  submittedAt: string;
  company: {
    name: string;
    pan: string;
    gstin: string;
    udyamNumber?: string;
    msmeCategory?: string;
    cin?: string;
    epfoCode?: string;
    esicCode?: string;
    incorporationDate?: string;
    address?: string;
  };
  declared: {
    turnover: { financialYear: string; amountCr: number }[];
    makeInIndiaPercentage: number;
    emd: { instrument: 'NEFT_RTGS' | 'BANK_GUARANTEE' | 'MSME_EXEMPTION' | 'DEMAND_DRAFT'; amount: number; reference: string; bankName: string; paymentDate?: string; validUntil?: string };
  };
  documents: { requirementCode: string; name: string; path: string; fileName: string; mimeType: string; sizeBytes: number }[];
}

export const sign = (timestamp: string, rawBody: string) => createHmac('sha256', config.gemWebhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');

/** Rejects unsigned, wrongly signed or stale (> 5 minutes) deliveries. */
export function verifySignature(rawBody: Buffer | undefined, timestamp: string | undefined, signature: string | undefined) {
  if (!rawBody || !timestamp || !signature) throw new HttpError(401, 'Missing GeM signature headers.', 'SIGNATURE_MISSING');
  const age = Math.abs(Date.now() - Date.parse(timestamp));
  if (!Number.isFinite(age) || age > 5 * 60_000) throw new HttpError(401, 'GeM delivery timestamp is too old.', 'SIGNATURE_STALE');
  const expected = Buffer.from(`sha256=${sign(timestamp, rawBody.toString('utf8'))}`);
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) throw new HttpError(401, 'GeM signature does not match.', 'SIGNATURE_INVALID');
}

const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** NVIDIA fields -> the "Label: value" text the rules engine reads (same labels as bid-package documents). */
export function fieldsToText(type: DocumentType, f: Record<string, string | null>): string {
  const parts = (pairs: [string, string | null | undefined][]) =>
    pairs.filter(([, v]) => v != null && String(v).trim() !== '').map(([k, v]) => `${k}: ${v}`).join(' | ');
  switch (type) {
    case 'GST_CERTIFICATE':
      return parts([['GSTIN', f.gstin], ['Legal Name', f.legal_name], ['Status', f.registration_type]]);
    case 'UDYAM_CERTIFICATE':
      return parts([['Udyam No', f.udyam_number], ['Enterprise', f.enterprise_name], ['Category', f.category]]);
    case 'FINANCIAL_STATEMENTS':
      return parts([['FY 2022-23', f.turnover_fy_2022_23], ['FY 2023-24', f.turnover_fy_2023_24], ['FY 2024-25', f.turnover_fy_2024_25], ['UDIN', f.udin]]);
    case 'MAKE_IN_INDIA':
      return parts([['Declared Local Content', f.local_content_percent], ['Classification', f.classification], ['Manufacturing Location', f.manufacturing_location]]);
    case 'OEM_AUTHORIZATION': {
      const warranty = f.warranty && !/not stated/i.test(f.warranty) ? ['Warranty', f.warranty] : ['Warranty Clause', 'Not stated'];
      return parts([['Manufacturer', f.manufacturer], ['Authorized Partner', f.authorized_partner], warranty as [string, string], ['Valid Until', f.valid_until]]);
    }
    case 'EMD':
      return parts([['Transaction ID', f.reference], ['Amount', f.amount], ['Bank', f.bank], ['Valid Until', f.valid_until]]);
    case 'PAN':
      return parts([['PAN', f.pan], ['Name', f.name]]);
    case 'EPFO_ESIC':
      return parts([['EPFO Code', f.epfo_code], ['ESIC Code', f.esic_code], ['Latest ECR Paid', f.latest_return_month]]);
    case 'PAST_PERFORMANCE':
      return parts([['PO', f.order_1], ['PO', f.order_2]]);
    case 'TEST_REPORT':
      return parts([['Lab', f.laboratory], ['Standard', f.standard], ['Verdict', f.result]]);
    case 'AFFIDAVIT':
      return parts([['Affidavit Dated', f.date], ['Declaration', f.declaration]]);
    case 'LAND_BORDER':
      return parts([['Declaration', f.declaration], ['Signed', f.signatory]]);
  }
}

async function nextBidId(db: SupabaseClient) {
  const rows = must<any[]>(await db.from('bids').select('id'), 'bids');
  const max = rows.reduce((m, r) => Math.max(m, Number(/^BID-(\d+)$/.exec(r.id)?.[1] ?? 0)), 0);
  return `BID-${String(max + 1).padStart(3, '0')}`;
}

function validate(p: GemBidPayload) {
  const bad = (m: string) => new HttpError(400, m, 'VALIDATION');
  if (!/^GEM\/\d{4}\/B\/\d{4,8}$/.test(p.gemBidNo ?? '')) throw bad('gemBidNo is missing or malformed.');
  if (!p.company?.name?.trim()) throw bad('Company name is required.');
  if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(p.company.pan ?? '')) throw bad('PAN is not valid.');
  if (!/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(p.company.gstin ?? '')) throw bad('GSTIN is not valid.');
  if (p.company.gstin.slice(2, 12) !== p.company.pan) throw bad('The PAN inside the GSTIN does not match the PAN.');
  if (!Array.isArray(p.documents) || !p.documents.length) throw bad('At least one document is required.');
  if (!(p.declared?.makeInIndiaPercentage >= 0 && p.declared.makeInIndiaPercentage <= 100)) throw bad('Local content must be 0 to 100%.');
}

/** Webhook handler: records the bid and starts automatic verification. Idempotent per GeM bid number. */
export async function receiveGemBid(payload: GemBidPayload) {
  validate(payload);
  const db = serviceClient;
  const existing = must<any[]>(await db.from('bids').select('id').eq('gem_bid_no', payload.gemBidNo), 'bids');
  if (existing[0]) return { csapBidId: existing[0].id as string, duplicate: true };

  const ws = await loadWorkspace(db);
  const tender = ws.tenders.find((t) => t.id === payload.tenderId);
  if (!tender) throw new HttpError(404, `Tender ${payload.tenderId} is not known to CSAP.`, 'NOT_FOUND');
  if (tender.status !== 'OPEN_FOR_BIDS') throw new HttpError(409, `Tender ${tender.id} is not open for bids.`, 'TENDER_CLOSED');
  const requirements = ws.requirements.filter((r) => r.tenderId === tender.id);
  const clauseOf = (code: string) => ws.requirements.find((r) => r.code === code && r.clause)?.clause ?? '';
  const c = payload.company;

  // Bidder: reuse the company when CSAP already knows this PAN.
  const known = must<any[]>(await db.from('companies').select('id').eq('pan', c.pan), 'companies')[0];
  let companyId: string = known?.id;
  if (companyId) {
    // Same PAN, same legal entity: the company row takes the latest declaration. Each bid keeps its
    // own declaration (declared_profile below), so earlier bids still show what was submitted then.
    must(
      await db
        .from('companies')
        .update({ company_name: c.name.trim(), registered_address: c.address?.trim() || 'Not provided', udyam_number: c.udyamNumber || null })
        .eq('id', companyId),
      'company',
    );
    for (const t of payload.declared.turnover) {
      must(
        await db
          .from('company_turnover')
          .upsert({ company_id: companyId, financial_year: t.financialYear, turnover_amount: Math.round(t.amountCr * 1e7) }, { onConflict: 'company_id,financial_year' }),
        'turnover',
      );
    }
  }
  if (!companyId) {
    companyId = must<any>(
      await db
        .from('companies')
        .insert({
          vendor_code: `V-GEM-${c.pan.slice(5, 9)}${Math.floor(Math.random() * 90 + 10)}`,
          company_name: c.name.trim(),
          incorporation_date: c.incorporationDate || '2000-01-01',
          registered_address: c.address?.trim() || 'Not provided',
          gstin: c.gstin,
          pan: c.pan,
          udyam_number: c.udyamNumber || null,
          cin: c.cin || null,
          epfo_code: c.epfoCode || null,
          esic_code: c.esicCode || null,
        })
        .select('id')
        .single(),
      'company',
    ).id;
    if (payload.declared.turnover.length) {
      must(await db.from('company_turnover').insert(payload.declared.turnover.map((t) => ({ company_id: companyId, financial_year: t.financialYear, turnover_amount: Math.round(t.amountCr * 1e7) }))), 'turnover');
    }
  }

  const bidId = await nextBidId(db);
  const n = bidId.replace('BID-', '').replace(/^0+/, '');
  must(
    await db.from('bids').insert({
      id: bidId,
      tender_id: tender.id,
      company_id: companyId,
      make_in_india_percentage: payload.declared.makeInIndiaPercentage,
      overall_compliance_score: 0,
      risk_level: 'LOW',
      risk_score: 0,
      primary_concern: 'Automatic verification in progress.',
      submission_timestamp: payload.submittedAt,
      source: 'GEM',
      gem_bid_no: payload.gemBidNo,
      declared_profile: { name: c.name.trim(), address: c.address?.trim() || 'Not provided', turnover: payload.declared.turnover },
    }),
    'bid',
  );

  const docs: Record<string, unknown>[] = [];
  const e = payload.declared.emd;
  let packageNote = '';
  try {
    // A combined PDF (every document in one file) is first split into one PDF per requirement.
    // Documents uploaded separately for a requirement take precedence over pages of the combined file.
    const documents = payload.documents.filter((d) => d.requirementCode !== 'PACKAGE');
    const pkg = payload.documents.find((d) => d.requirementCode === 'PACKAGE');
    if (pkg) {
      const { data: blob, error: dl } = await db.storage.from('bid-documents').download(pkg.path);
      if (dl || !blob) throw new HttpError(502, `Could not read the combined PDF ${pkg.fileName}.`, 'STORAGE_ERROR');
      const split = await engine<{ pages: number; documents: { requirementCode: string; pages: number[]; contentBase64: string }[]; unassigned: number[] }>(
        '/api/v1/documents/split',
        { contentBase64: Buffer.from(await blob.arrayBuffer()).toString('base64'), requirements: requirements.map((r) => ({ code: r.code, title: r.title })) },
      );
      const folder = pkg.path.slice(0, pkg.path.lastIndexOf('/'));
      for (const part of split.documents) {
        if (documents.some((d) => d.requirementCode === part.requirementCode)) continue;
        const bytes = Buffer.from(part.contentBase64, 'base64');
        const path = `${folder}/${part.requirementCode}-from-package.pdf`;
        const { error: up } = await db.storage.from('bid-documents').upload(path, bytes, { contentType: 'application/pdf', upsert: true });
        if (up) throw new HttpError(502, `Could not store part of the combined PDF: ${up.message}`, 'STORAGE_ERROR');
        documents.push({
          requirementCode: part.requirementCode,
          name: requirements.find((r) => r.code === part.requirementCode)?.title ?? part.requirementCode,
          path,
          fileName: `${pkg.fileName.replace(/\.pdf$/i, '')} (page${part.pages.length > 1 ? 's' : ''} ${part.pages.join(', ')}).pdf`,
          mimeType: 'application/pdf',
          sizeBytes: bytes.length,
        });
      }
      packageNote = ` Combined PDF ${pkg.fileName}: ${split.pages} pages split into ${split.documents.length} documents${split.unassigned.length ? `; page${split.unassigned.length > 1 ? 's' : ''} ${split.unassigned.join(', ')} not matched to any requirement` : ''}.`;
    }

    // Documents: CSAP keeps its own copy of every file, separate from GeM's storage.
    for (const [i, d] of documents.entries()) {
      const req = requirements.find((r) => r.code === d.requirementCode);
      if (!req) continue;
      const code = `DOC-${n}${String(i + 1).padStart(2, '0')}`;
      const target = `${bidId}/${code}.${d.path.split('.').pop() ?? 'png'}`;
      await db.storage.from('bid-documents').remove([target]); // a leftover from an earlier demo run
      const { error } = await db.storage.from('bid-documents').copy(d.path, target);
      if (error) throw new HttpError(502, `Could not copy ${d.fileName}: ${error.message}`, 'STORAGE_ERROR');
      docs.push({
        bid_id: bidId,
        display_code: code,
        name: d.name,
        doc_type: req.category,
        file_name: d.fileName,
        file_size: sizeLabel(d.sizeBytes),
        upload_timestamp: payload.submittedAt,
        ocr_status: 'PROCESSING',
        verification_status: 'PENDING',
        status_message: 'Waiting for CSAP AI reading.',
        extracted_snippet: '',
        tender_clause_reference: docClauseRef(req.code, clauseOf(req.code)),
        storage_path: target,
        mime_type: d.mimeType,
      });
    }
    if (docs.length) must(await db.from('bid_documents').insert(docs), 'documents');

    must(
      await db.from('bid_emd').insert({
        bid_id: bidId,
        required_amount: tender.emdAmount,
        submitted_amount: e.instrument === 'MSME_EXEMPTION' ? 0 : e.amount,
        instrument_type: e.instrument,
        transaction_or_bg_no: e.reference || '—',
        bank_name: e.bankName || '—',
        valid_until: e.validUntil || null,
        payment_date: e.paymentDate || payload.submittedAt.slice(0, 10),
        payment_status: e.instrument === 'MSME_EXEMPTION' ? 'EXEMPTED' : 'SUCCESSFUL',
        bidder_match: true,
        verification_result: e.instrument === 'MSME_EXEMPTION' ? 'EXEMPTION_CONFIRMED' : e.amount >= tender.emdAmount ? 'EMD_VERIFIED' : 'EMD_AMOUNT_MISMATCH',
        officer_note: 'Declared on GeM; bank confirmation is simulated in this prototype.',
      }),
      'EMD',
    );
  } catch (err) {
    // All or nothing: never leave a half-created bid behind (documents, EMD and checks cascade).
    await db.from('bids').delete().eq('id', bidId);
    throw err;
  }

  await db.from('audit_events').insert({
    bid_id: bidId,
    tender_id: tender.id,
    actor_profile_id: null,
    actor_display_name: c.name,
    actor_role: 'Bidder (via GeM)',
    action_type: 'BIDDER_SUBMISSION',
    summary: 'Bid received from GeM',
    details: `GeM bid ${payload.gemBidNo}: ${docs.length} documents, EMD ${e.instrument === 'MSME_EXEMPTION' ? 'MSE exemption' : `₹${e.amount.toLocaleString('en-IN')}`}. Delivered by the GeM webhook (signature verified).${packageNote} Automatic verification started.`,
  });

  waitUntil(runIntakePipeline(bidId).catch(() => {}));
  return { csapBidId: bidId, duplicate: false };
}

const audit = (bid: BidView, summary: string, details: string) =>
  serviceClient.from('audit_events').insert({
    bid_id: bid.bid.id,
    tender_id: bid.tender.id,
    actor_profile_id: null,
    actor_display_name: 'CSAP AI · automatic verification (NVIDIA Nemotron)',
    actor_role: 'Automated service',
    action_type: 'SYSTEM_AI',
    summary,
    details,
  });

async function viewOf(bidId: string) {
  const v = getBidView(await loadWorkspace(serviceClient), bidId);
  if (!v) throw new Error(`Bid ${bidId} disappeared.`);
  return v;
}

/** Reads the documents, runs the rules, saves the results and checks the registries. */
export async function runIntakePipeline(bidId: string, opts: { reverify?: boolean; actor?: string } = {}) {
  const actor = opts.actor ?? 'Automatic verification (GeM intake)';
  const db = serviceClient;
  let view = await viewOf(bidId);
  try {
    if (opts.reverify) {
      // Re-evaluation: the previous results are replaced by the new run (history stays in the audit trail).
      await db.from('compliance_check_items').delete().eq('bid_id', bidId);
      await db.from('risk_factors').delete().eq('bid_id', bidId);
      await db.from('evidence_items').delete().eq('bid_id', bidId);
      await audit(view, 'Re-verification started', 'The bid is being verified again with the documents now on record.');
    }
    // 1. NVIDIA reads every document; its fields become the text the rules engine checks.
    const runs: DocumentVerificationRun[] = await readAllDocumentsNow(db, actor, bidId);
    for (const r of runs) {
      const code = r.document.code;
      if (!code) continue;
      const text = r.extraction ? fieldsToText(r.documentType, r.extraction.fields) : '';
      await db
        .from('bid_documents')
        .update({ extracted_snippet: text, ocr_status: r.status === 'COMPLETED' && text ? 'COMPLETED' : 'FAILED', status_message: r.comparison?.summary ?? r.error ?? null })
        .eq('bid_id', bidId)
        .eq('display_code', code);
    }
    const read = runs.filter((r) => r.status === 'COMPLETED').length;
    await audit(view, 'Documents read by CSAP AI', `${read} of ${runs.length} documents read; the extracted values are now the input to the tender rules.`);

    // 2. Rules engine on the extracted values; persist checks, findings, risk and recommendation.
    view = await viewOf(bidId);
    const startedAt = new Date().toISOString();
    // Tender rules on the declared values, then reconciled with what each document actually shows.
    const { result, changed } = applyDocumentEvidence(
      await verifyWithEngine(buildEnginePayload(view)),
      runs,
      view.requirements.map((r) => ({ code: r.code, title: r.title, benchmark: r.benchmark, mandatory: r.mandatory })),
    );
    if (changed.length) {
      await audit(view, 'Documents contradict the bid', `${changed.join(', ')}: the document does not support what the bid declares, so ${changed.length === 1 ? 'this requirement is' : 'these requirements are'} not counted as met.`);
    }
    const statusByCode: Record<string, CheckStatus> = Object.fromEntries(result.checks.map((c) => [c.requirementCode, c.status]));
    const req = new Map(view.requirements.map((r) => [r.code, r]));
    const docFor = (code: string) => view.documents.find((d) => req.get(code)?.id === d.requirementId);
    const n = bidId.replace('BID-', '').replace(/^0+/, '');

    const withFindings = result.checks.filter((c) => c.finding);
    const evidence = withFindings.length
      ? must<any[]>(
          await db
            .from('evidence_items')
            .insert(
              withFindings.map((c, i) => ({
                bid_id: bidId,
                display_code: `EVD-${n}${String(i + 1).padStart(2, '0')}`,
                requirement_title: evidenceRequirementTitle(c.requirementCode, req.get(c.requirementCode)?.title ?? c.requirementCode),
                finding_type: SEVERITY_TO_FINDING_TYPE[c.finding!.severity],
                ai_finding: c.finding!.title,
                submitted_document_name: docFor(c.requirementCode)?.fileName ?? '—',
                document_snippet: c.finding!.evidenceExcerpt,
                tender_clause_requirement: c.finding!.expected,
                verification_timestamp: new Date().toISOString(),
                source: c.finding!.evidenceSource,
                resolution_status: 'OPEN',
              })),
            )
            .select('id, display_code, requirement_title'),
          'evidence',
        )
      : [];
    const evidenceFor = (code: string) => evidence.find((e) => String(e.requirement_title).startsWith(code))?.id ?? null;

    must(
      await db.from('compliance_check_items').insert(
        result.checks.map((c) => ({
          bid_id: bidId,
          display_code: c.requirementCode,
          requirement_name: req.get(c.requirementCode)?.title ?? c.requirementCode,
          category: req.get(c.requirementCode)?.category ?? 'POLICY',
          status: CHECK_TO_DB[c.status],
          mandatory: req.get(c.requirementCode)?.mandatory ?? true,
          score_contribution: 0,
          notes: complianceNotes(c.submitted, c.note),
          evidence_item_id: evidenceFor(c.requirementCode),
        })),
      ),
      'checks',
    );
    for (const c of result.checks) {
      const d = docFor(c.requirementCode);
      if (d) await db.from('bid_documents').update({ verification_status: CHECK_TO_DB[c.status], evidence_item_id: evidenceFor(c.requirementCode) }).eq('bid_id', bidId).eq('display_code', d.id);
    }

    const RISK_CAT: Record<string, string> = { FINANCIAL: 'FINANCIAL', EMD: 'EMD', STATUTORY: 'STATUTORY', POLICY: 'POLICY', TECHNICAL: 'ELIGIBILITY' };
    const drivers = result.risk.drivers.filter((d) => d.points > 0);
    if (drivers.length) {
      must(
        await db.from('risk_factors').insert(
          drivers.map((d, i) => {
            const check = result.checks.find((c) => c.requirementCode === d.requirementCode);
            return {
              bid_id: bidId,
              display_code: `RF-${n}${String(i + 1).padStart(2, '0')}`,
              category: d.status === 'MISSING' ? 'DOCUMENT' : RISK_CAT[req.get(d.requirementCode)?.category ?? 'POLICY'] ?? 'POLICY',
              title: check?.finding?.title ?? req.get(d.requirementCode)?.title ?? d.requirementCode,
              level: d.points >= 30 ? 'HIGH' : d.points >= 10 ? 'MEDIUM' : 'LOW',
              description: check ? `${check.submitted}. ${check.note}` : '',
              impact_score: Math.min(100, d.points),
              evidence_item_id: evidenceFor(d.requirementCode),
            };
          }),
        ),
        'risk factors',
      );
    }

    const run = must<any>(
      await db
        .from('ai_verification_runs')
        .insert({
          bid_id: bidId,
          initiated_by: null,
          status: 'COMPLETED',
          started_at: startedAt,
          completed_at: new Date().toISOString(),
          steps: { kind: 'bidsure.verification.v1', source: 'engine', engineVersion: result.engineVersion, steps: buildSteps(view, statusByCode), checks: result.checks } satisfies StoredRun,
        })
        .select('id')
        .single(),
      'verification run',
    );

    const met = result.checks.filter((c) => c.status === 'MET' || c.status === 'EXEMPTED');
    const rec = must<any>(
      await db
        .from('ai_recommendations')
        .insert({
          bid_id: bidId,
          ai_verification_run_id: run.id,
          summary: result.recommendation.summary,
          details: `${met.length} of ${result.checks.length} requirements met by the documents as read by CSAP AI. ${withFindings.length ? `Findings: ${withFindings.map((c) => c.finding!.title).join('; ')}.` : 'No exceptions found.'}`,
          suggested_action: result.recommendation.suggestedDecision,
          confidence: 0,
        })
        .select('id')
        .single(),
      'recommendation',
    );
    const points = [
      ...met.slice(0, 4).map((c, i) => ({ ai_recommendation_id: rec.id, kind: 'PRO', point_text: `${req.get(c.requirementCode)?.title}: ${c.submitted}.`, sort_order: i })),
      ...withFindings.map((c, i) => ({ ai_recommendation_id: rec.id, kind: 'CON', point_text: `${c.finding!.title}.`, sort_order: i })),
    ];
    if (points.length) must(await db.from('ai_recommendation_points').insert(points), 'recommendation points');

    const emdCheck = result.checks.find((c) => c.requirementCode === 'REQ-06');
    if (emdCheck) {
      await db
        .from('bid_emd')
        .update({
          verification_result:
            emdCheck.status === 'EXEMPTED' ? 'EXEMPTION_CONFIRMED' : emdCheck.status === 'MET' ? 'EMD_VERIFIED' : changed.includes('REQ-06') ? 'INVALID_INSTRUMENT' : 'EMD_AMOUNT_MISMATCH',
          officer_note: emdCheck.note,
        })
        .eq('bid_id', bidId);
    }

    view = await viewOf(bidId);
    const top = [...withFindings].sort((a, b) => ['HIGH', 'MEDIUM', 'LOW'].indexOf(a.finding!.severity) - ['HIGH', 'MEDIUM', 'LOW'].indexOf(b.finding!.severity))[0];
    await db
      .from('bids')
      .update({
        overall_compliance_score: view.score.score,
        risk_level: result.risk.level,
        risk_score: Math.min(100, result.risk.score),
        primary_concern: top ? top.finding!.title : 'No exceptions.',
      })
      .eq('id', bidId);
    await audit(
      view,
      'Tender rules checked',
      `${met.length} of ${result.checks.length} requirements met; ${withFindings.length} finding(s); compliance score ${view.score.score}/100; risk ${result.risk.level.toLowerCase()}. Suggested action: ${result.recommendation.suggestedDecision.replace('_', ' ').toLowerCase()} (advisory).`,
    );

    // 3. Government registries.
    await runPortalChecksNow(db, null, actor, bidId);
    await audit(view, 'Automatic verification completed', 'Documents read, tender rules checked and registries queried. The bid is ready for the officer.');
  } catch (err) {
    await audit(view, 'Automatic verification stopped', `${err instanceof Error ? err.message : String(err)}. The officer can re-run each step from the bid.`);
    await db.from('bids').update({ primary_concern: 'Automatic verification did not finish; re-run from the bid.' }).eq('id', bidId);
  }
}
