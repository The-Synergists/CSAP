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
import { deleteUpload, listRuns, listSamples, signedUrl, startPanVerification, type DocumentSource } from '../services/documentPipeline.service.js';
import { config } from '../config/env.js';
import { listPortalChecks, startPortalChecks } from '../services/portal.service.js';
import { listBatches, listBatchRuns, startDocumentBatch } from '../services/documentBatch.service.js';
import { draftExplanation, latestDraft } from '../services/recommendation.service.js';
import { receiveGemBid, verifySignature, type GemBidPayload } from '../services/gemIntake.service.js';
import { demoKit, getSubmissionWithEvaluation, myBids, openTenders, receiveEvaluation, submitBid, submitResponse, uploadDocument } from '../services/gemPortal.service.js';
import { acceptRequest, declineRequest, receiveBidderResponse, type BidderResponsePayload } from '../services/reevaluation.service.js';
import { assertNoDocumentReadingRunning, assertNoPortalRunRunning, assertOpenForVerification } from '../services/bidRules.service.js';
import { generateReport, getReport, listAllReports, listReports, sendReportToGem } from '../services/report.service.js';
import { askAssistant } from '../services/assistant.service.js';
import { waitUntil } from '@vercel/functions';
import { backupConfigured, isValidGstin, providerConfigured, providerUsage, ProviderUnavailable } from '../registries/gstinProvider.js';
import { liveGstn } from '../registries/gstnLive.js';
import { ADAPTERS } from '../registries/adapters.js';
import { gatewayOverview, recentCalls, registryRecords, tryRegistryCall } from '../services/gatewayConsole.service.js';

const router = Router();

// ---------------------------------------------------------------- public

router.get(
  '/health',
  asyncHandler(async (_req, res) => {
    const [db, engine, pan] = await Promise.all([
      serviceClient.from('tenders').select('id', { count: 'exact', head: true }).then(({ error }) => !error),
      engineHealth(),
      fetch(`${config.govGatewayUrl}/v1/health`, { signal: AbortSignal.timeout(3000) })
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
      governmentGateway: pan ? `ok (${(pan as { registries?: string[] }).registries?.length ?? 0} registries, simulated)` : 'unreachable',
      liveGstinProvider: providerConfigured() ? `configured (gstinapi.in${backupConfigured() ? ' + backup gstinapi.com' : ''})` : backupConfigured() ? 'configured (gstinapi.com)' : 'not configured',
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

// ---------------------------------------------------------------- simulated GeM portal (bidder side, public)

router.get(
  '/gem/tenders',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await openTenders() });
  }),
);

router.get('/gem/demo-kit', (_req, res) => {
  res.json({ success: true, data: demoKit() });
});

router.post(
  '/gem/uploads',
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await uploadDocument(req.body ?? {}) });
  }),
);

router.post(
  '/gem/submissions',
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await submitBid(req.body ?? {}) });
  }),
);

router.get(
  '/gem/submissions/:id',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getSubmissionWithEvaluation(String(req.params.id)) });
  }),
);

router.post(
  '/gem/submissions/:id/responses',
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await submitResponse(String(req.params.id), req.body ?? {}) });
  }),
);

router.get(
  '/gem/my-bids',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await myBids(String(req.query.pan ?? '')) });
  }),
);

/** CSAP -> GeM: evaluation outcome and report summary (signed by CSAP). */
router.post(
  '/gem/notifications',
  asyncHandler(async (req, res) => {
    verifySignature((req as unknown as { rawBody?: Buffer }).rawBody, req.get('x-csap-timestamp'), req.get('x-csap-signature'));
    res.json({ success: true, data: await receiveEvaluation(req.body) });
  }),
);

// ---------------------------------------------------------------- GeM -> CSAP intake webhook (signed, no officer session)

router.post(
  '/integrations/gem/bids',
  asyncHandler(async (req, res) => {
    verifySignature((req as unknown as { rawBody?: Buffer }).rawBody, req.get('x-gem-timestamp'), req.get('x-gem-signature'));
    const result = await receiveGemBid(req.body as GemBidPayload);
    res.status(result.duplicate ? 200 : 202).json({ success: true, data: result });
  }),
);

/** GeM -> CSAP: a bidder's clarification response or re-evaluation request (waits for the officer). */
router.post(
  '/integrations/gem/responses',
  asyncHandler(async (req, res) => {
    verifySignature((req as unknown as { rawBody?: Buffer }).rawBody, req.get('x-gem-timestamp'), req.get('x-gem-signature'));
    res.status(202).json({ success: true, data: await receiveBidderResponse(req.body as BidderResponsePayload) });
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
    const { db, userId } = authOf(res);
    const result = await submitDecision(db, input);
    // Bids from GeM: the evaluation report goes back to GeM automatically after the decision.
    const { data: bid } = await db.from('bids').select('source').eq('id', input.bidId).single();
    if (bid?.source === 'GEM') {
      const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
      const name = profile?.full_name ?? 'Officer';
      waitUntil(
        generateReport(db, userId, name, input.bidId)
          .then((r) => sendReportToGem(db, userId, name, r.id))
          .catch(() => {}),
      );
    }
    res.status(201).json({ success: true, data: result });
  }),
);

router.post(
  '/verification/run',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const bidId = req.body?.bidId;
    if (!bidId) throw new HttpError(400, 'bidId is required.', 'VALIDATION');
    await assertOpenForVerification(db, String(bidId));
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
    await assertOpenForVerification(db, String(req.params.id));
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    const run = await startPanVerification(db, userId, profile?.full_name ?? 'Officer', String(req.params.id), source);
    res.status(202).json({ success: true, data: run });
  }),
);

router.delete(
  '/document-verifications/:id/file',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.json({ success: true, data: await deleteUpload(db, userId, String(req.params.id), profile?.full_name ?? 'Officer') });
  }),
);

router.post(
  '/assistant',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await askAssistant(authOf(res).db, req.body ?? {}) });
  }),
);

// ---------------------------------------------------------------- evaluation reports (evidence pack)

router.get(
  '/bids/:id/reports',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listReports(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/bids/:id/reports',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.status(201).json({ success: true, data: await generateReport(db, userId, profile?.full_name ?? 'Officer', String(req.params.id)) });
  }),
);

/** Every evaluation report with the decision it records (Reports page). */
router.get(
  '/reports',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await listAllReports(authOf(res).db) });
  }),
);

router.get(
  '/reports/:id',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await getReport(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/reports/:id/send-to-gem',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.json({ success: true, data: await sendReportToGem(db, userId, profile?.full_name ?? 'Officer', String(req.params.id)) });
  }),
);

// ---------------------------------------------------------------- bidder responses / re-evaluation

router.post(
  '/reevaluations/:id/accept',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.json({ success: true, data: await acceptRequest(db, userId, profile?.full_name ?? 'Officer', String(req.params.id), req.body?.note) });
  }),
);

router.post(
  '/reevaluations/:id/decline',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.json({ success: true, data: await declineRequest(db, userId, profile?.full_name ?? 'Officer', String(req.params.id), req.body?.note) });
  }),
);

// ---------------------------------------------------------------- tamper-evident audit trail

/** Recomputes the audit hash chain. ?simulate=<seq> pretends that event was altered (in memory only). */
router.get(
  '/audit/verify',
  asyncHandler(async (req, res) => {
    const simulate = req.query.simulate ? Number(req.query.simulate) : null;
    const { data, error } = await authOf(res).db.rpc('verify_audit_chain', simulate ? { p_simulate_seq: simulate } : {});
    if (error) throw new HttpError(502, `Could not verify the audit chain: ${error.message}`, 'DB_ERROR');
    const r = (data as { intact: boolean; checked: number; broken_at: number | null; reason: string | null; last_hash: string }[])[0];
    res.json({ success: true, data: { intact: r.intact, checked: Number(r.checked), brokenAt: r.broken_at, reason: r.reason, lastHash: r.last_hash, simulated: simulate } });
  }),
);

// ---------------------------------------------------------------- AI explanation of the recommendation

router.get(
  '/bids/:id/recommendation/draft',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await latestDraft(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/bids/:id/recommendation/draft',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    await assertOpenForVerification(db, String(req.params.id));
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.status(201).json({ success: true, data: await draftExplanation(db, userId, profile?.full_name ?? 'Officer', String(req.params.id)) });
  }),
);

// ---------------------------------------------------------------- document intelligence (whole bid package)

router.get(
  '/bids/:id/document-batches',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listBatches(authOf(res).db, String(req.params.id)) });
  }),
);

router.get(
  '/document-batches/:id/runs',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listBatchRuns(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/bids/:id/document-batches',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    await assertOpenForVerification(db, String(req.params.id));
    await assertNoDocumentReadingRunning(db, String(req.params.id));
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.status(202).json({ success: true, data: await startDocumentBatch(db, userId, profile?.full_name ?? 'Officer', String(req.params.id)) });
  }),
);

// ---------------------------------------------------------------- government portal verification

router.get(
  '/bids/:id/portal-checks',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await listPortalChecks(authOf(res).db, String(req.params.id)) });
  }),
);

router.post(
  '/bids/:id/portal-checks',
  asyncHandler(async (req, res) => {
    const { db, userId } = authOf(res);
    await assertOpenForVerification(db, String(req.params.id));
    await assertNoPortalRunRunning(db, String(req.params.id), ADAPTERS.length);
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single();
    res.status(202).json({ success: true, data: await startPortalChecks(db, userId, profile?.full_name ?? 'Officer', String(req.params.id)) });
  }),
);

router.get(
  '/registries',
  asyncHandler(async (_req, res) => {
    const r = await fetch(`${config.govGatewayUrl}/v1/registries`, { headers: { 'x-api-key': config.govGatewayKey }, signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new HttpError(502, 'Government Gateway not reachable.', 'GATEWAY_UNAVAILABLE');
    res.json({ success: true, data: ((await r.json()) as { registries: unknown[] }).registries });
  }),
);

// ---------------------------------------------------------------- Government Gateway console

router.get(
  '/gateway',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await gatewayOverview() });
  }),
);

router.get(
  '/gateway/calls',
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: await recentCalls(authOf(res).db) });
  }),
);

router.get(
  '/gateway/:registry/records',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await registryRecords(String(req.params.registry)) });
  }),
);

router.post(
  '/gateway/:registry/try',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await tryRegistryCall(String(req.params.registry), String(req.body?.identifier ?? '')) });
  }),
);

// ---------------------------------------------------------------- live GSTIN provider

/** Provider status and credit usage (the usage call is free). */
router.get(
  '/gstin/provider',
  asyncHandler(async (_req, res) => {
    const { count } = await serviceClient.from('gstin_live_cache').select('gstin', { count: 'exact', head: true });
    res.json({ success: true, data: { provider: 'gstinapi.in', configured: providerConfigured() || backupConfigured(), backup: backupConfigured() ? 'gstinapi.com' : null, cacheDays: config.gstinCacheDays, cachedAnswers: count ?? 0, usage: await providerUsage() } });
  }),
);

/** Officer's stand-alone lookup of any GSTIN on the live GST portal data (cached; malformed GSTINs never cost a credit). */
router.post(
  '/gstin/live',
  asyncHandler(async (req, res) => {
    const gstin = String(req.body?.gstin ?? '').trim().toUpperCase();
    if (!isValidGstin(gstin)) throw new HttpError(400, `${gstin || 'This'} is not a valid GSTIN (format or check digit). No credit was used.`, 'VALIDATION');
    if (!providerConfigured() && !backupConfigured()) throw new HttpError(503, 'Live GSTIN provider is not configured.', 'PROVIDER_NOT_CONFIGURED');
    try {
      res.json({ success: true, data: await liveGstn(gstin) });
    } catch (err) {
      if (err instanceof ProviderUnavailable) throw new HttpError(503, err.message, 'PROVIDER_UNAVAILABLE');
      throw err;
    }
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
