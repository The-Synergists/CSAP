import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, ShieldCheck } from 'lucide-react';
import type { VerificationStatus, BidderStatus, TenderStatus } from '../../types';

interface StatusBadgeProps {
  status: VerificationStatus | BidderStatus | TenderStatus | string;
  size?: 'sm' | 'md';
  showIcon?: boolean;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', showIcon = true }) => {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';

  switch (status) {
    case 'VERIFIED':
    case 'RECOMMENDED_ACCEPT':
    case 'AWARDED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 text-emerald-800 ${sizeClasses}`}>
          {showIcon && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
          {status === 'VERIFIED' ? 'Verified' : status === 'RECOMMENDED_ACCEPT' ? 'Recommended Accept' : 'Awarded'}
        </span>
      );

    case 'MANUAL_REVIEW':
    case 'UNDER_REVIEW':
    case 'UNDER_EVALUATION':
    case 'TECHNICAL_SCRUTINY':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 text-amber-800 ${sizeClasses}`}>
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />}
          {status === 'MANUAL_REVIEW'
            ? 'Manual Review'
            : status === 'UNDER_REVIEW'
            ? 'Under Review'
            : status === 'TECHNICAL_SCRUTINY'
            ? 'Technical Scrutiny'
            : 'Under Evaluation'}
        </span>
      );

    case 'MISMATCH':
    case 'DISQUALIFIED':
    case 'CANCELLED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 text-rose-800 ${sizeClasses}`}>
          {showIcon && <XCircle className="w-3.5 h-3.5 text-rose-600" />}
          {status === 'MISMATCH' ? 'Mismatch' : status === 'DISQUALIFIED' ? 'Disqualified' : 'Cancelled'}
        </span>
      );

    case 'EXEMPTED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 text-blue-800 ${sizeClasses}`}>
          {showIcon && <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />}
          Exempted (MSME)
        </span>
      );

    case 'CLARIFICATION_SEEKED':
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-purple-200 bg-purple-50 text-purple-800 ${sizeClasses}`}>
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-purple-600" />}
          Clarification Sought
        </span>
      );

    case 'PENDING':
    default:
      return (
        <span className={`inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 text-slate-700 ${sizeClasses}`}>
          {showIcon && <Clock className="w-3.5 h-3.5 text-slate-500" />}
          {status.replace(/_/g, ' ')}
        </span>
      );
  }
};
