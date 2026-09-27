import React, { useState } from 'react';
import { Eye } from 'lucide-react';
import type { DocumentVerificationRun } from '@shared/domain/types';
import { CheckBadge } from '../../../components/ui/Badge';
import { Button, Card } from '../../../components/ui/primitives';
import { useApp } from '../../../state/appContext';
import type { TabProps } from '../bidTabs';
import { IntelligenceCard, ReadingBadge, ReadingModal } from '../documentIntelligence';
import { useDocumentIntelligence } from '../useDocumentIntelligence';

/** Document verification: one row per tender requirement, so missing documents are visible. */
export const DocumentsTab: React.FC<TabProps> = ({ view, goTo, openDocument }) => {
  const { source } = useApp();
  const ai = useDocumentIntelligence(view.bid.id, source === 'api');
  const [reading, setReading] = useState<DocumentVerificationRun | null>(null);
  const stored = view.documents.filter((d) => d.storagePath).length;
  const showAi = source === 'api';
  return (
    <div className="space-y-4">
      {showAi && <IntelligenceCard state={ai} stored={stored} />}
      <Card
        title="Document verification"
        subtitle={`${view.documents.length} of ${view.documentsRequired} required documents submitted. Each document is matched to the tender requirement it supports.`}
        padded={false}
      >
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-xs text-slate-700">
            <thead className="border-b border-slate-200 bg-slate-100 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Requirement
                </th>
                <th scope="col" className="px-4 py-3">
                  Document
                </th>
                <th scope="col" className="px-4 py-3">
                  Result
                </th>
                {showAi && (
                  <th scope="col" className="px-4 py-3">
                    Document vs bid (CSAP AI)
                  </th>
                )}
                <th scope="col" className="px-4 py-3">
                  Note
                </th>
                <th scope="col" className="px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {view.checks.map((c) => (
                <tr key={c.id} className={!c.document ? 'bg-rose-50/40' : undefined}>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-slate-500">{c.requirement.code}</div>
                    <div className="text-slate-900">{c.requirement.title}</div>
                  </td>
                  <td className="px-4 py-3">
                    {c.document ? (
                      <>
                        <div className="text-slate-900">{c.document.name}</div>
                        <div className="font-mono text-xs text-slate-500">
                          {c.document.fileName} · {c.document.fileSize}
                        </div>
                      </>
                    ) : (
                      <span className="font-medium text-rose-700">Not submitted</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <CheckBadge status={c.status} />
                  </td>
                  {showAi && (
                    <td className="px-4 py-3">
                      {c.document ? <ReadingBadge run={ai.byCode.get(c.document.id)} onOpen={() => setReading(ai.byCode.get(c.document!.id) ?? null)} /> : null}
                    </td>
                  )}
                  <td className="max-w-xs px-4 py-3 text-slate-600">{c.note}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right">
                    <div className="flex justify-end gap-1.5">
                      {c.document && (
                        <Button size="sm" onClick={() => openDocument(c.document!)} aria-label={`View ${c.document.name}`}>
                          <Eye className="h-3.5 w-3.5" /> View
                        </Button>
                      )}
                      {c.requirement.code === 'REQ-07' && c.document?.storagePath && (
                        <Button size="sm" variant="ghost" onClick={() => goTo('pan')}>
                          Verify PAN
                        </Button>
                      )}
                      {c.findingId && (
                        <Button size="sm" variant="ghost" onClick={() => goTo('evidence', { finding: c.findingId! })}>
                          Finding
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <ReadingModal run={reading ? (ai.byCode.get(reading.document.code ?? '') ?? reading) : null} onClose={() => setReading(null)} />
    </div>
  );
};
