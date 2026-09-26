-- Phase 3: document intelligence for every document in a bid package.
-- document_verification_runs now covers every document type (one row per document read), grouped
-- into a document_batches row per "read all documents" run. The batch also stores the
-- cross-document consistency check (name, PAN, GSTIN, Udyam number, EPFO code across documents).

alter table document_verification_runs drop constraint if exists document_verification_runs_document_type_check;
alter table document_verification_runs add constraint document_verification_runs_document_type_check
  check (document_type in ('PAN', 'GST_CERTIFICATE', 'UDYAM_CERTIFICATE', 'FINANCIAL_STATEMENTS', 'MAKE_IN_INDIA',
                           'OEM_AUTHORIZATION', 'EMD', 'EPFO_ESIC', 'PAST_PERFORMANCE', 'TEST_REPORT', 'AFFIDAVIT', 'LAND_BORDER'));

alter table document_verification_runs drop constraint if exists document_verification_runs_verdict_check;
alter table document_verification_runs add constraint document_verification_runs_verdict_check
  check (verdict in ('VERIFIED', 'NAME_MISMATCH', 'PAN_MISMATCH', 'PAN_INVALID', 'PAN_NOT_FOUND', 'CONSISTENT', 'DISCREPANCY', 'ERROR'));

create table if not exists document_batches (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  initiated_by uuid not null references profiles(id),
  status text not null default 'RUNNING' check (status in ('RUNNING', 'COMPLETED', 'FAILED')),
  total integer not null,
  -- [{field, values: [{source, documentId?, value}], result: MATCH | MISMATCH | NOT_AVAILABLE, note}]
  consistency jsonb,
  summary text,
  error text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists document_batches_bid_idx on document_batches (bid_id, started_at desc);

alter table document_verification_runs add column if not exists batch_id uuid references document_batches(id) on delete cascade;
create index if not exists document_verification_runs_batch_idx on document_verification_runs (batch_id);

alter table document_batches enable row level security;
create policy document_batches_select on document_batches for select to authenticated using (true);
create policy document_batches_insert on document_batches for insert to authenticated with check (initiated_by = auth.uid());
create policy document_batches_update on document_batches for update to authenticated using (initiated_by = auth.uid());

alter table document_batches replica identity full;
alter publication supabase_realtime add table document_batches;
