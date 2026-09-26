// Maps a document_verification_runs row (snake_case, as stored and as delivered by
// Supabase Realtime) to the domain type. Shared by the backend and the browser.

import type { DocumentVerificationRun } from './types.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export const mapRunRow = (r: any): DocumentVerificationRun => ({
  id: r.id,
  bidId: r.bid_id,
  documentType: r.document_type,
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
