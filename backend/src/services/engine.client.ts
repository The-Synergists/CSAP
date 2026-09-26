import type { EnginePayload, EngineResult } from '../../../shared/domain/enginePayload.js';
import { config } from '../config/env.js';
import { HttpError } from '../lib/http.js';

const TIMEOUT_MS = 15_000;

/**
 * Calls the Python verification engine. There is deliberately NO fallback result: if the
 * engine is unreachable the run fails visibly rather than reporting checks as passed.
 */
export async function verifyWithEngine(payload: EnginePayload): Promise<EngineResult> {
  let res: Response;
  try {
    res = await fetch(`${config.aiEngineUrl}/api/v1/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-engine-key': config.engineApiKey },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    throw new HttpError(503, `Verification engine is not reachable at ${config.aiEngineUrl}. No checks were run.`, 'ENGINE_UNAVAILABLE');
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new HttpError(502, `Verification engine returned ${res.status}. ${text.slice(0, 300)}`, 'ENGINE_ERROR');
  }
  return (await res.json()) as EngineResult;
}

export interface EngineHealth {
  ok: boolean;
  version?: string;
  nvidia?: { ocr: { model: string; configured: boolean }; extraction: { model: string; configured: boolean } };
}

export async function engineHealth(): Promise<EngineHealth> {
  try {
    const res = await fetch(`${config.aiEngineUrl}/api/v1/health`, { signal: AbortSignal.timeout(3000) });
    const body = (await res.json()) as { engineVersion?: string; nvidia?: EngineHealth['nvidia'] };
    return { ok: res.ok, version: body.engineVersion, nvidia: body.nvidia };
  } catch {
    return { ok: false };
  }
}
