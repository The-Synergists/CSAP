-- CSAP (Central Statutory Authentication Platform) — initial normalized schema.
-- See C:\Users\gurpj\.claude\plans\woolly-strolling-steele.md for the full design
-- rationale (why each table/relation exists, what was deliberately NOT normalized
-- and why). This file is organized: extensions -> enums -> tables -> indexes ->
-- triggers/functions -> views -> RLS.

create extension if not exists pgcrypto;

-- =========================================================================
-- ENUMS — one per closed TS union type in src/types/index.ts
-- =========================================================================

create type profile_role_enum as enum ('PROCUREMENT_OFFICER','ADMIN');
create type tender_status_enum as enum ('UNDER_EVALUATION','TECHNICAL_SCRUTINY','COMMERCIAL_EVALUATION','AWARDED','CANCELLED');
-- Mirrors BidderStatus (distinct from tender_status_enum — a bid's review state,
-- not the tender's lifecycle state). Values confirmed against actual mockData.ts usage.
create type bidder_status_enum as enum ('UNDER_REVIEW','RECOMMENDED_ACCEPT','RECOMMENDED_REJECT','CLARIFICATION_SEEKED','DISQUALIFIED');
create type requirement_category_enum as enum ('STATUTORY','FINANCIAL','TECHNICAL','EMD','POLICY');
create type risk_level_enum as enum ('LOW','MEDIUM','HIGH','CRITICAL');
create type verification_status_enum as enum ('VERIFIED','MANUAL_REVIEW','MISMATCH','PENDING','EXEMPTED');
create type document_ocr_status_enum as enum ('COMPLETED','PROCESSING','FAILED');
create type emd_instrument_type_enum as enum ('BANK_GUARANTEE','NEFT_RTGS','MSME_EXEMPTION','DEMAND_DRAFT');
create type emd_payment_status_enum as enum ('SUCCESSFUL','PENDING','FAILED','EXEMPTED');
create type emd_verification_result_enum as enum ('EMD_VERIFIED','EMD_AMOUNT_MISMATCH','INVALID_INSTRUMENT','EXEMPTION_CONFIRMED');
create type risk_factor_category_enum as enum ('STATUTORY','FINANCIAL','DOCUMENT','EMD','ELIGIBILITY','POLICY');
create type evidence_finding_type_enum as enum ('NON_COMPLIANCE','MANUAL_REVIEW','VERIFIED','AMBIGUITY');
create type evidence_resolution_status_enum as enum ('OPEN','CLARIFIED','OVERRIDDEN','RESOLVED');
create type officer_decision_type_enum as enum ('APPROVE','REJECT','REQUEST_CLARIFICATION','COMMITTEE_REVIEW');
create type audit_action_type_enum as enum ('SYSTEM_AI','OFFICER_ACTION','BIDDER_SUBMISSION','DOCUMENT_OCR');
create type recommendation_point_kind_enum as enum ('PRO','CON');

-- =========================================================================
-- IDENTITY
-- =========================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  designation text,
  organization text,
  badge_id text unique,
  role profile_role_enum not null default 'PROCUREMENT_OFFICER',
  created_at timestamptz not null default now()
);

-- =========================================================================
-- REFERENCE / MASTER DATA (no client write access — seed script / Studio only)
-- =========================================================================

create table companies (
  id uuid primary key default gen_random_uuid(),
  vendor_code text not null unique,
  company_name text not null,
  incorporation_date date not null,
  registered_address text not null,
  gstin text not null unique,
  pan text not null unique,
  udyam_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index companies_udyam_number_key on companies (udyam_number) where udyam_number is not null;

create table company_turnover (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  financial_year text not null,
  turnover_amount numeric(14,2) not null,
  unique (company_id, financial_year)
);
create index company_turnover_company_id_idx on company_turnover (company_id);

-- PK stays text (matches existing IDs like 'GEM/2026/CPCL/001') — this string is
-- used directly in routing/URLs throughout the frontend; a surrogate uuid would
-- ripple through every page for no normalization benefit.
create table tenders (
  id text primary key,
  title text not null,
  category text not null,
  division text not null,
  estimated_value numeric(16,2) not null,
  emd_amount numeric(14,2) not null,
  publish_date date not null,
  deadline_date date not null,
  technical_opening_date date not null,
  status tender_status_enum not null,
  description text not null,
  officer_in_charge text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- uuid PK: 'REQ-01' is only unique *within* a tender, not globally, so a bare-text
-- PK would collide across tenders.
create table tender_requirements (
  id uuid primary key default gen_random_uuid(),
  tender_id text not null references tenders(id) on delete cascade,
  display_code text not null,
  category requirement_category_enum not null,
  title text not null,
  criterion text not null,
  mandatory boolean not null default true,
  benchmark_value text,
  unique (tender_id, display_code)
);
create index tender_requirements_tender_id_idx on tender_requirements (tender_id);

-- =========================================================================
-- BID DOMAIN — bids.id also stays text ('BID-001'), same routing reason as tenders
-- =========================================================================

create table bids (
  id text primary key,
  tender_id text not null references tenders(id),
  company_id uuid not null references companies(id),
  -- Declared per tender submission (local-content % of what's being supplied for
  -- THIS bid), not a fixed company attribute — deliberately NOT on companies.
  make_in_india_percentage numeric(5,2) not null check (make_in_india_percentage between 0 and 100),
  overall_compliance_score smallint not null check (overall_compliance_score between 0 and 100),
  risk_level risk_level_enum not null,
  risk_score smallint not null check (risk_score between 0 and 100),
  primary_concern text,
  submission_timestamp timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
  -- No `status` column: derived from officer_decisions via bid_status_v (see below),
  -- so it can never drift from the decision it's supposedly based on.
);
create index bids_tender_id_idx on bids (tender_id);
create index bids_company_id_idx on bids (company_id);

-- Seeded before bid_documents/compliance_check_items/risk_factors since those
-- optionally FK into it.
create table evidence_items (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  display_code text not null,
  requirement_title text not null,
  finding_type evidence_finding_type_enum not null,
  ai_finding text not null,
  submitted_document_name text not null,
  document_snippet text not null,
  tender_clause_requirement text not null,
  verification_timestamp timestamptz not null,
  source text not null,
  resolution_status evidence_resolution_status_enum not null,
  unique (bid_id, display_code)
);
create index evidence_items_bid_id_idx on evidence_items (bid_id);

create table bid_documents (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  display_code text not null,
  name text not null,
  doc_type text not null,
  file_name text not null,
  file_size text not null,
  upload_timestamp timestamptz not null,
  ocr_status document_ocr_status_enum not null,
  verification_status verification_status_enum not null,
  status_message text,
  extracted_snippet text,
  -- Free text, not FK'd to tender_requirements: the source clause citations
  -- ("Clause 4.2 - Statutory Eligibility") don't map 1:1 to requirement rows.
  -- Forcing a join here would misrepresent data that doesn't actually line up.
  tender_clause_reference text,
  evidence_item_id uuid references evidence_items(id) on delete set null,
  unique (bid_id, display_code)
  -- hasDiscrepancy dropped: derived as (evidence_item_id is not null)
);
create index bid_documents_bid_id_idx on bid_documents (bid_id);

create table bid_emd (
  bid_id text primary key references bids(id) on delete cascade,
  required_amount numeric(14,2) not null,
  submitted_amount numeric(14,2) not null,
  instrument_type emd_instrument_type_enum not null,
  transaction_or_bg_no text not null,
  bank_name text not null,
  issuing_branch text,
  sfms_reference text,
  valid_until date,
  payment_date date not null,
  payment_status emd_payment_status_enum not null,
  bidder_match boolean not null,
  verification_result emd_verification_result_enum not null,
  officer_note text
);

-- No FK to tender_requirements: checked the seed data — BID-001 has 9 compliance
-- items against tender 001's 12 requirements (not 1:1), and category values here
-- ('Legal','Labour') don't exist in requirement_category_enum. A strict FK would
-- break seeding or silently mismatch, so requirement_name/category stay free text.
create table compliance_check_items (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  display_code text not null,
  requirement_name text not null,
  category text not null,
  status verification_status_enum not null,
  mandatory boolean not null,
  score_contribution smallint not null,
  notes text,
  evidence_item_id uuid references evidence_items(id) on delete set null,
  unique (bid_id, display_code)
);
create index compliance_check_items_bid_id_idx on compliance_check_items (bid_id);

create table risk_factors (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  display_code text,
  category risk_factor_category_enum not null,
  title text not null,
  level risk_level_enum not null,
  description text not null,
  impact_score smallint not null,
  evidence_item_id uuid references evidence_items(id) on delete set null
);
create index risk_factors_bid_id_idx on risk_factors (bid_id);

-- =========================================================================
-- AI / VERIFICATION (simulated gov-portal layer)
-- =========================================================================

create table ai_verification_runs (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  initiated_by uuid not null references profiles(id),
  status text not null default 'RUNNING' check (status in ('RUNNING','COMPLETED')),
  steps jsonb not null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_verification_runs_bid_id_idx on ai_verification_runs (bid_id);

-- portal_code/check_type are text+CHECK, not native enums: this is the one part
-- of the schema explicitly meant to grow when real portal integrations are added
-- later — extending a CHECK list is a one-line ALTER, a native enum is not.
-- bid_id is deliberately NOT stored here (transitive via ai_verification_run_id ->
-- ai_verification_runs.bid_id) — avoids a redundant, independently-updatable copy.
create table gov_portal_verification_log (
  id uuid primary key default gen_random_uuid(),
  ai_verification_run_id uuid not null references ai_verification_runs(id) on delete cascade,
  portal_code text not null check (portal_code in ('GSTN','MCA21','UDYAM','EPFO','ESIC','INCOME_TAX','CPPP_BLACKLIST','BANK_TREASURY_SFMS')),
  check_type text not null check (check_type in ('GSTIN_STATUS','PAN_VALIDATION','ITR_FILING_STATUS','UDYAM_STATUS','EPFO_ECR','ESIC_ECR','CPPP_BLACKLIST_CHECK','EMD_RECONCILIATION')),
  document_id uuid references bid_documents(id) on delete set null,
  requested_at timestamptz not null,
  responded_at timestamptz not null,
  request_payload jsonb not null,
  response_payload jsonb not null,
  result_status verification_status_enum not null,
  is_simulated boolean not null default true,
  simulation_note text not null default 'Simulated response — no live government portal integration in this prototype.'
);
create index gov_portal_verification_log_run_id_idx on gov_portal_verification_log (ai_verification_run_id);

-- Append-only: "current" recommendation = latest row per bid_id.
create table ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  ai_verification_run_id uuid references ai_verification_runs(id) on delete set null,
  summary text not null,
  details text not null,
  suggested_action officer_decision_type_enum not null,
  confidence smallint not null check (confidence between 0 and 100),
  created_at timestamptz not null default now()
);
create index ai_recommendations_bid_id_idx on ai_recommendations (bid_id);

-- Child rows instead of a text[] column for pros/cons — an array is a 1NF
-- repeating-group even though Postgres supports it; strict normalization was
-- explicitly requested.
create table ai_recommendation_points (
  id uuid primary key default gen_random_uuid(),
  ai_recommendation_id uuid not null references ai_recommendations(id) on delete cascade,
  kind recommendation_point_kind_enum not null,
  point_text text not null,
  sort_order smallint not null default 0
);
create index ai_recommendation_points_rec_id_idx on ai_recommendation_points (ai_recommendation_id);

-- =========================================================================
-- OFFICER ACTIONS / AUDIT — append-only, no UPDATE/DELETE ever (see RLS below)
-- =========================================================================

-- A real decision HISTORY, not an overwritten field: a clarification request
-- followed later by an approval is two rows, not a lost value.
create table officer_decisions (
  id uuid primary key default gen_random_uuid(),
  bid_id text not null references bids(id) on delete cascade,
  tender_id text not null references tenders(id),
  officer_profile_id uuid not null references profiles(id),
  decision officer_decision_type_enum not null,
  remarks text not null,
  justification_reason text not null,
  conditions_applied text[],
  dsc_signed boolean not null default false,
  dsc_token_id text,
  created_at timestamptz not null default now()
);
create index officer_decisions_bid_id_idx on officer_decisions (bid_id);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  bid_id text references bids(id) on delete set null,
  tender_id text references tenders(id) on delete set null,
  actor_profile_id uuid references profiles(id) on delete set null,
  actor_display_name text not null,
  actor_role text not null,
  action_type audit_action_type_enum not null,
  summary text not null,
  details text not null,
  hash text not null default ('REF-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  created_at timestamptz not null default now()
);
create index audit_events_bid_id_idx on audit_events (bid_id);
create index audit_events_tender_id_idx on audit_events (tender_id);

-- =========================================================================
-- updated_at maintenance
-- =========================================================================

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger companies_set_updated_at before update on companies
  for each row execute function set_updated_at();
create trigger tenders_set_updated_at before update on tenders
  for each row execute function set_updated_at();
create trigger bids_set_updated_at before update on bids
  for each row execute function set_updated_at();

-- =========================================================================
-- VIEWS — replace stored aggregates that were dropped from tenders/bids
-- =========================================================================

-- Defaults to UNDER_REVIEW (matches bidder_status_enum, NOT tender_status_enum)
-- when no decision exists yet — matches every seeded bid's pre-decision state.
create or replace view bid_status_v as
select
  b.id as bid_id,
  coalesce(
    (
      select (case od.decision
        when 'APPROVE' then 'RECOMMENDED_ACCEPT'
        when 'REJECT' then 'DISQUALIFIED'
        when 'REQUEST_CLARIFICATION' then 'CLARIFICATION_SEEKED'
        when 'COMMITTEE_REVIEW' then 'UNDER_REVIEW'
      end)::bidder_status_enum
      from officer_decisions od
      where od.bid_id = b.id
      order by od.created_at desc
      limit 1
    ),
    'UNDER_REVIEW'::bidder_status_enum
  ) as status,
  (
    select od.created_at
    from officer_decisions od
    where od.bid_id = b.id
    order by od.created_at desc
    limit 1
  ) as decided_at
from bids b;

-- Note: tenders 002-004 will show bids_received_count = 0 here, even though the
-- old mock data displayed nonzero counts for them — there were never any actual
-- bid records for those tenders in mockBids, only tender 001 has real seeded
-- bids. This view fixes that pre-existing inconsistency, it isn't a regression.
create or replace view tender_bid_stats_v as
select
  t.id as tender_id,
  count(b.id) as bids_received_count,
  coalesce(round(avg(b.overall_compliance_score)), 0) as average_compliance,
  count(b.id) filter (where b.risk_level in ('HIGH','CRITICAL')) as high_risk_count
from tenders t
left join bids b on b.tender_id = t.id
group by t.id;

-- =========================================================================
-- AUTH: profile auto-provisioning
-- =========================================================================

-- Display fields (full_name/designation/organization/badge_id) stay null until
-- an admin fills them in — those are institutional facts on a government audit
-- tool, not something a user should free-type at signup. No public sign-up is
-- exposed in the frontend; accounts are created via the seed script's admin API call.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- =========================================================================
-- RPC: atomic officer decision submission
-- =========================================================================

-- SECURITY INVOKER (not DEFINER) — still governed by the caller's own RLS.
-- Reads officer identity server-side from auth.uid()/profiles rather than
-- trusting a name/designation sent from the client, closing off "decision
-- submitted under a spoofed name" (possible in the old client-built object).
create or replace function submit_officer_decision(
  p_bid_id text,
  p_decision officer_decision_type_enum,
  p_remarks text,
  p_justification_reason text,
  p_conditions_applied text[] default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tender_id text;
  v_officer profiles%rowtype;
  v_decision_id uuid;
begin
  select tender_id into v_tender_id from bids where id = p_bid_id;
  if v_tender_id is null then
    raise exception 'Bid % not found', p_bid_id;
  end if;

  select * into v_officer from profiles where id = auth.uid();

  insert into officer_decisions (bid_id, tender_id, officer_profile_id, decision, remarks, justification_reason, conditions_applied)
  values (p_bid_id, v_tender_id, auth.uid(), p_decision, p_remarks, p_justification_reason, p_conditions_applied)
  returning id into v_decision_id;

  insert into audit_events (bid_id, tender_id, actor_profile_id, actor_display_name, actor_role, action_type, summary, details)
  values (
    p_bid_id,
    v_tender_id,
    auth.uid(),
    coalesce(v_officer.full_name, 'Procurement Officer'),
    coalesce(v_officer.designation, 'Procurement Officer'),
    'OFFICER_ACTION',
    'Formal Officer Decision: ' || replace(p_decision::text, '_', ' '),
    p_remarks
  );

  return v_decision_id;
end;
$$;

-- =========================================================================
-- ROW LEVEL SECURITY
-- Small trusted set of government officer users, not a multi-tenant app:
-- any authenticated officer reads everything; writes are scoped narrowly only
-- where identity-spoofing or accidental overwrite is a real risk (decisions,
-- audit events). No anon access anywhere.
-- =========================================================================

alter table profiles enable row level security;
alter table companies enable row level security;
alter table company_turnover enable row level security;
alter table tenders enable row level security;
alter table tender_requirements enable row level security;
alter table bids enable row level security;
alter table bid_documents enable row level security;
alter table bid_emd enable row level security;
alter table compliance_check_items enable row level security;
alter table risk_factors enable row level security;
alter table evidence_items enable row level security;
alter table ai_recommendations enable row level security;
alter table ai_recommendation_points enable row level security;
alter table officer_decisions enable row level security;
alter table audit_events enable row level security;
alter table ai_verification_runs enable row level security;
alter table gov_portal_verification_log enable row level security;

-- profiles: read-all (names must resolve in audit/decision UI), self-update only.
-- No client INSERT policy — provisioning happens via the SECURITY DEFINER trigger.
create policy profiles_select on profiles for select to authenticated using (true);
create policy profiles_update_self on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Reference/master data: read-only to the app. Only the service-role seed
-- script or Studio can write — no INSERT/UPDATE/DELETE policy is granted, so
-- RLS default-denies those for `authenticated`.
create policy companies_select on companies for select to authenticated using (true);
create policy company_turnover_select on company_turnover for select to authenticated using (true);
create policy tenders_select on tenders for select to authenticated using (true);
create policy tender_requirements_select on tender_requirements for select to authenticated using (true);

-- Bid domain + AI/verification tables: broad authenticated read/write, no delete.
-- There's no separate backend service account in this frontend-only architecture,
-- so every "AI-simulated" write still runs as the logged-in officer's session.
create policy bids_select on bids for select to authenticated using (true);
create policy bids_write on bids for insert to authenticated with check (true);
create policy bids_update on bids for update to authenticated using (true) with check (true);

create policy bid_documents_select on bid_documents for select to authenticated using (true);
create policy bid_documents_insert on bid_documents for insert to authenticated with check (true);
create policy bid_documents_update on bid_documents for update to authenticated using (true) with check (true);

create policy bid_emd_select on bid_emd for select to authenticated using (true);
create policy bid_emd_insert on bid_emd for insert to authenticated with check (true);
create policy bid_emd_update on bid_emd for update to authenticated using (true) with check (true);

create policy compliance_check_items_select on compliance_check_items for select to authenticated using (true);
create policy compliance_check_items_insert on compliance_check_items for insert to authenticated with check (true);
create policy compliance_check_items_update on compliance_check_items for update to authenticated using (true) with check (true);

create policy risk_factors_select on risk_factors for select to authenticated using (true);
create policy risk_factors_insert on risk_factors for insert to authenticated with check (true);
create policy risk_factors_update on risk_factors for update to authenticated using (true) with check (true);

create policy evidence_items_select on evidence_items for select to authenticated using (true);
create policy evidence_items_insert on evidence_items for insert to authenticated with check (true);
create policy evidence_items_update on evidence_items for update to authenticated using (true) with check (true);

create policy ai_recommendations_select on ai_recommendations for select to authenticated using (true);
create policy ai_recommendations_insert on ai_recommendations for insert to authenticated with check (true);

create policy ai_recommendation_points_select on ai_recommendation_points for select to authenticated using (true);
create policy ai_recommendation_points_insert on ai_recommendation_points for insert to authenticated with check (true);

create policy ai_verification_runs_select on ai_verification_runs for select to authenticated using (true);
create policy ai_verification_runs_insert on ai_verification_runs for insert to authenticated with check (true);
create policy ai_verification_runs_update on ai_verification_runs for update to authenticated using (true) with check (true);

create policy gov_portal_verification_log_select on gov_portal_verification_log for select to authenticated using (true);
create policy gov_portal_verification_log_insert on gov_portal_verification_log for insert to authenticated with check (true);

-- Append-only, identity-checked writes.
create policy officer_decisions_select on officer_decisions for select to authenticated using (true);
create policy officer_decisions_insert on officer_decisions for insert to authenticated
  with check (officer_profile_id = auth.uid());

create policy audit_events_select on audit_events for select to authenticated using (true);
create policy audit_events_insert on audit_events for insert to authenticated
  with check (actor_profile_id = auth.uid() or actor_profile_id is null);
