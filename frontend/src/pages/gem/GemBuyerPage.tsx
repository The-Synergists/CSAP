// Buyer desk on the simulated GeM portal: the procurement officer, signed in on GeM, sees each
// tender's bids, the technical evaluation outcome and the evaluation reports CSAP delivered to GeM.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatDate, formatDateTime } from '../../lib/format';
import { GemCard, gemInput, gemPrimary, gemSecondary } from './GemLayout';
import { buyerToken, EVALUATION_STATUS, gemBuyerApi, type BuyerTender } from './gemApi';

export const GemBuyerLogin: React.FC<{ onSignedIn: () => void }> = ({ onSignedIn }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await gemBuyerApi.login(identifier.trim(), password);
      buyerToken.set(r.token);
      onSignedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <GemCard title="Buyer login">
      <form onSubmit={submit} className="max-w-sm space-y-3 text-sm">
        <p className="text-xs text-slate-600">For the buyer organisation's procurement officers: bids received on your tenders and the evaluation reports.</p>
        <label className="block text-xs font-medium text-slate-700">
          User ID or official email
          <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} className={`${gemInput} mt-1`} autoComplete="username" />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${gemInput} mt-1`} autoComplete="current-password" />
        </label>
        {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
        <button type="submit" className={gemPrimary} disabled={busy || !identifier || !password}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in
        </button>
      </form>
    </GemCard>
  );
};

export const GemBuyerPage: React.FC = () => {
  const [signedIn, setSignedIn] = useState(!!buyerToken.get());
  const [tenders, setTenders] = useState<BuyerTender[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    gemBuyerApi
      .overview()
      .then(setTenders)
      .catch((e) => {
        if ((e as { status?: number }).status === 401) {
          buyerToken.set(null);
          setSignedIn(false);
        } else setError(e instanceof Error ? e.message : String(e));
      });
  }, []);
  useEffect(() => {
    if (signedIn) load();
  }, [signedIn, load]);

  if (!signedIn) return <GemBuyerLogin onSignedIn={() => setSignedIn(true)} />;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Buyer desk</h1>
          <p className="text-sm text-slate-600">Bids received on your tenders, their technical evaluation and the evaluation reports.</p>
        </div>
        <button type="button" className={gemSecondary} onClick={() => { buyerToken.set(null); setSignedIn(false); setTenders(null); }}>
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {!tenders ? (
        <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>
      ) : tenders.length === 0 ? (
        <GemCard><p className="text-sm text-slate-600">No bids have been received yet.</p></GemCard>
      ) : (
        tenders.map((t) => (
          <GemCard key={t.id} title={<span><span className="font-mono">{t.id}</span> · {t.title}</span>}>
            <p className="mb-2 text-xs text-slate-500">{t.division} · bids closed {formatDate(t.closes)} · technical opening {formatDate(t.technicalOpening)} · {t.bids.length} bid{t.bids.length === 1 ? '' : 's'}</p>
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                  <tr>{['GeM bid no.', 'Seller', 'Submitted', 'Technical evaluation', 'Next stage', 'Evaluation report', ''].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {t.bids.map((b) => {
                    const st = EVALUATION_STATUS[b.evaluationStatus] ?? EVALUATION_STATUS.UNDER_EVALUATION;
                    return (
                      <tr key={b.id}>
                        <td className="px-3 py-2 font-mono text-xs">{b.gemBidNo}</td>
                        <td className="px-3 py-2">{b.seller}<span className="block font-mono text-[11px] text-slate-500">PAN {b.pan}</span></td>
                        <td className="px-3 py-2 text-xs">{formatDateTime(b.submittedAt)}<span className="block text-slate-500">{b.documents} documents</span></td>
                        <td className="px-3 py-2">
                          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${st.className}`}>{st.label}</span>
                          {b.requestPending && <span className="mt-1 block text-[11px] font-medium text-amber-800">Seller's response waiting for the buyer</span>}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-700">{b.nextStage}</td>
                        <td className="px-3 py-2 text-xs">
                          {b.latestReport ? (
                            <>
                              <span className="font-mono">{b.latestReport.reportNo}</span>
                              <span className={`mt-0.5 flex items-center gap-1 ${b.latestReport.verified ? 'text-emerald-700' : 'text-rose-700'}`}>
                                {b.latestReport.verified ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
                                {b.latestReport.verified ? 'Fingerprint verified' : 'Fingerprint mismatch'}
                              </span>
                              <span className="text-slate-500">received {formatDateTime(b.latestReport.receivedAt)}</span>
                            </>
                          ) : (
                            <span className="text-slate-500">Not received yet</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link to={`/gem/buyer/bids/${b.id}`} className={gemSecondary}>{b.latestReport ? 'View report' : 'View bid'}</Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GemCard>
        ))
      )}
    </div>
  );
};
