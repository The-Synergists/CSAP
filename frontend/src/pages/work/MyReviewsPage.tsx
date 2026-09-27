import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import { listBidViews, type BidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { BidStatusBadge, RiskBadge } from '../../components/ui/Badge';
import { Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { DECISION } from '../../domain/labels';
import { bidPath, formatDateTime } from '../../lib/format';
import { openedBids } from '../../lib/openedBids';

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
  const { db, currentUser } = useApp();
  const [opened, setOpened] = useState(() => openedBids(currentUser?.id));
  useEffect(() => {
    const refresh = () => setOpened(openedBids(currentUser?.id));
    refresh();
    window.addEventListener('csap:opened-bids', refresh);
    return () => window.removeEventListener('csap:opened-bids', refresh);
  }, [currentUser?.id]);

  const views = listBidViews(db);
  const mine = (v: BidView) => !!v.latestDecision && v.latestDecision.officerId === currentUser?.id;
  // In progress: bids you opened that have no final decision yet (newest opened first).
  const inProgress = views.filter((v) => !v.flags.closed && opened[v.bid.id]).sort((a, b) => opened[b.bid.id].localeCompare(opened[a.bid.id]));
  // Done: bids with your final decision (newest first).
  const done = views.filter((v) => v.flags.closed && mine(v)).sort((a, b) => b.latestDecision!.decidedAt.localeCompare(a.latestDecision!.decidedAt));

  return (
    <div className="space-y-5">
      <PageHeader title="My reviews" subtitle="Reviews you have started and bids you have decided." />

      <Card title={`In progress (${inProgress.length})`} subtitle="Bids you opened that have no final decision yet" padded={false}>
        {inProgress.length === 0 ? (
          <EmptyState title="No reviews in progress" description="A bid appears here once you open it." />
        ) : (
          <ul className="divide-y divide-slate-100">{inProgress.map((v) => <Row key={v.bid.id} v={v} action="Continue review" />)}</ul>
        )}
      </Card>

      <Card title={`Decided by you (${done.length})`} padded={false}>
        {done.length === 0 ? (
          <EmptyState icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title="No final decisions recorded yet" />
        ) : (
          <ul className="divide-y divide-slate-100">{done.map((v) => <Row key={v.bid.id} v={v} action="View decision" tab="decision" />)}</ul>
        )}
      </Card>
    </div>
  );
};
