-- Phase 6: tamper-evident audit trail.
--
-- Every audit event is sealed with   entry_hash = SHA-256(seq | prev_hash | time | bid | tender |
-- actor | role | action | summary | details)   where prev_hash is the previous event's entry_hash.
-- Editing or deleting any earlier event changes its hash and breaks every link after it, and
-- verify_audit_chain() reports the first event where the chain no longer matches.
-- Events cannot be updated; only the service role (demo reset) may delete, after which the
-- chain is re-sealed.

create extension if not exists pgcrypto with schema extensions;

create sequence if not exists audit_events_seq;
alter table audit_events add column if not exists seq bigint;
alter table audit_events add column if not exists prev_hash text;
alter table audit_events add column if not exists entry_hash text;

create or replace function audit_event_digest(e audit_events) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(
    concat_ws('|',
      e.seq::text,
      e.prev_hash,
      to_char(e.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
      coalesce(e.bid_id, ''),
      coalesce(e.tender_id, ''),
      coalesce(e.actor_profile_id::text, ''),
      e.actor_display_name,
      e.actor_role,
      e.action_type::text,
      e.summary,
      e.details),
    'sha256'), 'hex');
$$;

-- Seal on insert (serialised, so the chain has a single order).
create or replace function audit_events_seal() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare last_hash text;
begin
  perform pg_advisory_xact_lock(hashtext('csap.audit_chain'));
  select entry_hash into last_hash from audit_events where seq is not null order by seq desc limit 1;
  new.seq := nextval('audit_events_seq');
  new.prev_hash := coalesce(last_hash, repeat('0', 64));
  new.created_at := coalesce(new.created_at, now());
  new.entry_hash := audit_event_digest(new);
  return new;
end $$;

drop trigger if exists audit_events_seal on audit_events;
create trigger audit_events_seal before insert on audit_events for each row execute function audit_events_seal();

-- Append-only: no updates; deletes only for the service role (demo reset), except while re-sealing.
create or replace function audit_events_protect() returns trigger
language plpgsql as $$
begin
  if coalesce(current_setting('csap.audit_reseal', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Audit events are append-only and cannot be changed.';
  end if;
  if current_user not in ('postgres', 'service_role') and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Audit events cannot be deleted.';
  end if;
  return old;
end $$;

drop trigger if exists audit_events_protect on audit_events;
create trigger audit_events_protect before update or delete on audit_events for each row execute function audit_events_protect();

-- Re-seal the whole chain in sequence order (used after a demo reset removed events).
create or replace function reseal_audit_chain() returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare r audit_events; prev text := repeat('0', 64); n bigint := 0;
begin
  perform pg_advisory_xact_lock(hashtext('csap.audit_chain'));
  perform set_config('csap.audit_reseal', 'on', true);
  for r in select * from audit_events order by seq loop
    r.prev_hash := prev;
    r.entry_hash := audit_event_digest(r);
    update audit_events set prev_hash = r.prev_hash, entry_hash = r.entry_hash where id = r.id;
    prev := r.entry_hash;
    n := n + 1;
  end loop;
  perform set_config('csap.audit_reseal', 'off', true);
  return n;
end $$;
revoke execute on function reseal_audit_chain() from public, anon, authenticated;

-- Recompute every link. p_simulate_seq: pretend that event's details were altered (in memory only)
-- to demonstrate that tampering is detected; nothing in the table changes.
create or replace function verify_audit_chain(p_simulate_seq bigint default null)
returns table (intact boolean, checked bigint, broken_at bigint, reason text, last_hash text)
language plpgsql stable security definer set search_path = public, extensions as $$
declare r audit_events; prev text := repeat('0', 64); n bigint := 0; expected text;
begin
  for r in select * from audit_events order by seq loop
    n := n + 1;
    if r.prev_hash is distinct from prev then
      return query select false, n, r.seq, 'The link to the previous event does not match (an earlier event was changed or removed).', prev;
      return;
    end if;
    if r.seq = p_simulate_seq then
      r.details := r.details || ' [altered]';
    end if;
    expected := audit_event_digest(r);
    if expected is distinct from r.entry_hash then
      return query select false, n, r.seq, 'This event''s content no longer matches its fingerprint.', prev;
      return;
    end if;
    prev := r.entry_hash;
  end loop;
  return query select true, n, null::bigint, null::text, prev;
end $$;
grant execute on function verify_audit_chain(bigint) to authenticated;

-- Backfill: number existing events in time order, then seal them.
do $$
begin
  perform set_config('csap.audit_reseal', 'on', true);
  update audit_events a set seq = s.n
    from (select id, row_number() over (order by created_at, id) as n from audit_events) s
    where a.id = s.id and a.seq is null;
  perform setval('audit_events_seq', greatest((select coalesce(max(seq), 0) from audit_events), 1));
  perform set_config('csap.audit_reseal', 'off', true);
end $$;
select reseal_audit_chain();

create unique index if not exists audit_events_seq_key on audit_events (seq);
