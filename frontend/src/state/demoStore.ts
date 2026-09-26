// In-browser implementation of the write operations, used when VITE_DATA_SOURCE=demo.
// Mirrors what the backend does so both sources behave the same from the officer's view.

import { getBidView } from '@shared/domain/selectors';
import type { AuditEvent, Database, OfficerDecision, User } from '@shared/domain/types';
import { DECISION } from '../domain/labels';
import type { DecisionInput } from './appContext';

const nextId = (prefix: string, rows: { id: string }[]) => {
  const max = rows.reduce((m, r) => Math.max(m, Number(r.id.replace(/\D/g, '')) || 0), 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
};

export const appendAudit = (db: Database, events: Omit<AuditEvent, 'id'>[]): Database => {
  const rows = [...db.auditEvents];
  for (const e of events) rows.push({ ...e, id: nextId('AUD', rows) });
  return { ...db, auditEvents: rows };
};

const SUMMARY: Record<OfficerDecision['decision'], string> = {
  APPROVE: 'Formal Officer Decision: APPROVE',
  REJECT: 'Formal Officer Decision: REJECT',
  REQUEST_CLARIFICATION: 'Formal Officer Decision: REQUEST CLARIFICATION',
  COMMITTEE_REVIEW: 'Formal Officer Decision: COMMITTEE REVIEW',
};

export function applyDecision(db: Database, user: User, input: DecisionInput): Database {
  const view = getBidView(db, input.bidId);
  if (!view) throw new Error(`Bid ${input.bidId} was not found.`);
  if (!input.reason.trim()) throw new Error('Select a reason for the decision.');
  if (input.remarks.trim().length < 20) throw new Error('Remarks must be at least 20 characters.');
  if (view.flags.closed) throw new Error('A final decision has already been recorded for this bid.');

  const meta = DECISION[input.decision];
  const now = new Date().toISOString();
  const decision: OfficerDecision = {
    id: nextId('DEC', db.decisions),
    bidId: view.bid.id,
    tenderId: view.tender.id,
    decision: input.decision,
    reason: input.reason.trim(),
    remarks: input.remarks.trim(),
    officerId: user.id,
    officerName: user.name,
    officerDesignation: user.designation,
    decidedAt: now,
    followedRecommendation: view.recommendation?.suggestedDecision === input.decision,
  };
  const next: Database = {
    ...db,
    decisions: [...db.decisions, decision],
    bids: db.bids.map((b) => (b.id === view.bid.id ? { ...b, status: meta.resultingStatus } : b)),
    findings: db.findings.map((f) => (f.bidId === view.bid.id ? { ...f, status: meta.findingStatus } : f)),
  };
  return appendAudit(next, [
    {
      timestamp: now,
      tenderId: view.tender.id,
      bidId: view.bid.id,
      actorType: 'OFFICER',
      actor: user.name,
      summary: SUMMARY[input.decision],
      details: decision.remarks,
    },
  ]);
}
