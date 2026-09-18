import React from 'react';
import { ShieldAlert, ShieldCheck, AlertOctagon } from 'lucide-react';
import type { RiskLevel } from '../../types';

interface RiskBadgeProps {
  level: RiskLevel;
  score?: number;
  showIcon?: boolean;
}

export const RiskBadge: React.FC<RiskBadgeProps> = ({ level, score, showIcon = true }) => {
  switch (level) {
    case 'LOW':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          {showIcon && <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />}
          Low {score !== undefined ? `(${score})` : ''}
        </span>
      );

    case 'MEDIUM':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
          {showIcon && <ShieldAlert className="w-3.5 h-3.5 text-amber-600" />}
          Medium {score !== undefined ? `(${score})` : ''}
        </span>
      );

    case 'HIGH':
    case 'CRITICAL':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
          {showIcon && <AlertOctagon className="w-3.5 h-3.5 text-rose-600" />}
          High {score !== undefined ? `(${score})` : ''}
        </span>
      );

    default:
      return null;
  }
};
