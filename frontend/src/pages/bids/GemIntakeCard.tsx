// For bids delivered by the (simulated) GeM portal: the automatic verification stages, read from
// the audit trail, so the officer can see what already happened before opening the bid.

import React from 'react';
import { CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import { Card } from '../../components/ui/primitives';
import { formatDateTime } from '../../lib/format';

const STAGES = [
  { summary: 'Bid received from GeM', label: 'Received from GeM (signed delivery verified)' },
  { summary: 'Documents read by CSAP AI', label: 'Every document read by CSAP AI' },
  { summary: 'Tender rules checked', label: 'Tender requirements checked on the extracted values' },
  { summary: 'Portal verification completed', label: 'Government registries checked' },
  { summary: 'Automatic verification completed', label: 'Ready for the officer' },
];

export const GemIntakeCard: React.FC<{ view: BidView }> = ({ view }) => {
  if (view.bid.source !== 'GEM') return null;
  const events = view.audit; // newest first
  const find = (summary: string) => [...events].reverse().find((e) => e.summary === summary);
  const stopped = events.find((e) => e.summary === 'Automatic verification stopped');
  const firstOpen = STAGES.findIndex((s) => !find(s.summary));

  return (
    <Card title="Automatic verification from GeM" subtitle={`GeM bid ${view.bid.gemBidNo ?? ''} · no officer action was needed for these steps`}>
      <ol className="space-y-2.5" aria-live="polite">
        {STAGES.map((s, i) => {
          const ev = find(s.summary);
          const running = !ev && i === firstOpen && !stopped;
          return (
            <li key={s.summary} className="flex gap-2.5 text-xs">
              {ev ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-label="Done" />
              ) : running ? (
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-blue-600" aria-label="In progress" />
              ) : stopped && i === firstOpen ? (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-label="Stopped" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" aria-label="Waiting" />
              )}
              <div className="min-w-0">
                <p className={ev ? 'font-medium text-slate-900' : 'text-slate-500'}>
                  {s.label}
                  {ev && <span className="font-normal text-slate-500"> · {formatDateTime(ev.timestamp)}</span>}
                </p>
                {ev && i > 0 && <p className="mt-0.5 text-slate-600">{ev.details}</p>}
                {stopped && i === firstOpen && <p className="mt-0.5 text-rose-700">{stopped.details}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
};
