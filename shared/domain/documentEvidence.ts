// A requirement is only as good as the document behind it. The tender rules judge the values the
// bid declares (EMD amount, turnover, identifiers); this step checks them against what CSAP AI
// actually read in each requirement's document. A document that contradicts the bid, or that shows
// none of the details it should (for example an unrelated image uploaded as the EMD receipt), means
// the requirement cannot count as met.

import type { EngineCheck, EngineResult } from './enginePayload.js';
import type { DocumentVerificationRun } from './types.js';

const CONTRADICTS = new Set(['DISCREPANCY', 'PAN_MISMATCH', 'PAN_INVALID', 'PAN_NOT_FOUND']);
const LOW_MAX = 24;
const MEDIUM_MAX = 49;

export interface EvidenceRequirement {
  code: string;
  title: string;
  benchmark: string;
  mandatory: boolean;
}

/** Latest reading per requirement code (REQ-xx). */
const latestByCode = (runs: DocumentVerificationRun[]) => {
  const map = new Map<string, DocumentVerificationRun>();
  for (const r of runs) {
    const code = r.document?.requirement;
    if (!code) continue;
    const prev = map.get(code);
    if (!prev || r.startedAt > prev.startedAt) map.set(code, r);
  }
  return map;
};

/**
 * Returns the engine result with every check reconciled against the document readings, plus
 * the requirement codes that were changed. Risk and the suggested action are recomputed.
 */
export function applyDocumentEvidence(result: EngineResult, runs: DocumentVerificationRun[], requirements: EvidenceRequirement[]): { result: EngineResult; changed: string[] } {
  const byCode = latestByCode(runs);
  const reqs = new Map(requirements.map((r) => [r.code, r]));
  const changed: string[] = [];

  const checks: EngineCheck[] = result.checks.map((c) => {
    const run = byCode.get(c.requirementCode);
    const req = reqs.get(c.requirementCode);
    if (!run || !req || c.status === 'NOT_MET' || c.status === 'MISSING') return c;
    const unreadable = run.status === 'FAILED' || run.verdict === 'ERROR';
    const contradicts = !unreadable && CONTRADICTS.has(run.verdict ?? '');
    if (!unreadable && !contradicts) return c;
    if (unreadable && c.status === 'REVIEW') return c;

    const status = contradicts && req.mandatory ? 'NOT_MET' : 'REVIEW';
    const detail = unreadable
      ? `CSAP AI could not read ${run.document.fileName}${run.error ? `: ${run.error}` : ''}.`
      : run.comparison?.summary ?? 'The document does not agree with the bid.';
    changed.push(c.requirementCode);
    return {
      ...c,
      status,
      submitted: unreadable ? `Document could not be read (${run.document.fileName})` : `Document does not support the bid (${run.document.fileName})`,
      note: detail,
      riskPoints: Math.max(c.riskPoints, status === 'NOT_MET' ? 30 : 10),
      finding: {
        title: unreadable ? `${req.title}: document could not be read` : `${req.title}: document does not support the bid`,
        severity: status === 'NOT_MET' ? 'HIGH' : 'MEDIUM',
        expected: req.benchmark,
        submitted: unreadable ? 'Unreadable document' : `The document shows something else: ${detail}`,
        comparison: unreadable ? 'The requirement cannot be confirmed from the document.' : 'The document contradicts, or does not show, what the bid declares.',
        evidenceExcerpt: (run.ocr?.text ?? detail).slice(0, 400) || detail,
        evidenceSource: run.document.fileName,
        impact: status === 'NOT_MET'
          ? 'A mandatory requirement is not supported by its document; the bid is liable for rejection unless the correct document is provided.'
          : 'The requirement cannot be confirmed until the document is readable.',
        suggestedAction: 'Ask the bidder, through a clarification, for the correct and legible document.',
      },
    };
  });

  if (!changed.length) return { result, changed };

  const drivers = checks.filter((c) => c.status !== 'MET' && c.status !== 'EXEMPTED').map((c) => ({ requirementCode: c.requirementCode, status: c.status, points: c.riskPoints }));
  const score = Math.min(100, drivers.reduce((s, d) => s + d.points, 0));
  const level = score <= LOW_MAX ? 'LOW' : score <= MEDIUM_MAX ? 'MEDIUM' : 'HIGH';
  const blockers = checks.filter((c) => c.status === 'NOT_MET' || c.status === 'MISSING');
  const reviews = checks.filter((c) => c.status === 'REVIEW');
  const recommendation = blockers.length
    ? { suggestedDecision: 'REJECT' as const, summary: `${blockers.length} mandatory requirement(s) not met or not supported by their documents. Officer review required.` }
    : reviews.length
      ? { suggestedDecision: 'REQUEST_CLARIFICATION' as const, summary: `${reviews.length} item(s) need clarification before a final decision.` }
      : result.recommendation;
  const count = (s: string) => checks.filter((c) => c.status === s).length;
  return {
    changed,
    result: {
      ...result,
      checks,
      summary: { met: count('MET') + count('EXEMPTED'), review: count('REVIEW'), notMet: count('NOT_MET'), missing: count('MISSING'), total: checks.length },
      risk: { level, score, drivers },
      recommendation,
    },
  };
}
