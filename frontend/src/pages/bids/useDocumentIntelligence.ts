// State for "Read all documents" on the Documents tab: the latest batch for a bid and its
// per-document runs, kept current through Supabase Realtime (polling fallback while running).

import { useCallback, useEffect, useState } from 'react';
import { mapBatchRow, mapRunRow } from '@shared/domain/pipeline';
import type { DocumentBatch, DocumentVerificationRun } from '@shared/domain/types';
import { api } from '../../state/api';
import { subscribeToTables } from '../../state/realtime';

const merge = (existing: DocumentVerificationRun | undefined, incoming: DocumentVerificationRun) => {
  if (!existing) return incoming;
  // Never let a partial event erase a stage result already shown.
  const merged = { ...existing };
  for (const [k, v] of Object.entries(incoming)) if (v !== undefined && v !== null) (merged as Record<string, unknown>)[k] = v;
  return merged;
};

export function useDocumentIntelligence(bidId: string, enabled: boolean) {
  const [batch, setBatch] = useState<DocumentBatch | null>(null);
  const [runs, setRuns] = useState<DocumentVerificationRun[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [live, setLive] = useState(false);

  const load = useCallback(
    () =>
      api
        .documentBatches(bidId)
        .catch(() => [] as DocumentBatch[])
        .then(async (list) => ({ latest: list[0] ?? null, runs: list[0] ? await api.batchRuns(list[0].id).catch(() => []) : [] }))
        .then(({ latest, runs: r }) => {
          setBatch(latest);
          setRuns(r);
          setLoaded(true);
        }),
    [bidId],
  );

  useEffect(() => {
    if (!enabled) return;
    void load();
    return subscribeToTables(
      `docs-${bidId}`,
      [
        { table: 'document_batches', filter: `bid_id=eq.${bidId}` },
        { table: 'document_verification_runs', filter: `bid_id=eq.${bidId}` },
      ],
      (table, row) => {
        if (table === 'document_batches') {
          const b = mapBatchRow(row);
          setBatch((prev) => (!prev || prev.id === b.id || b.startedAt > prev.startedAt ? b : prev));
          return;
        }
        const r = mapRunRow(row);
        if (!r.batchId) return;
        setRuns((prev) => {
          const existing = prev.find((x) => x.id === r.id);
          if (!existing && prev.length && prev[0].batchId !== r.batchId) return [r]; // a newer batch started elsewhere
          return existing ? prev.map((x) => (x.id === r.id ? merge(x, r) : x)) : [...prev, r];
        });
      },
      setLive,
    );
  }, [bidId, enabled, load]);

  const running = batch?.status === 'RUNNING';
  // Polling fallback while a batch is running and Realtime is not connected.
  useEffect(() => {
    if (!running || live) return;
    const t = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(t);
  }, [running, live, load]);

  const start = async () => {
    const r = await api.startDocumentBatch(bidId);
    setBatch(r.batch);
    setRuns(r.runs);
  };
  const current = runs.filter((r) => r.batchId === batch?.id);
  const byCode = new Map(current.map((r) => [r.document.code ?? '', r]));
  return { batch, runs: current, byCode, loaded, live, running, start };
}

export type DocumentIntelligence = ReturnType<typeof useDocumentIntelligence>;
