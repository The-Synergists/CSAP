/**
 * Loads the BidSure demo dataset (shared/demo/seed.ts — the single source of the demo
 * scenarios) into Supabase using the storage conventions in backend/src/db/conventions.ts.
 *
 *   npm run seed            # from /database; reads ../backend/.env
 *
 * Before changing anything it writes a JSON backup of every table to database/backups/.
 * Only rows belonging to the demo tenders / bids / companies are replaced.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { DEMO_PASSWORD, seedDatabase } from '../../shared/demo/seed.js';
import type { EngineCheck } from '../../shared/domain/enginePayload.js';
import { getBidView } from '../../shared/domain/selectors.js';
import { buildSteps } from '../../shared/domain/verification.js';
import {
  ACTOR_TO_DB,
  CHECK_TO_DB,
  complianceNotes,
  docClauseRef,
  EMD_TO_DB,
  evidenceRequirementTitle,
  SEVERITY_TO_FINDING_TYPE,
  type StoredRun,
} from '../../backend/src/db/conventions.js';

function loadEnv() {
  const file = new URL('../../backend/.env', import.meta.url);
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnv();

const URL_ = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !KEY) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in backend/.env');
const sb = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

const ok = <T>(r: { data: T; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
};

const TABLES = [
  'profiles', 'companies', 'company_turnover', 'tenders', 'tender_requirements', 'bids', 'evidence_items',
  'bid_documents', 'bid_emd', 'compliance_check_items', 'risk_factors', 'ai_verification_runs',
  'gov_portal_verification_log', 'ai_recommendations', 'ai_recommendation_points', 'officer_decisions', 'audit_events',
];

async function backup() {
  const out: Record<string, unknown> = {};
  for (const t of TABLES) out[t] = ok(await sb.from(t).select('*'), `backup ${t}`);
  const dir = new URL('../backups/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const file = new URL(`backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, dir);
  writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Backup written: ${file.pathname}`);
}

async function main() {
  const demo = seedDatabase();
  await backup();

  // 1. Officer account (no public sign-up; provisioned here).
  const demoUser = demo.users[0];
  const users = ok(await sb.auth.admin.listUsers(), 'list users');
  let officerId = users.users.find((u) => u.email === demoUser.email)?.id;
  if (!officerId) {
    const created = ok(await sb.auth.admin.createUser({ email: demoUser.email, password: DEMO_PASSWORD, email_confirm: true }), 'create user');
    officerId = created.user!.id;
    console.log(`Created officer ${demoUser.email}`);
  }
  ok(
    await sb.from('profiles').update({
      full_name: demoUser.name,
      designation: demoUser.designation,
      organization: demoUser.organization,
      badge_id: demoUser.employeeId,
    }).eq('id', officerId),
    'update profile',
  );
  const userIdMap = new Map([[demoUser.id, officerId]]);

  // 2. Clear demo rows (bid children cascade from bids).
  const bidIds = demo.bids.map((b) => b.id);
  const tenderIds = demo.tenders.map((t) => t.id);
  // Bids that arrived through the simulated GeM portal are demo runs too: remove them and their companies.
  const gemBids = ok(await sb.from('bids').select('id, company_id').eq('source', 'GEM'), 'GeM bids');
  if (gemBids.length) {
    ok(await sb.from('audit_events').delete().in('bid_id', gemBids.map((b) => b.id)), 'clear GeM bid audit');
    ok(await sb.from('bids').delete().in('id', gemBids.map((b) => b.id)), 'clear GeM bids');
    for (const b of gemBids) {
      const { data: files } = await sb.storage.from('bid-documents').list(b.id, { limit: 100 });
      if (files?.length) await sb.storage.from('bid-documents').remove(files.map((f) => `${b.id}/${f.name}`));
    }
    ok(await sb.from('companies').delete().in('id', gemBids.map((b) => b.company_id)).like('vendor_code', 'V-GEM-%'), 'clear GeM companies');
  }
  ok(await sb.from('gem_bid_submissions').delete().neq('gem_bid_no', ''), 'clear GeM submissions');
  // Tenders an officer created during a demo.
  const officerTenders = ok(await sb.from('tenders').select('id').eq('created_by_officer', true), 'officer tenders');
  if (officerTenders.length) {
    const ids = officerTenders.map((t) => t.id);
    ok(await sb.from('audit_events').delete().in('tender_id', ids), 'clear officer tender audit');
    ok(await sb.from('tenders').delete().in('id', ids), 'clear officer tenders');
  }
  const { data: gemFolders } = await sb.storage.from('bid-documents').list('gem/submissions', { limit: 1000 });
  for (const folder of gemFolders ?? []) {
    const { data: files } = await sb.storage.from('bid-documents').list(`gem/submissions/${folder.name}`, { limit: 100 });
    if (files?.length) await sb.storage.from('bid-documents').remove(files.map((f) => `gem/submissions/${folder.name}/${f.name}`));
  }
  ok(await sb.from('audit_events').delete().in('tender_id', tenderIds), 'clear tender audit');
  ok(await sb.from('audit_events').delete().in('bid_id', bidIds), 'clear bid audit');
  ok(await sb.from('bids').delete().in('id', bidIds), 'clear bids');
  ok(await sb.from('tender_requirements').delete().in('tender_id', tenderIds), 'clear requirements');

  // 3. Master data.
  ok(await sb.from('tenders').upsert(demo.tenders.map((t) => ({
    id: t.id, title: t.title, category: t.category, division: t.division, estimated_value: t.estimatedValue,
    emd_amount: t.emdAmount, publish_date: t.publishDate, deadline_date: t.deadlineDate,
    technical_opening_date: t.technicalOpeningDate, status: t.status, description: t.description, officer_in_charge: t.officerInCharge,
  }))), 'tenders');

  ok(await sb.from('tender_requirements').insert(demo.requirements.map((r) => ({
    tender_id: r.tenderId, display_code: r.code, category: r.category, title: r.title,
    criterion: r.criterion, mandatory: r.mandatory, benchmark_value: r.benchmark,
  }))), 'requirements');

  const companies = ok(await sb.from('companies').upsert(demo.bidders.map((b) => ({
    vendor_code: b.id, company_name: b.companyName, incorporation_date: b.incorporationDate,
    registered_address: b.registeredAddress, gstin: b.gstin, pan: b.pan, udyam_number: b.udyamNumber || null,
    cin: b.cin ?? null, epfo_code: b.epfoCode ?? null, esic_code: b.esicCode ?? null,
    dpiit_number: b.dpiitNumber ?? null, nsic_number: b.nsicNumber ?? null,
  })), { onConflict: 'vendor_code' }).select('id, vendor_code'), 'companies');
  const companyId = new Map(companies.map((c) => [c.vendor_code, c.id]));
  ok(await sb.from('company_turnover').delete().in('company_id', [...companyId.values()]), 'clear turnover');
  ok(await sb.from('company_turnover').insert(demo.bidders.flatMap((b) => b.turnover.map((t) => ({
    company_id: companyId.get(b.id), financial_year: t.financialYear, turnover_amount: Math.round(t.amountCr * 1e7),
  })))), 'turnover');

  const reqCode = new Map(demo.requirements.map((r) => [r.id, r]));

  // 4. Bids and everything that hangs off them.
  for (const bid of demo.bids) {
    const view = getBidView(demo, bid.id)!;
    ok(await sb.from('bids').insert({
      id: bid.id, tender_id: bid.tenderId, company_id: companyId.get(bid.bidderId),
      make_in_india_percentage: bid.makeInIndiaPercentage, overall_compliance_score: view.score.score,
      risk_level: bid.riskLevel, risk_score: bid.riskScore, primary_concern: bid.primaryConcern, submission_timestamp: bid.submittedAt,
    }), `bid ${bid.id}`);

    const evidence = ok(await sb.from('evidence_items').insert(view.findings.map((f) => {
      const req = reqCode.get(f.requirementId)!;
      return {
        bid_id: bid.id, display_code: f.id, requirement_title: evidenceRequirementTitle(req.code, req.title),
        finding_type: SEVERITY_TO_FINDING_TYPE[f.severity], ai_finding: f.title,
        submitted_document_name: view.documents.find((d) => d.id === f.documentId)?.fileName ?? '—',
        document_snippet: f.evidenceExcerpt, tender_clause_requirement: f.expected, verification_timestamp: f.detectedAt,
        source: f.evidenceSource, resolution_status: 'OPEN',
      };
    })).select('id, display_code'), `evidence ${bid.id}`);
    const evidenceUuid = new Map(evidence.map((e) => [e.display_code, e.id]));

    ok(await sb.from('bid_documents').insert(view.documents.map((d) => {
      const req = reqCode.get(d.requirementId)!;
      const check = view.checks.find((c) => c.requirementId === d.requirementId);
      return {
        bid_id: bid.id, display_code: d.id, name: d.name, doc_type: req.category, file_name: d.fileName, file_size: d.fileSize,
        upload_timestamp: d.uploadedAt, ocr_status: 'COMPLETED', verification_status: CHECK_TO_DB[check?.status ?? 'MET'],
        status_message: check?.note ?? null, extracted_snippet: d.extractedText, tender_clause_reference: docClauseRef(req.code, req.clause),
        evidence_item_id: check?.findingId ? evidenceUuid.get(check.findingId) : null,
      };
    })), `documents ${bid.id}`);

    if (view.emd) {
      const e = view.emd;
      ok(await sb.from('bid_emd').insert({
        bid_id: bid.id, required_amount: e.requiredAmount, submitted_amount: e.submittedAmount, instrument_type: e.instrument,
        transaction_or_bg_no: e.reference, bank_name: e.bankName, issuing_branch: e.branch ?? null, valid_until: e.validUntil ?? null,
        payment_date: e.paymentDate, payment_status: e.instrument === 'MSME_EXEMPTION' ? 'EXEMPTED' : 'SUCCESSFUL',
        bidder_match: e.remitterMatchesBidder, verification_result: EMD_TO_DB[e.result], officer_note: e.note,
      }), `emd ${bid.id}`);
    }

    ok(await sb.from('compliance_check_items').insert(view.checks.map((c) => ({
      bid_id: bid.id, display_code: c.requirement.code, requirement_name: c.requirement.title, category: c.requirement.category,
      status: CHECK_TO_DB[c.status], mandatory: c.requirement.mandatory, score_contribution: 0,
      notes: complianceNotes(c.submitted, c.note), evidence_item_id: c.findingId ? evidenceUuid.get(c.findingId) : null,
    }))), `checks ${bid.id}`);

    if (view.riskFactors.length) {
      ok(await sb.from('risk_factors').insert(view.riskFactors.map((r) => ({
        bid_id: bid.id, display_code: r.id, category: r.category, title: r.title, level: r.level, description: r.description,
        impact_score: 0, evidence_item_id: r.findingId ? evidenceUuid.get(r.findingId) : null,
      }))), `risks ${bid.id}`);
    }

    // The recorded verification run carries the per-requirement detail (see StoredRun).
    const checks: EngineCheck[] = view.checks.map((c) => ({
      requirementCode: c.requirement.code, status: c.status, submitted: c.submitted, note: c.note,
      documentId: c.documentId ?? null, riskPoints: 0,
      finding: c.finding && {
        title: c.finding.title, severity: c.finding.severity, expected: c.finding.expected, submitted: c.finding.submitted,
        comparison: c.finding.comparison, evidenceExcerpt: c.finding.evidenceExcerpt, evidenceSource: c.finding.evidenceSource,
        impact: c.finding.impact, suggestedAction: c.finding.suggestedAction,
      },
    }));
    const started = view.audit.find((a) => a.summary === 'Verification started')?.timestamp ?? bid.submittedAt;
    const run = ok(await sb.from('ai_verification_runs').insert({
      bid_id: bid.id, initiated_by: officerId, status: 'COMPLETED', started_at: started, completed_at: bid.lastVerifiedAt,
      steps: { kind: 'bidsure.verification.v1', source: 'seed', steps: buildSteps(view), checks } satisfies StoredRun,
    }).select('id').single(), `run ${bid.id}`);

    if (view.recommendation) {
      const r = view.recommendation;
      const rec = ok(await sb.from('ai_recommendations').insert({
        bid_id: bid.id, ai_verification_run_id: run.id, summary: r.summary, details: r.rationale,
        suggested_action: r.suggestedDecision, confidence: 0, created_at: r.generatedAt,
      }).select('id').single(), `recommendation ${bid.id}`);
      const pts = [
        ...r.strengths.map((t, i) => ({ ai_recommendation_id: rec.id, kind: 'PRO', point_text: t, sort_order: i })),
        ...r.concerns.map((t, i) => ({ ai_recommendation_id: rec.id, kind: 'CON', point_text: t, sort_order: i })),
      ];
      if (pts.length) ok(await sb.from('ai_recommendation_points').insert(pts), `points ${bid.id}`);
    }

    for (const d of view.decisions) {
      ok(await sb.from('officer_decisions').insert({
        bid_id: bid.id, tender_id: bid.tenderId, officer_profile_id: userIdMap.get(d.officerId) ?? officerId, decision: d.decision,
        remarks: d.remarks, justification_reason: d.reason, dsc_signed: false, created_at: d.decidedAt,
      }), `decision ${bid.id}`);
    }
    console.log(`Seeded ${bid.id} — ${view.bidder.companyName}`);
  }

  // 5. Audit trail (tender- and bid-level).
  ok(await sb.from('audit_events').insert(demo.auditEvents.map((a) => ({
    bid_id: a.bidId ?? null, tender_id: a.tenderId,
    actor_profile_id: a.actorType === 'OFFICER' ? officerId : null,
    actor_display_name: a.actor, actor_role: ACTOR_TO_DB[a.actorType].role, action_type: ACTOR_TO_DB[a.actorType].actionType,
    summary: a.summary, details: a.details, created_at: a.timestamp,
  }))), 'audit events');

  // 6. Document files for the PAN verification pipeline (bucket `bid-documents`).
  const samplesDir = new URL('../sample_documents/', import.meta.url);
  for (const file of readdirSync(samplesDir).filter((f) => f.endsWith('.png') || f.endsWith('.pdf'))) {
    const bidId = /^(BID-\d{3})_/.exec(file)?.[1];
    const path = bidId ? `${bidId}/${file}` : `samples/${file}`;
    const { error } = await sb.storage
      .from('bid-documents')
      .upload(path, readFileSync(new URL(file, samplesDir)), { contentType: file.endsWith('.pdf') ? 'application/pdf' : 'image/png', upsert: true });
    if (error) throw new Error(`upload ${path}: ${error.message}`);
    if (bidId) {
      ok(
        await sb.from('bid_documents').update({ storage_path: path, mime_type: 'image/png' }).eq('bid_id', bidId).like('tender_clause_reference', 'REQ-07 %'),
        `link ${path}`,
      );
    }
    console.log(`Stored ${path}`);
  }

  // 7. Specimen images of every other bid document (document-intelligence pipeline).
  const packageDir = new URL('../sample_documents/bid_package/', import.meta.url);
  for (const bidId of readdirSync(packageDir).filter((f) => /^BID-\d{3}$/.test(f))) {
    for (const file of readdirSync(new URL(`${bidId}/`, packageDir)).filter((f) => f.endsWith('.png'))) {
      const path = `${bidId}/${file}`;
      const { error } = await sb.storage
        .from('bid-documents')
        .upload(path, readFileSync(new URL(path, packageDir)), { contentType: 'image/png', upsert: true });
      if (error) throw new Error(`upload ${path}: ${error.message}`);
      ok(
        await sb.from('bid_documents').update({ storage_path: path, mime_type: 'image/png' }).eq('bid_id', bidId).eq('display_code', file.replace('.png', '')),
        `link ${path}`,
      );
    }
    console.log(`Stored bid package ${bidId}`);
  }

  // 8. GeM demo kit: specimen documents a bidder can attach on the simulated GeM portal.
  const kitDir = new URL('../sample_documents/gem_demo_kit/', import.meta.url);
  for (const file of readdirSync(kitDir).filter((f) => f.endsWith('.png'))) {
    const { error } = await sb.storage.from('bid-documents').upload(`gem/demo-kit/${file}`, readFileSync(new URL(file, kitDir)), { contentType: 'image/png', upsert: true });
    if (error) throw new Error(`upload gem/demo-kit/${file}: ${error.message}`);
  }
  console.log('Stored GeM demo kit');

  // 9. The demo reset removed audit events; re-seal the tamper-evident chain over what remains.
  const sealed = ok(await sb.rpc('reseal_audit_chain'), 'reseal audit chain');
  console.log(`Audit chain re-sealed over ${sealed} events`);

  console.log(`\nDone. Officer login: ${demoUser.email} or employee ID ${demoUser.employeeId}`);
}

main().catch((err) => {
  console.error('Seed failed:', err.message ?? err);
  process.exit(1);
});
