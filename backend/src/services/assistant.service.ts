// Officer assistant on NVIDIA Nemotron. The model gets a compact snapshot of what the officer can
// see (tenders, bids, findings, the open bid in detail) and a map of CSAP's pages, and answers
// with plain text plus action links. Links are validated against real routes and IDs, so the
// assistant can guide and prepare, but every action is still the officer's own click.

import type { SupabaseClient } from '@supabase/supabase-js';
import { getBidView, listBidViews } from '../../../shared/domain/selectors.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError } from '../lib/http.js';
import { engine } from './documentPipeline.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const PAGES = `
/dashboard — work summary, alerts, time saved
/tenders — all tenders; /tenders/<TENDER_SLUG> — one tender, where the slug replaces slashes with dashes (GEM/2026/CPCL/001 -> /tenders/GEM-2026-CPCL-001)
/bids/<BID_ID>/<tab> — one bid; tabs: overview, documents (read all documents with CSAP AI), portal (government registry checks), pan (PAN document verification), emd, compliance (score and why), risk, evidence (findings), decision (recommendation, officer decision, evaluation report), activity
/bids/<BID_ID>/evidence?finding=<EVD_ID> — open one finding
/bids/<BID_ID>/decision?decision=<APPROVE|REJECT|REQUEST_CLARIFICATION|COMMITTEE_REVIEW>&finding=<EVD_ID> — decision form pre-filled (the officer still reviews, writes remarks and confirms)
/reviews — reviews the officer started and bids the officer decided; /alerts — bids with disqualifying issues or requests waiting; /reports — each bid's evaluation report and compiled reports
/audit — tamper-evident audit trail (verify integrity); /gateway — government registries; /gateway/<pan|gstn|udyam|mca21|epfo|esic|startup_india|nsic|debarment|digilocker>?q=<NUMBER> — check a number
/gem — simulated GeM portal (bidder side); /settings — profile and integrations (links to the Government Gateway)`;

const SYSTEM = `You are the CSAP assistant for a procurement officer. CSAP verifies GeM bids; the officer makes every decision. Do not name the buyer organisation.
Answer ONLY from the DATA given. If the data does not contain the answer, say so. Never invent bids, numbers, findings or pages.
Be brief: 1 to 4 short sentences, plain English, no markdown tables.
When the officer wants to see or do something, give links to the right page from PAGES (at most 3). For tasks, link to the page where the officer completes it (for example the pre-filled decision form); never claim you performed an action.
Respond with JSON only: {"answer": "...", "actions": [{"label": "short button text", "path": "/path"}]}`;

const ALLOWED = [
  /^\/(dashboard|tenders|reviews|alerts|reports|audit|gateway|gem|settings)$/,
  /^\/tenders\/GEM-\d{4}-CPCL-\d{3}$/,
  /^\/bids\/BID-\d{3}(\/(overview|documents|portal|pan|emd|compliance|risk|evidence|decision|activity))?$/,
  /^\/bids\/BID-\d{3}\/evidence\?finding=EVD-\d{3,4}$/,
  /^\/bids\/BID-\d{3}\/decision\?decision=(APPROVE|REJECT|REQUEST_CLARIFICATION)(&finding=EVD-\d{3,4})?$/,
  /^\/gateway\/(pan|gstn|udyam|mca21|epfo|esic|startup_india|nsic|debarment|digilocker)(\?q=[A-Za-z0-9%/-]{3,40})?$/,
];

function snapshot(ws: any, bidId?: string) {
  const views = listBidViews(ws);
  const list = (f: (v: (typeof views)[number]) => boolean) => views.filter(f).map((v) => `${v.bid.id} (${v.bidder.companyName}, ${v.bid.riskLevel.toLowerCase()} risk)`).join(', ') || 'none';
  const lines = [
    `AWAITING THE OFFICER'S DECISION: ${list((v) => v.flags.awaitingDecision)}`,
    `WAITING FOR A BIDDER'S CLARIFICATION (decision already requested): ${list((v) => v.flags.clarification)}`,
    `DECIDED: ${list((v) => v.flags.closed)}`,
    'TENDERS: ' + ws.tenders.map((t: any) => `${t.id} "${t.title}" (${t.status.replace(/_/g, ' ').toLowerCase()}, closes ${t.deadlineDate})`).join('; '),
    'BIDS:',
    ...views.map(
      (v) =>
        `- ${v.bid.id} ${v.bidder.companyName} on ${v.tender.id}: status ${v.bid.status.replace(/_/g, ' ').toLowerCase()}, score ${v.bid.complianceScore}/100, risk ${v.bid.riskLevel.toLowerCase()}, ${v.counts.met}/${v.counts.total} met${v.bid.source === 'GEM' ? ', came from GeM' : ''}. Open findings: ${
          v.openFindings.map((f) => `${f.id} ${f.title} (${f.severity.toLowerCase()})`).join('; ') || 'none'
        }.${v.latestDecision ? ` Decision: ${v.latestDecision.decision.replace(/_/g, ' ').toLowerCase()}.` : ''}`,
    ),
  ];
  const v = bidId ? getBidView(ws, bidId) : undefined;
  if (v) {
    lines.push(
      `OPEN BID ${v.bid.id} (${v.bidder.companyName}, PAN ${v.bidder.pan}, GSTIN ${v.bidder.gstin}${v.bidder.udyamNumber ? `, Udyam ${v.bidder.udyamNumber}` : ''}):`,
      'Requirements: ' + v.checks.map((c) => `${c.requirement.code} ${c.requirement.title}: ${c.status.toLowerCase()} (${c.submitted})`).join('; '),
      'Findings: ' + (v.findings.map((f) => `${f.id} ${f.title}: required ${f.expected}; submitted ${f.submitted}; action: ${f.suggestedAction}`).join(' | ') || 'none'),
      v.emd ? `EMD: required ${v.emd.requiredAmount}, submitted ${v.emd.submittedAmount} (${v.emd.instrument}), ${v.emd.result.toLowerCase()}` : 'EMD: none',
      'Registries: ' + (v.portal.map((p) => `${p.registry} ${p.status.toLowerCase()}`).join(', ') || 'not checked yet'),
      v.recommendation ? `Suggested action (advisory): ${v.recommendation.suggestedDecision} — ${v.recommendation.summary}` : '',
    );
  }
  return lines.filter(Boolean).join('\n');
}

const parse = (content: string): { answer: string; actions: { label: string; path: string }[] } => {
  const m = content.replace(/^```(?:json)?\s*|\s*```$/g, '').match(/\{[\s\S]*\}/);
  if (!m) return { answer: content.trim().slice(0, 800), actions: [] };
  try {
    const j = JSON.parse(m[0]);
    return { answer: String(j.answer ?? '').slice(0, 1200), actions: Array.isArray(j.actions) ? j.actions : [] };
  } catch {
    return { answer: content.trim().slice(0, 800), actions: [] };
  }
};

export async function askAssistant(db: SupabaseClient, input: { message: string; path?: string; bidId?: string; history?: { role: string; content: string }[] }) {
  const message = String(input.message ?? '').trim();
  if (!message) throw new HttpError(400, 'Ask a question.', 'VALIDATION');
  if (message.length > 600) throw new HttpError(400, 'Keep the question under 600 characters.', 'VALIDATION');
  const ws = await loadWorkspace(db);
  const bidId = input.bidId && /^BID-\d{3}$/.test(input.bidId) ? input.bidId : undefined;
  const history = (input.history ?? []).slice(-6).map((h) => `${h.role === 'user' ? 'Officer' : 'Assistant'}: ${String(h.content).slice(0, 400)}`).join('\n');
  const user = `PAGES:${PAGES}\n\nDATA:\n${snapshot(ws, bidId)}\n\nThe officer is on page ${input.path ?? '/'}${bidId ? ` (bid ${bidId})` : ''}.\n${history ? `Conversation so far:\n${history}\n` : ''}Officer: ${message}`;

  let result: { content: string; model: string; latencyMs: number };
  try {
    result = await engine('/api/v1/llm/chat', { system: SYSTEM, user, maxTokens: 500 });
    // The hosted model occasionally returns an empty stream; ask once more before giving up.
    if (!parse(result.content).answer) result = await engine('/api/v1/llm/chat', { system: SYSTEM, user, maxTokens: 500 });
  } catch (err) {
    throw new HttpError(502, err instanceof Error ? err.message : String(err), 'NVIDIA_ERROR');
  }
  const out = parse(result.content);
  const bidIds = new Set(ws.bids.map((b: any) => b.id));
  const findingIds = new Set(ws.findings.map((f: any) => f.id));
  const actions = out.actions
    .filter((a) => a && typeof a.path === 'string' && typeof a.label === 'string')
    .map((a) => ({ label: a.label.slice(0, 60), path: a.path.trim() }))
    .filter((a) => ALLOWED.some((re) => re.test(a.path)))
    .filter((a) => [...a.path.matchAll(/BID-\d{3}/g)].every((m) => bidIds.has(m[0])) && [...a.path.matchAll(/EVD-\d{3,4}/g)].every((m) => findingIds.has(m[0])))
    .slice(0, 3);
  return { answer: out.answer || 'I could not find that in CSAP.', actions, model: result.model, latencyMs: result.latencyMs };
}
