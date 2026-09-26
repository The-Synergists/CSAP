import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const required = (...names: string[]): string => {
  for (const n of names) if (process.env[n]) return process.env[n] as string;
  throw new Error(`Missing environment variable ${names[0]} (see backend/.env.example)`);
};

// On Vercel the engine and PAN API are Python functions in the same project, reached through
// the project's production domain (set automatically by Vercel).
const vercelBase = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;

export const config = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseUrl: required('SUPABASE_URL', 'VITE_SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  aiEngineUrl: process.env.AI_ENGINE_URL ?? (vercelBase ? `${vercelBase}/api/engine` : 'http://localhost:8000'),
  /** Shared secret the engine requires on every call (protects the NVIDIA-backed endpoints). */
  engineApiKey: process.env.ENGINE_API_KEY ?? '',
  /** Government Gateway (gov_gateway/): simulated registries, external from CSAP's point of view. */
  govGatewayUrl: process.env.GOV_GATEWAY_URL ?? process.env.PAN_API_URL ?? (vercelBase ? `${vercelBase}/api/gov` : 'http://localhost:8100'),
  govGatewayKey: process.env.GOV_GATEWAY_KEY ?? process.env.PAN_API_KEY ?? 'csap-demo-pan-key',
  /** Live GSTIN provider (gstinapi.in). Empty key = GSTN stays simulated only. */
  gstinProviderUrl: (process.env.GSTIN_PROVIDER_URL ?? 'https://www.gstinapi.in').replace(/\/+$/, ''),
  gstinProviderKey: process.env.GSTIN_PROVIDER_KEY ?? '',
  /** Backup provider (gstinapi.com), used only when the primary cannot answer (no credits, outage). */
  gstinFallbackUrl: (process.env.GSTIN_FALLBACK_URL ?? 'https://gstinapi.com/api').replace(/\/+$/, ''),
  gstinFallbackKey: process.env.GSTIN_FALLBACK_KEY ?? '',
  /** Live answers are reused for this many days so repeated checks spend no credits. */
  gstinCacheDays: Number(process.env.GSTIN_CACHE_DAYS ?? 30),
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
};
