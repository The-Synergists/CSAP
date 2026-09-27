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

/**
 * The suggested action, recomputed from the current checks every time they change: a mandatory
 * requirement not met or missing suggests rejection, an item needing review suggests clarification,
 * otherwise approval. Advisory only; the officer decides.
 */
export const liveRecommendation = (bid: Bid, checks: CheckRow[], score: number): Recommendation => {
  const open = (c: CheckRow) => !c.finding || c.finding.status === 'OPEN' || c.finding.status === 'CLARIFICATION_REQUESTED';
  const blockers = checks.filter((c) => c.requirement.mandatory && (c.status === 'NOT_MET' || c.status === 'MISSING') && open(c));
  const reviews = checks.filter((c) => c.status === 'REVIEW' && open(c));
  const met = checks.filter((c) => c.status === 'MET' || c.status === 'EXEMPTED');
  const label = (c: CheckRow) => c.finding?.title ?? `${c.requirement.title}: ${c.submitted}`;
  const list = (cs: CheckRow[]) => cs.map((c) => c.requirement.title.toLowerCase()).join(', ');
  const suggestedDecision = blockers.length ? 'REJECT' : reviews.length ? 'REQUEST_CLARIFICATION' : 'APPROVE';
  const summary =
    suggestedDecision === 'REJECT'
      ? `${blockers.length} mandatory requirement${blockers.length > 1 ? 's' : ''} not met or missing (${list(blockers)}). The bid is liable for rejection unless these are resolved.`
      : suggestedDecision === 'REQUEST_CLARIFICATION'
        ? `All mandatory requirements are met except ${reviews.length} item${reviews.length > 1 ? 's' : ''} that need${reviews.length > 1 ? '' : 's'} clarification (${list(reviews)}).`
        : `All ${checks.length} requirements are met or validly exempted.`;
  return {
    bidId: bid.id,
    suggestedDecision,
    summary,
    rationale: `${met.length} of ${checks.length} requirements met · compliance score ${score}/100 · ${bid.riskLevel.toLowerCase()} risk.`,
    strengths: met.slice(0, 5).map((c) => `${c.requirement.title}: ${c.submitted}.`),
    concerns: [...blockers, ...reviews].map(label),
    generatedAt: bid.lastVerifiedAt,
  };
};

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
    recommendation: checks.length ? liveRecommendation(bid, checks, score.score) : db.recommendations.find((r) => r.bidId === bid.id),
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

/**
 * Audit events that record a procurement decision or a step of the formal workflow (tender
 * published, officer decisions, clarifications, re-evaluation, evaluation reports). The
 * step-by-step verification events stay in each bid's activity.
 */
export const isKeyAuditEvent = (e: AuditEvent): boolean =>
  /^(Tender published|Formal Officer Decision|Clarification requested|Evaluation report (generated|sent to GeM)|Bidder (responded to the clarification|requested re-evaluation)|Re-evaluation (opened|declined)|Clarification response (accepted|declined))/.test(e.summary);

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

/**
 * Where a tender actually is, derived from its bids and decisions (never from a stored label):
 * open for bids until the closing date; after that, no bids received, under evaluation while any
 * bid has no final decision, or evaluation complete once every bid is approved or rejected.
 */
export type TenderStage = 'OPEN_FOR_BIDS' | 'NO_BIDS' | 'UNDER_EVALUATION' | 'EVALUATION_COMPLETE' | 'CANCELLED';

export interface TenderStats {
  stage: TenderStage;
  bidCount: number;
  /** Average of the bids' computed scores; null when there are no bids. */
  averageCompliance: number | null;
  highRiskCount: number;
  /** Highest risk among the bids; null when there are no bids. */
  riskLevel: Bid['riskLevel'] | null;
  awaitingDecision: number;
  decided: number;
  openFindings: number;
}

const RISK_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

export const tenderStage = (tender: Tender, views: BidView[], today = new Date().toISOString().slice(0, 10)): TenderStage => {
  if (tender.status === 'CANCELLED') return 'CANCELLED';
  if (tender.status === 'OPEN_FOR_BIDS' && tender.deadlineDate >= today) return 'OPEN_FOR_BIDS';
  if (views.length === 0) return 'NO_BIDS';
  return views.every((v) => v.flags.closed) ? 'EVALUATION_COMPLETE' : 'UNDER_EVALUATION';
};

export const getTenderStats = (db: Database, tenderId: string): TenderStats => {
  const views = listBidViews(db, tenderId);
  const tender = db.tenders.find((t) => t.id === tenderId)!;
  return {
    stage: tenderStage(tender, views),
    bidCount: views.length,
    averageCompliance: views.length
      ? Math.round(views.reduce((s, v) => s + v.bid.complianceScore, 0) / views.length)
      : null,
    highRiskCount: views.filter((v) => v.flags.highRisk).length,
    riskLevel: views.length ? views.map((v) => v.bid.riskLevel).reduce((a, b) => (RISK_RANK[b] > RISK_RANK[a] ? b : a)) : null,
    awaitingDecision: views.filter((v) => v.flags.awaitingDecision).length,
    decided: views.filter((v) => v.flags.closed).length,
    openFindings: views.reduce((s, v) => s + v.openFindings.length, 0),
  };
};

/** One reason a bid needs the officer's attention. */
export interface AlertItem {
  /** ACTION: the officer must act (bidder response waiting, verification did not finish).
   *  DISQUALIFYING: a mandatory requirement is not met or missing, or a registry contradicts the bid. */
  kind: 'ACTION' | 'DISQUALIFYING';
  title: string;
  detail: string;
  tab: 'overview' | 'evidence' | 'portal' | 'emd';
  findingId?: string;
}

export interface Alert {
  bidId: string;
  tenderId: string;
  companyName: string;
  severity: FindingSeverity;
  title: string;
  findingId?: string;
  openCount: number;
  items: AlertItem[];
}

const REGISTRY_NAME: Record<string, string> = {
  PAN: 'PAN', GSTN: 'GST', UDYAM: 'Udyam', MCA21: 'MCA21', EPFO: 'EPFO', ESIC: 'ESIC', STARTUP_INDIA: 'Startup India', NSIC: 'NSIC', DEBARMENT: 'Debarment list', DIGILOCKER: 'DigiLocker',
};

/** What in a bid needs the officer: derived from checks, findings, registry answers and requests. */
export const bidAlertItems = (v: BidView): AlertItem[] => {
  if (v.flags.closed && !v.flags.pendingRequest) return [];
  const items: AlertItem[] = [];
  for (const r of v.reevaluations.filter((x) => x.status === 'OPEN')) {
    items.push({ kind: 'ACTION', title: r.kind === 'CLARIFICATION_RESPONSE' ? 'Bidder responded to the clarification' : 'Bidder requested re-evaluation', detail: r.reason, tab: 'overview' });
  }
  const lastRun = v.audit.find((e) => /^Automatic verification (completed|stopped)/.test(e.summary));
  if (lastRun?.summary.startsWith('Automatic verification stopped')) {
    items.push({ kind: 'ACTION', title: 'Automatic verification did not finish', detail: lastRun.details, tab: 'overview' });
  }
  if (v.flags.closed) return items;
  for (const c of v.checks) {
    if (!c.requirement.mandatory || (c.status !== 'NOT_MET' && c.status !== 'MISSING')) continue;
    if (c.finding && c.finding.status !== 'OPEN') continue;
    items.push({
      kind: 'DISQUALIFYING',
      title: c.finding?.title ?? `${c.requirement.title} ${c.status === 'MISSING' ? 'not submitted' : 'not met'}`,
      detail: `${c.requirement.code} ${c.requirement.title}: requires ${c.requirement.benchmark}; found ${c.submitted}.`,
      tab: c.requirement.code === 'REQ-06' ? 'emd' : 'evidence',
      findingId: c.findingId,
    });
  }
  for (const p of v.portal) {
    if (p.status !== 'FAILED' && p.status !== 'NOT_FOUND') continue;
    items.push({ kind: 'DISQUALIFYING', title: `${REGISTRY_NAME[p.registry] ?? p.registry} registry contradicts the bid`, detail: p.summary, tab: 'portal' });
  }
  return items;
};

/**
 * One alert per bid that needs the officer: a bidder response waiting, a verification that did not
 * finish, a mandatory requirement not met or missing, or a registry answer against the bid. Points
 * that only need review before deciding are in My Reviews, not here. The sidebar badge, header bell
 * and Alerts page all read this.
 */
export const getAlerts = (db: Database): Alert[] =>
  listBidViews(db)
    .map((v) => ({ v, items: bidAlertItems(v) }))
    .filter(({ items }) => items.length > 0)
    .map(({ v, items }) => {
      const top = items.find((i) => i.kind === 'DISQUALIFYING') ?? items[0];
      return {
        bidId: v.bid.id,
        tenderId: v.tender.id,
        companyName: v.bidder.companyName,
        severity: (items.some((i) => i.kind === 'DISQUALIFYING') ? 'HIGH' : 'MEDIUM') as FindingSeverity,
        title: top.title,
        findingId: top.findingId,
        openCount: items.length,
        items,
      };
    })
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.openCount - a.openCount);

export const getDashboardMetrics = (db: Database) => {
  const views = listBidViews(db);
  const open = views.filter((v) => !v.flags.closed);
  const scored = open.filter((v) => v.checks.length > 0);
  return {
    /** Tenders whose bids are being evaluated now (derived, see tenderStage). */
    activeTenders: db.tenders.filter((t) => getTenderStats(db, t.id).stage === 'UNDER_EVALUATION').length,
    openForBids: db.tenders.filter((t) => getTenderStats(db, t.id).stage === 'OPEN_FOR_BIDS').length,
    bidsUnderVerification: open.length,
    fullyCompliant: open.filter((v) => v.checks.length > 0 && v.flags.noExceptions).length,
    averageCompliance: scored.length ? Math.round(scored.reduce((s, v) => s + v.bid.complianceScore, 0) / scored.length) : null,
    bidsInReview: views.filter((v) => !v.flags.closed).length,
    awaitingDecision: views.filter((v) => v.flags.awaitingDecision).length,
    awaitingClarification: views.filter((v) => v.flags.clarification || v.bid.status === 'COMMITTEE_REVIEW').length,
    highRisk: views.filter((v) => v.flags.highRisk && !v.flags.closed).length,
    emdIssues: views.filter((v) => v.flags.emdIssue && !v.flags.closed).length,
    decided: views.filter((v) => v.flags.closed).length,
  };
};
