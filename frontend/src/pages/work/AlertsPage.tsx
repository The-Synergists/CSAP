import React from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { getAlerts, type AlertItem } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { Badge } from '../../components/ui/Badge';
import { Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { bidPath } from '../../lib/format';

const KIND: Record<AlertItem['kind'], { label: string; tone: 'danger' | 'warning' }> = {
  ACTION: { label: 'Needs your action', tone: 'warning' },
  DISQUALIFYING: { label: 'Can disqualify the bid', tone: 'danger' },
};

const itemLink = (bidId: string, i: AlertItem) =>
  i.findingId && i.tab === 'evidence' ? `${bidPath(bidId, 'evidence')}?finding=${i.findingId}` : bidPath(bidId, i.tab === 'overview' ? undefined : i.tab);

/**
 * Alerts come only from real signals on a bid: a bidder response waiting for the officer, an
 * automatic verification that did not finish, a mandatory requirement not met or missing, or a
 * government registry that contradicts the bid. Points that only need review are in My Reviews.
 */
export const AlertsPage: React.FC = () => {
  const { db } = useApp();
  const alerts = getAlerts(db);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alerts"
        subtitle="Bids that need you now: responses waiting, verification that did not finish, mandatory requirements not met, or registries contradicting the bid."
      />
      {alerts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
            title="No alerts"
            description="No bid has a disqualifying issue or a request waiting for you. Items that only need review are in My Reviews."
          />
        </Card>
      ) : (
        alerts.map((a) => (
          <Card
            key={a.bidId}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {a.companyName} <span className="font-mono text-xs font-normal text-slate-500">{a.bidId}</span>
              </span>
            }
            subtitle={`${a.tenderId} · ${a.items.length} alert${a.items.length === 1 ? '' : 's'}`}
            actions={
              <Link to={bidPath(a.bidId, 'decision')} className={buttonClass('primary', 'sm')}>
                Open decision
              </Link>
            }
            padded={false}
          >
            <ul className="divide-y divide-slate-100">
              {a.items.map((i, n) => (
                <li key={n} className="flex flex-col gap-1 px-4 py-2.5 text-xs sm:flex-row sm:items-start sm:gap-3">
                  <Badge tone={KIND[i.kind].tone}>{KIND[i.kind].label}</Badge>
                  <div className="min-w-0">
                    <Link to={itemLink(a.bidId, i)} className="font-medium text-slate-900 hover:text-blue-700 hover:underline">
                      {i.title}
                    </Link>
                    <p className="text-slate-500">{i.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
};
