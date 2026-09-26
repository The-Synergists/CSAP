// Domain model for CSAP.
//
// The frontend holds a normalised, relational-style dataset (one table per entity, rows
// reference each other by id), mirroring the tables in /database/migrations. Screens never
// hardcode bid/tender facts — they read rows from the store and join them with the
// selectors in ./selectors.ts. A real backend can later replace the in-memory store without
// changing page code.

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type TenderStatus = 'UNDER_EVALUATION' | 'TECHNICAL_SCRUTINY' | 'AWARDED' | 'CANCELLED';

/** Workflow status of a bid. Only an officer decision moves a bid to ACCEPTED / REJECTED. */
export type BidStatus =
  | 'UNDER_REVIEW'
  | 'RECOMMENDED_ACCEPT'
  | 'CLARIFICATION_REQUIRED'
  | 'COMMITTEE_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED';

/** Outcome of checking one tender requirement against the bidder's submission. */
export type CheckStatus = 'MET' | 'EXEMPTED' | 'REVIEW' | 'NOT_MET' | 'MISSING';

export type FindingSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type FindingStatus = 'OPEN' | 'CLARIFICATION_REQUESTED' | 'REFERRED' | 'ACCEPTED' | 'CONFIRMED';

export type DecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_CLARIFICATION' | 'COMMITTEE_REVIEW';

export type RequirementCategory = 'STATUTORY' | 'FINANCIAL' | 'TECHNICAL' | 'EMD' | 'POLICY';

export interface User {
  id: string;
  employeeId: string;
  email: string;
  name: string;
  designation: string;
  division: string;
  organization: string;
  role: string;
}

export interface Tender {
  id: string; // e.g. GEM/2026/CPCL/001
  title: string;
  category: string;
  division: string;
  estimatedValue: number; // INR
  emdAmount: number; // INR
  publishDate: string; // ISO date
  deadlineDate: string;
  technicalOpeningDate: string;
  status: TenderStatus;
  description: string;
  officerInCharge: string;
}

export interface TenderRequirement {
  /** Unique across tenders. */
  id: string;
  /** Display code, unique within its tender, e.g. REQ-01. */
  code: string;
  tenderId: string;
  clause: string; // e.g. "Clause 3.1"
  category: RequirementCategory;
  title: string;
  criterion: string;
  benchmark: string;
  mandatory: boolean;
}

export interface Bidder {
  id: string; // vendor code, e.g. V-CPCL-7842
  companyName: string;
  incorporationDate: string;
  registeredAddress: string;
  gstin: string;
  pan: string;
  udyamNumber: string;
  msmeCategory?: string;
  /** Registry identifiers declared by the bidder (used for government portal checks). */
  cin?: string;
  epfoCode?: string;
  esicCode?: string;
  dpiitNumber?: string;
  nsicNumber?: string;
  /** Audited turnover in ₹ crore, oldest first. */
  turnover: { financialYear: string; amountCr: number }[];
}

export interface Bid {
  id: string; // BID-001
  tenderId: string;
  bidderId: string;
  submittedAt: string; // ISO datetime
  makeInIndiaPercentage: number;
  /** Outputs of the most recent verification run. */
  complianceScore: number; // 0–100
  riskScore: number; // 0–100
  riskLevel: RiskLevel;
  primaryConcern: string;
  lastVerifiedAt: string;
  status: BidStatus;
}

/** A file in the bid package. Its verification outcome lives on the ComplianceCheck that
 *  references it (one source of truth), not on the document row. */
export interface BidDocument {
  id: string;
  bidId: string;
  requirementId: string;
  name: string;
  fileName: string;
  fileSize: string;
  uploadedAt: string;
  /** Fields extracted from the document ("Label: value | Label: value"). */
  extractedText: string;
  /** Object path in the `bid-documents` storage bucket, when the file itself is stored. */
  storagePath?: string;
  mimeType?: string;
}

export type EmdInstrument = 'NEFT_RTGS' | 'BANK_GUARANTEE' | 'MSME_EXEMPTION' | 'DEMAND_DRAFT';
export type EmdResult = 'VERIFIED' | 'SHORTFALL' | 'EXEMPTION_CONFIRMED' | 'INVALID_INSTRUMENT';

export interface EmdTransaction {
  bidId: string;
  documentId: string;
  requiredAmount: number;
  submittedAmount: number;
  instrument: EmdInstrument;
  reference: string;
  bankName: string;
  branch?: string;
  paymentDate: string;
  validUntil?: string;
  remitterMatchesBidder: boolean;
  result: EmdResult;
  note: string;
}

/** One row per (bid, tender requirement). */
export interface ComplianceCheck {
  id: string;
  bidId: string;
  requirementId: string;
  documentId?: string;
  status: CheckStatus;
  /** What the bidder submitted, as read from the document. */
  submitted: string;
  note: string;
  findingId?: string;
}

/**
 * A discrepancy the verification run raised for officer attention. Captures the whole chain
 * the officer needs: requirement → submission → comparison → evidence → impact → action.
 */
export interface Finding {
  id: string; // EVD-001
  bidId: string;
  requirementId: string;
  documentId?: string;
  title: string;
  severity: FindingSeverity;
  expected: string;
  submitted: string;
  comparison: string;
  evidenceExcerpt: string;
  evidenceSource: string;
  impact: string;
  suggestedAction: string;
  detectedAt: string;
  status: FindingStatus;
}

export interface RiskFactor {
  id: string;
  bidId: string;
  category: 'STATUTORY' | 'FINANCIAL' | 'DOCUMENT' | 'EMD' | 'ELIGIBILITY' | 'POLICY';
  title: string;
  level: RiskLevel;
  description: string;
  findingId?: string;
}

export interface Recommendation {
  bidId: string;
  suggestedDecision: DecisionType;
  summary: string;
  rationale: string;
  strengths: string[];
  concerns: string[];
  generatedAt: string;
}

export interface OfficerDecision {
  id: string;
  bidId: string;
  tenderId: string;
  decision: DecisionType;
  reason: string;
  remarks: string;
  officerId: string;
  officerName: string;
  officerDesignation: string;
  decidedAt: string;
  followedRecommendation: boolean;
}

export type AuditActorType = 'BIDDER' | 'SYSTEM' | 'OFFICER';

export interface AuditEvent {
  id: string;
  timestamp: string;
  tenderId: string;
  bidId?: string;
  actorType: AuditActorType;
  actor: string;
  summary: string;
  details: string;
}

// ---------------------------------------------------------------- government portal verification

export type RegistryId = 'PAN' | 'GSTN' | 'UDYAM' | 'MCA21' | 'EPFO' | 'ESIC' | 'STARTUP_INDIA' | 'NSIC' | 'DEBARMENT' | 'DIGILOCKER';
export type RegistryMode = 'SIMULATED' | 'LIVE_PROVIDER';
export type PortalStatus = 'VERIFIED' | 'REVIEW' | 'FAILED' | 'NOT_FOUND' | 'NOT_APPLICABLE' | 'UNAVAILABLE';

/** One comparison CSAP made between the registry's answer and the bid. */
export interface PortalCheck {
  label: string;
  expected?: string | null;
  actual?: string | null;
  ok: boolean | null;
}

export interface PortalVerification {
  id: string;
  runId: string;
  bidId: string;
  registry: RegistryId;
  mode: RegistryMode;
  identifier: string | null;
  status: PortalStatus;
  summary: string;
  facts: { label: string; value: string }[];
  checks: PortalCheck[];
  request?: { method: string; url: string; body: unknown } | null;
  response?: { httpStatus: number; body: unknown } | null;
  latencyMs?: number | null;
  checkedAt: string;
}

/** The whole prototype dataset. Each array is one "table". */
export interface Database {
  users: User[];
  tenders: Tender[];
  requirements: TenderRequirement[];
  bidders: Bidder[];
  bids: Bid[];
  documents: BidDocument[];
  emdTransactions: EmdTransaction[];
  complianceChecks: ComplianceCheck[];
  findings: Finding[];
  riskFactors: RiskFactor[];
  recommendations: Recommendation[];
  decisions: OfficerDecision[];
  auditEvents: AuditEvent[];
  portalVerifications: PortalVerification[];
}

// ---------------------------------------------------------------- document verification pipeline

export type PipelineStatus = 'QUEUED' | 'OCR_RUNNING' | 'EXTRACTING' | 'CALLING_API' | 'COMPLETED' | 'FAILED';
export type PanVerdict = 'VERIFIED' | 'NAME_MISMATCH' | 'PAN_MISMATCH' | 'PAN_INVALID' | 'PAN_NOT_FOUND' | 'ERROR';
/** Non-PAN documents: does what the document says agree with the bid record? */
export type DocumentVerdict = PanVerdict | 'CONSISTENT' | 'DISCREPANCY';
export type DocumentType =
  | 'PAN'
  | 'GST_CERTIFICATE'
  | 'UDYAM_CERTIFICATE'
  | 'FINANCIAL_STATEMENTS'
  | 'MAKE_IN_INDIA'
  | 'OEM_AUTHORIZATION'
  | 'EMD'
  | 'EPFO_ESIC'
  | 'PAST_PERFORMANCE'
  | 'TEST_REPORT'
  | 'AFFIDAVIT'
  | 'LAND_BORDER';

export interface PipelineDocument {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  source: 'bid_package' | 'officer_upload' | 'sample';
  /** Bid-package documents: display code (e.g. DOC-305), title and the requirement it supports. */
  code?: string;
  title?: string;
  requirement?: string;
  /** Set when an officer deleted an uploaded file (e.g. a personal PAN card used for testing). */
  deletedAt?: string;
}

export interface OcrResult {
  model: string;
  endpoint: string;
  latencyMs: number;
  text: string;
  blocks: { text: string; confidence: number }[];
  meanConfidence: number;
}

export interface ExtractionResult {
  model: string;
  endpoint: string;
  latencyMs: number;
  documentType: string;
  /** Keys depend on the document type (see ai_engine/src/nvidia/extraction.py SCHEMAS). */
  fields: Record<string, string | null>;
  grounding: Record<string, boolean>;
  warnings: string[];
  rawOutput: string;
}

export interface ApiRequestRecord {
  apiName: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: { pan: string; name?: string | null };
  sentAt: string;
}

export interface ApiResponseRecord {
  httpStatus: number;
  latencyMs: number;
  receivedAt: string;
  body: Record<string, unknown>;
}

export interface ComparisonRow {
  field: string;
  document: string | null;
  apiRegistry: string | null;
  bidderRecord: string | null;
  result: 'MATCH' | 'MISMATCH' | 'NOT_AVAILABLE';
  note?: string;
}

export interface DocumentVerificationRun {
  id: string;
  bidId: string;
  documentType: DocumentType;
  /** Set when the run is part of a "read all documents" batch. */
  batchId?: string | null;
  bidDocumentId?: string | null;
  initiatedBy: string;
  status: PipelineStatus;
  document: PipelineDocument;
  ocr?: OcrResult | null;
  extraction?: ExtractionResult | null;
  apiRequest?: ApiRequestRecord | null;
  apiResponse?: ApiResponseRecord | null;
  comparison?: { rows: ComparisonRow[]; summary: string } | null;
  verdict?: DocumentVerdict | null;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

/** One field compared across every document in a bid package and the bid record. */
export interface ConsistencyCheck {
  field: string;
  values: { source: string; documentCode?: string; value: string }[];
  result: 'MATCH' | 'MISMATCH' | 'NOT_AVAILABLE';
  note?: string;
}

/** A "read all documents" run over a bid package. */
export interface DocumentBatch {
  id: string;
  bidId: string;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  total: number;
  consistency: ConsistencyCheck[] | null;
  summary: string | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}
