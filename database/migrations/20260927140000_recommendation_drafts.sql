-- Phase 4: NVIDIA-drafted explanations of the (rule-based) recommendation. Each draft keeps the
-- sentences that passed CSAP's grounding check (with their citations) and the ones it removed,
-- so reviewers can see both.

create table if not exists recommendation_drafts (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  suggested_decision text not null,
  score integer not null,
  sentences jsonb not null,   -- [{text, citations: [EVD-003 | REQ-02 ...]}]
  dropped jsonb not null,     -- [{text, reason}]
  evidence jsonb not null,    -- [{id, text}] exactly what the model was given
  model text not null,
  latency_ms integer,
  raw_output text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists recommendation_drafts_bid_idx on recommendation_drafts (bid_id, created_at desc);

alter table recommendation_drafts enable row level security;
create policy recommendation_drafts_select on recommendation_drafts for select to authenticated using (true);
create policy recommendation_drafts_insert on recommendation_drafts for insert to authenticated with check (created_by = auth.uid());
