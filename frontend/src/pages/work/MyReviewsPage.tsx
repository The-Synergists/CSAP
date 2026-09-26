import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { listBidViews, type BidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { BidStatusBadge, RiskBadge } from '../../components/ui/Badge';
import { Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { DECISION } from '../../domain/labels';
import { bidPath, formatDateTime } from '../../lib/format';

const Row: React.FC<{ v: BidView; action: string; tab?: string }> = ({ v, action, tab }) => (
  <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-900">{v.bidder.companyName}</span>
        <span className="font-mono text-xs text-slate-500">{v.bid.id}</span>
        <BidStatusBadge status={v.bid.status} />
        <RiskBadge level={v.bid.riskLevel} score={v.bid.riskScore} />
      </div>
      <p className="mt-0.5 text-xs text-slate-600">{v.bid.primaryConcern}</p>
      <p className="text-xs text-slate-500">
        {v.tender.id} · compliance {v.bid.complianceScore}
        {v.latestDecision && ` · last action: ${DECISION[v.latestDecision.decision].label} on ${formatDateTime(v.latestDecision.decidedAt)}`}
      </p>
    </div>
    <Link to={bidPath(v.bid.id, tab)} className={`${buttonClass('primary', 'sm')} shrink-0`}>
      {action} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  </li>
);

export const MyReviewsPage: React.FC = () => {
  const { db } = useApp();
  const views = listBidViews(db).sort((a, b) => b.bid.riskScore - a.bid.riskScore);
  const toDecide = views.filter((v) => v.flags.awaitingDecision);
  const waiting = views.filter((v) => v.bid.status === 'CLARIFICATION_REQUIRED' || v.bid.status === 'COMMITTEE_REVIEW');
  const done = views.filter((v) => v.flags.closed);

  return (
    <div className="space-y-5">
      <PageHeader title="My reviews" subtitle="Bids that need your decision, bids waiting on others, and bids you have closed." />

      <Card title={`Awaiting your decision (${toDecide.length})`} subtitle="Highest risk first" padded={false}>
        {toDecide.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title="Nothing awaiting your decision" />
        ) : (
          <ul className="divide-y divide-slate-100">{toDecide.map((v) => <Row key={v.bid.id} v={v} action="Start review" />)}</ul>
        )}
      </Card>

      <Card title={`Waiting on bidder or committee (${waiting.length})`} padded={false}>
        {waiting.length === 0 ? (
          <EmptyState title="No bids are waiting on clarification or committee review" />
        ) : (
          <ul className="divide-y divide-slate-100">{waiting.map((v) => <Row key={v.bid.id} v={v} action="Open case" />)}</ul>
        )}
      </Card>

      <Card title={`Decided (${done.length})`} padded={false}>
        {done.length === 0 ? (
          <EmptyState title="No final decisions recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-100">{done.map((v) => <Row key={v.bid.id} v={v} action="View decision" tab="decision" />)}</ul>
        )}
      </Card>
    </div>
  );
};
