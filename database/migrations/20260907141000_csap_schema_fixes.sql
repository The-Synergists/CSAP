-- Fixes found by `supabase db advisors` after applying 20260907140000_csap_schema.sql
-- (the "check after applying" pass). Four real issues, all fixed here:

-- 1. ERROR: bid_status_v / tender_bid_stats_v ran with the view owner's
--    privileges instead of the querying user's, silently bypassing RLS on the
--    underlying tables (no actual data leak today since those tables' SELECT
--    policies are already open to any authenticated user, but wrong on
--    principle and would matter the moment RLS is ever tightened).
alter view bid_status_v set (security_invoker = true);
alter view tender_bid_stats_v set (security_invoker = true);

-- 2. WARN: set_updated_at() had no fixed search_path, leaving it open to
--    search_path hijacking (a malicious schema earlier in a caller's path
--    could shadow objects it references).
alter function set_updated_at() set search_path = public;

-- 3. WARN: handle_new_user() is SECURITY DEFINER and was, by default,
--    EXECUTE-able via RPC by anon/authenticated. It's only ever meant to run
--    as the auth.users insert trigger. It returns `trigger`, so Postgres
--    already refuses to run it outside a trigger context — but revoke the
--    grant explicitly instead of relying on that as the only guard.
revoke execute on function handle_new_user() from public, anon, authenticated;

-- 4. WARN (performance): auth.uid() in RLS policies gets re-evaluated per row;
--    wrapping it as (select auth.uid()) lets Postgres cache it once per query.
alter policy profiles_update_self on profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
alter policy officer_decisions_insert on officer_decisions
  with check (officer_profile_id = (select auth.uid()));
alter policy audit_events_insert on audit_events
  with check (actor_profile_id = (select auth.uid()) or actor_profile_id is null);
