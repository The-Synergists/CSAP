// Read-side joins over the normalised Database. Every screen derives what it shows from
// these functions, so a bid's scores, EMD status, findings and decision are always read from
// the same rows no matter which page displays them.

import { explainScore, type ScoreBreakdown } from './scoring.js';
import type {
  AuditEvent,
  Bid,
  BidDocument,
  Bidder,
  ComplianceCheck,
  Database,
  EmdTransaction,
  Finding,
  FindingSeverity,
  OfficerDecision,
  PortalVerification,
  ReevaluationRequest,
  Recommendation,
  RiskFactor,
  Tender,
  TenderRequirement,
} from './types.js';

export interface CheckRow extends ComplianceCheck {
  requirement: TenderRequirement;
  document?: BidDocument;
  finding?: Finding;
}

export interface BidView {
  bid: Bid;
  /** How the compliance score is made up (see scoring.ts). */
  score: ScoreBreakdown;
  tender: Tender;
  bidder: Bidder;
  requirements: TenderRequirement[];
  documents: BidDocument[];
  emd?: EmdTransaction;
  checks: CheckRow[];
  findings: Finding[];
  openFindings: Finding[];
  riskFactors: RiskFactor[];
  recommendation?: Recommendation;
  /** Newest first. */
  decisions: OfficerDecision[];
  latestDecision?: OfficerDecision;
  /** Newest first. */
  audit: AuditEvent[];
  /** Government portal checks from the most recent run (one row per registry). */
  portal: PortalVerification[];
  /** Bidder responses and re-evaluation requests, newest first. */
  reevaluations: ReevaluationRequest[];
  counts: { met: number; review: number; notMet: number; missing: number; total: number; exceptions: number };
  documentsRequired: number;
  averageTurnoverCr: number;
  flags: BidFlags;
}

export interface BidFlags {
  awaitingDecision: boolean;
  closed: boolean;
  highRisk: boolean;
  emdIssue: boolean;
  missingDocuments: boolean;
  clarification: boolean;
  noExceptions: boolean;
  /** A final decision was reopened by an accepted re-evaluation request. */
  reopened: boolean;
  /** A bidder response / re-evaluation request is waiting for the officer. */
  pendingRequest: boolean;
}

const SEVERITY_RANK: Record<FindingSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const byNewest = <T,>(key: (row: T) => string) => (a: T, b: T) => key(b).localeCompare(key(a));

export const isClosedStatus = (status: Bid['status']) => status === 'ACCEPTED' || status === 'REJECTED';

export const findTender = (db: Database, idOrSlug?: string): Tender | undefined => {
  if (!idOrSlug) return undefined;
  const needle = decodeURIComponent(idOrSlug).toLowerCase();
  return db.tenders.find((t) => t.id.toLowerCase() === needle || t.id.replace(/\//g, '-').toLowerCase() === needle);
};

export const findBid = (db: Database, bidId?: string): Bid | undefined =>
  bidId ? db.bids.find((b) => b.id.toLowerCase() === bidId.toLowerCase()) : undefined;

export const getBidView = (db: Database, bidId: string): BidView | undefined => {
  const bid = findBid(db, bidId);
  if (!bid) return undefined;
  const tender = db.tenders.find((t) => t.id === bid.tenderId);
  const bidder = db.bidders.find((b) => b.id === bid.bidderId);
  if (!tender || !bidder) return undefined;

  const requirements = db.requirements.filter((r) => r.tenderId === tender.id);
  const documents = db.documents.filter((d) => d.bidId === bid.id);
  const findings = db.findings
    .filter((f) => f.bidId === bid.id)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

  const checks: CheckRow[] = db.complianceChecks
    .filter((c) => c.bidId === bid.id)
    .map((c) => ({
      ...c,
      requirement: requirements.find((r) => r.id === c.requirementId)!,
      document: documents.find((d) => d.id === c.documentId),
      finding: findings.find((f) => f.id === c.findingId),
    }))
    .filter((c) => c.requirement)
    .sort((a, b) => a.requirement.id.localeCompare(b.requirement.id));

  const count = (s: ComplianceCheck['status']) => checks.filter((c) => c.status === s).length;
  const counts = {
    met: count('MET') + count('EXEMPTED'),
    review: count('REVIEW'),
    notMet: count('NOT_MET'),
    missing: count('MISSING'),
    total: checks.length,
    exceptions: 0,
  };
  counts.exceptions = counts.review + counts.notMet + counts.missing;

  const emd = db.emdTransactions.find((e) => e.bidId === bid.id);
  const decisions = db.decisions.filter((d) => d.bidId === bid.id).sort(byNewest((d) => d.decidedAt));
  const openFindings = findings.filter((f) => f.status === 'OPEN');
  const closed = isClosedStatus(bid.status);
  const reevaluations = (db.reevaluationRequests ?? []).filter((r) => r.bidId === bid.id).sort(byNewest((r) => r.requestedAt));
  const lastDecision = db.decisions.filter((d) => d.bidId === bid.id).sort(byNewest((d) => d.decidedAt))[0];
  const reopened = !!lastDecision && reevaluations.some((r) => r.status === 'ACCEPTED' && (r.decidedAt ?? '') > lastDecision.decidedAt);

  const flags: BidFlags = {
    awaitingDecision: bid.status === 'UNDER_REVIEW' || bid.status === 'RECOMMENDED_ACCEPT',
    closed,
    highRisk: bid.riskLevel === 'HIGH',
    emdIssue: !!emd && (emd.result === 'SHORTFALL' || emd.result === 'INVALID_INSTRUMENT'),
    missingDocuments: counts.missing > 0 || documents.length < requirements.length,
    clarification: bid.status === 'CLARIFICATION_REQUIRED',
    noExceptions: counts.exceptions === 0,
    reopened,
    pendingRequest: reevaluations.some((r) => r.status === 'OPEN'),
  };

  const score = explainScore(checks);

  return {
    // The displayed compliance score is always the one computed from the checks.
    bid: checks.length ? { ...bid, complianceScore: score.score } : bid,
    score,
    tender,
    bidder,
    requirements,
    documents,
    emd,
    checks,
    findings,
    openFindings,
    riskFactors: db.riskFactors.filter((r) => r.bidId === bid.id),
    recommendation: db.recommendations.find((r) => r.bidId === bid.id),
    decisions,
    latestDecision: decisions[0],
    audit: db.auditEvents.filter((e) => e.bidId === bid.id).sort(byNewest((e) => e.timestamp)),
    portal: latestPortalRun(db.portalVerifications ?? [], bid.id),
    reevaluations,
    counts,
    documentsRequired: requirements.length,
    averageTurnoverCr: bidder.turnover.reduce((s, t) => s + t.amountCr, 0) / (bidder.turnover.length || 1),
    flags,
  };
};

const REGISTRY_ORDER = ['PAN', 'GSTN', 'UDYAM', 'MCA21', 'EPFO', 'ESIC', 'STARTUP_INDIA', 'NSIC', 'DEBARMENT', 'DIGILOCKER'];

/** Rows of the newest portal-check run for a bid, in a fixed registry order. */
export const latestPortalRun = (rows: PortalVerification[], bidId: string): PortalVerification[] => {
  const mine = rows.filter((r) => r.bidId === bidId);
  if (!mine.length) return [];
  const newest = mine.reduce((a, b) => (b.checkedAt > a.checkedAt ? b : a));
  return mine
    .filter((r) => r.runId === newest.runId)
    .sort((a, b) => REGISTRY_ORDER.indexOf(a.registry) - REGISTRY_ORDER.indexOf(b.registry));
};

export const listBidViews = (db: Database, tenderId?: string): BidView[] =>
  db.bids
    .filter((b) => !tenderId || b.tenderId === tenderId)
    .map((b) => getBidView(db, b.id))
    .filter((v): v is BidView => !!v);

/** Quick filters shared by the Bidders page and the tender Bids tab. */
export const BID_FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'needs-review', label: 'Needs Review', test: (v: BidView) => v.flags.awaitingDecision },
  { id: 'high-risk', label: 'High Risk', test: (v: BidView) => v.flags.highRisk },
  { id: 'emd-issue', label: 'EMD Issue', test: (v: BidView) => v.flags.emdIssue },
  { id: 'missing-docs', label: 'Missing Documents', test: (v: BidView) => v.flags.missingDocuments },
  { id: 'clarification', label: 'Clarification Required', test: (v: BidView) => v.flags.clarification },
  { id: 'verified', label: 'Verified', test: (v: BidView) => v.flags.noExceptions },
] as const;

export type BidFilterId = (typeof BID_FILTERS)[number]['id'];

export const matchesBidSearch = (v: BidView, term: string): boolean => {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [v.bid.id, v.bidder.companyName, v.bidder.id, v.bidder.gstin, v.bidder.pan, v.tender.id].some((s) =>
    s.toLowerCase().includes(q),
  );
};

export interface TenderStats {
  bidCount: number;
  averageCompliance: number | null;
  highRiskCount: number;
  awaitingDecision: number;
  openFindings: number;
}

export const getTenderStats = (db: Database, tenderId: string): TenderStats => {
  const views = listBidViews(db, tenderId);
  return {
    bidCount: views.length,
    averageCompliance: views.length
      ? Math.round(views.reduce((s, v) => s + v.bid.complianceScore, 0) / views.length)
      : null,
    highRiskCount: views.filter((v) => v.flags.highRisk).length,
    awaitingDecision: views.filter((v) => v.flags.awaitingDecision).length,
    openFindings: views.reduce((s, v) => s + v.openFindings.length, 0),
  };
};

export interface Alert {
  bidId: string;
  tenderId: string;
  companyName: string;
  severity: FindingSeverity;
  title: string;
  findingId: string;
  openCount: number;
}

/**
 * One alert per bid that still has open findings and no final decision. Derived from the
 * findings table, so the sidebar badge, header bell, dashboard and Alerts page always agree.
 */
export const getAlerts = (db: Database): Alert[] =>
  listBidViews(db)
    .filter((v) => !v.flags.closed && v.openFindings.length > 0)
    .map((v) => {
      const top = v.openFindings[0];
      return {
        bidId: v.bid.id,
        tenderId: v.tender.id,
        companyName: v.bidder.companyName,
        severity: top.severity,
        title: top.title,
        findingId: top.id,
        openCount: v.openFindings.length,
      };
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);

export const getDashboardMetrics = (db: Database) => {
  const views = listBidViews(db);
  return {
    activeTenders: db.tenders.filter((t) => t.status === 'UNDER_EVALUATION' || t.status === 'TECHNICAL_SCRUTINY').length,
    bidsInReview: views.filter((v) => !v.flags.closed).length,
    awaitingDecision: views.filter((v) => v.flags.awaitingDecision).length,
    awaitingClarification: views.filter((v) => v.flags.clarification || v.bid.status === 'COMMITTEE_REVIEW').length,
    highRisk: views.filter((v) => v.flags.highRisk && !v.flags.closed).length,
    emdIssues: views.filter((v) => v.flags.emdIssue && !v.flags.closed).length,
    decided: views.filter((v) => v.flags.closed).length,
  };
};
