// Explainable compliance score, computed from the requirement checks (never stored separately):
//
//   score = Σ(weight × outcome) / Σ(weight) × 100
//
// Weights follow how much a requirement decides eligibility; outcomes follow the check result.
// Every screen shows this same number, and the Compliance tab shows each requirement's share.

import type { CheckStatus, RequirementCategory, TenderRequirement } from './types.js';

export const CATEGORY_WEIGHT: Record<RequirementCategory, number> = {
  EMD: 3, // bids with short EMD are liable for rejection
  FINANCIAL: 3, // eligibility criterion
  STATUTORY: 2,
  TECHNICAL: 2,
  POLICY: 1,
};

export const OUTCOME: Record<CheckStatus, number> = { MET: 1, EXEMPTED: 1, REVIEW: 0.5, NOT_MET: 0, MISSING: 0 };

/** Non-mandatory requirements (e.g. Udyam, needed only to claim MSE benefits) weigh 1. */
export const requirementWeight = (r: TenderRequirement) => (r.mandatory ? CATEGORY_WEIGHT[r.category] : 1);

export interface ScoreRow {
  code: string;
  title: string;
  category: RequirementCategory;
  mandatory: boolean;
  status: CheckStatus;
  weight: number;
  outcome: number;
  points: number;
}

export interface ScoreBreakdown {
  score: number;
  points: number;
  maxPoints: number;
  rows: ScoreRow[];
}

export function explainScore(checks: { status: CheckStatus; requirement: TenderRequirement }[]): ScoreBreakdown {
  const rows = checks.map(({ status, requirement: r }) => {
    const weight = requirementWeight(r);
    return { code: r.code, title: r.title, category: r.category, mandatory: r.mandatory, status, weight, outcome: OUTCOME[status], points: weight * OUTCOME[status] };
  });
  const points = rows.reduce((s, r) => s + r.points, 0);
  const maxPoints = rows.reduce((s, r) => s + r.weight, 0);
  return { score: maxPoints ? Math.round((points / maxPoints) * 100) : 0, points, maxPoints, rows };
}
