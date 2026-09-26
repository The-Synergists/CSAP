import React from 'react';
import { ArrowRight, Info } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import { DECISION } from '../../domain/labels';
import { formatDateTime, plural } from '../../lib/format';
import { buttonClass } from '../../components/ui/styles';
import type { BidTab } from './bidTabs';

/** One-line guidance: what the officer should do next on this bid. */
export const NextStep: React.FC<{ view: BidView; goTo: (tab: BidTab) => void }> = ({ view, goTo }) => {
  const { bid, openFindings, latestDecision } = view;
  let text: React.ReactNode;
  let action: { label: string; tab: BidTab } | null = null;

  switch (bid.status) {
    case 'ACCEPTED':
    case 'REJECTED':
      text = (
        <>
          Final decision recorded: <strong>{DECISION[latestDecision!.decision].label}</strong> by {latestDecision!.officerName} on{' '}
          {formatDateTime(latestDecision!.decidedAt)}.
        </>
      );
      action = { label: 'View decision', tab: 'decision' };
      break;
    case 'CLARIFICATION_REQUIRED':
      text = (
        <>
          Clarification requested on {formatDateTime(latestDecision!.decidedAt)} — awaiting the bidder's response. Record a new decision once it is received.
        </>
      );
      action = { label: 'Record decision', tab: 'decision' };
      break;
    case 'COMMITTEE_REVIEW':
      text = <>Referred to the tender evaluation committee. Record the outcome once the committee has decided.</>;
      action = { label: 'Record decision', tab: 'decision' };
      break;
    default:
      if (openFindings.length) {
        text = (
          <>
            {plural(openFindings.length, 'open finding')} to review before deciding. Most severe: <strong>{openFindings[0].title}</strong>.
          </>
        );
        action = { label: 'Review findings', tab: 'evidence' };
      } else {
        text = <>No exceptions found. Review the AI recommendation and record your decision.</>;
        action = { label: 'Record decision', tab: 'decision' };
      }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-950 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2">
        <Info aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" />
        <span>
          <span className="font-semibold">Next step: </span>
          {text}
        </span>
      </p>
      {action && (
        <button type="button" onClick={() => goTo(action.tab)} className={`${buttonClass('secondary', 'sm')} shrink-0`}>
          {action.label} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
};
