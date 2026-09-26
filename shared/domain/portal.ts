// Maps a portal_verifications row (as stored and as delivered by Supabase Realtime) to the
// domain type. Shared by the backend and the browser.

import type { PortalVerification } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapPortalRow = (r: any): PortalVerification => ({
  id: r.id,
  runId: r.run_id,
  bidId: r.bid_id,
  registry: r.registry,
  mode: r.mode,
  identifier: r.identifier,
  status: r.status,
  summary: r.summary,
  facts: r.facts ?? [],
  checks: r.checks ?? [],
  request: r.request,
  response: r.response,
  latencyMs: r.latency_ms,
  checkedAt: r.checked_at,
});
