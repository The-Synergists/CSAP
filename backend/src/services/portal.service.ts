// Government portal verification: runs every applicable registry adapter for a bid and stores
// one portal_verifications row per registry as soon as it answers (streamed over Realtime).

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { mapPortalRow } from '../../../shared/domain/portal.js';
import { getBidView, type BidView } from '../../../shared/domain/selectors.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { ADAPTERS, NOT_APPLICABLE_REASON, type RegistryResult } from '../registries/adapters.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function listPortalChecks(db: SupabaseClient, bidId: string) {
  const rows = must<any[]>(
    await db.from('portal_verifications').select('*').eq('bid_id', bidId).order('checked_at', { ascending: false }).limit(100),
    'portal verifications',
  );
  return rows.map(mapPortalRow);
}

/** Starts a run and returns its id immediately; registries are checked in the background. */
export async function startPortalChecks(db: SupabaseClient, userId: string, officerName: string, bidId: string): Promise<{ runId: string; registries: number }> {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');
  const runId = randomUUID();
  waitUntil(runChecks(db, userId, officerName, view, runId));
  return { runId, registries: ADAPTERS.length };
}

/** Runs every registry check for a bid and waits for the result (used by automatic GeM intake). */
export async function runPortalChecksNow(db: SupabaseClient, userId: string | null, actorName: string, bidId: string) {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');
  await runChecks(db, userId, actorName, view, randomUUID());
}

async function runChecks(db: SupabaseClient, userId: string | null, officerName: string, view: BidView, runId: string) {
  const audit = (summary: string, details: string) =>
    db.from('audit_events').insert({
      bid_id: view.bid.id,
      tender_id: view.tender.id,
      actor_profile_id: null,
      actor_display_name: 'Government portal verification',
      actor_role: 'Automated service',
      action_type: 'SYSTEM_AI',
      summary,
      details,
    });

  await audit('Portal verification started', `${officerName} started registry checks across ${ADAPTERS.length} government portals.`);
  const tally: Record<string, number> = {};

  for (const adapter of ADAPTERS) {
    const identifier = adapter.identifier(view);
    let result: RegistryResult;
    if (!identifier) {
      result = {
        registry: adapter.registry,
        mode: adapter.mode,
        identifier: null,
        status: 'NOT_APPLICABLE',
        summary: NOT_APPLICABLE_REASON[adapter.registry] ?? 'Not applicable to this bidder.',
        facts: [],
        checks: [],
        request: null,
        response: null,
        latencyMs: null,
      };
    } else {
      try {
        result = await adapter.verify(view, identifier);
      } catch (err) {
        // Unreachable registry = not verified. Never reported as a pass.
        result = {
          registry: adapter.registry,
          mode: adapter.mode,
          identifier,
          status: 'UNAVAILABLE',
          summary: `Registry could not be reached: ${err instanceof Error ? err.message : String(err)}`,
          facts: [],
          checks: [],
          request: null,
          response: null,
          latencyMs: null,
        };
      }
    }
    tally[result.status] = (tally[result.status] ?? 0) + 1;
    await db.from('portal_verifications').insert({
      run_id: runId,
      bid_id: view.bid.id,
      registry: result.registry,
      mode: result.mode,
      identifier: result.identifier,
      status: result.status,
      summary: result.summary,
      facts: result.facts,
      checks: result.checks,
      request: result.request,
      response: result.response,
      latency_ms: result.latencyMs,
      initiated_by: userId,
    });
  }

  const parts = Object.entries(tally).map(([s, n]) => `${n} ${s.toLowerCase().replace('_', ' ')}`);
  await audit('Portal verification completed', `Registry results: ${parts.join(', ')}.`);
}
