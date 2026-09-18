import type { Request, Response } from 'express';
import { getDb } from '../config/supabase.js';

export async function listTenders(req: Request, res: Response) {
  try {
    const db = getDb();
    const { data, error } = await db
      .from('tenders')
      .select('*, tender_requirements(*)')
      .order('publish_date', { ascending: false });

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getTenderById(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const db = getDb();
    const { data, error } = await db
      .from('tenders')
      .select('*, tender_requirements(*)')
      .eq('id', id)
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ success: false, message: 'Tender not found' });
    res.json({ success: true, data });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message });
  }
}
