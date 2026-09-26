import React, { useEffect } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { Finding } from '@shared/domain/types';
import { FindingStatusBadge, SeverityBadge } from '../../../components/ui/Badge';
import { Button, Card, EmptyState } from '../../../components/ui/primitives';
import { formatDateTime } from '../../../lib/format';
import type { TabProps } from '../bidTabs';

const Step: React.FC<{ n: number; label: string; children: React.ReactNode; tone?: 'danger' }> = ({ n, label, children, tone }) => (
  <div className="grid grid-cols-[1.5rem_1fr] gap-2">
    <span aria-hidden className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
      {n}
    </span>
    <div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={`text-xs ${tone === 'danger' ? 'font-semibold text-rose-800' : 'text-slate-900'}`}>{children}</div>
    </div>
  </div>
);

/** Findings: each one shows the full chain from tender requirement to officer action. */
export const EvidenceTab: React.FC<TabProps & { highlight?: string }> = ({ view, goTo, openDocument, highlight }) => {
  useEffect(() => {
    if (highlight) document.getElementById(`finding-${highlight}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlight]);

  if (view.findings.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<CheckCircle2 className="h-7 w-7 text-emerald-600" />}
          title="No findings"
          description="Every requirement was met or validly exempted. Nothing needs investigation before the decision."
          action={<Button variant="primary" onClick={() => goTo('decision')}>Go to decision</Button>}
        />
      </Card>
    );
  }

  const actionFor = (f: Finding) => {
    if (view.flags.closed) return null;
    const isValidity = /expire|validity/i.test(f.title);
    return (
      <Button
        size="sm"
        onClick={() => goTo('decision', { decision: 'REQUEST_CLARIFICATION', finding: f.id })}
      >
        {isValidity ? 'Request extension' : 'Request clarification'}
      </Button>
    );
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        {view.findings.length} finding{view.findings.length === 1 ? '' : 's'} raised by the verification run. Each shows what the tender requires,
        what the bidder submitted and the evidence used — review before deciding.
      </p>
      {view.findings.map((f) => {
        const req = view.requirements.find((r) => r.id === f.requirementId);
        const doc = view.documents.find((d) => d.id === f.documentId);
        const focused = highlight === f.id;
        return (
          <article
            key={f.id}
            id={`finding-${f.id}`}
            aria-labelledby={`finding-title-${f.id}`}
            className={`rounded-md border bg-white ${focused ? 'border-blue-500 ring-2 ring-blue-200' : 'border-slate-200'}`}
          >
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-200 px-4 py-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <SeverityBadge severity={f.severity} />
                  <FindingStatusBadge status={f.status} />
                  <span className="font-mono text-xs text-slate-500">{f.id}</span>
                </div>
                <h3 id={`finding-title-${f.id}`} className="mt-1 font-semibold text-slate-900">
                  {f.title}
                </h3>
              </div>
              <span className="text-xs text-slate-500">Detected {formatDateTime(f.detectedAt)}</span>
            </header>

            <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Step n={1} label={`Tender requirement${req ? ` · ${req.code} ${req.clause}` : ''}`}>
                  {f.expected}
                </Step>
                <Step n={2} label="Bidder submission">{f.submitted || '—'}</Step>
                <Step n={3} label="Comparison" tone="danger">{f.comparison || '—'}</Step>
                <Step n={4} label="Impact">{f.impact || '—'}</Step>
                <Step n={5} label="Suggested officer action">{f.suggestedAction || 'Officer review required.'}</Step>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500">Evidence</div>
                <blockquote className="mt-1 rounded border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800">
                  {f.evidenceExcerpt}
                </blockquote>
                <p className="mt-1 text-xs text-slate-500">Source: {f.evidenceSource}</p>
              </div>
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 px-4 py-2.5">
              {doc && (
                <Button size="sm" variant="ghost" onClick={() => openDocument(doc)}>
                  View document
                </Button>
              )}
              {actionFor(f)}
            </footer>
          </article>
        );
      })}
    </div>
  );
};
