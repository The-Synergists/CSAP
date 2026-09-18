import React, { type ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon?: ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  subtext,
  icon,
  variant = 'default',
}) => {
  const borderHighlight =
    variant === 'danger'
      ? 'border-l-4 border-l-rose-600'
      : variant === 'warning'
      ? 'border-l-4 border-l-amber-500'
      : variant === 'success'
      ? 'border-l-4 border-l-emerald-600'
      : variant === 'info'
      ? 'border-l-4 border-l-blue-600'
      : '';

  return (
    <div className={`bg-white border border-slate-200 rounded-md p-4 shadow-xs ${borderHighlight}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-slate-900">{value}</span>
      </div>
      {subtext && <p className="mt-1 text-xs text-slate-500">{subtext}</p>}
    </div>
  );
};
