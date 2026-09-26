import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import type { VerificationRun } from '@shared/domain/verification';
import { Button } from '../../components/ui/primitives';
import { DECISION } from '../../domain/labels';
import type { DecisionType } from '@shared/domain/types';

const ICON = {
  pending: <Circle className="h-4 w-4 text-slate-300" />,
  running: <Loader2 className="h-4 w-4 animate-spin text-blue-600" />,
  passed: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  flagged: <AlertTriangle className="h-4 w-4 text-amber-600" />,
};

/** Progress and result of a verification re-run for the current bid. */
export const VerificationPanel: React.FC<{ run: VerificationRun; onReviewFindings: () => void }> = ({ run, onReviewFindings }) => {
  if (run.error) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <p className="font-semibold">Verification did not run</p>
          <p>{run.error}</p>
          <p className="mt-1 text-xs">The recorded verification result below is unchanged.</p>
        </div>
      </div>
    );
  }
  const o = run.outcome;
  return (
    <section aria-live="polite" className="rounded-md border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5">
        <h2 className="text-xs font-semibold text-slate-900">{run.done ? 'Verification re-run complete' : 'Running verification…'}</h2>
        <span className="text-xs text-slate-500">Registry lookups are simulated in this prototype</span>
      </div>
      <ol className="divide-y divide-slate-100">
        {run.steps.map((s) => (
          <li key={s.id} className="flex items-start gap-3 px-4 py-2 text-xs">
            <span className="mt-0.5">{ICON[s.status]}</span>
            <span className="min-w-0 flex-1">
              <span className={s.status === 'pending' ? 'text-slate-400' : 'text-slate-900'}>{s.label}</span>
              {s.detail && <span className="block text-xs text-slate-500">{s.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {run.done && o && (
        <div className="flex flex-col gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-700">
            <strong>{o.met} of {o.total}</strong> requirements met · <strong>{o.exceptions}</strong> flagged · risk {o.riskLevel.toLowerCase()} · suggested:{' '}
            {DECISION[o.suggestedDecision as DecisionType]?.label ?? o.suggestedDecision}.{' '}
            {o.differences.length === 0 ? (
              <span className="text-emerald-700">Consistent with the recorded result.</span>
            ) : (
              <span className="text-amber-700">
                Differs from the record on {o.differences.map((d) => d.requirementCode).join(', ')} — review before deciding.
              </span>
            )}
            <span className="block text-xs text-slate-500">Engine {o.engineVersion}</span>
          </p>
          {o.exceptions > 0 && (
            <Button size="sm" onClick={onReviewFindings}>
              Review findings
            </Button>
          )}
        </div>
      )}
    </section>
  );
};
