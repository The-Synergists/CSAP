import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { BID_FILTERS, findTender, getTenderStats, listBidViews, matchesBidSearch, type BidFilterId } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { ActivityTimeline } from '../../components/ActivityTimeline';
import { BidTable } from '../../components/bids/BidTable';
import { Badge, TenderStageBadge } from '../../components/ui/Badge';
import { Button, Card, CountPill, DetailList, EmptyState, FilterChips, PageHeader, SearchInput, Stat, Tabs } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { REQUIREMENT_CATEGORY } from '../../domain/labels';
import { formatCrore, formatDate, formatINR, tenderPath } from '../../lib/format';
import { NotFoundPage } from '../common/NotFoundPage';

const TABS = ['overview', 'requirements', 'bids', 'activity'] as const;
type Tab = (typeof TABS)[number];

export const TenderWorkspacePage: React.FC = () => {
  const { tenderId, tab } = useParams();
  const navigate = useNavigate();
  const { db, setActiveTenderId } = useApp();
  const tender = findTender(db, tenderId);
  const activeTab: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'overview';

  const [term, setTerm] = useState('');
  const [filter, setFilter] = useState<BidFilterId>('all');

  useEffect(() => {
    if (tender) setActiveTenderId(tender.id);
  }, [tender, setActiveTenderId]);

  if (!tender) return <NotFoundPage what="tender" id={tenderId} />;

  const views = listBidViews(db, tender.id);
  const stats = getTenderStats(db, tender.id);
  const requirements = db.requirements.filter((r) => r.tenderId === tender.id);
  const filterDef = BID_FILTERS.find((f) => f.id === filter)!;
  const shown = views.filter((v) => filterDef.test(v) && matchesBidSearch(v, term));
  const counts = Object.fromEntries(BID_FILTERS.map((f) => [f.id, views.filter((v) => f.test(v)).length]));
  const activity = db.auditEvents.filter((e) => e.tenderId === tender.id);

  const setTab = (t: Tab) => navigate(tenderPath(tender.id, t === 'overview' ? undefined : t));

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: 'Tenders', to: '/tenders' }, { label: tender.id }]}
        meta={
          <>
            <span className="font-mono text-xs text-slate-600">{tender.id}</span>
            <TenderStageBadge stage={stats.stage} />
          </>
        }
        title={tender.title}
        subtitle={tender.division}
        actions={
          <>
            {views.length > 0 && (
              <Button variant="primary" onClick={() => setTab('bids')}>
                <Users className="h-4 w-4" /> Review bids ({views.length})
              </Button>
            )}
          </>
        }
      />

      <Tabs
        label="Tender sections"
        active={activeTab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'requirements', label: 'Requirements', badge: <CountPill n={requirements.length} /> },
          { id: 'bids', label: 'Bids', badge: <CountPill n={views.length} /> },
          { id: 'activity', label: 'Activity' },
        ]}
      />

      {activeTab === 'overview' && (
        <div className="space-y-5">
        <Card>
          <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Bids received" value={stats.bidCount} />
            <Stat label="Awaiting decision" value={stats.awaitingDecision} />
            <Stat label="Open findings" value={stats.openFindings} />
            <Stat label="High-risk bids" value={stats.highRiskCount} />
            <Stat label="Estimated value" value={formatCrore(tender.estimatedValue)} />
            <Stat label="EMD required" value={formatINR(tender.emdAmount)} />
          </dl>
        </Card>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card title="About this tender" className="lg:col-span-2">
            <p className="text-xs leading-relaxed text-slate-700">{tender.description}</p>
            <div className="mt-4">
              <DetailList
                rows={[
                  { label: 'Category', value: tender.category },
                  { label: 'Officer in charge', value: tender.officerInCharge },
                  { label: 'Published', value: formatDate(tender.publishDate) },
                  { label: 'Bid submission deadline', value: formatDate(tender.deadlineDate) },
                  { label: 'Technical bid opening', value: formatDate(tender.technicalOpeningDate) },
                ]}
              />
            </div>
          </Card>
          <Card title="Bids at a glance" padded={false} actions={views.length > 0 && <Button size="sm" onClick={() => setTab('bids')}>Full table</Button>}>
            {views.length === 0 ? (
              <EmptyState title="No bids" description="No bid records exist for this tender in the current dataset." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {views.map((v) => (
                  <li key={v.bid.id}>
                    <Link to={`/bids/${v.bid.id}`} className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-slate-50">
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium text-slate-900">{v.bidder.companyName}</span>
                        <span className="block font-mono text-xs text-slate-500">{v.bid.id} · compliance {v.bid.complianceScore}</span>
                      </span>
                      <Badge tone={v.bid.riskLevel === 'HIGH' ? 'danger' : v.bid.riskLevel === 'MEDIUM' ? 'warning' : 'success'} dot>
                        {v.bid.riskLevel.charAt(0) + v.bid.riskLevel.slice(1).toLowerCase()}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        </div>
      )}

      {activeTab === 'requirements' && (
        <Card
          title="Evaluation requirements"
          subtitle="Each bid is checked against every requirement below. Illustrative tender rules for this prototype."
          padded={false}
        >
          {requirements.length === 0 ? (
            <EmptyState title="Requirements not configured" description="Clause-level requirements have not been set up for this tender." />
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-xs text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  <tr>
                    <th scope="col" className="px-4 py-3">Code</th>
                    <th scope="col" className="px-4 py-3">Requirement</th>
                    <th scope="col" className="px-4 py-3">Criterion</th>
                    <th scope="col" className="px-4 py-3">Benchmark</th>
                    <th scope="col" className="px-4 py-3">Mandatory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {requirements.map((r) => (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-600">
                        {r.code}
                        <div className="text-slate-400">{r.clause}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{r.title}</div>
                        <div className="text-xs text-slate-500">{REQUIREMENT_CATEGORY[r.category]}</div>
                      </td>
                      <td className="max-w-md px-4 py-3 text-slate-700">{r.criterion}</td>
                      <td className="px-4 py-3 text-slate-900">{r.benchmark}</td>
                      <td className="px-4 py-3">{r.mandatory ? <Badge tone="neutral">Mandatory</Badge> : <span className="text-xs text-slate-500">Optional</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {activeTab === 'bids' && (
        <Card padded={false}>
          <div className="flex flex-col gap-3 border-b border-slate-200 p-3">
            <SearchInput value={term} onChange={setTerm} label="Search bids" placeholder="Search by bidder, bid ID or GSTIN" className="lg:w-96" />
            <FilterChips label="Filter bids" options={BID_FILTERS} value={filter} onChange={setFilter} counts={counts} />
          </div>
          {views.length === 0 ? (
            <EmptyState title="No bids received" description="Bids will appear here once submitted for this tender." />
          ) : shown.length === 0 ? (
            <EmptyState
              title="No bids match the current filters"
              action={<Button onClick={() => { setTerm(''); setFilter('all'); }}>Clear filters</Button>}
            />
          ) : (
            <BidTable views={shown} actionLabel="Review bid" />
          )}
        </Card>
      )}

      {activeTab === 'activity' && (
        <Card title="Tender activity" actions={<Link to="/audit" className={buttonClass('ghost', 'sm')}>Open audit trail</Link>}>
          <ActivityTimeline events={activity} showBid />
        </Card>
      )}
    </div>
  );
};
