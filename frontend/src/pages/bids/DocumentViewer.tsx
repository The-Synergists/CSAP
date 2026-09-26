import React, { useEffect, useState } from 'react';
import type { BidView } from '@shared/domain/selectors';
import type { BidDocument } from '@shared/domain/types';
import { CheckBadge } from '../../components/ui/Badge';
import { Button, DetailList, Modal } from '../../components/ui/primitives';
import { formatDateTime } from '../../lib/format';
import { api } from '../../state/api';

const parseFields = (text: string) =>
  text
    .split('|')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const i = p.indexOf(':');
      return i === -1 ? { label: 'Detail', value: p } : { label: p.slice(0, i).trim(), value: p.slice(i + 1).trim() };
    });

/** Shows the fields extracted from a bid document and how it was assessed. */
export const DocumentViewer: React.FC<{
  view: BidView;
  doc: BidDocument | null;
  onClose: () => void;
  onViewFinding: (findingId: string) => void;
}> = ({ view, doc, onClose, onViewFinding }) => {
  const check = doc ? view.checks.find((c) => c.requirementId === doc.requirementId) : undefined;
  const [preview, setPreview] = useState<{ path: string; url: string } | null>(null);
  const path = doc?.storagePath;
  useEffect(() => {
    if (!path) return;
    let active = true;
    api
      .documentUrl(path)
      .then((r) => active && setPreview({ path, url: r.url }))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [path]);
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      size="lg"
      title={doc?.name}
      description={doc && `${doc.fileName} · ${doc.fileSize} · uploaded ${formatDateTime(doc.uploadedAt)}`}
      footer={
        <>
          {check?.findingId && (
            <Button onClick={() => onViewFinding(check.findingId!)}>View related finding</Button>
          )}
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {doc && (
        <div className="space-y-4 text-xs">
          <div className="rounded border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">Fields extracted from the document</div>
            <div className="px-3">
              <DetailList rows={parseFields(doc.extractedText).map((f, i) => ({ label: f.label || `Field ${i + 1}`, value: <span className="font-mono text-xs">{f.value}</span> }))} />
            </div>
          </div>
          {check && (
            <div className="rounded border border-slate-200 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-slate-900">
                  {check.requirement.code} · {check.requirement.title}
                </span>
                <CheckBadge status={check.status} />
              </div>
              <p className="mt-1 text-slate-600">Required: {check.requirement.benchmark}</p>
              <p className="text-slate-600">Found: {check.submitted}</p>
              <p className="mt-1 text-slate-800">{check.note}</p>
            </div>
          )}
          {preview && preview.path === path ? (
            <div className="rounded border border-slate-200 bg-slate-50 p-2">
              <img src={preview.url} alt={`Specimen image of ${doc.name}`} className="w-full rounded bg-white" />
              <p className="mt-1.5 text-[11px] text-slate-500">Specimen image stored for this prototype. Use “Read all documents” on the Documents tab to have NVIDIA read it.</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">{path ? 'Loading preview…' : 'No stored file for this document in the prototype.'}</p>
          )}
        </div>
      )}
    </Modal>
  );
};
