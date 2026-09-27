import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getTenderStats } from '@shared/domain/selectors';
import type { TenderStatus } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { TenderStatusBadge } from '../../components/ui/Badge';
import { Button, Card, EmptyState, FilterChips, PageHeader, SearchInput } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { TENDER_STATUS } from '../../domain/labels';
import { formatCrore, formatDate, formatINR, tenderPath } from '../../lib/format';

type StatusFilter = 'ALL' | TenderStatus;
const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'UNDER_EVALUATION', label: TENDER_STATUS.UNDER_EVALUATION.label },
  { id: 'TECHNICAL_SCRUTINY', label: TENDER_STATUS.TECHNICAL_SCRUTINY.label },
  { id: 'AWARDED', label: TENDER_STATUS.AWARDED.label },
];

export const TenderListPage: React.FC = () => {
  const { db, source } = useApp();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');

  const q = term.trim().toLowerCase();
  const rows = db.tenders.filter(
    (t) => (status === 'ALL' || t.status === status) && (!q || [t.id, t.title, t.division, t.category].some((s) => s.toLowerCase().includes(q))),
  );
  const counts = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.id, db.tenders.filter((t) => o.id === 'ALL' || t.status === o.id).length]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tenders"
        subtitle="Tenders published by CPCL and the bids received against them."
        actions={
          source === 'api' && (
            <Link to="/tenders/new" className={buttonClass('primary', 'md')}>
              <Plus className="h-4 w-4" /> New tender
            </Link>
          )
        }
      />

      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={term} onChange={setTerm} label="Search tenders" placeholder="Search by tender ID, title or division" className="lg:w-96" />
          <FilterChips label="Filter by status" options={STATUS_OPTIONS} value={status} onChange={setStatus} counts={counts} />
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No tenders match"
            description="Try a different search term or status."
            action={<Button onClick={() => { setTerm(''); setStatus('ALL'); }}>Clear filters</Button>}
          />
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs text-slate-700">
              <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                <tr>
                  <th scope="col" className="px-4 py-3">Tender</th>
                  <th scope="col" className="px-4 py-3 text-right">Est. value</th>
                  <th scope="col" className="px-4 py-3 text-right">EMD</th>
                  <th scope="col" className="px-4 py-3">Closing date</th>
                  <th scope="col" className="px-4 py-3 text-right">Bids</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-2.5"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((t) => {
                  const s = getTenderStats(db, t.id);
                  return (
                    <tr key={t.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(tenderPath(t.id))}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{t.title}</div>
                        <div className="text-xs text-slate-500">
                          <span className="font-mono">{t.id}</span> · {t.division}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatCrore(t.estimatedValue)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">{formatINR(t.emdAmount)}</td>
                      <td className="whitespace-nowrap px-4 py-3">{formatDate(t.deadlineDate)}</td>
                      <td className="px-4 py-3 text-right font-mono" title={s.bidCount === 0 ? 'No bid records for this tender in the dataset' : undefined}>
                        {s.bidCount}
                      </td>
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
