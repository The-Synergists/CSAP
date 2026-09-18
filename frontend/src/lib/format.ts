import type { BidderStatus, TenderStatus } from '../types';

export const formatINR = (amount: number): string =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);

export const formatCrore = (amount: number): string => `₹${(amount / 1e7).toFixed(2)} Crore`;

export const formatTurnoverLabel = (financialYear: string, amount: number): string =>
  `₹${(amount / 1e7).toFixed(2)} Cr (${financialYear})`;

const TENDER_STATUS_LABELS: Record<TenderStatus, string> = {
  UNDER_EVALUATION: 'Under Evaluation',
  TECHNICAL_SCRUTINY: 'Technical Scrutiny',
  COMMERCIAL_EVALUATION: 'Commercial Evaluation',
  AWARDED: 'Awarded',
  CANCELLED: 'Cancelled',
};
export const tenderStatusLabel = (status: TenderStatus): string => TENDER_STATUS_LABELS[status];

const BIDDER_STATUS_LABELS: Record<BidderStatus, string> = {
  UNDER_REVIEW: 'Under Review',
  RECOMMENDED_ACCEPT: 'Recommended Accept',
  RECOMMENDED_REJECT: 'Recommended Reject',
  CLARIFICATION_SEEKED: 'Clarification Sought',
  DISQUALIFIED: 'Disqualified',
};
export const bidderStatusLabel = (status: BidderStatus): string => BIDDER_STATUS_LABELS[status];
