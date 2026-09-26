import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { BID_FILTERS, listBidViews, matchesBidSearch, type BidFilterId } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { BidTable } from '../../components/bids/BidTable';
import { Button, Card, EmptyState, FilterChips, PageHeader, SearchInput } from '../../components/ui/primitives';

/** All bidders and their bids across tenders. Search and filter are kept in the URL so the
 *  dashboard can link straight to e.g. ?filter=high-risk and the back button restores them. */
export const BidderListPage: React.FC = () => {
  const { db } = useApp();
  const [params, setParams] = useSearchParams();
  const term = params.get('q') ?? '';
  const filterParam = params.get('filter') as BidFilterId | null;
  const filter: BidFilterId = BID_FILTERS.some((f) => f.id === filterParam) ? (filterParam as BidFilterId) : 'all';

  // Functional update: two quick changes (e.g. clear filter, then type) must not overwrite each other.
  const update = (next: { q?: string; filter?: BidFilterId }) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next.q !== undefined) {
        if (next.q) p.set('q', next.q);
        else p.delete('q');
      }
      if (next.filter !== undefined) {
        if (next.filter !== 'all') p.set('filter', next.filter);
        else p.delete('filter');
      }
      return p;
    }, { replace: true });

  const views = listBidViews(db);
  const filterDef = BID_FILTERS.find((f) => f.id === filter)!;
  const shown = views.filter((v) => filterDef.test(v) && matchesBidSearch(v, term));
  const counts = Object.fromEntries(BID_FILTERS.map((f) => [f.id, views.filter((v) => f.test(v)).length]));

  return (
    <div className="space-y-5">
      <PageHeader title="Bidders" subtitle="Every bid received, with its verification outcome. Select a bid to review it." />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3">
          <SearchInput
            value={term}
            onChange={(q) => update({ q })}
            label="Search bidders"
            placeholder="Search by company, vendor code, bid ID, GSTIN or PAN"
            className="lg:w-[28rem]"
          />
          <FilterChips label="Filter bids" options={BID_FILTERS} value={filter} onChange={(f) => update({ filter: f })} counts={counts} />
        </div>
        {shown.length === 0 ? (
          <EmptyState
            title="No bidders match"
            description="Try a different search term or filter."
            action={<Button onClick={() => setParams({}, { replace: true })}>Clear filters</Button>}
          />
        ) : (
          <BidTable views={shown} showTender actionLabel="Inspect bidder" />
        )}
      </Card>
    </div>
  );
};
