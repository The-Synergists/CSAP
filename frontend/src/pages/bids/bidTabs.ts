import type { BidView } from '@shared/domain/selectors';
import type { BidDocument } from '@shared/domain/types';

export const BID_TABS = ['overview', 'documents', 'portal', 'pan', 'emd', 'compliance', 'risk', 'evidence', 'decision'] as const;
export type BidTab = (typeof BID_TABS)[number];
/** Older / alternative URL segments that map onto a tab. */
export const BID_TAB_ALIASES: Record<string, BidTab> = { recommendation: 'decision', verification: 'overview', audit: 'overview', activity: 'overview', findings: 'evidence' };

/** Props every bid tab receives. `goTo` keeps navigation inside this bid (context is never lost). */
export interface TabProps {
  view: BidView;
  goTo: (tab: BidTab, query?: Record<string, string>) => void;
  openDocument: (doc: BidDocument) => void;
}
