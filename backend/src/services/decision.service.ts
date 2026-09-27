import type { SupabaseClient } from '@supabase/supabase-js';
import { isFinal } from './bidRules.service.js';
import type { DecisionType } from '../../../shared/domain/types.js';
import { HttpError, must } from '../lib/http.js';

const DECISIONS: DecisionType[] = ['APPROVE', 'REJECT', 'REQUEST_CLARIFICATION'];
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
  if (!b.remarks?.trim()) throw new HttpError(400, 'Enter your remarks for the decision.', 'VALIDATION');
  return { bidId: b.bidId, decision: b.decision, reason: b.reason.trim(), remarks: b.remarks.trim() };
}

/**
 * Records the decision through the submit_officer_decision() RPC, which runs under the
 * officer's own JWT: the decision row and its audit event are written atomically and the
 * officer identity comes from auth.uid(), not from the request body.
 */
export async function submitDecision(db: SupabaseClient, input: DecisionRequest): Promise<{ id: string }> {
  // A final decision closes the bid unless a re-evaluation was accepted after it (also enforced in the database).
  if (await isFinal(db, input.bidId)) {
    throw new HttpError(409, 'A final decision has already been recorded for this bid. It can be decided again only after a re-evaluation request is accepted.', 'ALREADY_DECIDED');
  }

  // The officer decides on a verified bid: its documents must have been read and the latest
  // verification must have finished (not still running, not stopped).
  const { data: batches } = await db.from('document_batches').select('status').eq('bid_id', input.bidId).eq('status', 'COMPLETED').limit(1);
  if (!batches?.length) {
    throw new HttpError(409, "CSAP has not read this bid's documents yet. Run Re-run verification and decide on the verified result.", 'NOT_VERIFIED');
  }
  const { data: marks } = await db
    .from('audit_events')
    .select('summary')
    .eq('bid_id', input.bidId)
    .in('summary', ['Re-verification requested', 'Bid received from GeM', 'Automatic verification completed', 'Automatic verification stopped'])
    .order('created_at', { ascending: false })
    .limit(1);
  const lastMark = marks?.[0]?.summary;
  if (lastMark && lastMark !== 'Automatic verification completed') {
    throw new HttpError(
      409,
      lastMark === 'Automatic verification stopped' ? 'The last verification did not finish. Run Re-run verification before deciding.' : 'CSAP is still verifying this bid. Decide once it has finished.',
      'NOT_VERIFIED',
    );
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
