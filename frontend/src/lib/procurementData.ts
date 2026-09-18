import { supabase } from './supabaseClient';
import { formatCrore, formatINR, formatTurnoverLabel, tenderStatusLabel, bidderStatusLabel } from './format';
import type { Bid, Tender, VerificationStatus } from '../types';

const TENDER_SELECT = '*, tender_requirements(*)';
const BID_SELECT = `
  *,
  companies(*, company_turnover(*)),
  bid_documents(*),
  bid_emd(*),
  compliance_check_items(*),
  risk_factors(*),
  evidence_items(*),
  ai_recommendations(*, ai_recommendation_points(*)),
  officer_decisions(*, profiles(full_name, designation)),
  audit_events(*),
  ai_verification_runs(*, gov_portal_verification_log(*))
`;

// emd_verification_result_enum -> VerificationStatus (different vocabularies —
// bid_emd tracks *why* an EMD check resolved the way it did, verificationsSummary
// just needs the coarser pass/fail/exempt tile state).
function emdResultToVerificationStatus(result: string): VerificationStatus {
  switch (result) {
    case 'EMD_VERIFIED':
      return 'VERIFIED';
    case 'EXEMPTION_CONFIRMED':
      return 'EXEMPTED';
    default:
      return 'MISMATCH'; // EMD_AMOUNT_MISMATCH, INVALID_INSTRUMENT
  }
}

const STATUS_SEVERITY: Record<VerificationStatus, number> = {
  MISMATCH: 0,
  MANUAL_REVIEW: 1,
  PENDING: 2,
  EXEMPTED: 3,
  VERIFIED: 4,
};
function worseOf(a: VerificationStatus | undefined, b: VerificationStatus | undefined): VerificationStatus {
  if (!a) return b ?? 'PENDING';
  if (!b) return a;
  return STATUS_SEVERITY[a] <= STATUS_SEVERITY[b] ? a : b;
}

function latestLogStatus(
  logs: { portal_code: string; check_type: string; result_status: VerificationStatus; responded_at: string }[],
  portalCode: string,
  checkType: string
): VerificationStatus | undefined {
  const matches = logs.filter((l) => l.portal_code === portalCode && l.check_type === checkType);
  if (!matches.length) return undefined;
  return matches.sort((a, b) => b.responded_at.localeCompare(a.responded_at))[0].result_status;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBidRow(row: any, status: import('../types').BidderStatus, documentsRequired: number): Bid {
  const evidenceIdByUuid = new Map<string, string>();
  for (const ev of row.evidence_items ?? []) evidenceIdByUuid.set(ev.id, ev.display_code);

  const documents = (row.bid_documents ?? []).map((d: any) => ({
    id: d.display_code,
    name: d.name,
    type: d.doc_type,
    fileName: d.file_name,
    fileSize: d.file_size,
    uploadTimestamp: d.upload_timestamp,
    ocrStatus: d.ocr_status,
    verificationStatus: d.verification_status,
    statusMessage: d.status_message,
    extractedSnippet: d.extracted_snippet ?? undefined,
    tenderClauseReference: d.tender_clause_reference ?? undefined,
    hasDiscrepancy: d.evidence_item_id != null,
    evidenceId: d.evidence_item_id ? evidenceIdByUuid.get(d.evidence_item_id) : undefined,
  }));

  const complianceItems = (row.compliance_check_items ?? []).map((c: any) => ({
    id: c.display_code,
    requirementName: c.requirement_name,
    category: c.category,
    status: c.status,
    mandatory: c.mandatory,
    scoreContribution: c.score_contribution,
    notes: c.notes,
    evidenceId: c.evidence_item_id ? evidenceIdByUuid.get(c.evidence_item_id) : undefined,
  }));

  const riskFactors = (row.risk_factors ?? []).map((r: any) => ({
    id: r.display_code,
    category: r.category,
    title: r.title,
    level: r.level,
    description: r.description,
    impactScore: r.impact_score,
    evidenceId: r.evidence_item_id ? evidenceIdByUuid.get(r.evidence_item_id) : undefined,
  }));

  const evidenceItems = (row.evidence_items ?? []).map((ev: any) => ({
    id: ev.display_code,
    requirementTitle: ev.requirement_title,
    findingType: ev.finding_type,
    aiFinding: ev.ai_finding,
    submittedDocumentName: ev.submitted_document_name,
    documentSnippet: ev.document_snippet,
    tenderClauseRequirement: ev.tender_clause_requirement,
    verificationTimestamp: ev.verification_timestamp,
    source: ev.source,
    resolutionStatus: ev.resolution_status,
  }));

  const emdRow = row.bid_emd;
  const emd = emdRow && {
    requiredAmount: Number(emdRow.required_amount),
    requiredAmountFormatted: formatINR(Number(emdRow.required_amount)),
    submittedAmount: Number(emdRow.submitted_amount),
    submittedAmountFormatted: formatINR(Number(emdRow.submitted_amount)),
    instrumentType: emdRow.instrument_type,
    transactionOrBgNo: emdRow.transaction_or_bg_no,
    bankName: emdRow.bank_name,
    issuingBranch: emdRow.issuing_branch ?? undefined,
    sfmsReference: emdRow.sfms_reference ?? undefined,
    validUntil: emdRow.valid_until ?? 'N/A',
    paymentDate: emdRow.payment_date,
    paymentStatus: emdRow.payment_status,
    bidderMatch: emdRow.bidder_match,
    verificationResult: emdRow.verification_result,
    officerNote: emdRow.officer_note ?? undefined,
  };

  const allLogs = (row.ai_verification_runs ?? []).flatMap((run: any) => run.gov_portal_verification_log ?? []);
  const verificationsSummary = {
    gst: latestLogStatus(allLogs, 'GSTN', 'GSTIN_STATUS') ?? 'PENDING',
    pan: latestLogStatus(allLogs, 'INCOME_TAX', 'PAN_VALIDATION') ?? 'PENDING',
    udyam: latestLogStatus(allLogs, 'UDYAM', 'UDYAM_STATUS') ?? 'PENDING',
    incomeTax: latestLogStatus(allLogs, 'INCOME_TAX', 'ITR_FILING_STATUS') ?? 'PENDING',
    epfoEsic: worseOf(
      latestLogStatus(allLogs, 'EPFO', 'EPFO_ECR'),
      latestLogStatus(allLogs, 'ESIC', 'ESIC_ECR')
    ),
    // Derived, not a portal call: local-content % vs. the standard 50% Public
    // Procurement (Preference to Make in India) Order threshold.
    makeInIndia: (row.make_in_india_percentage >= 50 ? 'VERIFIED' : 'MISMATCH') as VerificationStatus,
    // Derived from the matching compliance item — document-based, not a portal call.
    oemAuthorization:
      complianceItems.find((c: any) => c.requirementName === 'OEM Authorization Certificate')?.status ?? 'PENDING',
    emd: emdRow ? emdResultToVerificationStatus(emdRow.verification_result) : 'PENDING',
    blacklisting: latestLogStatus(allLogs, 'CPPP_BLACKLIST', 'CPPP_BLACKLIST_CHECK') ?? 'PENDING',
  };

  const latestDecision = (row.officer_decisions ?? [])
    .slice()
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
  const officerDecision = latestDecision && {
    tenderId: row.tender_id,
    bidderId: row.id,
    bidId: row.id,
    decision: latestDecision.decision,
    officerName: latestDecision.profiles?.full_name ?? 'Procurement Officer',
    officerDesignation: latestDecision.profiles?.designation ?? 'Procurement Officer',
    timestamp: latestDecision.created_at,
    remarks: latestDecision.remarks,
    justificationReason: latestDecision.justification_reason,
    conditionsApplied: latestDecision.conditions_applied ?? undefined,
    dscSigned: latestDecision.dsc_signed,
    dscTokenId: latestDecision.dsc_token_id ?? undefined,
  };

  const auditTrail = (row.audit_events ?? [])
    .slice()
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))
    .map((a: any) => ({
      id: a.id,
      timestamp: a.created_at,
      actor: a.actor_display_name,
      actorRole: a.actor_role,
      actionType: a.action_type,
      summary: a.summary,
      details: a.details,
      hash: a.hash,
      bidId: a.bid_id ?? undefined,
      tenderId: a.tender_id ?? undefined,
    }));

  const rec = (row.ai_recommendations ?? [])
    .slice()
    .sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
  const aiRecommendation = {
    summary: rec?.summary ?? '',
    details: rec?.details ?? '',
    suggestedAction: rec?.suggested_action ?? 'COMMITTEE_REVIEW',
    pros: (rec?.ai_recommendation_points ?? [])
      .filter((p: any) => p.kind === 'PRO')
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((p: any) => p.point_text),
    cons: (rec?.ai_recommendation_points ?? [])
      .filter((p: any) => p.kind === 'CON')
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((p: any) => p.point_text),
    confidence: rec?.confidence ?? 0,
  };

  const company = row.companies;
  const turnoverLast3Years = (company?.company_turnover ?? [])
    .slice()
    .sort((a: any, b: any) => a.financial_year.localeCompare(b.financial_year))
    .map((t: any) => formatTurnoverLabel(t.financial_year, Number(t.turnover_amount)));

  return {
    id: row.id,
    bidId: row.id,
    tenderId: row.tender_id,
    bidder: {
      vendorCode: company.vendor_code,
      companyName: company.company_name,
      incorporationDate: company.incorporation_date,
      registeredAddress: company.registered_address,
      gstin: company.gstin,
      pan: company.pan,
      udyamNumber: company.udyam_number ?? '',
      makeInIndiaPercentage: row.make_in_india_percentage,
      turnoverLast3Years,
    },
    companyName: company.company_name,
    vendorCode: company.vendor_code,
    incorporationDate: company.incorporation_date,
    registeredAddress: company.registered_address,
    gstin: company.gstin,
    pan: company.pan,
    udyamNumber: company.udyam_number ?? '',
    makeInIndiaPercentage: row.make_in_india_percentage,
    turnoverLast3Years,
    overallComplianceScore: row.overall_compliance_score,
    riskLevel: row.risk_level,
    riskScore: row.risk_score,
    documentsCount: { submitted: documents.length, required: documentsRequired },
    status,
    statusLabel: bidderStatusLabel(status),
    submissionTimestamp: row.submission_timestamp,
    verificationsSummary,
    documents,
    emd,
    complianceItems,
    riskFactors,
    primaryConcern: row.primary_concern ?? '',
    evidenceItems,
    aiRecommendation,
    officerDecision,
    auditTrail,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapTenderRow(row: any, stats?: { bids_received_count: number; average_compliance: number; high_risk_count: number }): Tender {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    division: row.division,
    estimatedValue: Number(row.estimated_value),
    estimatedValueFormatted: formatCrore(Number(row.estimated_value)),
    emdAmount: Number(row.emd_amount),
    emdAmountFormatted: formatINR(Number(row.emd_amount)),
    bidsReceivedCount: stats?.bids_received_count ?? 0,
    publishDate: row.publish_date,
    deadlineDate: row.deadline_date,
    technicalOpeningDate: row.technical_opening_date,
    status: row.status,
    statusLabel: tenderStatusLabel(row.status),
    averageCompliance: Number(stats?.average_compliance ?? 0),
    highRiskCount: stats?.high_risk_count ?? 0,
    description: row.description,
    officerInCharge: row.officer_in_charge,
    requirementsCount: (row.tender_requirements ?? []).length,
    requirements: (row.tender_requirements ?? [])
      .slice()
      .sort((a: any, b: any) => a.display_code.localeCompare(b.display_code))
      .map((r: any) => ({
        id: r.display_code,
        category: r.category,
        title: r.title,
        criterion: r.criterion,
        mandatory: r.mandatory,
        benchmarkValue: r.benchmark_value ?? undefined,
      })),
  };
}

export async function fetchTenders(): Promise<Tender[]> {
  const [{ data: tenderRows, error }, { data: statsRows, error: statsErr }] = await Promise.all([
    supabase.from('tenders').select(TENDER_SELECT).order('id'),
    supabase.from('tender_bid_stats_v').select('*'),
  ]);
  if (error) throw error;
  if (statsErr) throw statsErr;
  const statsByTender = new Map((statsRows ?? []).map((s: any) => [s.tender_id, s]));
  return (tenderRows ?? []).map((row: any) => mapTenderRow(row, statsByTender.get(row.id)));
}

export async function fetchBids(): Promise<Bid[]> {
  const [{ data: bidRows, error }, { data: statusRows, error: statusErr }, { data: tenderRows, error: tErr }] =
    await Promise.all([
      supabase.from('bids').select(BID_SELECT).order('id'),
      supabase.from('bid_status_v').select('*'),
      supabase.from('tenders').select('id, tender_requirements(id)'),
    ]);
  if (error) throw error;
  if (statusErr) throw statusErr;
  if (tErr) throw tErr;

  const statusByBid = new Map((statusRows ?? []).map((s: any) => [s.bid_id, s.status]));
  const requirementsCountByTender = new Map(
    (tenderRows ?? []).map((t: any) => [t.id, (t.tender_requirements ?? []).length])
  );

  return (bidRows ?? []).map((row: any) =>
    mapBidRow(row, statusByBid.get(row.id) ?? 'UNDER_REVIEW', requirementsCountByTender.get(row.tender_id) ?? 0)
  );
}
