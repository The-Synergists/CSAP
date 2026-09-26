import type { SupabaseClient } from '@supabase/supabase-js';
import type { DecisionType } from '../../../shared/domain/types.js';
import { HttpError, must } from '../lib/http.js';

const DECISIONS: DecisionType[] = ['APPROVE', 'REJECT', 'REQUEST_CLARIFICATION', 'COMMITTEE_REVIEW'];
const FINAL: DecisionType[] = ['APPROVE', 'REJECT'];

export interface DecisionRequest {
  bidId: string;
  decision: DecisionType;
  reason: string;
  remarks: string;
}

export function validateDecision(body: unknown): DecisionRequest {
  const b = (body ?? {}) as Partial<DecisionRequest>;
  if (!b.bidId || typeof b.bidId !== 'string') throw new HttpError(400, 'bidId is required.', 'VALIDATION');
  if (!b.decision || !DECISIONS.includes(b.decision)) throw new HttpError(400, `decision must be one of ${DECISIONS.join(', ')}.`, 'VALIDATION');
  if (!b.reason?.trim()) throw new HttpError(400, 'Select a reason for the decision.', 'VALIDATION');
  if (!b.remarks || b.remarks.trim().length < 20) throw new HttpError(400, 'Remarks must be at least 20 characters.', 'VALIDATION');
  return { bidId: b.bidId, decision: b.decision, reason: b.reason.trim(), remarks: b.remarks.trim() };
}

/**
 * Records the decision through the submit_officer_decision() RPC, which runs under the
 * officer's own JWT: the decision row and its audit event are written atomically and the
 * officer identity comes from auth.uid(), not from the request body.
 */
export async function submitDecision(db: SupabaseClient, input: DecisionRequest): Promise<{ id: string }> {
  const latest = must<{ decision: DecisionType }[]>(
    await db.from('officer_decisions').select('decision').eq('bid_id', input.bidId).order('created_at', { ascending: false }).limit(1),
    'decision history',
  );
  if (latest[0] && FINAL.includes(latest[0].decision)) {
    throw new HttpError(409, 'A final decision has already been recorded for this bid.', 'ALREADY_DECIDED');
  }

  const { data, error } = await db.rpc('submit_officer_decision', {
    p_bid_id: input.bidId,
    p_decision: input.decision,
    p_remarks: input.remarks,
    p_justification_reason: input.reason,
  });
  if (error) {
    if (/not found/i.test(error.message)) throw new HttpError(404, `Bid ${input.bidId} was not found.`, 'NOT_FOUND');
    throw new HttpError(502, `Could not record the decision: ${error.message}`, 'DB_ERROR');
  }
  return { id: data as string };
}
