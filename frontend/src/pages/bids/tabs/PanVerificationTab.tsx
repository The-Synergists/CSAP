// PAN verification: the PAN document from the bid package, read by CSAP AI like every other
// document, compared with the bid record and with the PAN registry's answer. It is read
// automatically when the bid arrives and again on Re-run verification.

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useApp } from '../../../state/appContext';
import { Badge } from '../../../components/ui/Badge';
import { Button, Card, EmptyState } from '../../../components/ui/primitives';
import { PORTAL_STATUS } from '../../../domain/labels';
import { formatDateTime } from '../../../lib/format';
import { ComparisonTable, ReadingBadge, ReadingModal } from '../documentIntelligence';
import { useDocumentIntelligence } from '../useDocumentIntelligence';
import type { TabProps } from '../bidTabs';

export const PanVerificationTab: React.FC<TabProps> = ({ view, openDocument }) => {
  const { source } = useApp();
  const ai = useDocumentIntelligence(view.bid.id, source === 'api');
  const [open, setOpen] = useState(false);
  const panCheck = view.checks.find((c) => c.requirement.code === 'REQ-07');
  const doc = panCheck?.document;
  const run = ai.runs.find((r) => r.document.requirement === 'REQ-07');
  const registry = view.portal.find((p) => p.registry === 'PAN');

  return (
    <div className="space-y-4">
      <Card
        title="PAN verification"
        subtitle="The PAN document in the bid, read by CSAP AI and compared with the bid record and the PAN registry. Re-run verification reads it again."
        actions={doc && <Button size="sm" onClick={() => openDocument(doc)}>View document</Button>}
      >
        {!doc ? (
          <EmptyState title="No PAN document in this bid" description="The bid package does not include a document for the PAN requirement." />
        ) : !run ? (
          ai.running ? (
            <p className="flex items-center gap-2 text-xs text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> CSAP AI is reading the documents…</p>
          ) : (
            <p className="text-xs text-slate-600">Not read yet. Use Re-run verification at the top of the bid.</p>
          )
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{doc.name}</span>
              <span className="font-mono text-slate-500">{doc.fileName}</span>
              <ReadingBadge run={run} onOpen={() => setOpen(true)} />
              <span className="text-slate-500">read {formatDateTime(run.completedAt ?? run.updatedAt)}</span>
            </div>
            {run.error && <p role="alert" className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">Could not read this document: {run.error}</p>}
            {run.comparison && (
              <>
                <p className="text-slate-700">{run.comparison.summary}</p>
                <ComparisonTable rows={run.comparison.rows} registry />
              </>
            )}
            <Button size="sm" onClick={() => setOpen(true)}>Show how it was read</Button>
          </div>
        )}
      </Card>

      <Card title="PAN registry" subtitle="What the Income Tax PAN registry returned for the PAN declared in the bid.">
        {registry ? (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge tone={PORTAL_STATUS[registry.status]?.tone ?? 'neutral'}>{PORTAL_STATUS[registry.status]?.label ?? registry.status}</Badge>
            <span className="font-mono">{registry.identifier}</span>
            <span className="text-slate-700">{registry.summary}</span>
            <span className="text-slate-500">· {formatDateTime(registry.checkedAt)}</span>
          </div>
        ) : (
          <p className="text-xs text-slate-600">Not checked yet. Re-run verification queries the registries.</p>
        )}
      </Card>

      {panCheck && (
        <p className="text-xs text-slate-500">
          Requirement result: <span className="font-medium text-slate-800">{panCheck.status.replace(/_/g, ' ').toLowerCase()}</span> · {panCheck.note}
        </p>
      )}

      <ReadingModal run={open ? run ?? null : null} onClose={() => setOpen(false)} />
    </div>
  );
};
