// Officer time saved: measured durations of CSAP's automatic steps against a stated manual
// estimate for doing the same work by hand. The estimates are assumptions and are returned with
// the figures so every screen can show them.

import type { SupabaseClient } from '@supabase/supabase-js';
import { must } from '../lib/http.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export const MANUAL_MINUTES = {
  perDocument: 6, // open, read and cross-check one document against the bid
  perRegistry: 5, // log in to a government portal, search, note the result
  perRequirement: 4, // compare the evidence with one tender requirement
  report: 20, // write the evaluation note
};

const secs = (a?: string | null, b?: string | null) => (a && b ? Math.max(0, (Date.parse(b) - Date.parse(a)) / 1000) : 0);

export async function timeSaved(db: SupabaseClient) {
  const [batches, portal, runs, reports, bids] = await Promise.all([
    db.from('document_batches').select('bid_id, total, status, started_at, completed_at').eq('status', 'COMPLETED').order('started_at', { ascending: false }),
    db.from('portal_verifications').select('bid_id, run_id, status, latency_ms, checked_at').order('checked_at', { ascending: false }).limit(1000),
    db.from('ai_verification_runs').select('bid_id, status, steps, started_at, completed_at').eq('status', 'COMPLETED'),
    db.from('evaluation_reports').select('bid_id'),
    db.from('bids').select('id'),
  ]);
  const B = must<any[]>(batches, 'batches');
  const P = must<any[]>(portal, 'portal checks');
  const R = must<any[]>(runs, 'verification runs');
  const E = must<any[]>(reports, 'reports');

  const rows = must<any[]>(bids, 'bids').map((b) => {
    const batch = B.find((x) => x.bid_id === b.id);
    const mine = P.filter((x) => x.bid_id === b.id);
    const runId = mine[0]?.run_id;
    const run = mine.filter((x) => x.run_id === runId);
    const registries = run.filter((x) => x.status !== 'NOT_APPLICABLE').length;
    const portalSecs = run.length ? secs(run[run.length - 1].checked_at, run[0].checked_at) + (run[run.length - 1].latency_ms ?? 0) / 1000 : 0;
    const engine = R.filter((x) => x.bid_id === b.id && x.steps?.source === 'engine').sort((x, y) => (y.completed_at ?? '').localeCompare(x.completed_at ?? ''))[0];
    const requirements = engine?.steps?.checks?.length ?? 0;
    const reported = E.some((x) => x.bid_id === b.id);

    const automatedSeconds = (batch ? secs(batch.started_at, batch.completed_at) : 0) + portalSecs + (engine ? secs(engine.started_at, engine.completed_at) : 0);
    const manualMinutes =
      (batch ? batch.total * MANUAL_MINUTES.perDocument : 0) +
      registries * MANUAL_MINUTES.perRegistry +
      requirements * MANUAL_MINUTES.perRequirement +
      (reported ? MANUAL_MINUTES.report : 0);
    return {
      bidId: b.id,
      documentsRead: batch?.total ?? 0,
      registriesChecked: registries,
      requirementsChecked: requirements,
      reportGenerated: reported,
      automatedSeconds: Math.round(automatedSeconds),
      manualMinutes,
    };
  }).filter((r) => r.manualMinutes > 0);

  const totals = rows.reduce((t, r) => ({ automatedSeconds: t.automatedSeconds + r.automatedSeconds, manualMinutes: t.manualMinutes + r.manualMinutes }), { automatedSeconds: 0, manualMinutes: 0 });
  return { assumptions: MANUAL_MINUTES, bids: rows, totals: { ...totals, savedMinutes: Math.max(0, totals.manualMinutes - totals.automatedSeconds / 60) } };
}
