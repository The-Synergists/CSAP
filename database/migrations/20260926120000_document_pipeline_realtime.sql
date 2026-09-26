-- Document verification pipeline (NVIDIA OCR → NVIDIA extraction → external PAN API),
-- document storage, and Realtime.
--
-- document_verification_runs holds one row per pipeline run. Each stage writes its result
-- into its own column as soon as it finishes, and the row is published over Supabase
-- Realtime, so the officer's screen shows every stage live.

-- ------------------------------------------------------------------ document storage
alter table bid_documents add column if not exists storage_path text;
alter table bid_documents add column if not exists mime_type text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bid-documents', 'bid-documents', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- ------------------------------------------------------------------ pipeline runs
create table if not exists document_verification_runs (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  bid_document_id uuid references bid_documents(id) on delete set null,
  document_type text not null default 'PAN' check (document_type in ('PAN')),
  initiated_by uuid not null references profiles(id),
  status text not null default 'QUEUED'
    check (status in ('QUEUED', 'OCR_RUNNING', 'EXTRACTING', 'CALLING_API', 'COMPLETED', 'FAILED')),
  -- { path, fileName, mimeType, sizeBytes, sha256, source: 'bid_package' | 'officer_upload' }
  document jsonb not null,
  -- Stage 1: NVIDIA Nemotron OCR V2 { model, endpoint, latencyMs, text, blocks, meanConfidence }
  ocr_result jsonb,
  -- Stage 2: NVIDIA extraction model { model, latencyMs, fields, grounding, warnings, rawOutput }
  extraction_result jsonb,
  -- Stage 3: request CSAP sent to the PAN verification API, and its response
  api_request jsonb,
  api_response jsonb,
  -- Stage 4: CSAP comparison of document data vs API data vs bidder record
  comparison jsonb,
  verdict text check (verdict in ('VERIFIED', 'NAME_MISMATCH', 'PAN_MISMATCH', 'PAN_INVALID', 'PAN_NOT_FOUND', 'ERROR')),
  error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists document_verification_runs_bid_idx on document_verification_runs (bid_id, started_at desc);

create trigger document_verification_runs_set_updated_at before update on document_verification_runs
  for each row execute function set_updated_at();

-- ------------------------------------------------------------------ external API call log
create table if not exists external_api_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references document_verification_runs(id) on delete cascade,
  bid_id text references bids(id) on delete cascade,
  api_name text not null,
  method text not null,
  url text not null,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  latency_ms integer,
  called_at timestamptz not null default now()
);
create index if not exists external_api_calls_run_idx on external_api_calls (run_id);

-- ------------------------------------------------------------------ RLS
alter table document_verification_runs enable row level security;
alter table external_api_calls enable row level security;

create policy document_verification_runs_select on document_verification_runs for select to authenticated using (true);
create policy document_verification_runs_insert on document_verification_runs for insert to authenticated
  with check (initiated_by = (select auth.uid()));
create policy document_verification_runs_update on document_verification_runs for update to authenticated
  using (true) with check (true);

create policy external_api_calls_select on external_api_calls for select to authenticated using (true);
create policy external_api_calls_insert on external_api_calls for insert to authenticated with check (true);

-- ------------------------------------------------------------------ Realtime
do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['ai_verification_runs', 'document_verification_runs', 'officer_decisions', 'audit_events'] loop
    if not exists (
      select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
