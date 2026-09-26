import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Fingerprint, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { AuditActorType } from '@shared/domain/types';
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
  { id: 'SYSTEM', label: 'Verification' },
  { id: 'BIDDER', label: 'Bidder submissions' },
];

type ChainResult = Awaited<ReturnType<typeof api.verifyAudit>>;

/** Tamper-evident chain: verify it, or show (in memory only) that altering one event is detected. */
const IntegrityCard: React.FC<{ middleSeq?: number }> = ({ middleSeq }) => {
  const [result, setResult] = useState<ChainResult | null>(null);
  const [busy, setBusy] = useState<'verify' | 'simulate' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (kind: 'verify' | 'simulate') => {
    setBusy(kind);
    setError(null);
    try {
      setResult(await api.verifyAudit(kind === 'simulate' ? middleSeq : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <Card
      title="Tamper-evident record"
      subtitle="Every event carries a fingerprint (SHA-256) that includes the previous event's fingerprint. Changing or deleting any past event breaks the chain from that point, and CSAP shows where."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => void run('verify')} disabled={!!busy}>
            {busy === 'verify' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />} Verify integrity
          </Button>
          {middleSeq != null && (
            <Button size="sm" onClick={() => void run('simulate')} disabled={!!busy} title="Pretends one event was edited, in memory only; nothing is changed">
              {busy === 'simulate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint className="h-3.5 w-3.5" />} Simulate tampering (demo)
            </Button>
          )}
        </div>
      }
    >
      {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
      {!result && !error && <p className="text-xs text-slate-600">Events cannot be edited through CSAP or the database; only the demo reset re-seals the chain.</p>}
      {result && (
        <div role="status" className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${result.intact ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-rose-200 bg-rose-50 text-rose-900'}`}>
          {result.intact ? <ShieldCheck aria-hidden className="h-5 w-5 shrink-0" /> : <ShieldAlert aria-hidden className="h-5 w-5 shrink-0" />}
          <div>
            <p className="text-sm font-semibold">
              {result.intact ? `Chain intact: all ${result.checked} events match their fingerprints.` : `Tampering detected at event #${result.brokenAt}.`}
            </p>
            <p className="mt-0.5">
              {result.intact
                ? `Latest fingerprint ${result.lastHash.slice(0, 16)}… Any change to any past event would break this chain.`
                : `${result.reason}${result.simulated ? ` This was a simulation: event #${result.simulated} was altered in memory only, and the stored record is unchanged. Run "Verify integrity" to confirm.` : ''}`}
            </p>
          </div>
        </div>
      )}
    </Card>
  );
};

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
  const seqs = db.auditEvents.map((e) => e.seq).filter((n): n is number => n != null).sort((a, b) => a - b);
  const middleSeq = seqs.length ? seqs[Math.floor(seqs.length / 2)] : undefined;

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
      sorted.map((e) => [formatDateTime(e.timestamp), e.tenderId, e.bidId ?? '', e.actor, e.actorType, e.summary, e.details, String(e.seq ?? ''), e.entryHash ?? '']),
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
      {source === 'api' && <IntegrityCard middleSeq={middleSeq} />}
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
