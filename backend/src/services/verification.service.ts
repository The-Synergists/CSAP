import type { SupabaseClient } from '@supabase/supabase-js';
import { buildEnginePayload } from '../../../shared/domain/enginePayload.js';
import { getBidView } from '../../../shared/domain/selectors.js';
import type { CheckStatus } from '../../../shared/domain/types.js';
import { buildSteps, pendingSteps, type VerificationRun } from '../../../shared/domain/verification.js';
import { EMD_TO_DB, type StoredRun } from '../db/conventions.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { HttpError, must } from '../lib/http.js';
import { verifyWithEngine } from './engine.client.js';

const ACTOR = { actor_profile_id: null, actor_display_name: 'Verification service', actor_role: 'Automated service', action_type: 'SYSTEM_AI' };

// Registry portals the schema's gov_portal_verification_log accepts.
const PORTAL_CODES = new Set(['GSTN', 'MCA21', 'UDYAM', 'EPFO', 'ESIC', 'INCOME_TAX', 'CPPP_BLACKLIST', 'BANK_TREASURY_SFMS']);

/**
 * Re-runs verification of a bid through the Python engine and records the run, the
 * (simulated) registry checks and audit events. Recorded scores and findings are not
 * overwritten; the result reports whether the fresh run agrees with the record.
 */
export async function runVerification(db: SupabaseClient, userId: string, officerName: string, bidId: string): Promise<VerificationRun> {
  const view = getBidView(await loadWorkspace(db), bidId);
  if (!view) throw new HttpError(404, `Bid ${bidId} was not found.`, 'NOT_FOUND');

  const startedAt = new Date().toISOString();
  const run = must<{ id: string }>(
    await db
      .from('ai_verification_runs')
      .insert({
        bid_id: bidId,
        initiated_by: userId,
        status: 'RUNNING',
        steps: { kind: 'bidsure.verification.v1', source: 'engine', steps: pendingSteps(view), checks: [] } satisfies StoredRun,
        started_at: startedAt,
      })
      .select('id')
      .single(),
    'verification run',
  );

  await db.from('audit_events').insert({
    ...ACTOR,
    bid_id: bidId,
    tender_id: view.tender.id,
    summary: 'Verification re-run started',
    details: `Re-run requested by ${officerName} against ${view.requirements.length} tender requirements.`,
  });

  let result;
  try {
    result = await verifyWithEngine(buildEnginePayload(view));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .from('ai_verification_runs')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString(), steps: { kind: 'bidsure.verification.v1', source: 'engine', steps: [], checks: [], error: message } satisfies StoredRun })
      .eq('id', run.id);
    await db.from('audit_events').insert({ ...ACTOR, bid_id: bidId, tender_id: view.tender.id, summary: 'Verification re-run failed', details: message });
    throw err;
  }

  const statusByCode: Record<string, CheckStatus> = Object.fromEntries(result.checks.map((c) => [c.requirementCode, c.status]));
  const steps = buildSteps(view, statusByCode);
  const differences = view.checks
    .filter((c) => statusByCode[c.requirement.code] && statusByCode[c.requirement.code] !== c.status)
    .map((c) => ({ requirementCode: c.requirement.code, recorded: c.status, now: statusByCode[c.requirement.code] }));
  const finishedAt = new Date().toISOString();

  // Registry checks are format validations marked as simulated (no live portal access).
  const now = finishedAt;
  const logRows = result.registryChecks
    .filter((r) => PORTAL_CODES.has(r.portal))
    .map((r) => ({
      ai_verification_run_id: run.id,
      portal_code: r.portal,
      check_type: r.checkType,
      requested_at: now,
      responded_at: now,
      request_payload: { identifier: r.identifier },
      response_payload: { status: r.status, detail: r.detail },
      result_status: r.status === 'VERIFIED' ? 'VERIFIED' : r.status === 'PENDING' ? 'PENDING' : 'MISMATCH',
      is_simulated: true,
    }));
  if (view.emd) {
    logRows.push({
      ai_verification_run_id: run.id,
      portal_code: 'BANK_TREASURY_SFMS',
      check_type: 'EMD_RECONCILIATION',
      requested_at: now,
      responded_at: now,
      request_payload: { identifier: view.emd.reference },
      response_payload: { status: EMD_TO_DB[view.emd.result], detail: view.emd.note },
      result_status: view.emd.result === 'VERIFIED' ? 'VERIFIED' : view.emd.result === 'EXEMPTION_CONFIRMED' ? 'EXEMPTED' : 'MISMATCH',
      is_simulated: true,
    });
  }
  if (logRows.length) must(await db.from('gov_portal_verification_log').insert(logRows), 'registry log');

  must(
    await db
      .from('ai_verification_runs')
      .update({
        status: 'COMPLETED',
        completed_at: finishedAt,
        steps: { kind: 'bidsure.verification.v1', source: 'engine', engineVersion: result.engineVersion, steps, checks: result.checks } satisfies StoredRun,
      })
      .eq('id', run.id),
    'verification run',
  );

  const exceptions = result.summary.review + result.summary.notMet + result.summary.missing;
  await db.from('audit_events').insert({
    ...ACTOR,
    bid_id: bidId,
    tender_id: view.tender.id,
    summary: 'Verification re-run completed',
    details:
      `${result.summary.met} of ${result.summary.total} requirements met; ${exceptions} flagged for officer review. ` +
      (differences.length
        ? `Differs from the recorded result on ${differences.map((d) => d.requirementCode).join(', ')}.`
        : 'Consistent with the recorded result.'),
  });

  return {
    bidId,
    startedAt,
    finishedAt,
    done: true,
    steps,
    outcome: {
      engineVersion: result.engineVersion,
      met: result.summary.met,
      exceptions,
      total: result.summary.total,
      riskLevel: result.risk.level,
      suggestedDecision: result.recommendation.suggestedDecision,
      differences,
      simulatedRegistryChecks: logRows.length,
    },
  };
}
