import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isKeyAuditEvent } from '@shared/domain/selectors';
import { Download, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditActorType, AuditEvent } from '@shared/domain/types';
import { useApp } from '../../state/appContext';
import { ActivityTimeline } from '../../components/ActivityTimeline';
import { Button, Card, EmptyState, FilterChips, PageHeader, SearchInput } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime } from '../../lib/format';
import { api } from '../../state/api';

type ActorFilter = 'ALL' | AuditActorType;
const ACTOR_OPTIONS: { id: ActorFilter; label: string }[] = [
  { id: 'ALL', label: 'All' },
  { id: 'OFFICER', label: 'Officer actions' },
  { id: 'BIDDER', label: 'Bidder submissions' },
];

type ChainResult = Awaited<ReturnType<typeof api.verifyAudit>>;

/**
 * Tamper-evident record: the whole chain is recomputed by the database when the page opens and
 * whenever new events arrive. Any edited or deleted past event would show here, with where.
 */
const IntegrityCard: React.FC<{ events: number }> = ({ events }) => {
  const [result, setResult] = useState<ChainResult | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.verifyAudit());
      setCheckedAt(new Date().toISOString());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void run();
  }, [run, events]);

  return (
    <Card
      title="Tamper-evident record"
      subtitle="Every event carries a SHA-256 fingerprint that includes the previous event's fingerprint. Editing or deleting any past event, even directly in the database, breaks the chain from that point and shows here."
      actions={
        <Button size="sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verify again
        </Button>
      }
    >
      {error && <p role="alert" className="text-xs text-rose-700">Could not verify the chain: {error}</p>}
      {!result && !error && <p className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Verifying every event…</p>}
      {result && (
        <div role="status" className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${result.intact ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          {result.intact ? <ShieldCheck aria-hidden className="h-5 w-5 shrink-0" /> : <ShieldAlert aria-hidden className="h-5 w-5 shrink-0" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {result.intact ? `Record intact: all ${result.checked} events match their fingerprints.` : `Record altered: the chain breaks at event #${result.brokenAt}.`}
            </p>
            <p className="mt-0.5">
              {result.intact ? 'No event has been edited or deleted since it was written.' : `${result.reason} Report this to the system administrator and vigilance.`}
            </p>
            <p className="mt-1 break-all font-mono text-[11px] opacity-80">
              Chain fingerprint {result.lastHash} · checked {checkedAt ? formatDateTime(checkedAt) : ''}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};

/** One key event, with the verification steps that led to it available in a dropdown. */
const KeyEvent: React.FC<{ event: AuditEvent; steps: AuditEvent[] }> = ({ event, steps }) => (
  <li className="py-2">
    <ActivityTimeline events={[event]} showBid />
    {steps.length > 0 && (
      <details className="ml-6 mt-1 rounded border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs">
        <summary className="cursor-pointer select-none font-medium text-blue-700">
          Verification steps behind this ({steps.length})
        </summary>
        <div className="mt-2">
          <ActivityTimeline events={steps} />
        </div>
      </details>
    )}
  </li>
);

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
      isKeyAuditEvent(e) &&
      (actor === 'ALL' || e.actorType === actor) &&
      (bidFilter === 'ALL' || e.bidId === bidFilter) &&
      (!q || [e.summary, e.details, e.actor, e.bidId ?? '', e.tenderId].some((s) => s.toLowerCase().includes(q))),
  );
  const sorted = [...events].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  // The verification steps behind a key event: that bid's other events since its previous key event.
  const stepsFor = (e: AuditEvent) => {
    if (!e.bidId) return [];
    const mine = db.auditEvents.filter((x) => x.bidId === e.bidId);
    const prevKey = mine.filter((x) => isKeyAuditEvent(x) && x.timestamp < e.timestamp).sort((x, y) => y.timestamp.localeCompare(x.timestamp))[0];
    return mine
      .filter((x) => !isKeyAuditEvent(x) && x.timestamp <= e.timestamp && (!prevKey || x.timestamp > prevKey.timestamp))
      .sort((x, y) => y.timestamp.localeCompare(x.timestamp));
  };
  const everyEvent = db.auditEvents
    .filter((e) => bidFilter === 'ALL' || e.bidId === bidFilter)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));

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
      ['Timestamp (IST)', 'Tender', 'Bid', 'Actor', 'Actor type', 'Event', 'Details', 'Sequence', 'SHA-256 fingerprint'],
      everyEvent.map((e) => [formatDateTime(e.timestamp), e.tenderId, e.bidId ?? '', e.actor, e.actorType, e.summary, e.details, String(e.seq ?? ''), e.entryHash ?? '']),
    );
    toast({ kind: 'success', title: 'Audit log exported', message: `${everyEvent.length} events (key events and every verification step) downloaded as CSV.` });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit trail"
        subtitle={`Key workflow events: tenders published, officer decisions and clarifications, bidder re-evaluation requests and evaluation reports. The verification steps behind each one open from its dropdown. ${
          source === 'api' ? 'Stored in the CSAP database; officer entries are written together with the decision.' : 'Held in this browser session (demo data).'
        }`}
        actions={<Button onClick={exportCsv} disabled={!sorted.length}><Download className="h-4 w-4" /> Export CSV</Button>}
      />
      {source === 'api' && <IntegrityCard events={db.auditEvents.length} />}
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
          <p className="mb-3 text-xs text-slate-500">{sorted.length} key events</p>
          {sorted.length === 0 ? (
            <EmptyState title="No events match" action={<Button onClick={() => { setTerm(''); setActor('ALL'); setBid('ALL'); }}>Clear filters</Button>} />
          ) : (
            <ul className="divide-y divide-slate-100">
              {sorted.map((e) => (
                <KeyEvent key={e.id} event={e} steps={stepsFor(e)} />
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};
