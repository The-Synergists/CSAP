import type { Bid, RiskLevel } from '../types';

export interface ProcurementAlert {
  id: string;
  bidId: string;
  tenderId: string;
  companyName: string;
  severity: 'HIGH' | 'MEDIUM';
  title: string;
  description: string;
  actionLabel: string;
  actionTab: 'emd' | 'evidence' | 'decision';
}

/**
 * Single source of truth for "needs officer attention" alerts.
 * Derived directly from bid evidence/risk data so the Sidebar badge count,
 * Dashboard panel, and Alerts page never drift out of sync with each other.
 * A bid drops off this list once the officer has recorded a decision on it.
 */
export const getActiveAlerts = (bids: Bid[]): ProcurementAlert[] => {
  return bids
    .filter((b) => !b.officerDecision && b.evidenceItems.length > 0)
    .map((b) => {
      const isHighSeverity: boolean =
        b.riskLevel === 'HIGH' ||
        (b.riskLevel as RiskLevel) === 'CRITICAL' ||
        b.emd.verificationResult === 'EMD_AMOUNT_MISMATCH';
      const primaryEvidence = b.evidenceItems[0];
      const actionTab: ProcurementAlert['actionTab'] =
        b.emd.verificationResult === 'EMD_AMOUNT_MISMATCH' ? 'emd' : 'evidence';

      return {
        id: `${b.id}-alert`,
        bidId: b.id,
        tenderId: b.tenderId,
        companyName: b.companyName,
        severity: isHighSeverity ? 'HIGH' : 'MEDIUM',
        title: primaryEvidence.aiFinding,
        description: b.primaryConcern,
        actionLabel: isHighSeverity ? 'Review Disqualification' : 'Request Clarification',
        actionTab,
      } satisfies ProcurementAlert;
    })
    .sort((a, b) => {
      if (a.severity === b.severity) return 0;
      return a.severity === 'HIGH' ? -1 : 1;
    });
};
