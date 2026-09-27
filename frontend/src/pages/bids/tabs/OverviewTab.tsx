import React from 'react';
import { RegistryLink } from '../../../components/RegistryLink';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ActivityTimeline } from '../../../components/ActivityTimeline';
import { RiskBadge } from '../../../components/ui/Badge';
import { Stat } from '../../../components/ui/primitives';
import { EMD_RESULT } from '../../../domain/labels';
import { formatDateTime } from '../../../lib/format';
import { AdvisoryTag, CheckBadge } from '../../../components/ui/Badge';
import { Button, Card, DetailList } from '../../../components/ui/primitives';
import { DECISION } from '../../../domain/labels';
import { formatCr, formatDate } from '../../../lib/format';
import type { TabProps } from '../bidTabs';
import { GemIntakeCard } from '../GemIntakeCard';

export const OverviewTab: React.FC<TabProps> = ({ view, goTo }) => {
  const exceptions = view.checks.filter((c) => c.status === 'REVIEW' || c.status === 'NOT_MET' || c.status === 'MISSING');
  const rec = view.recommendation;
  const { bid, counts } = view;
  return (
    <div className="space-y-5">
    <Card>
      {view.checks.length === 0 ? (
        <p className="flex items-center gap-2 py-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" /> CSAP is verifying this bid: reading its documents, checking the tender rules and the registries. The score and results appear here as soon as it finishes.
        </p>
      ) : (
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Compliance score" value={`${bid.complianceScore} / 100`} />
        <Stat label="Risk" value={<RiskBadge level={bid.riskLevel} score={bid.riskScore} />} />
        <Stat label="Requirements met" value={`${counts.met} of ${counts.total}`} />
        <Stat label="Exceptions" value={<span className={counts.exceptions ? 'text-amber-700' : 'text-emerald-700'}>{counts.exceptions || 'None'}</span>} />
        <Stat
          label="Documents"
          value={<span className={view.documents.length < view.documentsRequired ? 'text-rose-700' : ''}>{view.documents.length} of {view.documentsRequired}</span>}
        />
        <Stat label="EMD" value={view.emd ? EMD_RESULT[view.emd.result].label : 'Not submitted'} />
      </dl>
      )}
      <p className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
        Submitted {formatDateTime(bid.submittedAt)} · last verified {formatDateTime(bid.lastVerifiedAt)}
      </p>
    </Card>
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <GemIntakeCard view={view} />
        <Card
          title="Exceptions against tender requirements"
          subtitle={`${view.counts.met} of ${view.counts.total} requirements met`}
          actions={<Button size="sm" onClick={() => goTo('compliance')}>All requirements</Button>}
          padded={false}
        >
          {exceptions.length === 0 ? (
            <p className="flex items-center gap-2 px-4 py-4 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Every requirement is met or validly exempted.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {exceptions.map((c) => (
                <li key={c.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{c.requirement.code}</span>
                      <span className="font-medium text-slate-900">{c.requirement.title}</span>
                      <CheckBadge status={c.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      Required <span className="text-slate-900">{c.requirement.benchmark}</span> · found <span className="text-slate-900">{c.submitted}</span>
                    </p>
                  </div>
                  {c.findingId && (
                    <Button size="sm" variant="ghost" onClick={() => goTo('evidence', { finding: c.findingId! })}>
                      View evidence
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        {rec && (
          <Card
            title={
              <span className="flex items-center gap-2">
                AI recommendation <AdvisoryTag />
              </span>
            }
            actions={<Button size="sm" variant="primary" onClick={() => goTo('decision')}>Go to decision</Button>}
          >
            <p className="text-xs text-slate-900">
              <span className="font-medium">Suggested: {DECISION[rec.suggestedDecision].label}.</span> {rec.summary}
            </p>
            <p className="mt-2 text-xs text-slate-500">AI advisory — the final decision remains with the designated procurement officer.</p>
          </Card>
        )}
      </div>

      <div className="space-y-5">
      <Card title="Bidder">
        <DetailList
          rows={[
            { label: 'GSTIN', value: <RegistryLink registry="gstn" id={view.bidder.gstin} /> },
            { label: 'PAN', value: <RegistryLink registry="pan" id={view.bidder.pan} /> },
            { label: 'Incorporated', value: formatDate(view.bidder.incorporationDate) },
            { label: 'Address', value: view.bidder.registeredAddress },
            {
              label: 'Udyam',
              value: view.bidder.udyamNumber ? (
                <>
                  <RegistryLink registry="udyam" id={view.bidder.udyamNumber} />
                  {view.bidder.msmeCategory ? ` (${view.bidder.msmeCategory})` : ''}
                </>
              ) : (
                '—'
              ),
            },
            { label: 'Local content', value: `${view.bid.makeInIndiaPercentage}%` },
            {
              label: 'Turnover',
              value: (
                <ul>
                  {view.bidder.turnover.map((t) => (
                    <li key={t.financialYear}>
                      {t.financialYear}: {formatCr(t.amountCr)}
                    </li>
                  ))}
                  <li className="font-medium">Average: {formatCr(view.averageTurnoverCr)}</li>
                </ul>
              ),
            },
          ]}
        />
      </Card>
      <Card
        title="Activity"
        subtitle="Submission, verification and officer actions on this bid"
        actions={<Link to={`/audit?bidId=${view.bid.id}`} className="text-xs font-medium text-blue-700 hover:underline">Audit trail</Link>}
      >
        <ActivityTimeline events={view.audit.slice(0, 8)} />
        {view.audit.length > 8 && <p className="mt-2 text-xs text-slate-500">{view.audit.length - 8} earlier events in the audit trail.</p>}
      </Card>
      </div>
    </div>
    </div>
  );
};
