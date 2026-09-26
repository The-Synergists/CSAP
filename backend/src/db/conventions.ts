// How the domain model (shared/domain/types.ts) is stored in the existing Supabase schema
// (database/migrations). Used by both the backend (read/write) and database/seeds/seed.ts, so
// the two can never disagree. Where the schema has no dedicated column, a documented
// natural-key convention is used instead (see database/schema/schema_documentation.md).

import type {
  AuditActorType,
  BidStatus,
  CheckStatus,
  DecisionType,
  EmdResult,
  FindingSeverity,
  FindingStatus,
} from '../../../shared/domain/types.js';
import type { EngineCheck } from '../../../shared/domain/enginePayload.js';

export const CHECK_TO_DB: Record<CheckStatus, string> = {
  MET: 'VERIFIED',
  EXEMPTED: 'EXEMPTED',
  REVIEW: 'MANUAL_REVIEW',
  NOT_MET: 'MISMATCH',
  MISSING: 'PENDING',
};
export const CHECK_FROM_DB: Record<string, CheckStatus> = Object.fromEntries(
  Object.entries(CHECK_TO_DB).map(([k, v]) => [v, k as CheckStatus]),
);

export const SEVERITY_TO_FINDING_TYPE: Record<FindingSeverity, string> = {
  HIGH: 'NON_COMPLIANCE',
  MEDIUM: 'MANUAL_REVIEW',
  LOW: 'AMBIGUITY',
};
export const SEVERITY_FROM_FINDING_TYPE: Record<string, FindingSeverity> = {
  NON_COMPLIANCE: 'HIGH',
  MANUAL_REVIEW: 'MEDIUM',
  AMBIGUITY: 'LOW',
  VERIFIED: 'LOW',
};

export const EMD_TO_DB: Record<EmdResult, string> = {
  VERIFIED: 'EMD_VERIFIED',
  SHORTFALL: 'EMD_AMOUNT_MISMATCH',
  EXEMPTION_CONFIRMED: 'EXEMPTION_CONFIRMED',
  INVALID_INSTRUMENT: 'INVALID_INSTRUMENT',
};
export const EMD_FROM_DB: Record<string, EmdResult> = Object.fromEntries(
  Object.entries(EMD_TO_DB).map(([k, v]) => [v, k as EmdResult]),
);

export const ACTOR_TO_DB: Record<AuditActorType, { actionType: string; role: string }> = {
  BIDDER: { actionType: 'BIDDER_SUBMISSION', role: 'Bidder' },
  SYSTEM: { actionType: 'SYSTEM_AI', role: 'Automated service' },
  OFFICER: { actionType: 'OFFICER_ACTION', role: 'Procurement Officer' },
};
export const ACTOR_FROM_DB: Record<string, AuditActorType> = {
  BIDDER_SUBMISSION: 'BIDDER',
  SYSTEM_AI: 'SYSTEM',
  DOCUMENT_OCR: 'SYSTEM',
  OFFICER_ACTION: 'OFFICER',
};

/** Bid status is never stored — it is derived from the latest officer decision. */
export const DECISION_TO_BID_STATUS: Record<DecisionType, BidStatus> = {
  APPROVE: 'ACCEPTED',
  REJECT: 'REJECTED',
  REQUEST_CLARIFICATION: 'CLARIFICATION_REQUIRED',
  COMMITTEE_REVIEW: 'COMMITTEE_REVIEW',
};
export const DECISION_TO_FINDING_STATUS: Record<DecisionType, FindingStatus> = {
  APPROVE: 'ACCEPTED',
  REJECT: 'CONFIRMED',
  REQUEST_CLARIFICATION: 'CLARIFICATION_REQUESTED',
  COMMITTEE_REVIEW: 'REFERRED',
};

// ---- natural-key conventions -------------------------------------------------------

/** bid_documents.tender_clause_reference = "REQ-05 · Clause 5.1(b)" */
export const docClauseRef = (requirementCode: string, clause: string) => `${requirementCode} · ${clause}`;
export const parseClauseRef = (ref: string | null | undefined): { code?: string; clause?: string } => {
  const m = /^(REQ-\d+)\s*·\s*(.*)$/.exec(ref ?? '');
  return m ? { code: m[1], clause: m[2] } : {};
};

/** evidence_items.requirement_title = "REQ-06 · Earnest Money Deposit (EMD)" */
export const evidenceRequirementTitle = (code: string, title: string) => `${code} · ${title}`;
export const parseEvidenceRequirement = (value: string): string | undefined => /^(REQ-\d+)/.exec(value)?.[1];

/** compliance_check_items.notes = "<what was submitted>\n<officer-facing note>" */
export const complianceNotes = (submitted: string, note: string) => `${submitted}\n${note}`;
export const parseComplianceNotes = (notes: string | null): { submitted: string; note: string } => {
  const [submitted = '', ...rest] = (notes ?? '').split('\n');
  return { submitted, note: rest.join('\n') };
};

/**
 * ai_verification_runs.steps holds the full output of a run: the step summary plus the
 * engine's per-requirement checks (with finding narratives). The latest completed run is
 * where the detailed finding fields (submitted / comparison / impact / action) are read from.
 */
export interface StoredRun {
  kind: 'bidsure.verification.v1';
  source: 'engine' | 'seed';
  engineVersion?: string;
  steps: { id: string; label: string; status: string; detail: string }[];
  checks: EngineCheck[];
  error?: string;
}
