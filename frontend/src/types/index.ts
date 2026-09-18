// TypeScript schemas for CSAP (Central Statutory Authentication Platform)

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type VerificationStatus = 'VERIFIED' | 'MANUAL_REVIEW' | 'MISMATCH' | 'PENDING' | 'EXEMPTED';
export type TenderStatus = 'UNDER_EVALUATION' | 'TECHNICAL_SCRUTINY' | 'COMMERCIAL_EVALUATION' | 'AWARDED' | 'CANCELLED';
export type BidderStatus = 'UNDER_REVIEW' | 'RECOMMENDED_ACCEPT' | 'RECOMMENDED_REJECT' | 'CLARIFICATION_SEEKED' | 'DISQUALIFIED';
export type OfficerDecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_CLARIFICATION' | 'COMMITTEE_REVIEW';

export interface TenderRequirement {
  id: string;
  category: 'STATUTORY' | 'FINANCIAL' | 'TECHNICAL' | 'EMD' | 'POLICY';
  title: string;
  criterion: string;
  mandatory: boolean;
  benchmarkValue?: string;
}

export interface Tender {
  id: string; // e.g. GEM/2026/CPCL/001
  title: string;
  category: string;
  division: string;
  estimatedValue: number; // in INR
  estimatedValueFormatted: string;
  emdAmount: number;
  emdAmountFormatted: string;
  bidsReceivedCount: number;
  publishDate: string;
  deadlineDate: string;
  technicalOpeningDate: string;
  status: TenderStatus;
  statusLabel: string;
  averageCompliance: number;
  highRiskCount: number;
  description: string;
  officerInCharge: string;
  requirementsCount: number;
  requirements: TenderRequirement[];
}

export interface BidderDocument {
  id: string;
  name: string;
  type: string;
  fileName: string;
  fileSize: string;
  uploadTimestamp: string;
  ocrStatus: 'COMPLETED' | 'PROCESSING' | 'FAILED';
  verificationStatus: VerificationStatus;
  statusMessage: string;
  extractedSnippet?: string;
  tenderClauseReference?: string;
  hasDiscrepancy: boolean;
  evidenceId?: string;
}

export interface EmdRecord {
  requiredAmount: number;
  requiredAmountFormatted: string;
  submittedAmount: number;
  submittedAmountFormatted: string;
  instrumentType: 'BANK_GUARANTEE' | 'NEFT_RTGS' | 'MSME_EXEMPTION' | 'DEMAND_DRAFT';
  transactionOrBgNo: string;
  bankName: string;
  issuingBranch?: string;
  sfmsReference?: string;
  validUntil: string;
  paymentDate: string;
  paymentStatus: 'SUCCESSFUL' | 'PENDING' | 'FAILED' | 'EXEMPTED';
  bidderMatch: boolean;
  verificationResult: 'EMD_VERIFIED' | 'EMD_AMOUNT_MISMATCH' | 'INVALID_INSTRUMENT' | 'EXEMPTION_CONFIRMED';
  officerNote?: string;
}

export interface ComplianceCheckItem {
  id: string;
  requirementName: string;
  category: string;
  status: VerificationStatus;
  mandatory: boolean;
  scoreContribution: number;
  notes: string;
  evidenceId?: string;
}

export interface RiskFactor {
  id: string;
  category: 'STATUTORY' | 'FINANCIAL' | 'DOCUMENT' | 'EMD' | 'ELIGIBILITY' | 'POLICY';
  title: string;
  level: RiskLevel;
  description: string;
  impactScore: number;
  evidenceId?: string;
}

export interface EvidenceItem {
  id: string;
  requirementTitle: string;
  findingType: 'NON_COMPLIANCE' | 'MANUAL_REVIEW' | 'VERIFIED' | 'AMBIGUITY';
  aiFinding: string;
  submittedDocumentName: string;
  documentSnippet: string;
  tenderClauseRequirement: string;
  verificationTimestamp: string;
  source: string;
  resolutionStatus: 'OPEN' | 'CLARIFIED' | 'OVERRIDDEN' | 'RESOLVED';
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  actorRole: string;
  actionType: 'SYSTEM_AI' | 'OFFICER_ACTION' | 'BIDDER_SUBMISSION' | 'DOCUMENT_OCR';
  summary: string;
  details: string;
  hash?: string;
  bidId?: string;
  tenderId?: string;
}

export interface OfficerDecisionRecord {
  tenderId: string;
  bidderId: string;
  bidId?: string;
  decision: OfficerDecisionType;
  officerName: string;
  officerDesignation: string;
  timestamp: string;
  remarks: string;
  justificationReason: string;
  conditionsApplied?: string[];
  dscSigned: boolean;
  dscTokenId?: string;
}

export interface BidderProfile {
  vendorCode: string;
  companyName: string;
  incorporationDate: string;
  registeredAddress: string;
  gstin: string;
  pan: string;
  udyamNumber: string;
  makeInIndiaPercentage: number;
  turnoverLast3Years: string[];
}

export interface Bid {
  id: string; // e.g. BID-001
  bidId?: string; // alias
  tenderId: string; // Reference to Tender GEM/2026/CPCL/001
  bidder: BidderProfile;

  // Flattened for backward compatibility
  companyName: string;
  vendorCode: string;
  incorporationDate: string;
  registeredAddress: string;
  gstin: string;
  pan: string;
  udyamNumber: string;
  makeInIndiaPercentage: number;
  turnoverLast3Years: string[];

  overallComplianceScore: number;
  riskLevel: RiskLevel;
  riskScore: number; // 0 - 100
  documentsCount: {
    submitted: number;
    required: number;
  };
  status: BidderStatus;
  statusLabel: string;
  submissionTimestamp: string;

  // Overview quick badges
  verificationsSummary: {
    gst: VerificationStatus;
    pan: VerificationStatus;
    udyam: VerificationStatus;
    incomeTax: VerificationStatus;
    epfoEsic: VerificationStatus;
    makeInIndia: VerificationStatus;
    oemAuthorization: VerificationStatus;
    emd: VerificationStatus;
    blacklisting: VerificationStatus;
  };

  // Detailed records
  documents: BidderDocument[];
  emd: EmdRecord;
  complianceItems: ComplianceCheckItem[];
  riskFactors: RiskFactor[];
  primaryConcern: string;
  evidenceItems: EvidenceItem[];
  aiRecommendation: {
    summary: string;
    details: string;
    suggestedAction: OfficerDecisionType;
    pros: string[];
    cons: string[];
    confidence: number;
  };
  officerDecision?: OfficerDecisionRecord;
  auditTrail: AuditEvent[];
}

export type Bidder = Bid;

export interface DashboardMetrics {
  activeTenders: number;
  bidsUnderVerification: number;
  fullyCompliant: number;
  pendingReviews: number;
  highRisk: number;
  averageCompliance: number;
}

export const toTenderSlug = (tenderId: string): string => {
  return tenderId.replace(/\//g, '-');
};

export const fromTenderSlug = (slug: string): string => {
  return slug.replace(/-/g, '/');
};

export const findTenderByIdOrSlug = (tenders: Tender[], identifier?: string): Tender | undefined => {
  if (!identifier) return undefined;
  const decoded = decodeURIComponent(identifier);
  return tenders.find(
    (t) =>
      t.id === identifier ||
      t.id === decoded ||
      toTenderSlug(t.id).toLowerCase() === identifier.toLowerCase() ||
      toTenderSlug(t.id).toLowerCase() === decoded.toLowerCase() ||
      t.id.replace(/\//g, '-').toLowerCase() === identifier.toLowerCase()
  );
};

export const findBidById = (bids: Bid[], identifier?: string): Bid | undefined => {
  if (!identifier) return undefined;
  const lower = identifier.toLowerCase();
  return bids.find(
    (b) =>
      b.id.toLowerCase() === lower ||
      b.bidId?.toLowerCase() === lower ||
      b.vendorCode.toLowerCase() === lower ||
      b.bidder?.vendorCode.toLowerCase() === lower ||
      b.companyName.toLowerCase() === lower ||
      b.bidder?.companyName.toLowerCase() === lower
  );
};
