-- Phase 5: bids arriving from the (simulated) GeM portal.
--  * tenders can be open for bids;
--  * gem_bid_submissions is the GeM side's own record of a submission (separate from CSAP's tables);
--  * bids remember where they came from;
--  * automated steps (GeM intake) may run without an officer, so initiated_by becomes optional.

alter type tender_status_enum add value if not exists 'OPEN_FOR_BIDS';

create table if not exists gem_bid_submissions (
  id uuid primary key default gen_random_uuid(),
  gem_bid_no text not null unique,
  tender_id text not null references tenders(id),
  company jsonb not null,      -- what the bidder entered: name, PAN, GSTIN, Udyam, CIN, EPFO, ESIC, address …
  declared jsonb not null,     -- turnover per year, local content %, EMD instrument / amount / reference / bank
  documents jsonb not null,    -- [{requirementCode, path, fileName, mimeType, sizeBytes}]
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'DELIVERED', 'DELIVERY_FAILED')),
  csap_bid_id text,
  delivery jsonb,              -- webhook request (signed) and CSAP's response
  submitted_at timestamptz not null default now(),
  delivered_at timestamptz
);
alter table gem_bid_submissions enable row level security;
create policy gem_bid_submissions_select on gem_bid_submissions for select to authenticated using (true);

alter table bids add column if not exists source text not null default 'CSAP' check (source in ('CSAP', 'GEM'));
alter table bids add column if not exists gem_bid_no text;

alter table document_batches alter column initiated_by drop not null;
alter table document_verification_runs alter column initiated_by drop not null;
alter table ai_verification_runs alter column initiated_by drop not null;
