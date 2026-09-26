-- Phase 2: cache of answers from the live GSTIN provider (gstinapi.in). Each found or
-- not-found lookup costs a provider credit, so every charged answer is kept here and reused
-- (GSTIN_CACHE_DAYS). Only the backend's service role reads or writes it: RLS is enabled
-- with no policies for other roles.

create table if not exists gstin_live_cache (
  gstin text not null,
  endpoint text not null,                -- 'profile' or 'returns:<FY>'
  http_status integer not null,          -- 200 found, 404 not found (both charged)
  body jsonb not null,
  fetched_at timestamptz not null default now(),
  primary key (gstin, endpoint)
);

alter table gstin_live_cache enable row level security;
