import React from 'react';
import { AlertOctagon, AlertTriangle, CheckCircle2, Clock, ShieldAlert, ShieldCheck, XCircle } from 'lucide-react';
import {
  BID_STATUS,
  CHECK_STATUS,
  EMD_RESULT,
  FINDING_STATUS,
  RISK_LEVEL,
  SEVERITY,
  TENDER_STATUS,
  type Tone,
} from '../../domain/labels';
import type { BidStatus, CheckStatus, EmdResult, FindingSeverity, FindingStatus, RiskLevel, TenderStatus } from '@shared/domain/types';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-rose-50 text-rose-800 border-rose-200',
  purple: 'bg-purple-50 text-purple-800 border-purple-200',
};

/** Status icons as in the original CSAP status badges. */
const TONE_ICON: Record<Tone, React.ReactNode> = {
  neutral: <Clock className="h-3.5 w-3.5 text-slate-500" />,
  info: <ShieldCheck className="h-3.5 w-3.5 text-blue-600" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />,
  warning: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
  danger: <XCircle className="h-3.5 w-3.5 text-rose-600" />,
  purple: <AlertTriangle className="h-3.5 w-3.5 text-purple-600" />,
};

export const Badge: React.FC<{ tone: Tone; children: React.ReactNode; dot?: boolean; title?: string; icon?: React.ReactNode }> = ({
  tone,
  children,
  dot = false,
  title,
  icon,
}) => (
  <span
    title={title}
    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
  >
    {icon ?? (dot ? <span aria-hidden>{TONE_ICON[tone]}</span> : null)}
    {children}
  </span>
);

export const BidStatusBadge: React.FC<{ status: BidStatus }> = ({ status }) => (
  <Badge tone={BID_STATUS[status].tone} dot>{BID_STATUS[status].label}</Badge>
);

export const TenderStatusBadge: React.FC<{ status: TenderStatus }> = ({ status }) => (
  <Badge tone={TENDER_STATUS[status].tone} dot>{TENDER_STATUS[status].label}</Badge>
);

export const CheckBadge: React.FC<{ status: CheckStatus }> = ({ status }) => (
  <Badge tone={CHECK_STATUS[status].tone} dot>
    {CHECK_STATUS[status].label}
  </Badge>
);

const RISK_ICON: Record<RiskLevel, React.ReactNode> = {
  LOW: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />,
  MEDIUM: <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />,
  HIGH: <AlertOctagon className="h-3.5 w-3.5 text-rose-600" />,
};

/** Original CSAP risk badge: uppercase label with shield icon and score. */
export const RiskBadge: React.FC<{ level: RiskLevel; score?: number }> = ({ level, score }) => (
  <span
    title={score !== undefined ? `Risk score ${score} / 100` : undefined}
    className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-semibold uppercase tracking-wider ${TONE_CLASS[RISK_LEVEL[level].tone]}`}
  >
    {RISK_ICON[level]}
    {RISK_LEVEL[level].label}
    {score !== undefined && <span>({score})</span>}
  </span>
);

export const SeverityBadge: React.FC<{ severity: FindingSeverity }> = ({ severity }) => (
  <Badge tone={SEVERITY[severity].tone}>{SEVERITY[severity].label} severity</Badge>
);

export const FindingStatusBadge: React.FC<{ status: FindingStatus }> = ({ status }) => (
  <Badge tone={FINDING_STATUS[status].tone}>{FINDING_STATUS[status].label}</Badge>
);

export const EmdBadge: React.FC<{ result?: EmdResult }> = ({ result }) =>
  result ? <Badge tone={EMD_RESULT[result].tone} dot>{EMD_RESULT[result].label}</Badge> : <Badge tone="neutral">Pending</Badge>;

/** "AI advisory" marker — used sparingly, only where content is machine-generated. */
export const AdvisoryTag: React.FC = () => (
  <span className="inline-flex items-center rounded bg-indigo-200 px-2 py-0.5 font-mono text-[10px] font-semibold text-indigo-800">
    AI advisory
  </span>
);
