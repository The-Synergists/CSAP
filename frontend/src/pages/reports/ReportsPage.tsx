import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Eye, FileText, Printer } from 'lucide-react';
import { listBidViews, type BidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
import { api, type ReportSummary } from '../../state/api';
import { Badge } from '../../components/ui/Badge';
import { buttonClass } from '../../components/ui/styles';
import { bidPath } from '../../lib/format';
import { Button, Card, EmptyState, Modal, PageHeader } from '../../components/ui/primitives';
import { inputClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { BID_STATUS, CHECK_STATUS, DECISION, EMD_INSTRUMENT, EMD_RESULT, FINDING_STATUS, SEVERITY } from '../../domain/labels';
import { downloadCsv } from '../../lib/csv';
import { formatDateTime, formatINR } from '../../lib/format';

interface ReportDef {
  id: string;
  title: string;
  description: string;
  build: (views: BidView[]) => { header: string[]; rows: (string | number)[][] };
}

const REPORTS: ReportDef[] = [
  {
    id: 'evaluation-summary',
    title: 'Technical evaluation summary',
    description: 'One line per bid: compliance, risk, requirements met, EMD, status and latest decision.',
    build: (views) => ({
      header: ['Bid', 'Bidder', 'Compliance', 'Risk', 'Requirements met', 'EMD', 'Status', 'Latest decision', 'Decided by'],
      rows: views.map((v) => [
        v.bid.id,
        v.bidder.companyName,
        v.bid.complianceScore,
        `${v.bid.riskLevel} (${v.bid.riskScore})`,
        `${v.counts.met}/${v.counts.total}`,
        v.emd ? EMD_RESULT[v.emd.result].label : '—',
        BID_STATUS[v.bid.status].label,
        v.latestDecision ? DECISION[v.latestDecision.decision].label : '—',
        v.latestDecision ? `${v.latestDecision.officerName}, ${formatDateTime(v.latestDecision.decidedAt)}` : '—',
      ]),
    }),
  },
  {
    id: 'findings-register',
    title: 'Findings and evidence register',
    description: 'Every finding with the tender requirement, what was submitted, the comparison and its status.',
    build: (views) => ({
      header: ['Bid', 'Bidder', 'Finding', 'Severity', 'Requirement', 'Tender requires', 'Submitted', 'Comparison', 'Evidence source', 'Status'],
      rows: views.flatMap((v) =>
        v.findings.map((f) => [
          v.bid.id,
          v.bidder.companyName,
          f.title,
          SEVERITY[f.severity].label,
          v.requirements.find((r) => r.id === f.requirementId)?.code ?? '',
          f.expected,
          f.submitted,
          f.comparison,
          f.evidenceSource,
          FINDING_STATUS[f.status].label,
        ]),
      ),
    }),
  },
  {
    id: 'compliance-matrix',
    title: 'Compliance matrix',
    description: 'Every bid against every tender requirement.',
    build: (views) => {
      const reqs = views[0]?.requirements ?? [];
      return {
        header: ['Bid', 'Bidder', ...reqs.map((r) => `${r.code} ${r.title}`)],
        rows: views.map((v) => [v.bid.id, v.bidder.companyName, ...reqs.map((r) => CHECK_STATUS[v.checks.find((c) => c.requirementId === r.id)?.status ?? 'MISSING'].label)]),
      };
    },
  },
  {
    id: 'emd-register',
    title: 'EMD register',
    description: 'EMD instrument, amount and verification result for each bid.',
    build: (views) => ({
      header: ['Bid', 'Bidder', 'Instrument', 'Reference', 'Required', 'Submitted', 'Result'],
      rows: views.map((v) => [
        v.bid.id,
        v.bidder.companyName,
        v.emd ? EMD_INSTRUMENT[v.emd.instrument] : '—',
        v.emd?.reference ?? '—',
        v.emd ? formatINR(v.emd.requiredAmount) : '—',
        v.emd ? (v.emd.instrument === 'MSME_EXEMPTION' ? 'Exempted' : formatINR(v.emd.submittedAmount)) : '—',
        v.emd ? EMD_RESULT[v.emd.result].label : '—',
      ]),
    }),
  },
];

/** One row per bid: its evaluation report (the signed record of the officer's decision) or why there is none yet. */
const BidReportList: React.FC = () => {
  const { db } = useApp();
  const [rows, setRows] = useState<ReportSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const decisions = db.decisions.length;
  useEffect(() => {
    api.allReports().then(setRows).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [decisions]);
  const views = listBidViews(db);

  return (
    <Card
      title="Bid evaluation reports"
      subtitle="The signed evaluation report of each bid (SHA-256 fingerprint), generated from the officer's decision. One report per decision; earlier ones stay as superseded history."
      padded={false}
    >
      {error ? (
        <p role="alert" className="px-4 py-3 text-xs text-rose-700">{error}</p>
      ) : rows === null ? (
        <p className="px-4 py-3 text-xs text-slate-500">Loading…</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {['Bid', 'Bidder', 'Tender', 'Status', 'Final decision', 'Evaluation report', ''].map((h) => (
                  <th key={h} scope="col" className="px-3 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {views.map((v) => {
                const mine = rows.filter((r) => r.bidId === v.bid.id);
                const d = v.latestDecision;
                const current = d ? mine.find((r) => r.decisionId === d.id) ?? (mine[0]?.decisionId ? undefined : mine[0]) : undefined;
                const older = mine.filter((r) => r !== current).length;
                return (
                  <tr key={v.bid.id}>
                    <td className="px-3 py-2"><Link to={bidPath(v.bid.id)} className="font-mono text-blue-700 hover:underline">{v.bid.id}</Link></td>
                    <td className="px-3 py-2">{v.bidder.companyName}</td>
                    <td className="px-3 py-2 font-mono text-slate-600">{v.tender.id}</td>
                    <td className="px-3 py-2"><Badge tone={BID_STATUS[v.bid.status].tone}>{BID_STATUS[v.bid.status].label}</Badge></td>
                    <td className="px-3 py-2">
                      {d ? (
                        <>
                          <Badge tone={DECISION[d.decision].tone}>{DECISION[d.decision].label}</Badge>
                          <p className="mt-0.5 text-slate-500">{d.officerName}, {formatDateTime(d.decidedAt)}</p>
                        </>
                      ) : (
                        <span className="text-slate-400">Not decided</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {current ? (
                        <>
                          <span className="font-mono">{current.reportNo}</span>
                          <p className="mt-0.5 flex flex-wrap gap-1">
                            {current.sentToGemAt && <Badge tone="info">Sent to GeM</Badge>}
                            {older > 0 && <Badge tone="neutral">{older} superseded</Badge>}
                          </p>
                        </>
                      ) : d ? (
                        <span className="text-slate-500">Not generated yet</span>
                      ) : (
                        <span className="text-slate-400">Generated after the decision</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {current ? (
                        <Link to={`/reports/evaluation/${current.id}`} className={buttonClass('secondary', 'sm')}><FileText className="h-3.5 w-3.5" /> Open</Link>
                      ) : d ? (
                        <Link to={bidPath(v.bid.id, 'decision')} className={buttonClass('secondary', 'sm')}>Generate</Link>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};

export const ReportsPage: React.FC = () => {
  const { db, activeTenderId, source } = useApp();
  const toast = useToast();
  const tendersWithBids = db.tenders.filter((t) => db.bids.some((b) => b.tenderId === t.id));
  const [tenderId, setTenderId] = useState(
    tendersWithBids.find((t) => t.id === activeTenderId)?.id ?? tendersWithBids[0]?.id ?? '',
  );
  const [preview, setPreview] = useState<ReportDef | null>(null);
  const tender = db.tenders.find((t) => t.id === tenderId);
  const views = tender ? listBidViews(db, tender.id) : [];

  const download = (r: ReportDef) => {
    const { header, rows } = r.build(views);
    downloadCsv(`${r.id}_${tenderId.replace(/\//g, '-')}.csv`, header, rows);
    toast({ kind: 'success', title: 'CSV downloaded', message: `${r.title} — ${rows.length} rows, generated in your browser from current data.` });
  };

  const previewData = preview ? preview.build(views) : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports"
        subtitle="Each bid's evaluation report, and compiled reports across a tender."
        actions={
          tendersWithBids.length > 0 && (
            <label className="flex items-center gap-2 text-xs text-slate-700">
              Tender
              <select value={tenderId} onChange={(e) => setTenderId(e.target.value)} className={`${inputClass} w-auto`}>
                {tendersWithBids.map((t) => (
                  <option key={t.id} value={t.id}>{t.id} — {t.title}</option>
                ))}
              </select>
            </label>
          )
        }
      />

      {source === 'api' && <BidReportList />}

      <h2 className="pt-1 text-sm font-semibold text-slate-900">Compiled reports</h2>
      <p className="-mt-3 text-xs text-slate-500">Lists across all bids of the selected tender, generated in your browser from the current data.</p>

      {!tender ? (
        <Card><EmptyState title="No tenders with bids" description="Reports become available once a tender has received bids." /></Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {REPORTS.map((r) => (
            <Card key={r.id} title={r.title} subtitle={r.description}>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPreview(r)}><Eye className="h-3.5 w-3.5" /> View report</Button>
                <Button size="sm" onClick={() => download(r)}><Download className="h-3.5 w-3.5" /> Download CSV</Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        size="lg"
        title={preview?.title}
        description={tender && `${tender.id} — ${tender.title} · generated ${formatDateTime(new Date().toISOString())}`}
        footer={
          <>
            <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
            {preview && <Button onClick={() => download(preview)}><Download className="h-4 w-4" /> Download CSV</Button>}
            <Button variant="primary" onClick={() => setPreview(null)}>Close</Button>
          </>
        }
      >
        {previewData && (
          <div className="relative overflow-x-auto">
            {previewData.rows.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No rows for this tender.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
                  <tr>{previewData.header.map((h) => <th key={h} scope="col" className="px-2 py-2 font-medium">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {previewData.rows.map((row, i) => (
                    <tr key={i}>{row.map((c, j) => <td key={j} className="px-2 py-1.5 text-slate-800">{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-slate-500">Prototype report generated from demo data. Not an official record.</p>
          </div>
        )}
      </Modal>
    </div>
  );
};
