-- What the bidder declared in each bid (company name, address, turnover), kept on the bid itself.
-- The company table has one row per PAN (the legal entity); a bidder can submit several bids and
-- change its declared details between them, so each bid is shown and verified against its own
-- declaration rather than whatever the company row said first.

alter table bids add column if not exists declared_profile jsonb;

-- Backfill bids that came from the simulated GeM portal from their GeM submission.
update bids b
set declared_profile = jsonb_build_object(
  'name', s.company->>'name',
  'address', coalesce(nullif(s.company->>'address', ''), 'Not provided'),
  'turnover', coalesce(s.declared->'turnover', '[]'::jsonb)
)
from gem_bid_submissions s
where s.gem_bid_no = b.gem_bid_no and b.declared_profile is null;
