import type { Request, Response } from 'express';
import { getDb } from '../config/supabase.js';
import { config } from '../config/env.js';

/**
 * POST /api/documents/upload
 *
 * Accepts a multipart/form-data upload with:
 *   - file: the PDF / image binary
 *   - bidId: bid UUID
 *   - tenderId: tender ID string
 *   - documentType: e.g. "GST_REGISTRATION_CERTIFICATE"
 *   - tenderClauseReference: e.g. "Clause 2.1"
 *
 * Flow:
 *   1. Store file to Supabase Storage bucket "bid-documents"
 *   2. Insert a row in bid_documents (with OCR status PROCESSING)
 *   3. Create an ai_verification_runs row (status=RUNNING)
 *   4. Fetch full bid + company data for AI context
 *   5. POST to AI engine /api/v1/documents/ingest (fire-and-forget)
 *   6. Return 202 immediately — results arrive via Supabase real-time
 */
export async function uploadBidDocument(req: Request, res: Response) {
  try {
    const db = getDb();
    const { bidId, tenderId, documentType, tenderClauseReference, userId, name } = req.body as Record<string, string>;

    if (!bidId || !req.file) {
      return res.status(400).json({ success: false, message: 'bidId and file are required' });
    }

    const originalName = req.file.originalname;
    const storagePath = `bids/${bidId}/${Date.now()}_${originalName}`;

    // 1. Upload to Supabase Storage (graceful fallback if bucket not yet created)
    try {
      const { error: storageError } = await db.storage
        .from('bid-documents')
        .upload(storagePath, req.file.buffer, {
          contentType: req.file.mimetype,
          upsert: false,
        });

      if (storageError) {
        console.warn('[Documents] Storage upload notice:', storageError.message);
      }
    } catch (storageEx: any) {
      console.warn('[Documents] Storage exception (proceeding with local metadata):', storageEx?.message);
    }

    // 2. Count existing documents for this bid to generate display_code
    const { count } = await db
      .from('bid_documents')
      .select('*', { count: 'exact', head: true })
      .eq('bid_id', bidId);

    const docIndex = (count || 0) + 1;
    const displayCode = `DOC-${String(docIndex).padStart(2, '0')}`;
    const fileSizeStr =
      req.file.size >= 1024 * 1024
        ? `${(req.file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(req.file.size / 1024)} KB`;

    const docName =
      name ||
      originalName
        .replace(/\.[^/.]+$/, '')
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());

    // 3. Insert bid_documents row with correct schema columns
    const { data: docRow, error: docError } = await db
      .from('bid_documents')
      .insert({
        bid_id: bidId,
        display_code: displayCode,
        name: docName,
        doc_type: documentType || 'STATUTORY_CERTIFICATE',
        file_name: originalName,
        file_size: fileSizeStr,
        upload_timestamp: new Date().toISOString(),
        ocr_status: 'PROCESSING',
        storage_path: storagePath,
        tender_clause_requirement: tenderClauseReference || 'Statutory Requirement',
      })
      .select('id')
      .single();

    if (docError) {
      console.error('[Documents] Error creating bid_documents row:', docError);
      throw docError;
    }

    // 4. Resolve initiated_by profile UUID for ai_verification_runs FK
    let officerId = userId;
    if (!officerId) {
      const { data: profile } = await db.from('profiles').select('id').limit(1).maybeSingle();
      officerId = profile?.id;
    }

    if (!officerId) {
      throw new Error('No procurement profile found to initiate verification run.');
    }

    // 5. Create ai_verification_runs row
    const steps = [
      { name: 'Documents OCR Extraction', status: 'in-progress' },
      { name: 'Government Registry Cross-Check (GSTN / MCA21)', status: 'pending' },
      { name: 'EMD & Payment Gateway Reconciliation', status: 'pending' },
      { name: 'Tender Rule & Eligibility Evaluation', status: 'pending' },
      { name: 'Discrepancy & Deficit Detection', status: 'pending' },
      { name: 'Compliance & Multi-Vector Risk Calculation', status: 'pending' },
    ];

    const { data: run, error: runError } = await db
      .from('ai_verification_runs')
      .insert({
        bid_id: bidId,
        initiated_by: officerId,
        status: 'RUNNING',
        steps,
      })
      .select('id')
      .single();

    if (runError) {
      console.error('[Documents] Error creating ai_verification_runs row:', runError);
      throw runError;
    }

    // 6. Fetch full bid context for AI engine
    const { data: bid } = await db
      .from('bids')
      .select(`
        *,
        companies(*, company_turnover(*)),
        bid_documents(*),
        bid_emd(*),
        tenders(*, tender_requirements(*))
      `)
      .eq('id', bidId)
      .single();

    // 7. Fire-and-forget: POST to AI engine ingest endpoint
    const ingestPayload = {
      bidId,
      tenderId: tenderId || bid?.tender_id || '',
      runId: run.id,
      documentId: docRow.id,
      gstin: bid?.companies?.gstin || '',
      pan: bid?.companies?.pan || '',
      udyamNumber: bid?.companies?.udyam_number || '',
      companyName: bid?.companies?.legal_name || '',
      enterpriseType: bid?.companies?.enterprise_type || '',
      isBlacklisted: bid?.companies?.is_blacklisted || false,
      tenderRequirements: bid?.tenders?.tender_requirements || [],
      emd: bid?.bid_emd
        ? {
            requiredAmount: bid.bid_emd.required_amount,
            submittedAmount: bid.bid_emd.submitted_amount,
            instrumentType: bid.bid_emd.instrument_type,
            transactionOrBgNo: bid.bid_emd.transaction_or_bg_no,
            validUntil: bid.bid_emd.valid_until,
          }
        : null,
      averageTurnover:
        bid?.companies?.company_turnover?.reduce(
          (sum: number, t: any) => sum + (t.turnover_amount || 0),
          0
        ) / Math.max(bid?.companies?.company_turnover?.length || 1, 1),
      makeInIndiaPercentage: bid?.make_in_india_percentage ?? null,
      documents: (bid?.bid_documents || []).map((d: any) => ({
        id: d.id,
        name: d.file_name,
        url: d.storage_path,
      })),
    };

    // Fire and forget — AI engine returns 202 immediately, runs pipeline in background
    fetch(`${config.aiEngineUrl}/api/v1/documents/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ingestPayload),
    }).catch((err: any) =>
      console.warn('[Documents] AI engine ingest call failed:', err.message)
    );

    // 8. Respond immediately
    res.status(202).json({
      success: true,
      message: 'Document received. AI verification pipeline started automatically.',
      documentId: docRow.id,
      runId: run.id,
      storagePath,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * GET /api/documents/:bidId
 * Returns all documents for a bid with their OCR status.
 */
export async function listBidDocuments(req: Request, res: Response) {
  try {
    const { bidId } = req.params;
    const db = getDb();
    const { data, error } = await db
      .from('bid_documents')
      .select('*')
      .eq('bid_id', bidId)
      .order('upload_timestamp', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
