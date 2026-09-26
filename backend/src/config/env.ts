import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const required = (...names: string[]): string => {
  for (const n of names) if (process.env[n]) return process.env[n] as string;
  throw new Error(`Missing environment variable ${names[0]} (see backend/.env.example)`);
};

export const config = {
  port: Number(process.env.PORT ?? 5000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  supabaseUrl: required('SUPABASE_URL', 'VITE_SUPABASE_URL'),
  supabaseAnonKey: required('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  aiEngineUrl: process.env.AI_ENGINE_URL ?? 'http://localhost:8000',
  /** Shared secret the engine requires on every call (protects the NVIDIA-backed endpoints). */
  engineApiKey: process.env.ENGINE_API_KEY ?? '',
  /** Dummy PAN Verification API (pan_api/) — an external service from CSAP's point of view. */
  panApiUrl: process.env.PAN_API_URL ?? 'http://localhost:8100',
  panApiKey: process.env.PAN_API_KEY ?? 'csap-demo-pan-key',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
};
