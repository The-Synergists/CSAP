import type { Request, Response } from 'express';
import { getDb } from '../config/supabase.js';

export async function submitDecision(req: Request, res: Response) {
  try {
    const { bidId, decisionType, remarks, conditionPrecedent, officerId } = req.body;
    if (!bidId || !decisionType || !officerId) {
      return res.status(400).json({ success: false, message: 'Missing required decision fields' });
    }

    const db = getDb();

    // 1. Insert officer decision
    const { data: decision, error: decError } = await db
      .from('officer_decisions')
      .insert({
        bid_id: bidId,
        officer_id: officerId,
        decision_type: decisionType,
        remarks: remarks || '',
        condition_precedent: conditionPrecedent || null,
        decided_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (decError) throw decError;

    // 2. Map decision to bidder_status
    let newStatus = 'UNDER_REVIEW';
    if (decisionType === 'APPROVE') newStatus = 'RECOMMENDED_ACCEPT';
    else if (decisionType === 'REJECT') newStatus = 'RECOMMENDED_REJECT';
    else if (decisionType === 'REQUEST_CLARIFICATION') newStatus = 'CLARIFICATION_SEEKED';

    await db.from('bids').update({ status: newStatus }).eq('id', bidId);

    // 3. Log audit event
    await db.from('audit_events').insert({
      bid_id: bidId,
      actor_id: officerId,
      action_type: 'OFFICER_ACTION',
      event_title: `Officer Decision: ${decisionType}`,
      description: remarks || `Decision recorded as ${decisionType}`,
    });

    res.json({ success: true, data: decision });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
