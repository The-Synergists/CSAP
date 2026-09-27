// New tender from the requirement template: the officer sets the tender-specific values
// (turnover threshold, EMD, dates, which optional requirements apply) and publishes it; it is
// open for bids on the simulated GeM portal immediately.

import type { SupabaseClient } from '@supabase/supabase-js';
import { OPTIONAL_CODES, SAFETY_EQUIPMENT_TEMPLATE } from '../../../shared/domain/tenderTemplate.js';
import { HttpError, must } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface NewTenderInput {
  title: string;
  category: string;
  division: string;
  description: string;
  estimatedValue: number;
  emdAmount: number;
  turnoverCr: number;
  deadlineDate: string;
  technicalOpeningDate: string;
  exclude: string[];
}

const isoDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '');

export async function createTender(db: SupabaseClient, userId: string, officerName: string, input: NewTenderInput) {
  const bad = (m: string) => new HttpError(400, m, 'VALIDATION');
  const title = String(input.title ?? '').trim();
  if (title.length < 5) throw bad('Give the tender a title.');
  if (!(input.estimatedValue > 0)) throw bad('Estimated value must be above zero.');
  if (!(input.emdAmount >= 0)) throw bad('EMD cannot be negative.');
  if (!(input.turnoverCr > 0 && input.turnoverCr < 1000)) throw bad('Minimum average turnover must be between 0 and 1,000 crore.');
  if (!isoDate(input.deadlineDate) || !isoDate(input.technicalOpeningDate)) throw bad('Give the bid end date and the technical opening date.');
  const today = new Date().toISOString().slice(0, 10);
  if (input.deadlineDate <= today) throw bad('The bid end date must be in the future.');
  if (input.technicalOpeningDate < input.deadlineDate) throw bad('Technical opening cannot be before the bid end date.');
  const exclude = (input.exclude ?? []).filter((c) => OPTIONAL_CODES.includes(c));

  const ids = must<any[]>(await serviceClient.from('tenders').select('id').like('id', 'GEM/2026/CPCL/%'), 'tenders');
  const next = ids.reduce((m, r) => Math.max(m, Number(/(\d+)$/.exec(r.id)?.[1] ?? 0)), 0) + 1;
  const id = `GEM/2026/CPCL/${String(next).padStart(3, '0')}`;

  must(
    await serviceClient.from('tenders').insert({
      id,
      title,
      category: String(input.category ?? 'Safety & Fire').trim() || 'Safety & Fire',
      division: String(input.division ?? '').trim() || 'Chennai Refinery',
      estimated_value: input.estimatedValue,
      emd_amount: input.emdAmount,
      publish_date: today,
      deadline_date: input.deadlineDate,
      technical_opening_date: input.technicalOpeningDate,
      status: 'OPEN_FOR_BIDS',
      description: String(input.description ?? '').trim() || title,
      officer_in_charge: officerName,
      created_by_officer: true,
    }),
    'tender',
  );
  const reqs = SAFETY_EQUIPMENT_TEMPLATE({ turnoverCr: input.turnoverCr, emdAmount: input.emdAmount }).filter((r) => !exclude.includes(r.code));
  must(
    await serviceClient.from('tender_requirements').insert(
      reqs.map((r) => ({ tender_id: id, display_code: r.code, category: r.category, title: r.title, criterion: r.criterion, mandatory: r.mandatory, benchmark_value: r.benchmark })),
    ),
    'requirements',
  );
  await db.from('audit_events').insert({
    tender_id: id,
    actor_profile_id: userId,
    actor_display_name: officerName,
    actor_role: 'Procurement officer',
    action_type: 'OFFICER_ACTION',
    summary: 'Tender published',
    details: `${id} "${title}" published on GeM (simulated) with ${reqs.length} requirements: average turnover ≥ ₹${input.turnoverCr.toFixed(2)} Cr, EMD ₹${input.emdAmount.toLocaleString('en-IN')}; bids close ${input.deadlineDate}.`,
  });
  return { id, requirements: reqs.length };
}
