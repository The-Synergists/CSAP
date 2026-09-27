// Procurement verification dashboard, in the layout of the original CSAP dashboard. Every number is
// derived from the database rows (bids, checks, decisions, EMD); a tender's status comes from its
// bids (see tenderStage), so a tender without bids never shows as "under evaluation".

import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertOctagon, ArrowRight, CheckCircle2, Clock, FileText, Percent, Users } from 'lucide-react';
import { getDashboardMetrics, getTenderStats } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { TenderStageBadge } from '../../components/ui/Badge';
import { PageHeader } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { RISK_LEVEL } from '../../domain/labels';
import { tenderPath } from '../../lib/format';

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

export const DashboardPage: React.FC = () => {
  const { db } = useApp();
  const navigate = useNavigate();
  const m = getDashboardMetrics(db);
  const tenders = [...db.tenders].sort((a, b) => b.publishDate.localeCompare(a.publishDate));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Procurement Verification Dashboard"
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
          <Link to="/tenders" className={buttonClass('secondary', 'sm')}>
            View all tenders <ArrowRight className="h-3.5 w-3.5" />
          </Link>
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

    </div>
  );
};
