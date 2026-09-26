// Groups per-requirement check results into the verification steps shown to the officer.
// Used for both the recorded result and a fresh engine run, so both read the same way.

import type { BidView } from './selectors.js';
import type { CheckStatus, RequirementCategory } from './types.js';

export type StepStatus = 'pending' | 'running' | 'passed' | 'flagged';

export interface VerificationStep {
  id: string;
  label: string;
  status: StepStatus;
  detail: string;
}

export interface VerificationRun {
  bidId: string;
  startedAt: string;
  finishedAt?: string;
  steps: VerificationStep[];
  done: boolean;
  error?: string;
  /** Present once the engine has answered. */
  outcome?: {
    engineVersion: string;
    met: number;
    exceptions: number;
    total: number;
    riskLevel: string;
    suggestedDecision: string;
    /** Requirements whose status differs from the recorded verification result. */
    differences: { requirementCode: string; recorded: CheckStatus; now: CheckStatus }[];
    simulatedRegistryChecks: number;
  };
}

const STEP_DEFS: { id: string; label: string; categories: RequirementCategory[] }[] = [
  { id: 'statutory', label: 'Statutory registrations (GST, PAN / ITR, EPFO / ESIC)', categories: ['STATUTORY'] },
  { id: 'financial', label: 'Financial eligibility (audited turnover)', categories: ['FINANCIAL'] },
  { id: 'emd', label: 'EMD amount and instrument', categories: ['EMD'] },
  { id: 'technical', label: 'Technical requirements (OEM, experience, test certificates)', categories: ['TECHNICAL'] },
  { id: 'policy', label: 'Policy and declarations (MSE, local content, affidavits)', categories: ['POLICY'] },
];

const isException = (s: CheckStatus) => s === 'REVIEW' || s === 'NOT_MET' || s === 'MISSING';

/**
 * @param statusByCode status per requirement code; defaults to the bid's recorded checks.
 */
export const buildSteps = (view: BidView, statusByCode?: Record<string, CheckStatus>): VerificationStep[] => {
  const statusOf = (code: string, fallback: CheckStatus) => statusByCode?.[code] ?? fallback;

  const docStep: VerificationStep = {
    id: 'documents',
    label: 'Read bid documents and extract fields',
    status: view.documents.length < view.documentsRequired ? 'flagged' : 'passed',
    detail: `${view.documents.length} of ${view.documentsRequired} required documents found`,
  };

  let exceptions = 0;
  const ruleSteps = STEP_DEFS.map((def): VerificationStep => {
    const rows = view.checks.filter((c) => def.categories.includes(c.requirement.category));
    const flagged = rows.filter((r) => isException(statusOf(r.requirement.code, r.status)));
    exceptions += flagged.length;
    return {
      id: def.id,
      label: def.label,
      status: flagged.length ? 'flagged' : 'passed',
      detail: flagged.length
        ? `${rows.length - flagged.length} of ${rows.length} met · flagged: ${flagged.map((f) => f.requirement.title).join(', ')}`
        : `${rows.length} of ${rows.length} met`,
    };
  });

  const summaryStep: VerificationStep = {
    id: 'summary',
    label: 'Compile findings, risk assessment and recommendation',
    status: exceptions ? 'flagged' : 'passed',
    detail: exceptions ? `${exceptions} requirement${exceptions === 1 ? '' : 's'} flagged for officer review` : 'No exceptions',
  };
  return [docStep, ...ruleSteps, summaryStep];
};

export const pendingSteps = (view: BidView): VerificationStep[] =>
  buildSteps(view).map((s, i) => ({ ...s, status: i === 0 ? 'running' : 'pending', detail: '' }));
