-- Phase 6: evaluation reports (evidence pack) and their delivery to GeM.
-- A report is a frozen snapshot of everything CSAP knows about a bid at the time it was generated,
-- with a SHA-256 fingerprint of that snapshot. GeM keeps what CSAP sent back to the bidder.

create table if not exists evaluation_reports (
  id uuid primary key default gen_random_uuid(),
  report_no text not null unique,
  bid_id text not null references bids(id) on delete cascade,
  content jsonb not null,
  sha256 text not null,
  generated_by uuid references profiles(id),
  generated_by_name text not null,
  generated_at timestamptz not null default now(),
  sent_to_gem_at timestamptz,
  gem_response jsonb
);
create index if not exists evaluation_reports_bid_idx on evaluation_reports (bid_id, generated_at desc);

alter table evaluation_reports enable row level security;
create policy evaluation_reports_select on evaluation_reports for select to authenticated using (true);
create policy evaluation_reports_insert on evaluation_reports for insert to authenticated with check (generated_by = auth.uid());
create policy evaluation_reports_update on evaluation_reports for update to authenticated using (true) with check (true);

-- What the buyer (CPCL, through CSAP) told the bidder on GeM.
alter table gem_bid_submissions add column if not exists evaluation_status text not null default 'UNDER_EVALUATION';
alter table gem_bid_submissions add column if not exists evaluation jsonb;
alter table gem_bid_submissions add column if not exists evaluation_received_at timestamptz;
