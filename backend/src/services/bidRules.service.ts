// Evaluation workflow rules shared by every verification action. The database enforces the same
// rules (bid_is_final, officer_decisions_final_guard); these checks give the officer a clear
// message before anything starts.

import type { SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from '../lib/http.js';

export async function isFinal(db: SupabaseClient, bidId: string): Promise<boolean> {
  const { data, error } = await db.rpc('bid_is_final', { p_bid_id: bidId });
  if (error) throw new HttpError(502, `Could not check the bid's status: ${error.message}`, 'DB_ERROR');
  return data === true;
}

/** Refuses verification work on a bid whose decision is final (until a re-evaluation is accepted). */
export async function assertOpenForVerification(db: SupabaseClient, bidId: string) {
  if (await isFinal(db, bidId)) {
    throw new HttpError(
      409,
      'This bid has a final decision, so verification is closed. It reopens only if the bidder requests re-evaluation and you accept it.',
      'BID_FINAL',
    );
  }
}

/** Refuses to start document reading while a reading of the same bid is still running. */
export async function assertNoDocumentReadingRunning(db: SupabaseClient, bidId: string) {
  const since = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data } = await db.from('document_batches').select('id').eq('bid_id', bidId).eq('status', 'RUNNING').gte('started_at', since).limit(1);
  if (data?.length) throw new HttpError(409, 'The documents of this bid are already being read. Wait for it to finish.', 'ALREADY_RUNNING');
}

/** Refuses to start registry checks while a run for the same bid started in the last minute is incomplete. */
export async function assertNoPortalRunRunning(db: SupabaseClient, bidId: string, registries: number) {
  const since = new Date(Date.now() - 60_000).toISOString();
  const { data } = await db.from('portal_verifications').select('run_id').eq('bid_id', bidId).gte('checked_at', since);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.run_id, (counts.get(r.run_id) ?? 0) + 1);
  if ([...counts.values()].some((n) => n < registries)) throw new HttpError(409, 'Registry checks for this bid are already running. Wait for them to finish.', 'ALREADY_RUNNING');
}
