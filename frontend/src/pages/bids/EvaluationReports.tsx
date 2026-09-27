// Decision tab: generate the evaluation report (evidence pack), open it for printing, and for bids
// that came from GeM, send it back to GeM.

import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Loader2, Send } from 'lucide-react';
import type { BidView } from '@shared/domain/selectors';
import { Badge } from '../../components/ui/Badge';
import { Button, Card } from '../../components/ui/primitives';
import { buttonClass } from '../../components/ui/styles';
import { useToast } from '../../components/ui/toast';
import { formatDateTime } from '../../lib/format';
import { api, type EvaluationReport } from '../../state/api';

export const EvaluationReports: React.FC<{ view: BidView }> = ({ view }) => {
  const toast = useToast();
  const [reports, setReports] = useState<EvaluationReport[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const bidId = view.bid.id;
  const fromGem = view.bid.source === 'GEM';
  const decided = !!view.latestDecision;

  const load = useCallback(() => api.reports(bidId).then(setReports).catch(() => setReports([])), [bidId]);
  // Reload when the decision or audit trail changes (a GeM report is sent right after a decision).
  useEffect(() => {
    void load();
  }, [load, view.audit.length]);

  const generate = async () => {
    setBusy('generate');
    try {
      const r = await api.generateReport(bidId);
      toast({ kind: 'success', title: 'Evaluation report generated', message: `${r.reportNo} · fingerprint ${r.sha256.slice(0, 12)}…` });
      await load();
    } catch (e) {
      toast({ kind: 'error', title: 'Report not generated', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };
  const send = async (id: string) => {
    setBusy(id);
    try {
      const r = await api.sendReportToGem(id);
      toast({ kind: 'success', title: 'Sent to GeM', message: `The bidder now sees "${r.gemStatus.replace(/_/g, ' ').toLowerCase()}".` });
      await load();
    } catch (e) {
      toast({ kind: 'error', title: 'Not sent', message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  // One report per decision: once it exists, the button opens it instead of making another.
  const current = reports?.find((r) => r.decisionId === view.latestDecision?.id);

  return (
    <Card
      title="Evaluation report"
      subtitle={`A signed record of your evaluation: the decision with its score, requirements, findings, document readings, registries and audit history.${fromGem ? ' For GeM bids it is generated and sent to GeM automatically when you decide.' : ''}`}
      actions={
        current ? (
          <Link to={`/reports/evaluation/${current.id}`} className={buttonClass('primary', 'sm')}>
            <FileText className="h-3.5 w-3.5" /> Open report {current.reportNo.split('/').pop()}
          </Link>
        ) : (
          <Button size="sm" variant="primary" onClick={() => void generate()} disabled={!!busy || !decided || reports === null} title={decided ? undefined : 'Available after you record a decision'}>
            {busy === 'generate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Generate report
          </Button>
        )
      }
    >
      {reports === null ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="text-xs text-slate-600">
          {decided ? 'No report yet. Generate it to create the signed record of your decision.' : 'Available after you record a decision. The report is the signed record of that decision.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 text-xs">
                <p className="font-semibold text-slate-900">{r.reportNo}</p>
                <p className="text-slate-500">
                  {formatDateTime(r.generatedAt)} · {r.generatedBy} · <span className="font-mono">SHA-256 {r.sha256.slice(0, 12)}…</span>
                </p>
                <p className="mt-0.5 flex flex-wrap gap-1.5">
                  {r.content?.decision && <Badge tone="info">Decision: {String(r.content.decision.decision).replace(/_/g, ' ').toLowerCase()}</Badge>}
                  {r.sentToGemAt && <Badge tone="success">Sent to GeM {formatDateTime(r.sentToGemAt)}</Badge>}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Link to={`/reports/evaluation/${r.id}`} className={buttonClass('secondary', 'sm')}>
                  <FileText className="h-3.5 w-3.5" /> Open
                </Link>
                {fromGem && !r.sentToGemAt && (
                  <Button size="sm" onClick={() => void send(r.id)} disabled={!!busy}>
                    {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to GeM
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
