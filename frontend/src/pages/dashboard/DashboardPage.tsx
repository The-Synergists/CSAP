// Procurement verification dashboard, in the layout of the original CSAP dashboard. Every number is
// derived from the database rows (bids, checks, decisions, EMD); a tender's status comes from its
// bids (see tenderStage), so a tender without bids never shows as "under evaluation".

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CheckCircle2, Clock, CreditCard, ExternalLink, FileText, Percent, ShieldAlert, Users } from 'lucide-react';
import { getAlerts, getDashboardMetrics, getTenderStats, listBidViews, type BidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { BidStatusBadge, RiskBadge, SeverityBadge, TenderStageBadge } from '../../components/ui/Badge';
import { EmptyState, PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { EMD_RESULT, RISK_LEVEL } from '../../domain/labels';
import { bidPath, formatDate, formatDateTime, formatINR, tenderPath } from '../../lib/format';

const TONE_BORDER = { neutral: 'border-l-slate-400', danger: 'border-l-rose-600', warning: 'border-l-amber-500', info: 'border-l-blue-600', success: 'border-l-emerald-600' } as const;

const Metric: React.FC<{ to: string; label: string; value: React.ReactNode; subtext: string; icon: React.ReactNode; tone: keyof typeof TONE_BORDER }> = ({ to, label, value, subtext, icon, tone }) => (
  <Link to={to} className={`block rounded-md border border-l-4 border-slate-200 bg-white p-3.5 shadow-xs transition-colors hover:bg-slate-50 ${TONE_BORDER[tone]}`}>
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-slate-400">{icon}</span>
    </div>
    <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{value}</div>
    <p className="mt-1 text-xs text-slate-500">{subtext}</p>
  </Link>
);

const Panel: React.FC<{ title: string; icon: React.ReactNode; badge?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, badge, children }) => (
  <section className="rounded-md border border-slate-200 bg-white p-4 shadow-xs">
    <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
      <h2 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-800">
        {icon} {title}
      </h2>
      {badge}
    </div>
    {children}
  </section>
);

const Row: React.FC<{ to: string; tone?: 'danger' | 'default'; children: React.ReactNode }> = ({ to, tone = 'default', children }) => (
  <Link
    to={to}
    className={`flex items-center justify-between gap-2 rounded border p-2.5 text-xs transition-colors ${
      tone === 'danger' ? 'border-rose-200 bg-rose-50/40 hover:bg-rose-50' : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50'
    }`}
  >
    {children}
  </Link>
);

const emdText = (v: BidView) => {
  const e = v.emd;
  if (!e) return 'No EMD record';
  if (e.instrument === 'MSME_EXEMPTION') return `MSE exemption claimed · ${EMD_RESULT[e.result].label}`;
  const short = e.requiredAmount - e.submittedAmount;
  return `${formatINR(e.submittedAmount)} of ${formatINR(e.requiredAmount)}${short > 0 ? ` · ${formatINR(short)} short` : ''} · ${EMD_RESULT[e.result].label}`;
};

export const DashboardPage: React.FC = () => {
  const { db } = useApp();
  const navigate = useNavigate();
  const m = getDashboardMetrics(db);
  const alerts = getAlerts(db);
  const views = listBidViews(db);
  const pending = views.filter((v) => v.flags.awaitingDecision || v.flags.pendingRequest);
  const verified = views.filter((v) => v.checks.length > 0).sort((a, b) => (b.bid.lastVerifiedAt ?? '').localeCompare(a.bid.lastVerifiedAt ?? '')).slice(0, 5);
  const emd = views.filter((v) => v.emd).sort((a, b) => Number(b.flags.emdIssue) - Number(a.flags.emdIssue)).slice(0, 5);
  const tenders = [...db.tenders].sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Procurement Verification Dashboard"
        subtitle={`Commercial & Contracts Division · ${formatDate(new Date().toISOString())}`}
        actions={
          <Link to="/tenders" className={buttonClass('secondary')}>
            View all tenders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric to="/tenders" label="Active tenders" value={m.activeTenders} subtext={`In evaluation${m.openForBids ? ` · ${m.openForBids} open for bids` : ''}`} icon={<FileText className="h-4 w-4" />} tone="neutral" />
        <Metric to="/bidders" label="Bids under verification" value={m.bidsUnderVerification} subtext="Without a final decision" icon={<Users className="h-4 w-4" />} tone="info" />
        <Metric to="/bidders?filter=verified" label="Fully compliant" value={m.fullyCompliant} subtext="All criteria cleared" icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />} tone="success" />
        <Metric to="/reviews" label="Pending reviews" value={m.awaitingDecision} subtext="Officer sign-off required" icon={<Clock className="h-4 w-4 text-amber-500" />} tone="warning" />
        <Metric to="/bidders?filter=high-risk" label="High risk" value={m.highRisk} subtext="Deficits or discrepancies" icon={<AlertOctagon className="h-4 w-4 text-rose-500" />} tone="danger" />
        <Metric to="/bidders" label="Avg compliance" value={m.averageCompliance === null ? '—' : `${m.averageCompliance}%`} subtext="Across bids under verification" icon={<Percent className="h-4 w-4 text-blue-500" />} tone="info" />
      </section>

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-xs" aria-label="Tenders">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-800">
            <FileText className="h-4 w-4 text-slate-500" /> Tenders
          </h2>
          <span className="text-xs text-slate-500">{tenders.length} tenders · status from their bids</span>
        </div>
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-2.5">Tender ID &amp; title</th>
                <th scope="col" className="px-4 py-2.5 text-center">Bids received</th>
                <th scope="col" className="px-4 py-2.5 text-center">Avg compliance</th>
                <th scope="col" className="px-4 py-2.5">Risk profile</th>
                <th scope="col" className="px-4 py-2.5">Status</th>
                <th scope="col" className="px-4 py-2.5 text-right"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {tenders.map((t) => {
                const s = getTenderStats(db, t.id);
                return (
                  <tr key={t.id} className="cursor-pointer hover:bg-blue-50/40" onClick={() => navigate(tenderPath(t.id))}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-[11px] font-bold text-blue-700">{t.id}</div>
                      <div className="mt-0.5 font-medium text-slate-900">{t.title}</div>
                      <div className="text-[11px] text-slate-500">{t.division}</div>
                    </td>
                    <td className="px-4 py-3 text-center font-medium">{s.bidCount ? `${s.bidCount} ${s.bidCount === 1 ? 'bid' : 'bids'}` : '—'}</td>
                    <td className="px-4 py-3 text-center font-semibold text-slate-900">{s.averageCompliance === null ? '—' : `${s.averageCompliance}%`}</td>
                    <td className="px-4 py-3">
                      {s.riskLevel ? (
                        <span title={`${s.highRiskCount} high-risk bid(s)`}>{RISK_LEVEL[s.riskLevel].label}{s.highRiskCount ? ` · ${s.highRiskCount} high-risk` : ''}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><TenderStageBadge stage={s.stage} /></td>
                    <td className="px-4 py-3 text-right">
                      <Link to={tenderPath(t.id)} onClick={(e) => e.stopPropagation()} className={buttonClass('primary', 'sm')}>
                        Open case
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel
          title="Pending officer reviews"
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          badge={<span className="rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">{pending.length} awaiting</span>}
        >
          {pending.length === 0 ? (
            <EmptyState title="Nothing awaiting your decision" />
          ) : (
            <div className="space-y-2">
              {pending.map((v) => (
                <Row key={v.bid.id} to={bidPath(v.bid.id, v.flags.pendingRequest ? undefined : 'decision')}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{v.bidder.companyName}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      {v.bid.id} · {v.tender.id}
                      {v.flags.pendingRequest && <span className="font-sans text-amber-700"> · re-evaluation request</span>}
                    </div>
                  </div>
                  <span className="flex items-center gap-2">
                    <RiskBadge level={v.bid.riskLevel} score={v.bid.riskScore} />
                    <ExternalLink aria-hidden className="h-3.5 w-3.5 text-slate-400" />
                  </span>
                </Row>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Critical alerts & discrepancies"
          icon={<ShieldAlert className="h-4 w-4 text-rose-500" />}
          badge={<span className="rounded border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{alerts.length} {alerts.length === 1 ? 'flag' : 'flags'}</span>}
        >
          {alerts.length === 0 ? (
            <EmptyState title="No open alerts" description="Every finding has an officer decision." />
          ) : (
            <div className="space-y-2">
              {alerts.slice(0, 5).map((a) => (
                <Row key={a.bidId} to={`${bidPath(a.bidId, 'evidence')}?finding=${a.findingId}`} tone={a.severity === 'HIGH' ? 'danger' : 'default'}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{a.title}</div>
                    <div className="text-[11px] text-slate-600">
                      {a.companyName} · <span className="font-mono">{a.bidId}</span>
                      {a.openCount > 1 && ` · ${a.openCount} open findings`}
                    </div>
                  </div>
                  <SeverityBadge severity={a.severity} />
                </Row>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Recently verified bids" icon={<CheckCircle2 className="h-4 w-4 text-emerald-500" />}>
          {verified.length === 0 ? (
            <EmptyState title="No bids verified yet" />
          ) : (
            <div className="space-y-2">
              {verified.map((v) => (
                <Row key={v.bid.id} to={bidPath(v.bid.id)}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{v.bidder.companyName}</div>
                    <div className="font-mono text-[11px] text-slate-500">
                      Score {v.bid.complianceScore}% · {RISK_LEVEL[v.bid.riskLevel].label} risk · {v.bid.id}
                      {v.bid.lastVerifiedAt && <span className="font-sans"> · {formatDateTime(v.bid.lastVerifiedAt)}</span>}
                    </div>
                  </div>
                  <BidStatusBadge status={v.bid.status} />
                </Row>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="EMD & bank guarantee status" icon={<CreditCard className="h-4 w-4 text-blue-500" />}>
          {emd.length === 0 ? (
            <EmptyState title="No EMD records" />
          ) : (
            <div className="space-y-2">
              {emd.map((v) => (
                <Row key={v.bid.id} to={bidPath(v.bid.id, 'emd')} tone={v.flags.emdIssue ? 'danger' : 'default'}>
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{v.bidder.companyName} <span className="font-mono text-[11px] font-normal text-slate-500">({v.bid.id})</span></div>
                    <div className={`text-[11px] ${v.flags.emdIssue ? 'text-rose-700' : 'text-slate-500'}`}>{emdText(v)}</div>
                  </div>
                </Row>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
};
