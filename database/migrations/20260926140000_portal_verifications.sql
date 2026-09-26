-- Government portal verification (Phase 1): bidder registry identifiers and one row per
-- registry check. Rows are inserted as each registry answers and streamed over Realtime.

alter table companies add column if not exists cin text;
alter table companies add column if not exists epfo_code text;
alter table companies add column if not exists esic_code text;
alter table companies add column if not exists dpiit_number text;
alter table companies add column if not exists nsic_number text;

create table if not exists portal_verifications (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  bid_id text not null references bids(id) on delete cascade,
  registry text not null check (registry in ('PAN','GSTN','UDYAM','MCA21','EPFO','ESIC','STARTUP_INDIA','NSIC','DEBARMENT','DIGILOCKER')),
  mode text not null check (mode in ('SIMULATED','LIVE_PROVIDER')),
  identifier text,
  status text not null check (status in ('VERIFIED','REVIEW','FAILED','NOT_FOUND','NOT_APPLICABLE','UNAVAILABLE')),
  summary text not null,
  facts jsonb not null default '[]',     -- [{label, value}] key facts returned by the registry
  checks jsonb not null default '[]',    -- [{label, expected, actual, ok}] what CSAP compared
  request jsonb,                         -- {method, url, body}
  response jsonb,                        -- {httpStatus, body}
  latency_ms integer,
  initiated_by uuid references profiles(id),
  checked_at timestamptz not null default now()
);
create index if not exists portal_verifications_bid_idx on portal_verifications (bid_id, checked_at desc);

alter table portal_verifications enable row level security;
create policy portal_verifications_select on portal_verifications for select to authenticated using (true);
create policy portal_verifications_insert on portal_verifications for insert to authenticated
  with check (initiated_by = (select auth.uid()) or initiated_by is null);

alter table portal_verifications replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'portal_verifications') then
    alter publication supabase_realtime add table public.portal_verifications;
  end if;
end $$;
