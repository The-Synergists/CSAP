// NVIDIA-drafted explanation of the (rule-based) recommendation. Every sentence shows the evidence
// it cites; sentences the engine removed as unsupported are listed with the reason.

import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '../../components/ui/primitives';
import { useToast } from '../../components/ui/toast';
import { formatDateTime } from '../../lib/format';
import { api, type RecommendationDraft } from '../../state/api';
import type { TabProps } from './bidTabs';

export const AiExplanation: React.FC<{ bidId: string; goTo: TabProps['goTo'] }> = ({ bidId, goTo }) => {
  const toast = useToast();
  const [draft, setDraft] = useState<RecommendationDraft | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .recommendationDraft(bidId)
      .then((d) => active && setDraft(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [bidId]);

  const run = async () => {
    setBusy(true);
    try {
      setDraft(await api.draftRecommendation(bidId));
    } catch (err) {
      toast({ kind: 'error', title: 'Explanation not drafted', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  const cite = (id: string) =>
    id.startsWith('EVD') ? goTo('evidence', { finding: id }) : goTo('compliance');

  return (
    <div className="mt-4 rounded border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
          <Sparkles aria-hidden className="h-3.5 w-3.5 text-indigo-600" /> Explanation written by NVIDIA
        </h3>
        <Button size="sm" onClick={() => void run()} disabled={busy}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {busy ? 'Writing…' : draft ? 'Write again' : 'Explain with NVIDIA'}
        </Button>
      </div>
      {!draft ? (
        <p className="mt-2 text-xs text-slate-600">
          NVIDIA explains the suggested action in plain words from the findings. Every sentence must cite its evidence; CSAP removes any sentence that does not.
        </p>
      ) : (
        <div className="mt-2 space-y-2 text-xs">
          <ul className="space-y-1.5">
            {draft.sentences.map((s, i) => (
              <li key={i} className="leading-relaxed text-slate-800">
                {s.text}{' '}
                {s.citations.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => cite(c)}
                    className="mr-1 rounded border border-indigo-200 bg-white px-1 py-0.5 font-mono text-[10.5px] text-indigo-700 hover:bg-indigo-50"
                    aria-label={`Open evidence ${c}`}
                  >
                    {c}
                  </button>
                ))}
              </li>
            ))}
          </ul>
          {draft.dropped.length > 0 && (
            <details>
              <summary className="cursor-pointer text-[11px] font-medium text-amber-800">
                {draft.dropped.length} sentence{draft.dropped.length === 1 ? '' : 's'} removed as unsupported
              </summary>
              <ul className="mt-1 space-y-1 pl-3 text-[11px] text-slate-600">
                {draft.dropped.map((d, i) => (
                  <li key={i}>
                    <span className="line-through">{d.text}</span> <span className="text-amber-800">({d.reason})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          <p className="text-[11px] text-slate-500">
            {draft.model} · {draft.latencyMs != null ? `${(draft.latencyMs / 1000).toFixed(1)} s · ` : ''}written {formatDateTime(draft.createdAt)} from {draft.evidence.length} evidence items. The suggested action itself comes from CSAP's rules, not from the model.
          </p>
        </div>
      )}
    </div>
  );
};
