// Reads the live Supabase tables and maps them into the normalised domain Database used by
// every screen. Runs under the officer's JWT (RLS applies).

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AuditEvent,
  Bid,
  BidDocument,
  Bidder,
  ComplianceCheck,
  Database,
  EmdTransaction,
  Finding,
  OfficerDecision,
  Recommendation,
  RiskFactor,
  Tender,
  TenderRequirement,
  User,
} from '../../../shared/domain/types.js';
import { mapPortalRow } from '../../../shared/domain/portal.js';
import { must } from '../lib/http.js';
import {
  ACTOR_FROM_DB,
  CHECK_FROM_DB,
  DECISION_TO_BID_STATUS,
  DECISION_TO_FINDING_STATUS,
  EMD_FROM_DB,
  parseClauseRef,
  parseComplianceNotes,
  parseEvidenceRequirement,
  SEVERITY_FROM_FINDING_TYPE,
  type StoredRun,
} from './conventions.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const byNewest = (key: string) => (a: Row, b: Row) => String(b[key] ?? '').localeCompare(String(a[key] ?? ''));

export async function loadWorkspace(db: SupabaseClient): Promise<Database> {
  const q = (table: string, select = '*') => db.from(table).select(select);
  const [profiles, tenders, requirements, companies, turnover, bids, documents, emd, checks, evidence, risks, recs, points, decisions, audit, runs, portal] =
    await Promise.all([
      q('profiles'),
      q('tenders').order('id'),
      q('tender_requirements'),
      q('companies'),
      q('company_turnover'),
      q('bids').order('id'),
      q('bid_documents'),
      q('bid_emd'),
      q('compliance_check_items'),
      q('evidence_items'),
      q('risk_factors'),
      q('ai_recommendations'),
      q('ai_recommendation_points'),
      q('officer_decisions'),
      q('audit_events'),
      q('ai_verification_runs', 'id, bid_id, status, steps, started_at, completed_at'),
      q('portal_verifications').order('checked_at', { ascending: false }).limit(500),
    ]);

  const P = must<Row[]>(profiles, 'profiles');
  const T = must<Row[]>(tenders, 'tenders');
  const R = must<Row[]>(requirements, 'tender requirements');
  const C = must<Row[]>(companies, 'companies');
  const TO = must<Row[]>(turnover, 'turnover');
  const B = must<Row[]>(bids, 'bids');
  const D = must<Row[]>(documents, 'documents');
  const E = must<Row[]>(emd, 'EMD');
  const CK = must<Row[]>(checks, 'compliance checks');
  const EV = must<Row[]>(evidence, 'findings');
  const RF = must<Row[]>(risks, 'risk factors');
  const RC = must<Row[]>(recs, 'recommendations');
  const PT = must<Row[]>(points, 'recommendation points');
  const OD = must<Row[]>(decisions, 'decisions');
  const AU = must<Row[]>(audit, 'audit events');
  const RN = must<Row[]>(runs, 'verification runs');
  const PV = must<Row[]>(portal, 'portal verifications');

  const bidById = new Map(B.map((b) => [b.id, b]));
  const companyById = new Map(C.map((c) => [c.id, c]));
  const reqKey = (tenderId: string, code: string) => `${tenderId}:${code}`;

  // Clause per requirement comes from the document clause references (see conventions).
  const clauseByReq = new Map<string, string>();
  for (const d of D) {
    const { code, clause } = parseClauseRef(d.tender_clause_reference);
    const tenderId = bidById.get(d.bid_id)?.tender_id;
    if (code && clause && tenderId) clauseByReq.set(reqKey(tenderId, code), clause);
  }

  const latestDecisionByBid = new Map<string, Row>();
  for (const d of [...OD].sort(byNewest('created_at'))) if (!latestDecisionByBid.has(d.bid_id)) latestDecisionByBid.set(d.bid_id, d);

  const latestRunByBid = new Map<string, Row>();
  // Only runs written by this backend/seed carry per-requirement detail; ignore other formats
  // (e.g. rows written by older clients sharing the database) and failed runs.
  const isDetailedRun = (steps: unknown): steps is StoredRun =>
    !!steps && (steps as StoredRun).kind === 'bidsure.verification.v1' && !(steps as StoredRun).error && Array.isArray((steps as StoredRun).checks) && (steps as StoredRun).checks.length > 0;
  for (const r of [...RN].filter((r) => r.status === 'COMPLETED' && isDetailedRun(r.steps)).sort(byNewest('completed_at')))
    if (!latestRunByBid.has(r.bid_id)) latestRunByBid.set(r.bid_id, r);

  const latestRecByBid = new Map<string, Row>();
  for (const r of [...RC].sort(byNewest('created_at'))) if (!latestRecByBid.has(r.bid_id)) latestRecByBid.set(r.bid_id, r);

  // ---------------------------------------------------------------- reference data
  const usersOut: User[] = P.map((p) => ({
    id: p.id,
    employeeId: p.badge_id ?? '',
    email: p.email,
    name: p.full_name ?? p.email,
    designation: p.designation ?? '',
    division: '',
    organization: p.organization ?? '',
    role: p.role === 'ADMIN' ? 'Administrator' : 'Procurement Officer',
  }));
  const profileById = new Map(usersOut.map((u) => [u.id, u]));

  const tendersOut: Tender[] = T.map((t) => ({
    id: t.id,
    title: t.title,
    category: t.category,
    division: t.division,
    estimatedValue: Number(t.estimated_value),
    emdAmount: Number(t.emd_amount),
    publishDate: t.publish_date,
    deadlineDate: t.deadline_date,
    technicalOpeningDate: t.technical_opening_date,
    status: t.status === 'COMMERCIAL_EVALUATION' ? 'UNDER_EVALUATION' : t.status,
    description: t.description,
    officerInCharge: t.officer_in_charge,
  }));

  const requirementsOut: TenderRequirement[] = R.map((r) => ({
    id: reqKey(r.tender_id, r.display_code),
    code: r.display_code,
    tenderId: r.tender_id,
    clause: clauseByReq.get(reqKey(r.tender_id, r.display_code)) ?? '',
    category: r.category,
    title: r.title,
    criterion: r.criterion,
    benchmark: r.benchmark_value ?? '',
    mandatory: r.mandatory,
  })).sort((a, b) => a.id.localeCompare(b.id));

  const documentsOut: BidDocument[] = D.map((d) => {
    const tenderId = bidById.get(d.bid_id)?.tender_id ?? '';
    const { code } = parseClauseRef(d.tender_clause_reference);
    return {
      id: d.display_code,
      bidId: d.bid_id,
      requirementId: code ? reqKey(tenderId, code) : '',
      name: d.name,
      fileName: d.file_name,
      fileSize: d.file_size,
      uploadedAt: d.upload_timestamp,
      extractedText: d.extracted_snippet ?? '',
      storagePath: d.storage_path ?? undefined,
      mimeType: d.mime_type ?? undefined,
    };
  }).sort((a, b) => a.id.localeCompare(b.id));

  const biddersOut: Bidder[] = C.map((c) => {
    // MSE category is read from the bidder's Udyam certificate (no dedicated column).
    const companyBids = new Set(B.filter((b) => b.company_id === c.id).map((b) => b.id));
    const udyamDoc = documentsOut.find((d) => companyBids.has(d.bidId) && d.requirementId.endsWith(':REQ-03'));
    const category = /Category:\s*([^|]+)/.exec(udyamDoc?.extractedText ?? '')?.[1]?.trim();
    return {
      id: c.vendor_code,
      companyName: c.company_name,
      incorporationDate: c.incorporation_date,
      registeredAddress: c.registered_address,
      gstin: c.gstin,
      pan: c.pan,
      udyamNumber: c.udyam_number ?? '',
      msmeCategory: category,
      cin: c.cin ?? undefined,
      epfoCode: c.epfo_code ?? undefined,
      esicCode: c.esic_code ?? undefined,
      dpiitNumber: c.dpiit_number ?? undefined,
      nsicNumber: c.nsic_number ?? undefined,
      turnover: TO.filter((t) => t.company_id === c.id)
        .map((t) => ({ financialYear: t.financial_year, amountCr: Number(t.turnover_amount) / 1e7 }))
        .sort((a, b) => a.financialYear.localeCompare(b.financialYear)),
    };
  });

  // ---------------------------------------------------------------- findings (evidence)
  const evidenceCodeByUuid = new Map(EV.map((e) => [e.id, e.display_code]));
  const findingsOut: Finding[] = EV.map((e) => {
    const bid = bidById.get(e.bid_id);
    const code = parseEvidenceRequirement(e.requirement_title) ?? '';
    const run = latestRunByBid.get(e.bid_id)?.steps as StoredRun | undefined;
    const detail = run?.checks?.find((c) => c.requirementCode === code)?.finding ?? undefined;
    const doc = documentsOut.find((d) => d.bidId === e.bid_id && d.fileName === e.submitted_document_name);
    const decision = latestDecisionByBid.get(e.bid_id);
    return {
      id: e.display_code,
      bidId: e.bid_id,
      requirementId: reqKey(bid?.tender_id ?? '', code),
      documentId: doc?.id,
      title: e.ai_finding,
      severity: SEVERITY_FROM_FINDING_TYPE[e.finding_type] ?? 'MEDIUM',
      expected: e.tender_clause_requirement,
      submitted: detail?.submitted ?? '',
      comparison: detail?.comparison ?? '',
      evidenceExcerpt: e.document_snippet,
      evidenceSource: e.source,
      impact: detail?.impact ?? '',
      suggestedAction: detail?.suggestedAction ?? '',
      detectedAt: e.verification_timestamp,
      status: decision ? DECISION_TO_FINDING_STATUS[decision.decision as keyof typeof DECISION_TO_FINDING_STATUS] : 'OPEN',
    };
  });

  const checksOut: ComplianceCheck[] = CK.map((c) => {
    const bid = bidById.get(c.bid_id);
    const requirementId = reqKey(bid?.tender_id ?? '', c.display_code);
    const { submitted, note } = parseComplianceNotes(c.notes);
    return {
      id: `CHK-${c.bid_id.replace('BID-', '')}-${c.display_code.replace('REQ-', '')}`,
      bidId: c.bid_id,
      requirementId,
      documentId: documentsOut.find((d) => d.bidId === c.bid_id && d.requirementId === requirementId)?.id,
      status: CHECK_FROM_DB[c.status] ?? 'REVIEW',
      submitted,
      note,
      findingId: c.evidence_item_id ? evidenceCodeByUuid.get(c.evidence_item_id) : undefined,
    };
  });

  // ---------------------------------------------------------------- bids
  const bidsOut: Bid[] = B.map((b) => {
    const decision = latestDecisionByBid.get(b.id);
    const bidChecks = checksOut.filter((c) => c.bidId === b.id);
    const clean = bidChecks.length > 0 && bidChecks.every((c) => c.status === 'MET' || c.status === 'EXEMPTED');
    const run = latestRunByBid.get(b.id);
    return {
      id: b.id,
      tenderId: b.tender_id,
      bidderId: companyById.get(b.company_id)?.vendor_code ?? '',
      submittedAt: b.submission_timestamp,
      makeInIndiaPercentage: Number(b.make_in_india_percentage),
      complianceScore: b.overall_compliance_score,
      riskScore: b.risk_score,
      riskLevel: b.risk_level === 'CRITICAL' ? 'HIGH' : b.risk_level,
      primaryConcern: b.primary_concern ?? '',
      lastVerifiedAt: run?.completed_at ?? b.submission_timestamp,
      source: b.source === 'GEM' ? 'GEM' : 'CSAP',
      gemBidNo: b.gem_bid_no ?? undefined,
      status: decision
        ? DECISION_TO_BID_STATUS[decision.decision as keyof typeof DECISION_TO_BID_STATUS]
        : clean
          ? 'RECOMMENDED_ACCEPT'
          : 'UNDER_REVIEW',
    };
  });

  const emdOut: EmdTransaction[] = E.map((e) => ({
    bidId: e.bid_id,
    documentId: documentsOut.find((d) => d.bidId === e.bid_id && d.requirementId.endsWith(':REQ-06'))?.id ?? '',
    requiredAmount: Number(e.required_amount),
    submittedAmount: Number(e.submitted_amount),
    instrument: e.instrument_type,
    reference: e.transaction_or_bg_no,
    bankName: e.bank_name,
    branch: e.issuing_branch ?? undefined,
    paymentDate: e.payment_date,
    validUntil: e.valid_until ?? undefined,
    remitterMatchesBidder: e.bidder_match,
    result: EMD_FROM_DB[e.verification_result] ?? 'INVALID_INSTRUMENT',
    note: e.officer_note ?? '',
  }));

  const riskOut: RiskFactor[] = RF.map((r) => ({
    id: r.display_code ?? r.id,
    bidId: r.bid_id,
    category: r.category,
    title: r.title,
    level: r.level === 'CRITICAL' ? 'HIGH' : r.level,
    description: r.description,
    findingId: r.evidence_item_id ? evidenceCodeByUuid.get(r.evidence_item_id) : undefined,
  }));

  const recsOut: Recommendation[] = [...latestRecByBid.values()].map((r) => {
    const pts = PT.filter((p) => p.ai_recommendation_id === r.id).sort((a, b) => a.sort_order - b.sort_order);
    return {
      bidId: r.bid_id,
      suggestedDecision: r.suggested_action,
      summary: r.summary,
      rationale: r.details,
      strengths: pts.filter((p) => p.kind === 'PRO').map((p) => p.point_text),
      concerns: pts.filter((p) => p.kind === 'CON').map((p) => p.point_text),
      generatedAt: r.created_at,
    };
  });

  const decisionsOut: OfficerDecision[] = OD.map((d) => {
    const officer = profileById.get(d.officer_profile_id);
    const recAtTime = [...RC]
      .filter((r) => r.bid_id === d.bid_id && r.created_at <= d.created_at)
      .sort(byNewest('created_at'))[0] ?? latestRecByBid.get(d.bid_id);
    return {
      id: d.id,
      bidId: d.bid_id,
      tenderId: d.tender_id,
      decision: d.decision,
      reason: d.justification_reason,
      remarks: d.remarks,
      officerId: d.officer_profile_id,
      officerName: officer?.name ?? 'Procurement Officer',
      officerDesignation: officer?.designation ?? '',
      decidedAt: d.created_at,
      followedRecommendation: recAtTime?.suggested_action === d.decision,
    };
  });

  const auditOut: AuditEvent[] = AU.map((a) => ({
    id: a.id,
    timestamp: a.created_at,
    tenderId: a.tender_id ?? bidById.get(a.bid_id)?.tender_id ?? '',
    bidId: a.bid_id ?? undefined,
    actorType: ACTOR_FROM_DB[a.action_type] ?? 'SYSTEM',
    actor: a.actor_display_name,
    summary: a.summary,
    details: a.details,
    seq: a.seq ?? undefined,
    entryHash: a.entry_hash ?? undefined,
  }));

  return {
    users: usersOut,
    tenders: tendersOut,
    requirements: requirementsOut,
    bidders: biddersOut,
    bids: bidsOut,
    documents: documentsOut,
    emdTransactions: emdOut,
    complianceChecks: checksOut,
    findings: findingsOut,
    riskFactors: riskOut,
    recommendations: recsOut,
    decisions: decisionsOut,
    auditEvents: auditOut,
    portalVerifications: PV.map(mapPortalRow),
  };
}
