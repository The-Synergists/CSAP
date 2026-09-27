// NVIDIA-drafted explanation of the recommendation. The suggested decision stays rule-based;
// the model only explains it, citing evidence items, and the engine removes any sentence that
// is not supported by the evidence it cites.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBidView, type BidView } from '../../../shared/domain/selectors.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { engine } from './documentPipeline.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RecommendationDraft {
  id: string;
  bidId: string;
  suggestedDecision: string;
  score: number;
  sentences: { text: string; citations: string[] }[];
  dropped: { text: string; reason: string }[];
  evidence: { id: string; text: string }[];
  model: string;
  latencyMs: number | null;
  createdAt: string;
}

const mapDraft = (r: any): RecommendationDraft => ({
  id: r.id,
  bidId: r.bid_id,
  suggestedDecision: r.suggested_decision,
  score: r.score,
  sentences: r.sentences,
  dropped: r.dropped,
  evidence: r.evidence,
  model: r.model,
  latencyMs: r.latency_ms,
  createdAt: r.created_at,
});

/** What the model may use: the bid's findings, and the requirements it met. */
export function evidenceFor(view: BidView): { id: string; text: string }[] {
  const findings = view.findings.map((f) => ({
    id: f.id,
    text: `${f.title}. Tender requires: ${f.expected}. Bidder submitted: ${f.submitted}. ${f.comparison}. Impact: ${f.impact}`,
  }));
  const met = view.checks
    .filter((c) => c.status === 'MET' || c.status === 'EXEMPTED')
    .map((c) => ({ id: c.requirement.code, text: `${c.requirement.title}: ${c.status === 'EXEMPTED' ? 'exempted' : 'met'}. ${c.submitted}. ${c.note ?? ''}`.trim() }));
  return [...findings, ...met];
}

export async function latestDraft(db: SupabaseClient, bidId: string) {
  const rows = must<any[]>(await db.from('recommendation_drafts').select('*').eq('bid_id', bidId).order('created_at', { ascending: false }).limit(1), 'recommendation drafts');
  return rows[0] ? mapDraft(rows[0]) : null;
}

export async function draftExplanation(db: SupabaseClient, userId: string, officerName: string, bidId: string) {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');
  if (!view.recommendation) throw new HttpError(409, 'This bid has no recommendation to explain yet. Run verification first.', 'NO_RECOMMENDATION');
  const evidence = evidenceFor(view);
  let result: any;
  try {
    result = await engine<any>('/api/v1/recommendation/draft', {
      bidId,
      bidder: view.bidder.companyName,
      tender: `${view.tender.id} ${view.tender.title}`,
      suggestedDecision: view.recommendation.suggestedDecision,
      score: view.score.score,
      evidence,
    });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err), 'NVIDIA_ERROR');
  }
  const row = must<any>(
    await db
      .from('recommendation_drafts')
      .insert({
        bid_id: bidId,
        suggested_decision: view.recommendation.suggestedDecision,
        score: view.score.score,
        sentences: result.sentences,
        dropped: result.dropped,
        evidence,
        model: result.model,
        latency_ms: result.latencyMs,
        raw_output: result.rawOutput,
        created_by: userId,
      })
      .select('*')
      .single(),
    'recommendation draft',
  );
  await db.from('audit_events').insert({
    bid_id: bidId,
    tender_id: view.tender.id,
    actor_profile_id: null,
    actor_display_name: 'CSAP AI (NVIDIA Nemotron)',
    actor_role: 'Automated service',
    action_type: 'SYSTEM_AI',
    summary: 'AI explanation drafted',
    details: `${officerName} asked CSAP AI to explain the suggested decision. ${result.sentences.length} sentence(s) kept, each citing evidence; ${result.dropped.length} removed as unsupported.`,
  });
  return mapDraft(row);
}
