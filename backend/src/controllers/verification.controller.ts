import type { Request, Response } from 'express';
import { getDb } from '../config/supabase.js';
import { requestAiVerification } from '../services/aiEngineBridge.js';

export async function runVerification(req: Request, res: Response) {
  try {
    const { bidId, tenderId, userId } = req.body;
    if (!bidId) {
      return res.status(400).json({ success: false, message: 'bidId is required' });
    }

    const db = getDb();

    // 1. Fetch bid info
    const { data: bid, error: bidError } = await db
      .from('bids')
      .select('*, companies(*), bid_documents(*)')
      .eq('id', bidId)
      .single();

    if (bidError || !bid) {
      return res.status(404).json({ success: false, message: 'Bid not found' });
    }

    // 2. Insert AI verification run record
    const { data: run, error: runError } = await db
      .from('ai_verification_runs')
      .insert({
        bid_id: bidId,
        initiated_by: userId || null,
        status: 'RUNNING',
        steps: [
          { name: 'Documents OCR Extraction', status: 'in-progress' },
          { name: 'Government Registry Cross-Check (GSTN / MCA21)', status: 'pending' },
          { name: 'EMD & Payment Gateway Reconciliation', status: 'pending' },
          { name: 'Tender Rule & Eligibility Evaluation', status: 'pending' },
          { name: 'Discrepancy & Deficit Detection', status: 'pending' },
          { name: 'Compliance & Multi-Vector Risk Calculation', status: 'pending' },
        ],
      })
      .select('id')
      .single();

    if (runError) throw runError;

    // 3. Delegate to AI Engine bridge
    const aiResult = await requestAiVerification({
      bidId,
      tenderId: tenderId || bid.tender_id,
      gstin: bid.companies?.gstin || '',
      pan: bid.companies?.pan || '',
      udyamNumber: bid.companies?.udyam_number,
      documents: bid.bid_documents?.map((d: any) => ({
        id: d.id,
        name: d.file_name,
        url: d.storage_path,
      })),
    });

    // 4. Update run record to completed
    await db
      .from('ai_verification_runs')
      .update({
        status: 'COMPLETED',
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    res.json({
      success: true,
      runId: run.id,
      verificationResult: aiResult,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
