-- Tenders created by an officer from the requirement template (published to the simulated GeM
-- portal). Marked so a demo reset can remove them.
alter table tenders add column if not exists created_by_officer boolean not null default false;
