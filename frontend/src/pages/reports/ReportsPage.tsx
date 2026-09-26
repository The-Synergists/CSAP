import React, { useState } from 'react';
import { TimeSavedCard } from '../../components/TimeSaved';
import { Download, Eye, Printer } from 'lucide-react';
import { listBidViews, type BidView } from '@shared/domain/selectors';
import { useApp } from '../../state/appContext';
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

export const ReportsPage: React.FC = () => {
  const { db, activeTenderId } = useApp();
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
        subtitle="Generated in your browser from the current tender data. Working documents — not official or signed records."
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

      <TimeSavedCard />

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
