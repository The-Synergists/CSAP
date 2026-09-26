import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import type { AuditActorType } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { ActivityTimeline } from '../../components/ActivityTimeline';
import { Button, Card, EmptyState, FilterChips, PageHeader, SearchInput } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/format';

type ActorFilter = 'ALL' | AuditActorType;
const ACTOR_OPTIONS: { id: ActorFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OFFICER', label: 'Officer actions' },
  { id: 'SYSTEM', label: 'Verification' },
  { id: 'BIDDER', label: 'Bidder submissions' },
];

export const AuditTrailPage: React.FC = () => {
  const { db, source } = useApp();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const bidFilter = params.get('bidId') ?? 'ALL';
  const [term, setTerm] = useState('');
  const [actor, setActor] = useState<ActorFilter>('ALL');

  const q = term.trim().toLowerCase();
  const events = db.auditEvents.filter(
    (e) =>
      (actor === 'ALL' || e.actorType === actor) &&
      (bidFilter === 'ALL' || e.bidId === bidFilter) &&
      (!q || [e.summary, e.details, e.actor, e.bidId ?? '', e.tenderId].some((s) => s.toLowerCase().includes(q))),
  );
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  const setBid = (id: string) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (id === 'ALL') p.delete('bidId');
      else p.set('bidId', id);
      return p;
    }, { replace: true });

  const exportCsv = () => {
    downloadCsv(
      `audit-trail_${new Date().toISOString().slice(0, 10)}.csv`,
      ['Timestamp (IST)', 'Tender', 'Bid', 'Actor', 'Actor type', 'Event', 'Details'],
      sorted.map((e) => [formatDateTime(e.timestamp), e.tenderId, e.bidId ?? '', e.actor, e.actorType, e.summary, e.details]),
    );
    toast({ kind: 'success', title: 'Audit log exported', message: `${sorted.length} events downloaded as CSV.` });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit trail"
        subtitle={`Chronological record of bid submissions, verification runs and officer decisions. ${
          source === 'api' ? 'Stored in the CSAP database; officer entries are written together with the decision.' : 'Held in this browser session (demo data).'
        }`}
        actions={<Button onClick={exportCsv} disabled={!sorted.length}><Download className="h-4 w-4" /> Export CSV</Button>}
      />
      <Card padded={false}>
        <div className="flex flex-col gap-3 border-b border-slate-200 p-3 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={term} onChange={setTerm} label="Search audit events" placeholder="Search events, officers, bid IDs" className="lg:w-80" />
          <div className="flex flex-wrap items-center gap-3">
            <FilterChips label="Filter by actor" options={ACTOR_OPTIONS} value={actor} onChange={setActor} />
            <label className="flex items-center gap-2 text-xs text-slate-700">
              Bid
              <select value={bidFilter} onChange={(e) => setBid(e.target.value)} className={`${inputClass} w-auto py-1.5`}>
                <option value="ALL">All bids</option>
                {db.bids.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.id} — {db.bidders.find((x) => x.id === b.bidderId)?.companyName}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <div className="p-4">
          <p className="mb-3 text-xs text-slate-500">{sorted.length} events</p>
          {sorted.length === 0 ? (
            <EmptyState title="No events match" action={<Button onClick={() => { setTerm(''); setActor('ALL'); setBid('ALL'); }}>Clear filters</Button>} />
          ) : (
            <ActivityTimeline events={sorted} showBid />
          )}
        </div>
      </Card>
    </div>
  );
};
