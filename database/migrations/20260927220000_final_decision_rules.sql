-- Evaluation workflow rules, enforced by the database itself:
--  1. A final decision (APPROVE or REJECT) closes the bid. No further decision can be recorded
--     unless the officer accepted a re-evaluation request made after that decision.
--  2. At most one evaluation report per decision.
--  3. Re-evaluation requests (a bidder's clarification response or re-evaluation request, with any
--     replacement documents) are kept as their own records; accepting one reopens the bid.

create table if not exists reevaluation_requests (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  gem_bid_no text,
  kind text not null check (kind in ('CLARIFICATION_RESPONSE', 'REEVALUATION')),
  reason text not null,
  documents jsonb not null default '[]',   -- [{requirementCode, name, path, fileName, mimeType, sizeBytes}]
  status text not null default 'OPEN' check (status in ('OPEN', 'ACCEPTED', 'DECLINED')),
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references profiles(id),
  decision_note text
);
create index if not exists reevaluation_requests_bid_idx on reevaluation_requests (bid_id, requested_at desc);
alter table reevaluation_requests enable row level security;
create policy reevaluation_requests_select on reevaluation_requests for select to authenticated using (true);
create policy reevaluation_requests_update on reevaluation_requests for update to authenticated using (true) with check (decided_by = auth.uid());
alter table reevaluation_requests replica identity full;
alter publication supabase_realtime add table reevaluation_requests;

-- True when the bid's latest decision is final and no accepted re-evaluation came after it.
create or replace function bid_is_final(p_bid_id text) returns boolean
language sql stable security definer set search_path = public as $$
  with latest as (
    select decision, created_at from officer_decisions where bid_id = p_bid_id order by created_at desc limit 1
  )
  select coalesce((
    select l.decision::text in ('APPROVE', 'REJECT')
       and not exists (
         select 1 from reevaluation_requests r
         where r.bid_id = p_bid_id and r.status = 'ACCEPTED' and r.decided_at > l.created_at)
    from latest l), false);
$$;
grant execute on function bid_is_final(text) to authenticated, service_role;

create or replace function officer_decisions_final_guard() returns trigger
language plpgsql as $$
begin
  if bid_is_final(new.bid_id) then
    raise exception 'Bid % has a final decision. It can be decided again only after the officer accepts a re-evaluation request.', new.bid_id
      using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists officer_decisions_final_guard on officer_decisions;
create trigger officer_decisions_final_guard before insert on officer_decisions for each row execute function officer_decisions_final_guard();

-- One evaluation report per decision.
alter table evaluation_reports add column if not exists decision_id uuid references officer_decisions(id) on delete cascade;
create unique index if not exists evaluation_reports_decision_key on evaluation_reports (decision_id) where decision_id is not null;

-- GeM side: the bidder's responses / re-evaluation requests, as GeM recorded them.
alter table gem_bid_submissions add column if not exists responses jsonb not null default '[]';
