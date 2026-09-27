// Printable technical evaluation report (Print / Save as PDF from the browser). Shows the frozen
// snapshot exactly as fingerprinted, and whether the fingerprint still matches.

import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Loader2, Printer, ShieldAlert, ShieldCheck } from 'lucide-react';
import { formatDateTime, formatINR } from '../../lib/format';
import { api, type EvaluationReport } from '../../state/api';

/* eslint-disable @typescript-eslint/no-explicit-any */

const H: React.FC<{ children: React.ReactNode }> = ({ children }) => <h2 className="mt-6 border-b border-slate-300 pb-1 text-sm font-bold uppercase tracking-wide text-slate-800">{children}</h2>;
const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());

export const EvaluationReportPage: React.FC = () => {
  const { id = '' } = useParams();
  const [report, setReport] = useState<(EvaluationReport & { verified: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.report(id).then(setReport).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [id]);

  if (error) return <p className="p-8 text-sm text-rose-700">{error}</p>;
  if (!report) return <p className="flex items-center gap-2 p-8 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading report…</p>;
  const c = report.content as any;
  const td = 'border border-slate-300 px-2 py-1 align-top';

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3 print:hidden">
        <Link to={`/bids/${report.bidId}/decision`} className="text-xs font-medium text-blue-700 hover:underline">← Back to {report.bidId}</Link>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${report.verified ? 'text-emerald-700' : 'text-rose-700'}`}>
          {report.verified ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          {report.verified ? 'Fingerprint verified: this report is unchanged since it was generated.' : 'Fingerprint mismatch: this report was changed after it was generated.'}
        </span>
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800">
          <Printer className="h-4 w-4" /> Print / Save as PDF
        </button>
      </div>
      <article className="mx-auto max-w-4xl bg-white p-8 text-[12px] leading-relaxed text-slate-900 shadow print:shadow-none">
        <header className="border-b-2 border-slate-800 pb-3">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">CSAP · Technical evaluation</p>
          <h1 className="text-xl font-bold">{c.title}</h1>
          <p className="mt-1">
            <strong>{c.reportNo}</strong> · generated {formatDateTime(c.generatedAt)} by {c.generatedBy}
          </p>
          <p className="mt-1 break-all font-mono text-[10.5px] text-slate-600">SHA-256 fingerprint: {report.sha256}</p>
        </header>

        <H>Tender and bid</H>
        <table className="mt-2 w-full border-collapse">
          <tbody>
            <tr><td className={`${td} w-1/4 font-semibold`}>Tender</td><td className={td}>{c.tender.id} · {c.tender.title} ({c.tender.division})</td></tr>
            <tr><td className={`${td} font-semibold`}>Bid</td><td className={td}>{c.bid.id}{c.bid.gemBidNo ? ` · GeM bid ${c.bid.gemBidNo}` : ''} · submitted {formatDateTime(c.bid.submittedAt)}</td></tr>
            <tr><td className={`${td} font-semibold`}>Bidder</td><td className={td}>{c.bidder.name} · PAN {c.bidder.pan} · GSTIN {c.bidder.gstin}{c.bidder.udyamNumber ? ` · Udyam ${c.bidder.udyamNumber}` : ''}</td></tr>
          </tbody>
        </table>

        <H>Summary</H>
        <p className="mt-2">
          Compliance score <strong>{c.summary.complianceScore}/100</strong> ({c.summary.points} of {c.summary.maxPoints} weighted points) · {c.summary.met} of {c.summary.total} requirements met ·{' '}
          {c.summary.exceptions} exception(s) · risk <strong>{c.summary.riskLevel}</strong> ({c.summary.riskScore}).
        </p>
        {c.recommendation && (
          <p className="mt-1">
            Suggested action (advisory): <strong>{label(c.recommendation.suggestedDecision)}</strong>. {c.recommendation.summary}
          </p>
        )}
        {c.decision ? (
          <p className="mt-1 rounded border border-slate-300 bg-slate-50 px-2 py-1">
            <strong>Officer decision: {label(c.decision.decision)}</strong> by {c.decision.officer} on {formatDateTime(c.decision.decidedAt)}. Reason: {c.decision.reason}. Remarks: {c.decision.remarks}
          </p>
        ) : (
          <p className="mt-1 italic text-slate-600">No officer decision recorded when this report was generated.</p>
        )}

        <H>Requirements</H>
        <table className="mt-2 w-full border-collapse">
          <thead><tr className="bg-slate-100 text-left">{['Code', 'Requirement', 'Required', 'Found', 'Result', 'Points'].map((h) => <th key={h} className={td}>{h}</th>)}</tr></thead>
          <tbody>
            {c.requirements.map((r: any) => (
              <tr key={r.code}>
                <td className={td}>{r.code}</td>
                <td className={td}>{r.title}{r.mandatory ? '' : ' (optional)'}</td>
                <td className={td}>{r.benchmark}</td>
                <td className={td}>{r.submitted}{r.note ? ` — ${r.note}` : ''}</td>
                <td className={td}>{label(r.status)}</td>
                <td className={td}>{r.points ?? '—'} / {r.weight ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {c.findings.length > 0 && (
          <>
            <H>Findings and evidence</H>
            {c.findings.map((f: any) => (
              <div key={f.id} className="mt-2 break-inside-avoid border-l-2 border-slate-400 pl-2">
                <p><strong>{f.id} · {f.title}</strong> ({f.severity.toLowerCase()} severity)</p>
                <p>Required: {f.expected}. Submitted: {f.submitted}. {f.comparison}.</p>
                <p>Evidence: “{f.evidence}” — {f.source}</p>
                <p>Suggested action: {f.suggestedAction}</p>
              </div>
            ))}
          </>
        )}

        {c.documentReading && (
          <>
            <H>Documents read by CSAP AI</H>
            <p className="mt-1">{c.documentReading.summary}</p>
            <table className="mt-2 w-full border-collapse">
              <thead><tr className="bg-slate-100 text-left">{['Document', 'Result', 'Detail'].map((h) => <th key={h} className={td}>{h}</th>)}</tr></thead>
              <tbody>
                {c.documentReading.documents.map((d: any, i: number) => (
                  <tr key={i}><td className={td}>{d.code} · {d.title}</td><td className={td}>{label(String(d.verdict))}</td><td className={td}>{d.summary}</td></tr>
                ))}
              </tbody>
            </table>
            {c.documentReading.crossDocument?.length > 0 && (
              <p className="mt-1">
                Cross-document check: {c.documentReading.crossDocument.map((x: any) => `${x.field}: ${x.result === 'MATCH' ? 'consistent' : x.result === 'MISMATCH' ? `inconsistent (${x.note})` : 'not compared'}`).join('; ')}.
              </p>
            )}
          </>
        )}

        {c.registries.length > 0 && (
          <>
            <H>Government registries</H>
            <table className="mt-2 w-full border-collapse">
              <thead><tr className="bg-slate-100 text-left">{['Registry', 'Identifier', 'Result', 'Detail'].map((h) => <th key={h} className={td}>{h}</th>)}</tr></thead>
              <tbody>
                {c.registries.map((r: any) => (
                  <tr key={r.registry}><td className={td}>{r.registry}{r.mode === 'LIVE_PROVIDER' ? ' (live)' : ' (simulated)'}</td><td className={td}>{r.identifier ?? '—'}</td><td className={td}>{label(r.status)}</td><td className={td}>{r.summary}</td></tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {c.emd && (
          <>
            <H>Earnest money deposit</H>
            <p className="mt-1">Required {formatINR(c.emd.required)} · submitted {formatINR(c.emd.submitted)} ({label(c.emd.instrument)}, {c.emd.reference}) · {label(c.emd.result)}.</p>
          </>
        )}

        {c.recommendation?.explanation?.length > 0 && (
          <>
            <H>Explanation (CSAP AI, cited)</H>
            <ul className="mt-1 list-disc pl-5">
              {c.recommendation.explanation.map((s: any, i: number) => <li key={i}>{s.text} [{s.citations.join(', ')}]</li>)}
            </ul>
          </>
        )}

        <H>Audit history</H>
        <p className="mt-1">Tamper-evident chain at generation: {c.audit.chainIntact ? 'intact' : 'not verified'}{c.audit.chainHead ? ` (head ${String(c.audit.chainHead).slice(0, 16)}…)` : ''}.</p>
        <table className="mt-2 w-full border-collapse">
          <thead><tr className="bg-slate-100 text-left">{['#', 'Time', 'Event', 'By', 'Fingerprint'].map((h) => <th key={h} className={td}>{h}</th>)}</tr></thead>
          <tbody>
            {c.audit.events.map((e: any, i: number) => (
              <tr key={i}><td className={td}>{e.seq ?? '—'}</td><td className={td}>{formatDateTime(e.at)}</td><td className={td}>{e.summary}</td><td className={td}>{e.actor}</td><td className={`${td} font-mono text-[10px]`}>{e.fingerprint ? `${e.fingerprint.slice(0, 12)}…` : '—'}</td></tr>
            ))}
          </tbody>
        </table>

        <footer className="mt-6 border-t border-slate-300 pt-2 text-[10.5px] text-slate-600">
          {c.advisoryNote} Prototype: tender data and registries are simulated where stated. Verify this report by recomputing the SHA-256 of its content.
        </footer>
      </article>
    </div>
  );
};
