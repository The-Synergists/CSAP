import type { Request, Response } from 'express';
import { getDb } from '../config/supabase.js';

export async function listBids(req: Request, res: Response) {
  try {
    const db = getDb();
    const { tenderId } = req.query;

    let query = db
      .from('bids')
      .select(`
        *,
        companies(*, company_turnover(*)),
        bid_documents(*),
        bid_emd(*),
        compliance_check_items(*),
        risk_factors(*),
        evidence_items(*),
        ai_recommendations(*, ai_recommendation_points(*)),
        officer_decisions(*, profiles(full_name, designation))
      `);

    if (tenderId) {
      query = query.eq('tender_id', tenderId as string);
    }

    const { data, error } = await query;
    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getBidById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = getDb();
    const { data, error } = await db
      .from('bids')
      .select(`
        *,
        companies(*, company_turnover(*)),
        bid_documents(*),
        bid_emd(*),
        compliance_check_items(*),
        risk_factors(*),
        evidence_items(*),
        ai_recommendations(*, ai_recommendation_points(*)),
        officer_decisions(*, profiles(full_name, designation)),
        audit_events(*)
      `)
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Bid not found' });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
