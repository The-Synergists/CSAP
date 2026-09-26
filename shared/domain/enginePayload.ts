// Contract between the backend gateway and the Python verification engine
// (ai_engine/src/schemas.py). Built from a joined BidView so the engine always receives the
// same authoritative data the officer sees.

import type { BidView } from './selectors.js';
import type { CheckStatus, DecisionType, FindingSeverity, RiskLevel } from './types.js';

export interface EnginePayload {
  bidId: string;
  tender: { id: string; title: string; technicalOpeningDate: string; emdAmount: number };
  requirements: { code: string; title: string; category: string; criterion: string; benchmark: string; mandatory: boolean }[];
  bidder: {
    companyName: string;
    gstin: string;
    pan: string;
    udyamNumber?: string;
    msmeCategory?: string;
    turnover: { financialYear: string; amountCr: number }[];
  };
  makeInIndiaPercentage: number;
  documents: { id: string; requirementCode?: string; name: string; fileName: string; extractedText: string }[];
  emd?: { requiredAmount: number; submittedAmount: number; instrument: string; reference: string; bankName: string; validUntil?: string };
}

export interface EngineFinding {
  title: string;
  severity: FindingSeverity;
  expected: string;
  submitted: string;
  comparison: string;
  evidenceExcerpt: string;
  evidenceSource: string;
  impact: string;
  suggestedAction: string;
}

export interface EngineCheck {
  requirementCode: string;
  status: CheckStatus;
  submitted: string;
  note: string;
  documentId?: string | null;
  finding?: EngineFinding | null;
  riskPoints: number;
}

export interface EngineResult {
  status: 'SUCCESS';
  engineVersion: string;
  advisory: true;
  bidId: string;
  summary: { met: number; review: number; notMet: number; missing: number; total: number };
  checks: EngineCheck[];
  risk: { level: RiskLevel; score: number; drivers: { requirementCode: string; status: CheckStatus; points: number }[] };
  recommendation: { suggestedDecision: DecisionType; summary: string };
  registryChecks: { portal: string; checkType: string; identifier: string | null; status: string; detail: string; simulated: boolean }[];
}

export const buildEnginePayload = (view: BidView): EnginePayload => {
  const codeOf = (requirementId: string) => view.requirements.find((r) => r.id === requirementId)?.code;
  return {
    bidId: view.bid.id,
    tender: {
      id: view.tender.id,
      title: view.tender.title,
      technicalOpeningDate: view.tender.technicalOpeningDate,
      emdAmount: view.tender.emdAmount,
    },
    requirements: view.requirements.map((r) => ({
      code: r.code,
      title: r.title,
      category: r.category,
      criterion: r.criterion,
      benchmark: r.benchmark,
      mandatory: r.mandatory,
    })),
    bidder: {
      companyName: view.bidder.companyName,
      gstin: view.bidder.gstin,
      pan: view.bidder.pan,
      udyamNumber: view.bidder.udyamNumber || undefined,
      msmeCategory: view.bidder.msmeCategory,
      turnover: view.bidder.turnover,
    },
    makeInIndiaPercentage: view.bid.makeInIndiaPercentage,
    documents: view.documents.map((d) => ({
      id: d.id,
      requirementCode: codeOf(d.requirementId),
      name: d.name,
      fileName: d.fileName,
      extractedText: d.extractedText,
    })),
    emd: view.emd && {
      requiredAmount: view.emd.requiredAmount,
      submittedAmount: view.emd.submittedAmount,
      instrument: view.emd.instrument,
      reference: view.emd.reference,
      bankName: view.emd.bankName,
      validUntil: view.emd.validUntil,
    },
  };
};
