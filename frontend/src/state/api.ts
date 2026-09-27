// Thin client for the CSAP backend (backend/). Holds the Supabase session tokens issued
// through /api/auth/login and refreshes them transparently on a 401.

import type { Database, DecisionType, DocumentBatch, DocumentVerificationRun, PortalVerification } from '@shared/domain/types';

/** A registry answer not tied to a bid run (e.g. the officer's live GSTIN lookup). */
export type RegistryAnswer = Omit<PortalVerification, 'id' | 'runId' | 'bidId' | 'checkedAt'>;

export interface EvaluationReport {
  id: string;
  reportNo: string;
  bidId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  sha256: string;
  generatedBy: string;
  generatedAt: string;
  sentToGemAt: string | null;
  gemResponse: unknown;
  decisionId: string | null;
}

/** A row of the Reports page: one evaluation report and the decision it records. */
export interface ReportSummary {
  id: string;
  reportNo: string;
  bidId: string;
  sha256: string;
  generatedBy: string;
  generatedAt: string;
  sentToGemAt: string | null;
  decisionId: string | null;
  decision: { decision: DecisionType; reason: string; remarks: string; officer: string; decidedAt: string } | null;
  bidder: string | null;
  tenderId: string | null;
  complianceScore: number | null;
  requirementsMet: string | null;
  riskLevel: string | null;
}

export interface RecommendationDraft {
  id: string;
  bidId: string;
  suggestedDecision: string;
  score: number;
  sentences: { text: string; citations: string[] }[];
  dropped: { text: string; reason: string }[];
  evidence: { id: string; text: string }[];
  model: string;
  latencyMs: number | null;
  createdAt: string;
}

export interface GatewayOverview {
  baseUrl: string;
  healthy: boolean;
  auth: string;
  liveGstinProvider: string | null;
  registries: { registry: string; name: string; file: string; dataset: string; version: string; records: number; mode: string; endpoint: string | null }[];
}

export interface GatewayCall {
  id: string;
  bidId: string | null;
  source: string;
  registry: string;
  identifier?: string | null;
  mode: string;
  method: string;
  url: string;
  requestBody: unknown;
  httpStatus: number | null;
  responseBody: unknown;
  latencyMs: number | null;
  at: string;
  outcome: string | null;
}

export interface GstinProviderStatus {
  provider: string;
  configured: boolean;
  cacheDays: number;
  cachedAnswers: number;
  usage: { ok: boolean; credits_used?: number; total_calls?: number; code?: string | null; message?: string } | null;
}

const BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const SESSION_KEY = 'csap.api-session.v1';

export interface ApiSession {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const sessionStore = {
  get(): ApiSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as ApiSession) : null;
    } catch {
      return null;
    }
  },
  set(s: ApiSession | null) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch {
      /* storage unavailable */
    }
  },
};

/** The Supabase user id (JWT `sub`) of the current session. */
export const sessionUserId = (s: ApiSession | null): string | null => {
  if (!s) return null;
  try {
    const payload = JSON.parse(atob(s.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
};

async function raw(path: string, init: RequestInit = {}, token?: string): Promise<Response> {
  try {
    return await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the CSAP server. Check that the backend is running (npm run dev:backend).', 'NETWORK');
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) {
    throw new ApiError(res.status, body.message ?? `Request failed (${res.status}).`, body.code);
  }
  return body.data as T;
}

let refreshing: Promise<ApiSession | null> | null = null;
async function refreshSession(): Promise<ApiSession | null> {
  const current = sessionStore.get();
  if (!current) return null;
  refreshing ??= raw('/api/auth/refresh', { method: 'POST', body: JSON.stringify({ refreshToken: current.refreshToken }) })
    .then((res) => parse<ApiSession>(res))
    .then((s) => {
      sessionStore.set(s);
      return s;
    })
    .catch(() => {
      sessionStore.set(null);
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Authenticated request; retries once after refreshing an expired token. */
/** Calls that need no officer session (the simulated GeM portal is used by bidders). */
export async function publicCall<T>(path: string, init: RequestInit = {}): Promise<T> {
  return parse<T>(await raw(path, init));
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = sessionStore.get();
  if (!session) throw new ApiError(401, 'Sign in required.', 'UNAUTHENTICATED');
  let res = await raw(path, init, session.accessToken);
  if (res.status === 401) {
    const renewed = await refreshSession();
    if (!renewed) throw new ApiError(401, 'Your session has expired. Please sign in again.', 'UNAUTHENTICATED');
    res = await raw(path, init, renewed.accessToken);
  }
  return parse<T>(res);
}

export const api = {
  login: async (identifier: string, password: string) =>
    parse<ApiSession>(await raw('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) })),
  workspace: () => call<Database>('/api/workspace'),
  submitDecision: (body: { bidId: string; decision: DecisionType; reason: string; remarks: string }) =>
    call<{ id: string }>('/api/decisions', { method: 'POST', body: JSON.stringify(body) }),
  runVerification: (bidId: string) => call<{ bidId: string; startedAt: string }>('/api/verification/run', { method: 'POST', body: JSON.stringify({ bidId }) }),
  documentRuns: (bidId: string) => call<DocumentVerificationRun[]>(`/api/bids/${bidId}/document-verifications`),
  startDocumentRun: (
    bidId: string,
    source: { source: 'bid_package' } | { source: 'sample'; fileName: string } | { source: 'upload'; fileName: string; mimeType: string; contentBase64: string },
  ) => call<DocumentVerificationRun>(`/api/bids/${bidId}/document-verifications`, { method: 'POST', body: JSON.stringify(source) }),
  documentSamples: () => call<string[]>('/api/document-samples'),
  portalChecks: (bidId: string) => call<PortalVerification[]>(`/api/bids/${bidId}/portal-checks`),
  startPortalChecks: (bidId: string) => call<{ runId: string; registries: number }>(`/api/bids/${bidId}/portal-checks`, { method: 'POST' }),
  reports: (bidId: string) => call<EvaluationReport[]>(`/api/bids/${bidId}/reports`),
  generateReport: (bidId: string) => call<EvaluationReport>(`/api/bids/${bidId}/reports`, { method: 'POST' }),
  report: (id: string) => call<EvaluationReport & { verified: boolean }>(`/api/reports/${id}`),
  allReports: () => call<ReportSummary[]>('/api/reports'),
  acceptReevaluation: (id: string, note?: string, password?: string) => call<{ bidId: string; status: string }>(`/api/reevaluations/${id}/accept`, { method: 'POST', body: JSON.stringify({ note, password }) }),
  declineReevaluation: (id: string, note: string) => call<{ bidId: string; status: string }>(`/api/reevaluations/${id}/decline`, { method: 'POST', body: JSON.stringify({ note }) }),
  sendReportToGem: (id: string) => call<EvaluationReport & { gemStatus: string }>(`/api/reports/${id}/send-to-gem`, { method: 'POST' }),
  assistant: (b: { message: string; path: string; bidId?: string; history: { role: string; content: string }[] }) =>
    call<{ answer: string; actions: { label: string; path: string }[]; model: string; latencyMs: number }>('/api/assistant', { method: 'POST', body: JSON.stringify(b) }),
  verifyAudit: (simulateSeq?: number) =>
    call<{ intact: boolean; checked: number; brokenAt: number | null; reason: string | null; lastHash: string; simulated: number | null }>(
      `/api/audit/verify${simulateSeq ? `?simulate=${simulateSeq}` : ''}`,
    ),
  recommendationDraft: (bidId: string) => call<RecommendationDraft | null>(`/api/bids/${bidId}/recommendation/draft`),
  draftRecommendation: (bidId: string) => call<RecommendationDraft>(`/api/bids/${bidId}/recommendation/draft`, { method: 'POST' }),
  gateway: () => call<GatewayOverview>('/api/gateway'),
  gatewayCalls: () => call<GatewayCall[]>('/api/gateway/calls'),
  gatewayRecords: (registry: string) => call<{ registry: string; file: string; dataset: string; version: string; records: Record<string, unknown>[] }>(`/api/gateway/${registry}/records`),
  gatewayTry: (registry: string, identifier: string) =>
    call<{ request: { method: string; url: string; headers: Record<string, string>; body: unknown; sentAt: string }; response: { httpStatus: number; body: unknown; latencyMs: number } }>(
      `/api/gateway/${registry}/try`,
      { method: 'POST', body: JSON.stringify({ identifier }) },
    ),
  gstinProvider: () => call<GstinProviderStatus>('/api/gstin/provider'),
  gstinLive: (gstin: string) => call<RegistryAnswer>('/api/gstin/live', { method: 'POST', body: JSON.stringify({ gstin }) }),
  deleteUpload: (runId: string) => call<DocumentVerificationRun>(`/api/document-verifications/${runId}/file`, { method: 'DELETE' }),
  documentBatches: (bidId: string) => call<DocumentBatch[]>(`/api/bids/${bidId}/document-batches`),
  batchRuns: (batchId: string) => call<DocumentVerificationRun[]>(`/api/document-batches/${batchId}/runs`),
  startDocumentBatch: (bidId: string) =>
    call<{ batch: DocumentBatch; runs: DocumentVerificationRun[] }>(`/api/bids/${bidId}/document-batches`, { method: 'POST' }),
  documentUrl: (path: string) => call<{ url: string }>(`/api/documents/url?path=${encodeURIComponent(path)}`),
};
