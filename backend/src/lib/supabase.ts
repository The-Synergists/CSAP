import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

/** Bypasses RLS. Only for login lookups — never for work done on an officer's behalf. */
export const serviceClient: SupabaseClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, noSession);

/** Unauthenticated client used to exchange credentials for a session. */
export const anonClient = (): SupabaseClient => createClient(config.supabaseUrl, config.supabaseAnonKey, noSession);

/**
 * Acts as the signed-in officer: every query runs under their JWT, so Postgres RLS and
 * auth.uid() apply exactly as they would for the officer directly (e.g. decisions can only
 * be recorded under the caller's own identity).
 */
export const userClient = (accessToken: string): SupabaseClient =>
  createClient(config.supabaseUrl, config.supabaseAnonKey, {
    ...noSession,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
