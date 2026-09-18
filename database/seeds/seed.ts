/**
 * One-off seed script — run manually via `npx tsx scripts/seed.ts`.
 * Not part of the app build; imports the existing mock fixtures directly from
 * src/data/mockData.ts so the seeded DB is guaranteed 1:1 with what the
 * prototype already shows, and any relationship mismatch fails loudly (FK
 * violation) instead of silently. See supabase/migrations for the schema and
 * the plan doc for the full design rationale.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { mockTenders, mockBids } from '../../frontend/src/data/mockData';
import type { Bid, Tender, VerificationStatus } from '../../frontend/src/types';

// --- minimal .env.local loader (no extra dependency for 3 lines of parsing) ---
function loadEnvLocal() {
  const possiblePaths = [
    new URL('../../.env.local', import.meta.url),
    new URL('../.env.local', import.meta.url),
    new URL('../../frontend/.env.local', import.meta.url),
  ];
  for (const envUrl of possiblePaths) {
    if (existsSync(envUrl)) {
      const raw = readFileSync(envUrl, 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = /^([A-Z_][A-Z0-9_]*)=(.*)$/.exec(line.trim());
        if (m) process.env[m[1]] = m[2];
      }
      break;
    }
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Error: Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- date parsing: mock data uses 'DD Mon YYYY' and 'DD Mon YYYY HH:MM AM/PM' ---
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};
function parseDateOnly(s: string): string | null {
  const m = /^(\d{1,2})\s+(\w{3})\s+(\d{4})/.exec(s);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  return new Date(Date.UTC(+m[3], month, +m[1])).toISOString().slice(0, 10);
}
function parseTimestamp(s: string): string | null {
  const m = /^(\d{1,2})\s+(\w{3})\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(s);
  if (!m) return null;
  const month = MONTHS[m[2]];
  if (month === undefined) return null;
  let hour = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === 'PM') hour += 12;
  return new Date(Date.UTC(+m[3], month, +m[1], hour, +m[5])).toISOString();
}
function parseTurnover(s: string): { financial_year: string; turnover_amount: number } | null {
  // e.g. '₹6.40 Cr (FY25)'
  const m = /₹\s*([\d.]+)\s*Cr[^(]*\(FY(\d{2})\)/i.exec(s);
  if (!m) return null;
  return { financial_year: `FY${m[2]}`, turnover_amount: Math.round(parseFloat(m[1]) * 1e7) };
}

async function main() {
  console.log('Seeding CSAP database…');

  // 1. Officer account (no public sign-up in the app — provisioned here only)
  const officerEmail = 'rk.ramanathan@cpcl.co.in';
  const officerPassword = 'Cpcl@2026';
  const { data: existingUsers } = await db.auth.admin.listUsers();
  let officerId = existingUsers.users.find((u) => u.email === officerEmail)?.id;
  if (!officerId) {
    const { data, error } = await db.auth.admin.createUser({
      email: officerEmail,
      password: officerPassword,
      email_confirm: true,
    });
    if (error) throw error;
    officerId = data.user.id;
    console.log(`Created officer auth user ${officerEmail}`);
  } else {
    console.log(`Officer auth user ${officerEmail} already exists, reusing`);
  }
  const { error: profileErr } = await db
    .from('profiles')
    .update({
      full_name: 'R. K. Ramanathan',
      designation: 'Chief Procurement Officer (CPO)',
      organization: 'Chennai Petroleum Corporation Limited (CPCL)',
      badge_id: 'CPCL-PROC-0841',
    })
    .eq('id', officerId);
  if (profileErr) throw profileErr;

  // 2. Companies (deduped by GSTIN) + turnover
  const companyIdByGstin = new Map<string, string>();
  for (const bid of mockBids as Bid[]) {
    if (companyIdByGstin.has(bid.gstin)) continue;
    const { data, error } = await db
      .from('companies')
      .upsert(
        {
          vendor_code: bid.vendorCode,
          company_name: bid.companyName,
          incorporation_date: parseDateOnly(bid.incorporationDate),
          registered_address: bid.registeredAddress,
          gstin: bid.gstin,
          pan: bid.pan,
          udyam_number: bid.udyamNumber || null,
        },
        { onConflict: 'gstin' }
      )
      .select('id')
      .single();
    if (error) throw error;
    companyIdByGstin.set(bid.gstin, data.id);

    const turnoverRows = bid.turnoverLast3Years
      .map(parseTurnover)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map((t) => ({ company_id: data.id, ...t }));
    if (turnoverRows.length) {
      const { error: tErr } = await db.from('company_turnover').upsert(turnoverRows, {
        onConflict: 'company_id,financial_year',
      });
      if (tErr) throw tErr;
    }
  }
  console.log(`Seeded ${companyIdByGstin.size} companies`);

  // 3. Tenders + requirements
  for (const tender of mockTenders as Tender[]) {
    const { error } = await db.from('tenders').upsert({
      id: tender.id,
      title: tender.title,
      category: tender.category,
      division: tender.division,
      estimated_value: tender.estimatedValue,
      emd_amount: tender.emdAmount,
      publish_date: parseDateOnly(tender.publishDate),
      deadline_date: parseDateOnly(tender.deadlineDate),
      technical_opening_date: parseDateOnly(tender.technicalOpeningDate),
      status: tender.status,
      description: tender.description,
      officer_in_charge: tender.officerInCharge,
    });
    if (error) throw error;

    const reqRows = tender.requirements.map((r) => ({
      tender_id: tender.id,
      display_code: r.id,
      category: r.category,
      title: r.title,
      criterion: r.criterion,
      mandatory: r.mandatory,
      benchmark_value: r.benchmarkValue ?? null,
    }));
    const { error: reqErr } = await db
      .from('tender_requirements')
      .upsert(reqRows, { onConflict: 'tender_id,display_code' });
    if (reqErr) throw reqErr;
  }
  console.log(`Seeded ${mockTenders.length} tenders with requirements`);

  // 4. Bids and everything under them
  for (const bid of mockBids as Bid[]) {
    const companyId = companyIdByGstin.get(bid.gstin)!;

    const { error: bidErr } = await db.from('bids').upsert({
      id: bid.id,
      tender_id: bid.tenderId,
      company_id: companyId,
      make_in_india_percentage: bid.makeInIndiaPercentage,
      overall_compliance_score: bid.overallComplianceScore,
      risk_level: bid.riskLevel,
      risk_score: bid.riskScore,
      primary_concern: bid.primaryConcern ?? null,
      submission_timestamp: parseTimestamp(bid.submissionTimestamp),
    });
    if (bidErr) throw bidErr;

    // Evidence items first — documents/compliance/risk rows FK into them.
    const evidenceIdByMockId = new Map<string, string>();
    for (const ev of bid.evidenceItems) {
      const { data, error } = await db
        .from('evidence_items')
        .upsert(
          {
            bid_id: bid.id,
            display_code: ev.id,
            requirement_title: ev.requirementTitle,
            finding_type: ev.findingType,
            ai_finding: ev.aiFinding,
            submitted_document_name: ev.submittedDocumentName,
            document_snippet: ev.documentSnippet,
            tender_clause_requirement: ev.tenderClauseRequirement,
            verification_timestamp: parseTimestamp(ev.verificationTimestamp),
            source: ev.source,
            resolution_status: ev.resolutionStatus,
          },
          { onConflict: 'bid_id,display_code' }
        )
        .select('id')
        .single();
      if (error) throw error;
      evidenceIdByMockId.set(ev.id, data.id);
    }

    const docRows = bid.documents.map((d) => ({
      bid_id: bid.id,
      display_code: d.id,
      name: d.name,
      doc_type: d.type,
      file_name: d.fileName,
      file_size: d.fileSize,
      upload_timestamp: parseTimestamp(d.uploadTimestamp),
      ocr_status: d.ocrStatus,
      verification_status: d.verificationStatus,
      status_message: d.statusMessage,
      extracted_snippet: d.extractedSnippet ?? null,
      tender_clause_reference: d.tenderClauseReference ?? null,
      evidence_item_id: d.evidenceId ? evidenceIdByMockId.get(d.evidenceId) ?? null : null,
    }));
    if (docRows.length) {
      const { error } = await db.from('bid_documents').upsert(docRows, { onConflict: 'bid_id,display_code' });
      if (error) throw error;
    }

    const emd = bid.emd;
    const { error: emdErr } = await db.from('bid_emd').upsert({
      bid_id: bid.id,
      required_amount: emd.requiredAmount,
      submitted_amount: emd.submittedAmount,
      instrument_type: emd.instrumentType,
      transaction_or_bg_no: emd.transactionOrBgNo,
      bank_name: emd.bankName,
      issuing_branch: emd.issuingBranch ?? null,
      sfms_reference: emd.sfmsReference ?? null,
      valid_until: parseDateOnly(emd.validUntil),
      payment_date: parseDateOnly(emd.paymentDate),
      payment_status: emd.paymentStatus,
      bidder_match: emd.bidderMatch,
      verification_result: emd.verificationResult,
      officer_note: emd.officerNote ?? null,
    });
    if (emdErr) throw emdErr;

    const complianceRows = bid.complianceItems.map((c) => ({
      bid_id: bid.id,
      display_code: c.id,
      requirement_name: c.requirementName,
      category: c.category,
      status: c.status,
      mandatory: c.mandatory,
      score_contribution: c.scoreContribution,
      notes: c.notes,
      evidence_item_id: c.evidenceId ? evidenceIdByMockId.get(c.evidenceId) ?? null : null,
    }));
    if (complianceRows.length) {
      const { error } = await db
        .from('compliance_check_items')
        .upsert(complianceRows, { onConflict: 'bid_id,display_code' });
      if (error) throw error;
    }

    const riskRows = bid.riskFactors.map((r) => ({
      bid_id: bid.id,
      display_code: r.id,
      category: r.category,
      title: r.title,
      level: r.level,
      description: r.description,
      impact_score: r.impactScore,
      evidence_item_id: r.evidenceId ? evidenceIdByMockId.get(r.evidenceId) ?? null : null,
    }));
    if (riskRows.length) {
      const { error } = await db.from('risk_factors').insert(riskRows);
      if (error) throw error;
    }

    // AI recommendation + pro/con points
    const { data: recRow, error: recErr } = await db
      .from('ai_recommendations')
      .insert({
        bid_id: bid.id,
        summary: bid.aiRecommendation.summary,
        details: bid.aiRecommendation.details,
        suggested_action: bid.aiRecommendation.suggestedAction,
        confidence: bid.aiRecommendation.confidence,
      })
      .select('id')
      .single();
    if (recErr) throw recErr;
    const pointRows = [
      ...bid.aiRecommendation.pros.map((text, i) => ({ ai_recommendation_id: recRow.id, kind: 'PRO', point_text: text, sort_order: i })),
      ...bid.aiRecommendation.cons.map((text, i) => ({ ai_recommendation_id: recRow.id, kind: 'CON', point_text: text, sort_order: i })),
    ];
    if (pointRows.length) {
      const { error } = await db.from('ai_recommendation_points').insert(pointRows);
      if (error) throw error;
    }

    // Original audit trail entries (OCR/system events already in the mock data)
    const auditRows = bid.auditTrail.map((a) => ({
      bid_id: bid.id,
      tender_id: bid.tenderId,
      actor_display_name: a.actor,
      actor_role: a.actorRole,
      action_type: a.actionType,
      summary: a.summary,
      details: a.details,
      created_at: parseTimestamp(a.timestamp) ?? new Date().toISOString(),
    }));
    if (auditRows.length) {
      const { error } = await db.from('audit_events').insert(auditRows);
      if (error) throw error;
    }

    // Completed AI verification run + simulated gov-portal log, so the demo
    // looks fully processed on first load (matches what the old mock data
    // showed) instead of starting from a blank "never verified" state.
    const steps = [
      { name: 'Documents OCR Extraction', status: 'completed' },
      { name: 'Government Registry Cross-Check (GSTN / MCA21)', status: 'completed' },
      { name: 'EMD & Payment Gateway Reconciliation', status: 'completed' },
      { name: 'Tender Rule & Eligibility Evaluation', status: 'completed' },
      { name: 'Discrepancy & Deficit Detection', status: bid.riskFactors.length ? 'flagged' : 'completed' },
      { name: 'Compliance & Multi-Vector Risk Calculation', status: 'completed' },
    ];
    const { data: runRow, error: runErr } = await db
      .from('ai_verification_runs')
      .insert({
        bid_id: bid.id,
        initiated_by: officerId,
        status: 'COMPLETED',
        steps,
        completed_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (runErr) throw runErr;

    const vs = bid.verificationsSummary;
    const now = new Date().toISOString();
    const canned = (
      portal: string,
      checkType: string,
      status: VerificationStatus,
      requestField: string,
      requestValue: string
    ) => ({
      ai_verification_run_id: runRow.id,
      portal_code: portal,
      check_type: checkType,
      requested_at: now,
      responded_at: now,
      request_payload: { [requestField]: requestValue },
      response_payload: { status, source: `${portal} (simulated)` },
      result_status: status,
    });
    const logRows = [
      canned('GSTN', 'GSTIN_STATUS', vs.gst, 'gstin', bid.gstin),
      canned('INCOME_TAX', 'PAN_VALIDATION', vs.pan, 'pan', bid.pan),
      canned('UDYAM', 'UDYAM_STATUS', vs.udyam, 'udyam_number', bid.udyamNumber),
      canned('INCOME_TAX', 'ITR_FILING_STATUS', vs.incomeTax, 'pan', bid.pan),
      canned('EPFO', 'EPFO_ECR', vs.epfoEsic, 'gstin', bid.gstin),
      canned('ESIC', 'ESIC_ECR', vs.epfoEsic, 'gstin', bid.gstin),
      canned('CPPP_BLACKLIST', 'CPPP_BLACKLIST_CHECK', vs.blacklisting, 'pan', bid.pan),
      canned('BANK_TREASURY_SFMS', 'EMD_RECONCILIATION', vs.emd, 'transaction_or_bg_no', bid.emd.transactionOrBgNo),
    ];
    const { error: logErr } = await db.from('gov_portal_verification_log').insert(logRows);
    if (logErr) throw logErr;

    // BID-004 in the old mock data shows status RECOMMENDED_ACCEPT with no
    // backing OfficerDecisionRecord — a pre-existing inconsistency (see plan
    // doc). Synthesize the missing decision here so the seeded demo still
    // shows one fully-worked "already decided" example instead of silently
    // losing that state once status is derived from officer_decisions.
    if (bid.status === 'RECOMMENDED_ACCEPT') {
      const { error: decErr } = await db.from('officer_decisions').insert({
        bid_id: bid.id,
        tender_id: bid.tenderId,
        officer_profile_id: officerId,
        decision: 'APPROVE',
        remarks: 'All statutory, financial, and technical criteria verified and compliant. Approved for commercial evaluation stage.',
        justification_reason: 'Full compliance across GST, PAN, Udyam, EMD, and OEM authorization checks; no outstanding risk factors.',
        dsc_signed: true,
      });
      if (decErr) throw decErr;
      const { error: auditErr } = await db.from('audit_events').insert({
        bid_id: bid.id,
        tender_id: bid.tenderId,
        actor_profile_id: officerId,
        actor_display_name: 'R. K. Ramanathan (Chief Procurement Officer)',
        actor_role: 'Procurement Officer',
        action_type: 'OFFICER_ACTION',
        summary: 'Formal Officer Decision: APPROVE',
        details: 'All statutory, financial, and technical criteria verified and compliant. Approved for commercial evaluation stage.',
      });
      if (auditErr) throw auditErr;
    }

    console.log(`Seeded bid ${bid.id} (${bid.companyName})`);
  }

  console.log('\nDone. Officer login:');
  console.log(`  email:    ${officerEmail}`);
  console.log(`  password: ${officerPassword}`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
