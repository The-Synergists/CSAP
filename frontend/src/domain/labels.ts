import type {
  BidStatus,
  CheckStatus,
  DecisionType,
  EmdInstrument,
  EmdResult,
  FindingSeverity,
  FindingStatus,
  RiskLevel,
  TenderStatus,
} from '@shared/domain/types';

/** Visual tone for badges. Kept to a small palette so colour stays meaningful. */
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

export const BID_STATUS: Record<BidStatus, { label: string; tone: Tone }> = {
  UNDER_REVIEW: { label: 'Under Review', tone: 'warning' },
  RECOMMENDED_ACCEPT: { label: 'Recommended Accept', tone: 'info' },
  CLARIFICATION_REQUIRED: { label: 'Clarification Required', tone: 'purple' },
  COMMITTEE_REVIEW: { label: 'Committee Review', tone: 'info' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
};

export const TENDER_STATUS: Record<TenderStatus, { label: string; tone: Tone }> = {
  UNDER_EVALUATION: { label: 'Under Evaluation', tone: 'warning' },
  TECHNICAL_SCRUTINY: { label: 'Technical Scrutiny', tone: 'warning' },
  AWARDED: { label: 'Awarded', tone: 'success' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};

export const CHECK_STATUS: Record<CheckStatus, { label: string; tone: Tone }> = {
  MET: { label: 'Met', tone: 'success' },
  EXEMPTED: { label: 'Exempted', tone: 'info' },
  REVIEW: { label: 'Needs review', tone: 'warning' },
  NOT_MET: { label: 'Not met', tone: 'danger' },
  MISSING: { label: 'Missing', tone: 'danger' },
};

export const RISK_LEVEL: Record<RiskLevel, { label: string; tone: Tone }> = {
  LOW: { label: 'Low', tone: 'success' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  HIGH: { label: 'High', tone: 'danger' },
};

export const SEVERITY: Record<FindingSeverity, { label: string; tone: Tone }> = {
  HIGH: { label: 'High', tone: 'danger' },
  MEDIUM: { label: 'Medium', tone: 'warning' },
  LOW: { label: 'Low', tone: 'neutral' },
};

export const FINDING_STATUS: Record<FindingStatus, { label: string; tone: Tone }> = {
  OPEN: { label: 'Open', tone: 'warning' },
  CLARIFICATION_REQUESTED: { label: 'Clarification requested', tone: 'purple' },
  REFERRED: { label: 'Referred to committee', tone: 'info' },
  ACCEPTED: { label: 'Accepted by officer', tone: 'success' },
  CONFIRMED: { label: 'Confirmed by officer', tone: 'danger' },
};

export const EMD_RESULT: Record<EmdResult, { label: string; tone: Tone }> = {
  VERIFIED: { label: 'Verified', tone: 'success' },
  EXEMPTION_CONFIRMED: { label: 'Exempted (MSE)', tone: 'info' },
  SHORTFALL: { label: 'Shortfall', tone: 'danger' },
  INVALID_INSTRUMENT: { label: 'Invalid instrument', tone: 'danger' },
};

export const EMD_INSTRUMENT: Record<EmdInstrument, string> = {
  NEFT_RTGS: 'Online transfer (NEFT/RTGS)',
  BANK_GUARANTEE: 'Bank guarantee',
  MSME_EXEMPTION: 'MSE exemption',
  DEMAND_DRAFT: 'Demand draft',
};

export const DECISION: Record<
  DecisionType,
  { label: string; verb: string; resultingStatus: BidStatus; findingStatus: FindingStatus; tone: Tone; reasons: string[] }
> = {
  APPROVE: {
    label: 'Approve',
    verb: 'Approve as technically qualified',
    resultingStatus: 'ACCEPTED',
    findingStatus: 'ACCEPTED',
    tone: 'success',
    reasons: [
      'Meets all tender requirements',
      'Exceptions reviewed and accepted as non-material',
      'Clarification received and satisfactory',
    ],
  },
  REJECT: {
    label: 'Reject',
    verb: 'Reject as non-responsive',
    resultingStatus: 'REJECTED',
    findingStatus: 'CONFIRMED',
    tone: 'danger',
    reasons: [
      'Mandatory EMD condition not met',
      'Financial eligibility not met',
      'Mandatory documents not submitted',
      'Multiple mandatory requirements not met',
    ],
  },
  REQUEST_CLARIFICATION: {
    label: 'Request Clarification',
    verb: 'Request clarification from bidder',
    resultingStatus: 'CLARIFICATION_REQUIRED',
    findingStatus: 'CLARIFICATION_REQUESTED',
    tone: 'warning',
    reasons: [
      'Curable deficiency in a mandatory document',
      'Supporting evidence needed to confirm a figure',
      'Missing document may be accepted on clarification',
    ],
  },
  COMMITTEE_REVIEW: {
    label: 'Committee Review',
    verb: 'Refer to tender evaluation committee',
    resultingStatus: 'COMMITTEE_REVIEW',
    findingStatus: 'REFERRED',
    tone: 'info',
    reasons: [
      'Interpretation of a tender clause required',
      'Borderline case needing committee view',
      'Conflicting evidence',
    ],
  },
};

export const REQUIREMENT_CATEGORY: Record<string, string> = {
  STATUTORY: 'Statutory',
  FINANCIAL: 'Financial',
  TECHNICAL: 'Technical',
  EMD: 'EMD',
  POLICY: 'Policy',
};

export const PAN_VERDICT: Record<string, { label: string; tone: Tone }> = {
  VERIFIED: { label: 'PAN verified', tone: 'success' },
  NAME_MISMATCH: { label: 'Name does not match', tone: 'warning' },
  PAN_MISMATCH: { label: 'PAN differs from bid', tone: 'warning' },
  PAN_INVALID: { label: 'PAN invalid', tone: 'danger' },
  PAN_NOT_FOUND: { label: 'PAN not found', tone: 'danger' },
  ERROR: { label: 'Pipeline error', tone: 'danger' },
};
