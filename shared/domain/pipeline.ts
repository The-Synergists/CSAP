// Maps a document_verification_runs row (snake_case, as stored and as delivered by
// Supabase Realtime) to the domain type. Shared by the backend and the browser.

import type { DocumentBatch, DocumentVerificationRun } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapRunRow = (r: any): DocumentVerificationRun => ({
  id: r.id,
  bidId: r.bid_id,
  documentType: r.document_type,
  batchId: r.batch_id ?? null,
  bidDocumentId: r.bid_document_id ?? null,
  initiatedBy: r.initiated_by,
  status: r.status,
  document: r.document,
  ocr: r.ocr_result,
  extraction: r.extraction_result,
  apiRequest: r.api_request,
  apiResponse: r.api_response,
  comparison: r.comparison,
  verdict: r.verdict,
  error: r.error,
  startedAt: r.started_at,
  updatedAt: r.updated_at,
  completedAt: r.completed_at,
});

export const mapBatchRow = (r: any): DocumentBatch => ({
  id: r.id,
  bidId: r.bid_id,
  status: r.status,
  total: r.total,
  consistency: r.consistency ?? null,
  summary: r.summary ?? null,
  error: r.error ?? null,
  startedAt: r.started_at,
  completedAt: r.completed_at ?? null,
});
