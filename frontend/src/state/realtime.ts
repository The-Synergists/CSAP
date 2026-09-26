// Supabase Realtime (postgres_changes). Uses the public anon key plus the officer's own
// access token, so Row Level Security decides which changes this browser may receive.
// All reads and writes still go through the backend; Realtime only signals "something changed".

import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { sessionStore } from './api';

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

export const realtimeAvailable = (): boolean => !!URL && !!ANON;

const getClient = (): SupabaseClient | null => {
  if (!realtimeAvailable()) return null;
  // `accessToken` makes every Realtime join/heartbeat use the officer's current JWT (read
  // fresh each time, so refreshed tokens apply). Without it supabase-js falls back to the anon
  // key on re-join and RLS then (correctly) stops delivering rows.
  client ??= createClient(URL!, ANON!, { accessToken: async () => sessionStore.get()?.accessToken ?? ANON! });
  return client;
};

export interface TableSubscription {
  table: string;
  /** PostgREST-style filter, e.g. "bid_id=eq.BID-001". */
  filter?: string;
}

/**
 * Subscribes to INSERT/UPDATE/DELETE on the given tables. Returns an unsubscribe function
 * (a no-op when Realtime is not configured). `onStatus` reports whether the channel is live.
 */
export function subscribeToTables(
  name: string,
  tables: TableSubscription[],
  onChange: (table: string, row: Record<string, unknown>) => void,
  onStatus?: (live: boolean) => void,
): () => void {
  const sb = getClient();
  if (!sb) {
    onStatus?.(false);
    return () => {};
  }
  let channel: RealtimeChannel | null = null;
  let cancelled = false;
  // realtime-js only fetches the token on its first setAuth(); without this await the first
  // join would register as `anon` and RLS would (correctly) deliver nothing.
  void sb.realtime.setAuth().then(() => {
    if (cancelled) return;
    let ch = sb.channel(`${name}-${Math.random().toString(36).slice(2, 8)}`);
    for (const t of tables) {
      ch = ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: t.table, ...(t.filter ? { filter: t.filter } : {}) },
        (payload) => onChange(t.table, (payload.new && Object.keys(payload.new).length ? payload.new : payload.old) as Record<string, unknown>),
      );
    }
    ch.subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
    channel = ch;
  });
  return () => {
    cancelled = true;
    if (channel) void sb.removeChannel(channel);
  };
}
