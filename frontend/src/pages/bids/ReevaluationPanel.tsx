// Final-decision lock and bidder responses. Once the officer approves or rejects a bid, the decision
// is final: verification and further decisions are closed (the database enforces the same rule).
// A bidder's clarification response or re-evaluation request from GeM waits here for the officer;
// accepting it applies the replacement documents, reopens the bid and verifies it again.

import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Lock, MessageSquareReply } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import type { ReevaluationRequest } from '@shared/domain/types';
import { Badge } from '../../components/ui/Badge';
import { Button, Card, Modal } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { DECISION } from '../../domain/labels';
import { formatDateTime } from '../../lib/format';
import { api } from '../../state/api';
import { useApp } from '../../state/appContext';


/**
 * The lock on a decided bid. Only the officer who recorded the final decision can reopen it, only
 * when the bidder has asked for re-evaluation, and only after typing their password again.
 */
export const LockControl: React.FC<{ view: BidView; label?: string }> = ({ view, label }) => {
  const { currentUser } = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const d = view.latestDecision;
  const request = view.reevaluations.find((r) => r.status === 'OPEN' && r.kind === 'REEVALUATION');
  const owner = !!d && d.officerId === currentUser?.id;
  if (!view.flags.closed || !d) return null;

  const close = () => {
    setOpen(false);
    setPassword('');
    setError(null);
  };
  const reopen = async () => {
    if (!request) return;
    setBusy(true);
    setError(null);
    try {
      await api.acceptReevaluation(request.id, note.trim() || undefined, password);
      toast({ kind: 'success', title: 'Bid reopened for re-evaluation', message: 'The new documents were applied and the bid is being verified again. Recorded in the audit trail.' });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} title="Final decision recorded: the bid is locked">
        <Lock className="h-4 w-4" /> {label ?? 'Locked'}
      </Button>
      <Modal
        open={open}
        onClose={close}
        title="Locked bid"
        description={`Final decision: ${DECISION[d.decision].label}, by ${d.officerName} on ${formatDateTime(d.decidedAt)}.`}
        footer={
          request && owner ? (
            <>
              <Button onClick={close} disabled={busy}>Cancel</Button>
              <Button variant="primary" onClick={() => void reopen()} disabled={busy || !password}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Reopen for re-evaluation
              </Button>
            </>
          ) : (
            <Button variant="primary" onClick={close}>Close</Button>
          )
        }
      >
        {!request ? (
          <p className="text-xs text-slate-700">
            The decision is final, so verification and decisions are closed. The bid can be reopened only when the bidder asks for re-evaluation on GeM, and only by {d.officerName}.
          </p>
        ) : !owner ? (
          <p className="text-xs text-slate-700">
            The bidder has asked for re-evaluation, but only {d.officerName}, who recorded the final decision, can reopen this bid.
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="rounded border border-amber-300 bg-amber-50 p-2.5">
              <p className="font-semibold text-slate-900">Re-evaluation requested by the bidder · {formatDateTime(request.requestedAt)}</p>
              <p className="mt-1 text-slate-800">“{request.reason}”</p>
              {request.documents.length > 0 && <p className="mt-1 text-slate-700">New documents: {request.documents.map((x) => `${x.requirementCode} ${x.name}`).join(' · ')}</p>}
            </div>
            <label className="block text-slate-700">
              Note for the record (optional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputClass} mt-0.5`} />
            </label>
            <label className="block text-slate-700">
              Confirm with your password
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${inputClass} mt-0.5`} aria-label="Your password" />
            </label>
            {error && <p role="alert" className="text-rose-700">{error}</p>}
            <p className="text-slate-500">Reopening applies the bidder's new documents, verifies the bid again and records who reopened it in the audit trail.</p>
          </div>
        )}
      </Modal>
    </>
  );
};

export const LOCKED_HINT = 'Final decision recorded: verification is closed. It reopens only if you accept a re-evaluation request from the bidder.';

const KIND: Record<ReevaluationRequest['kind'], string> = {
  CLARIFICATION_RESPONSE: 'Clarification response',
  REEVALUATION: 'Re-evaluation request',
};

const RequestCard: React.FC<{ r: ReevaluationRequest; view: BidView }> = ({ r, view }) => {
  const toast = useToast();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const act = async (what: 'accept' | 'decline') => {
    setBusy(what);
    try {
      if (what === 'accept') await api.acceptReevaluation(r.id, note.trim() || undefined);
      else await api.declineReevaluation(r.id, note.trim());
      toast(
        what === 'accept'
          ? { kind: 'success', title: 'Request accepted', message: 'The documents were applied and the bid is being verified again. The bidder was told on GeM.' }
          : { kind: 'success', title: 'Request declined', message: 'The bidder was told on GeM, with your reason.' },
      );
    } catch (e) {
      toast({ kind: 'error', title: 'Not saved', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded border border-amber-300 bg-amber-50 p-3 text-xs">
      <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
        <MessageSquareReply className="h-4 w-4 text-amber-700" /> {KIND[r.kind]} from the bidder
        <span className="font-normal text-slate-500">received {formatDateTime(r.requestedAt)} via GeM</span>
      </p>
      <p className="mt-1.5 text-slate-800">“{r.reason}”</p>
      {r.documents.length > 0 && (
        <p className="mt-1 text-slate-700">
          New documents: {r.documents.map((d) => `${d.requirementCode} ${d.name}`).join(' · ')}
        </p>
      )}
      <label className="mt-2 block text-slate-700">
        Your note (required to decline; the bidder sees it)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={`${inputClass} mt-0.5`} />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        {view.flags.closed ? (
          <LockControl view={view} label="Reopen with password" />
        ) : (
          <Button size="sm" variant="primary" disabled={!!busy} onClick={() => void act('accept')}>
            {busy === 'accept' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Accept and verify again
          </Button>
        )}
        <Button size="sm" disabled={!!busy || note.trim().length < 10} onClick={() => void act('decline')} title={note.trim().length < 10 ? 'Write a reason for the bidder (at least 10 characters)' : undefined}>
          {busy === 'decline' && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Decline
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Accepting replaces the matching documents with the new ones and runs the full verification again; you then record a new decision.
      </p>
    </div>
  );
};

/** Banner at the top of a bid: the lock after a final decision, and any request waiting for the officer. */
export const BidStatePanel: React.FC<{ view: BidView }> = ({ view }) => {
  const open = view.reevaluations.filter((r) => r.status === 'OPEN');
  const d = view.latestDecision;
  if (!view.flags.closed && !view.flags.reopened && open.length === 0) return null;
  return (
    <Card>
      <div className="space-y-3">
        {view.flags.closed && d && (
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="flex items-start gap-2 text-xs text-slate-800">
              <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
              <span>
                <span className="font-semibold">Final decision: {DECISION[d.decision].label}</span> by {d.officerName} on {formatDateTime(d.decidedAt)}. The bid is locked:
                verification and further decisions are closed. It reopens only if the bidder asks for re-evaluation and you accept.
              </span>
            </p>
            <Link to={`/reports`} className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline">
              <FileText className="h-3.5 w-3.5" /> Evaluation reports
            </Link>
          </div>
        )}
        {view.flags.reopened && (
          <p className="flex items-center gap-2 text-xs text-slate-800">
            <Badge tone="info">Reopened</Badge> You accepted the bidder's request; the bid was verified again. Review the results and record a new decision.
          </p>
        )}
        {open.map((r) => (
          <RequestCard key={r.id} r={r} view={view} />
        ))}
      </div>
    </Card>
  );
};
