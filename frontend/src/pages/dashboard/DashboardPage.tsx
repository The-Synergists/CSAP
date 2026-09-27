import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CheckCircle2, Clock, FileText, ShieldAlert } from 'lucide-react';
import { getAlerts, getDashboardMetrics, getTenderStats } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { ActivityTimeline } from '../../components/ActivityTimeline';
import { SeverityBadge, TenderStatusBadge } from '../../components/ui/Badge';
import { Card, EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { bidPath, formatDate, plural, tenderPath } from '../../lib/format';

const TONE_BORDER = { danger: 'border-l-rose-600', warning: 'border-l-amber-500', info: 'border-l-blue-600', success: 'border-l-emerald-600' } as const;

/** Metric card in the original CSAP style (coloured left border, uppercase label, icon). Links to the list it counts. */
const Counter: React.FC<{ to: string; label: string; value: number; subtext: string; icon: React.ReactNode; tone: keyof typeof TONE_BORDER }> = ({ to, label, value, subtext, icon, tone }) => (
  <Link to={to} className={`block rounded-md border border-l-4 border-slate-200 bg-white p-4 shadow-xs transition-colors hover:bg-slate-50 ${TONE_BORDER[tone]}`}>
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-slate-400">{icon}</span>
    </div>
    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
    <p className="mt-1 text-xs text-slate-500">{subtext}</p>
  </Link>
);

export const DashboardPage: React.FC = () => {
  const { db } = useApp();
  const navigate = useNavigate();
  const metrics = getDashboardMetrics(db);
  const alerts = getAlerts(db);
  const activeTenders = db.tenders.filter((t) => t.status === 'UNDER_EVALUATION' || t.status === 'TECHNICAL_SCRUTINY');
  const recent = [...db.auditEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 6);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Procurement Verification Dashboard"
        subtitle={`Commercial & Contracts Division · ${formatDate(new Date().toISOString())}`}
        actions={
          <Link to="/tenders" className={buttonClass('secondary')}>
            All tenders
          </Link>
        }
      />

      <section aria-label="Work summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Counter to="/reviews" label="Awaiting your decision" value={metrics.awaitingDecision} subtext="Officer sign-off required" icon={<Clock className="h-4 w-4 text-amber-500" />} tone="warning" />
        <Counter to="/alerts" label="Open alerts" value={alerts.length} subtext="Bids with open findings" icon={<ShieldAlert className="h-4 w-4 text-rose-500" />} tone="danger" />
        <Counter to="/bidders?filter=high-risk" label="High-risk bids" value={metrics.highRisk} subtext="Deficits or discrepancies" icon={<AlertOctagon className="h-4 w-4 text-rose-500" />} tone="danger" />
        <Counter to="/reviews" label="Awaiting clarification" value={metrics.awaitingClarification} subtext="Bidder or committee response" icon={<FileText className="h-4 w-4 text-blue-500" />} tone="info" />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card
          className="xl:col-span-2"
          title="Needs attention"
          subtitle="Bids with open findings, most severe first"
          actions={
            <Link to="/alerts" className="text-xs font-medium text-blue-700 hover:underline">
              All alerts
            </Link>
          }
          padded={false}
        >
          {alerts.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />} title="Nothing needs attention" description="Every flagged finding has an officer decision or pending clarification." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {alerts.map((a) => (
                <li key={a.bidId} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={a.severity} />
                      <span className="font-medium text-slate-900">{a.title}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {a.companyName} · <span className="font-mono text-xs">{a.bidId}</span>
                      {a.openCount > 1 && <span className="text-slate-500"> · {plural(a.openCount, 'open finding')}</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => navigate(`${bidPath(a.bidId, 'evidence')}?finding=${a.findingId}`)} className={buttonClass('primary', 'sm')}>
                    Review evidence <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity" actions={<Link to="/audit" className="text-xs font-medium text-blue-700 hover:underline">Audit trail</Link>}>
          <ActivityTimeline events={recent} showBid />
        </Card>
      </div>

      <Card title="Tenders in evaluation" padded={false}>
        {activeTenders.length === 0 ? (
          <EmptyState title="No tenders in evaluation" />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Tender</th>
                  <th scope="col" className="px-4 py-3 text-right">Bids</th>
                  <th scope="col" className="px-4 py-3 text-right">Awaiting decision</th>
                  <th scope="col" className="px-4 py-3 text-right">Open findings</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeTenders.map((t) => {
                  const s = getTenderStats(db, t.id);
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(tenderPath(t.id))}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{t.title}</div>
                        <div className="font-mono text-xs text-slate-500">{t.id}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{s.bidCount}</td>
                      <td className="px-4 py-3 text-right font-mono">{s.awaitingDecision}</td>
                      <td className={`px-4 py-3 text-right font-mono ${s.openFindings ? 'font-semibold text-amber-700' : ''}`}>{s.openFindings}</td>
                      <td className="px-4 py-3"><TenderStatusBadge status={t.status} /></td>
                      <td className="px-4 py-3 text-right">
                        <Link to={tenderPath(t.id)} onClick={(e) => e.stopPropagation()} className={buttonClass('secondary', 'sm')}>
                          Open workspace
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};
