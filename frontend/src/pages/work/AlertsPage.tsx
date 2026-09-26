import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getAlerts, getBidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { SeverityBadge } from '../../components/ui/Badge';
import { Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { bidPath } from '../../lib/format';

/** One alert per bid with open findings and no final decision (derived from the findings table). */
export const AlertsPage: React.FC = () => {
  const { db } = useApp();
  const alerts = getAlerts(db);

  return (
    <div className="space-y-5">
      <PageHeader title="Alerts" subtitle="Bids with open findings that need officer attention, most severe first." />
      {alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
            title="No open alerts"
            description="Every finding has an officer decision or a pending clarification."
          />
        </Card>
      ) : (
        alerts.map((a) => {
          const view = getBidView(db, a.bidId)!;
          return (
            <Card
              key={a.bidId}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={a.severity} /> {a.companyName} <span className="font-mono text-xs font-normal text-slate-500">{a.bidId}</span>
                </span>
              }
              subtitle={`${a.tenderId} · ${a.openCount} open finding${a.openCount === 1 ? '' : 's'}`}
              actions={
                <>
                  <Link to={`${bidPath(a.bidId, 'evidence')}?finding=${a.findingId}`} className={buttonClass('secondary', 'sm')}>
                    Review evidence
                  </Link>
                  <Link to={bidPath(a.bidId, 'decision')} className={buttonClass('primary', 'sm')}>
                    Record decision
                  </Link>
                </>
              }
              padded={false}
            >
              <ul className="divide-y divide-slate-100">
                {view.openFindings.map((f) => (
                  <li key={f.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-xs sm:flex-row sm:items-center sm:gap-3">
                    <SeverityBadge severity={f.severity} />
                    <Link to={`${bidPath(a.bidId, 'evidence')}?finding=${f.id}`} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                      {f.title}
                    </Link>
                    <span className="text-slate-500">{f.comparison}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })
      )}
    </div>
  );
};
