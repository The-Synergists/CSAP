import { Router } from 'express';
import { findTender, getBidView, listBidViews } from '../../../shared/domain/selectors.js';
import { loadWorkspace } from '../db/workspace.repository.js';
import { asyncHandler, HttpError } from '../lib/http.js';
import { serviceClient } from '../lib/supabase.js';
import { authOf, requireAuth } from '../middlewares/auth.js';
import { login, refresh } from '../services/auth.service.js';
import { submitDecision, validateDecision } from '../services/decision.service.js';
import { engineHealth } from '../services/engine.client.js';
import { runVerification } from '../services/verification.service.js';
import { listRuns, listSamples, signedUrl, startPanVerification, type DocumentSource } from '../services/documentPipeline.service.js';
import { config } from '../config/env.js';

const router = Router();

// ---------------------------------------------------------------- public

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [db, engine, pan] = await Promise.all([
      serviceClient.from('tenders').select('id', { count: 'exact', head: true }).then(({ error }) => !error),
      engineHealth(),
      fetch(`${config.panApiUrl}/v1/health`, { signal: AbortSignal.timeout(3000) })
        .then((r) => r.json() as Promise<{ records: number }>)
        .catch(() => null),
    ]);
    res.status(db ? 200 : 503).json({
      status: db && engine.ok && pan ? 'ok' : 'degraded',
      service: 'csap-backend',
      database: db ? 'ok' : 'unreachable',
      verificationEngine: engine.ok ? `ok (${engine.version})` : 'unreachable',
      nvidiaOcr: engine.nvidia?.ocr?.configured ? `configured (${engine.nvidia.ocr.model})` : 'not configured',
      nvidiaExtraction: engine.nvidia?.extraction?.configured ? `configured (${engine.nvidia.extraction.model})` : 'not configured',
      panVerificationApi: pan ? `ok (${pan.records} records)` : 'unreachable',
      timestamp: new Date().toISOString(),
    });
  }),
);

router.post(
  '/auth/login',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await login(req.body?.identifier, req.body?.password) });
  }),
);

router.post(
  '/auth/refresh',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await refresh(req.body?.refreshToken) });
  }),
);

// ---------------------------------------------------------------- officer (authenticated)

router.use(requireAuth);

router.get(
  '/me',
  asyncHandler(async (_req, res) => {
    const { db, userId } = authOf(res);
    const { data } = await db.from('profiles').select('*').eq('id', userId).single();
    if (!data) throw new HttpError(404, 'Profile not found.', 'NOT_FOUND');
    res.json({ success: true, data });
  }),
);

/** The whole normalised dataset the officer can see (small prototype dataset). */
router.get(
  '/workspace',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await loadWorkspace(authOf(res).db) });
  }),
);

router.get(
  '/tenders',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: (await loadWorkspace(authOf(res).db)).tenders });
  }),
);

router.get(
  '/tenders/:id',
  asyncHandler(async (req, res) => {
    const ws = await loadWorkspace(authOf(res).db);
    const tender = findTender(ws, String(req.params.id));
    if (!tender) throw new HttpError(404, `Tender ${req.params.id} was not found.`, 'NOT_FOUND');
    res.json({ success: true, data: { tender, requirements: ws.requirements.filter((r) => r.tenderId === tender.id) } });
  }),
);

router.get(
  '/bids',
  asyncHandler(async (req, res) => {
    const ws = await loadWorkspace(authOf(res).db);
    res.json({ success: true, data: listBidViews(ws, req.query.tenderId ? String(req.query.tenderId) : undefined) });
  }),
);

router.get(
  '/bids/:id',
  asyncHandler(async (req, res) => {
    const view = getBidView(await loadWorkspace(authOf(res).db), String(req.params.id));
    if (!view) throw new HttpError(404, `Bid ${req.params.id} was not found.`, 'NOT_FOUND');
    res.json({ success: true, data: view });
  }),
);

router.post(
  '/decisions',
  asyncHandler(async (req, res) => {
    const input = validateDecision(req.body);
    const result = await submitDecision(authOf(res).db, input);
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/verification/run',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const bidId = req.body?.bidId;
    if (!bidId) throw new HttpError(400, 'bidId is required.', 'VALIDATION');
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    const run = await runVerification(db, userId, profile?.full_name ?? 'Officer', String(bidId));
    res.json({ success: true, data: run });
  }),
);

// ---------------------------------------------------------------- document verification pipeline

router.get(
  '/bids/:id/document-verifications',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listRuns(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/bids/:id/document-verifications',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const b = req.body ?? {};
    const source: DocumentSource =
      b.source === 'upload'
        ? { kind: 'upload', fileName: String(b.fileName ?? ''), mimeType: String(b.mimeType ?? ''), contentBase64: String(b.contentBase64 ?? '') }
        : b.source === 'sample'
          ? { kind: 'sample', fileName: String(b.fileName ?? '') }
          : { kind: 'bid_package' };
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    const run = await startPanVerification(db, userId, profile?.full_name ?? 'Officer', String(req.params.id), source);
    res.status(202).json({ success: true, data: run });
  }),
);

router.get(
  '/document-samples',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listSamples() });
  }),
);

router.get(
  '/documents/url',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: { url: await signedUrl(String(req.query.path ?? '')) } });
  }),
);

export default router;
