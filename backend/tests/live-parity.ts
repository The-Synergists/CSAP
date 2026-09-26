/**
 * Integration check against the running backend + live Supabase:
 * signs in, loads /api/workspace and asserts every demo bid reads back exactly as defined in
 * shared/demo/seed.ts (status, scores, per-requirement checks, findings, EMD, decisions).
 *   API_URL=http://localhost:5000 npx tsx tests/live-parity.ts
 */
import assert from 'node:assert/strict';
import { DEMO_PASSWORD, seedDatabase } from '../../shared/demo/seed.js';
import { getBidView, getAlerts, getDashboardMetrics } from '../../shared/domain/selectors.js';
import type { Database } from '../../shared/domain/types.js';

const API = process.env.API_URL ?? 'http://localhost:5000';
const demo = seedDatabase();

const post = async (path: string, body: unknown, token?: string) =>
  fetch(`${API}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });

const login = await post('/api/auth/login', { identifier: demo.users[0].employeeId, password: DEMO_PASSWORD });
assert.equal(login.status, 200, 'login by employee ID');
const token = (await login.json()).data.accessToken as string;
const live: Database = (await (await fetch(`${API}/api/workspace`, { headers: { Authorization: `Bearer ${token}` } })).json()).data;

let checks = 0;
for (const bid of demo.bids) {
  const a = getBidView(demo, bid.id)!;
  const b = getBidView(live, bid.id);
  assert.ok(b, `${bid.id} present`);
  assert.equal(b.bid.status, a.bid.status, `${bid.id} status`);
  assert.equal(b.bid.complianceScore, a.bid.complianceScore);
  assert.equal(b.bid.riskLevel, a.bid.riskLevel);
  assert.equal(b.bid.riskScore, a.bid.riskScore);
  assert.equal(b.bidder.companyName, a.bidder.companyName);
  assert.equal(b.bidder.msmeCategory, a.bidder.msmeCategory, `${bid.id} MSE category`);
  assert.deepEqual(b.counts, a.counts, `${bid.id} counts`);
  assert.deepEqual(b.flags, a.flags, `${bid.id} flags`);
  assert.deepEqual(b.checks.map((c) => [c.requirement.code, c.status, c.submitted, c.note, c.findingId ?? null, c.document?.fileName ?? null]),
                   a.checks.map((c) => [c.requirement.code, c.status, c.submitted, c.note, c.findingId ?? null, c.document?.fileName ?? null]), `${bid.id} checks`);
  assert.deepEqual(b.checks.map((c) => c.requirement.clause), a.checks.map((c) => c.requirement.clause), `${bid.id} clauses`);
  const pick = (f: typeof a.findings[number]) => [f.id, f.title, f.severity, f.expected, f.submitted, f.comparison, f.impact, f.suggestedAction, f.evidenceExcerpt, f.status];
  assert.deepEqual(b.findings.map(pick), a.findings.map(pick), `${bid.id} findings`);
  assert.deepEqual(b.emd && { ...b.emd, documentId: 0 }, a.emd && { ...a.emd, documentId: 0 }, `${bid.id} EMD`);
  assert.equal(b.recommendation?.suggestedDecision, a.recommendation?.suggestedDecision);
  assert.deepEqual(b.recommendation?.concerns, a.recommendation?.concerns);
  assert.deepEqual(b.decisions.map((d) => [d.decision, d.reason, d.followedRecommendation]), a.decisions.map((d) => [d.decision, d.reason, d.followedRecommendation]));
  assert.equal(b.audit.length, a.audit.length, `${bid.id} audit count`);
  checks++;
}
assert.deepEqual(getAlerts(live), getAlerts(demo), 'alerts');
assert.deepEqual(getDashboardMetrics(live), getDashboardMetrics(demo), 'dashboard metrics');
console.log(`OK — ${checks} bids, alerts and dashboard metrics match the demo dataset exactly.`);
