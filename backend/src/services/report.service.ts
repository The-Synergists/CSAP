// Evaluation report (evidence pack): a frozen snapshot of a bid's verification, stored with a
// SHA-256 fingerprint, printable by the officer and sent back to GeM for bids that came from GeM.

import { createHash, randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getBidView } from '../../../shared/domain/selectors.js';
import { config } from '../config/env.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { listBatches, listBatchRuns } from './documentBatch.service.js';
import { sign } from './gemIntake.service.js';
import { latestDraft } from './recommendation.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** JSON with sorted keys, so the same content always gives the same fingerprint. */
export const stableJson = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stableJson).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v as object)
          .sort()
          .filter((k) => (v as any)[k] !== undefined)
          .map((k) => `${JSON.stringify(k)}:${stableJson((v as any)[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null);

export const fingerprint = (content: unknown) => createHash('sha256').update(stableJson(content)).digest('hex');

/** What the bidder sees on GeM for each officer decision. */
export const GEM_STATUS: Record<string, string> = {
  APPROVE: 'TECHNICALLY_QUALIFIED',
  REJECT: 'DISQUALIFIED',
  REQUEST_CLARIFICATION: 'CLARIFICATION_SOUGHT',
  COMMITTEE_REVIEW: 'UNDER_COMMITTEE_REVIEW',
};

const mapReport = (r: any) => ({
  id: r.id,
  reportNo: r.report_no,
  bidId: r.bid_id,
  content: r.content,
  sha256: r.sha256,
  generatedBy: r.generated_by_name,
  generatedAt: r.generated_at,
  sentToGemAt: r.sent_to_gem_at,
  gemResponse: r.gem_response,
});

export async function listReports(db: SupabaseClient, bidId: string) {
  return must<any[]>(await db.from('evaluation_reports').select('*').eq('bid_id', bidId).order('generated_at', { ascending: false }), 'reports').map(mapReport);
}

export async function getReport(db: SupabaseClient, id: string) {
  const r = must<any>(await db.from('evaluation_reports').select('*').eq('id', id).maybeSingle(), 'report');
  if (!r) throw new HttpError(404, 'Report not found.', 'NOT_FOUND');
  const report = mapReport(r);
  return { ...report, verified: fingerprint(report.content) === report.sha256 };
}

export async function generateReport(db: SupabaseClient, userId: string | null, officerName: string, bidId: string) {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');

  const batch = (await listBatches(db, bidId).catch(() => []))[0];
  const reads = batch ? await listBatchRuns(db, batch.id).catch(() => []) : [];
  const draft = await latestDraft(db, bidId).catch(() => null);
  const { data: chain } = await db.rpc('verify_audit_chain');
  const decision = view.latestDecision;
  const count = must<any[]>(await db.from('evaluation_reports').select('id').eq('bid_id', bidId), 'reports').length;
  const reportNo = `CSAP/ER/${bidId}/${String(count + 1).padStart(2, '0')}`;
  const weights = new Map(view.score.rows.map((r) => [r.code, r]));

  const content = {
    reportNo,
    title: 'Technical evaluation report',
    generatedAt: new Date().toISOString(),
    generatedBy: officerName,
    advisoryNote: 'Prepared by CSAP from automated checks. The decision recorded below is the procurement officer\'s own.',
    tender: { id: view.tender.id, title: view.tender.title, division: view.tender.division, emdAmount: view.tender.emdAmount, technicalOpeningDate: view.tender.technicalOpeningDate },
    bid: { id: view.bid.id, submittedAt: view.bid.submittedAt, source: view.bid.source ?? 'CSAP', gemBidNo: view.bid.gemBidNo ?? null },
    bidder: { name: view.bidder.companyName, pan: view.bidder.pan, gstin: view.bidder.gstin, udyamNumber: view.bidder.udyamNumber || null, address: view.bidder.registeredAddress },
    summary: {
      complianceScore: view.score.score,
      points: view.score.points,
      maxPoints: view.score.maxPoints,
      riskLevel: view.bid.riskLevel,
      riskScore: view.bid.riskScore,
      met: view.counts.met,
      total: view.counts.total,
      exceptions: view.counts.exceptions,
    },
    requirements: view.checks.map((c) => ({
      code: c.requirement.code,
      title: c.requirement.title,
      benchmark: c.requirement.benchmark,
      mandatory: c.requirement.mandatory,
      status: c.status,
      submitted: c.submitted,
      note: c.note,
      weight: weights.get(c.requirement.code)?.weight ?? null,
      points: weights.get(c.requirement.code)?.points ?? null,
      findingId: c.findingId ?? null,
    })),
    findings: view.findings.map((f) => ({
      id: f.id,
      title: f.title,
      severity: f.severity,
      expected: f.expected,
      submitted: f.submitted,
      comparison: f.comparison,
      impact: f.impact,
      suggestedAction: f.suggestedAction,
      evidence: f.evidenceExcerpt,
      source: f.evidenceSource,
    })),
    documentReading: batch
      ? {
          readAt: batch.completedAt ?? batch.startedAt,
          summary: batch.summary,
          documents: reads.map((r) => ({ code: r.document.code ?? null, title: r.document.title ?? r.document.fileName, sha256: r.document.sha256 || null, verdict: r.verdict ?? r.status, summary: r.comparison?.summary ?? r.error ?? null })),
          crossDocument: batch.consistency ?? [],
        }
      : null,
    registries: view.portal.map((p) => ({ registry: p.registry, identifier: p.identifier, status: p.status, summary: p.summary, mode: p.mode, checkedAt: p.checkedAt })),
    emd: view.emd ? { required: view.emd.requiredAmount, submitted: view.emd.submittedAmount, instrument: view.emd.instrument, reference: view.emd.reference, result: view.emd.result } : null,
    recommendation: view.recommendation
      ? { suggestedDecision: view.recommendation.suggestedDecision, summary: view.recommendation.summary, explanation: draft?.sentences ?? [] }
      : null,
    decision: decision
      ? { decision: decision.decision, reason: decision.reason, remarks: decision.remarks, officer: decision.officerName, decidedAt: decision.decidedAt }
      : null,
    audit: {
      chainIntact: (chain as any)?.[0]?.intact ?? null,
      chainHead: (chain as any)?.[0]?.last_hash ?? null,
      events: view.audit
        .slice()
        .reverse()
        .map((e) => ({ seq: e.seq ?? null, at: e.timestamp, summary: e.summary, actor: e.actor, fingerprint: e.entryHash ?? null })),
    },
  };
  const sha256 = fingerprint(content);
  const row = must<any>(
    await db
      .from('evaluation_reports')
      .insert({ report_no: reportNo, bid_id: bidId, content, sha256, generated_by: userId, generated_by_name: officerName })
      .select('*')
      .single(),
    'report',
  );
  await db.from('audit_events').insert({
    bid_id: bidId,
    tender_id: view.tender.id,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: userId ? 'Procurement officer' : 'Automated service',
    action_type: userId ? 'OFFICER_ACTION' : 'SYSTEM_AI',
    summary: 'Evaluation report generated',
    details: `${reportNo}, fingerprint SHA-256 ${sha256.slice(0, 16)}…${decision ? ` Includes the decision "${decision.decision.replace('_', ' ').toLowerCase()}".` : ' No decision recorded yet.'}`,
  });
  return mapReport(row);
}

/** Sends the outcome and the report summary to GeM (signed), for bids that came from GeM. */
export async function sendReportToGem(db: SupabaseClient, userId: string | null, officerName: string, reportId: string) {
  const report = await getReport(db, reportId);
  const c = report.content as any;
  if (c.bid.source !== 'GEM' || !c.bid.gemBidNo) throw new HttpError(409, 'This bid did not come from GeM.', 'NOT_GEM');
  const status = c.decision ? GEM_STATUS[c.decision.decision] ?? 'UNDER_EVALUATION' : 'UNDER_EVALUATION';
  const payload = {
    gemBidNo: c.bid.gemBidNo,
    csapBidId: c.bid.id,
    status,
    remarks: c.decision?.remarks ?? null,
    decidedAt: c.decision?.decidedAt ?? null,
    report: {
      reportNo: report.reportNo,
      sha256: report.sha256,
      generatedAt: c.generatedAt,
      complianceScore: c.summary.complianceScore,
      requirementsMet: `${c.summary.met} of ${c.summary.total}`,
      // Bidder-facing: what needs attention, never internal risk scoring.
      issues: c.findings.map((f: any) => ({ id: f.id, title: f.title, requiredAction: f.suggestedAction })),
    },
  };
  const body = JSON.stringify(payload);
  const timestamp = new Date().toISOString();
  const url = `${config.selfUrl}/api/gem/notifications`;
  let gemResponse: any;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSAP-Timestamp': timestamp, 'X-CSAP-Signature': `sha256=${sign(timestamp, body)}`, 'X-CSAP-Delivery': randomUUID() },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    gemResponse = { httpStatus: res.status, body: await res.json().catch(() => ({})) };
  } catch (err) {
    gemResponse = { error: err instanceof Error ? err.message : String(err) };
  }
  const ok = gemResponse.httpStatus && gemResponse.httpStatus < 300;
  await db.from('evaluation_reports').update({ sent_to_gem_at: ok ? new Date().toISOString() : null, gem_response: gemResponse }).eq('id', reportId);
  await db.from('audit_events').insert({
    bid_id: c.bid.id,
    tender_id: c.tender.id,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: userId ? 'Procurement officer' : 'Automated service',
    action_type: userId ? 'OFFICER_ACTION' : 'SYSTEM_AI',
    summary: ok ? 'Evaluation report sent to GeM' : 'Sending the evaluation report to GeM failed',
    details: ok
      ? `${report.reportNo} delivered for GeM bid ${c.bid.gemBidNo}; the bidder sees status "${status.replace(/_/g, ' ').toLowerCase()}".`
      : `${report.reportNo}: ${gemResponse.error ?? `GeM answered HTTP ${gemResponse.httpStatus}`}.`,
  });
  if (!ok) throw new HttpError(502, `GeM did not accept the report: ${gemResponse.error ?? `HTTP ${gemResponse.httpStatus}`}`, 'GEM_DELIVERY_FAILED');
  return { ...(await getReport(db, reportId)), gemStatus: status };
}
