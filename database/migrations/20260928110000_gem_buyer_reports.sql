-- GeM side: the full evaluation reports the buyer's system (CSAP) delivered for each bid, as GeM
-- received them (content, fingerprint, whether the fingerprint matched on arrival), newest last.
-- The seller sees only the outcome and the points to fix; the buyer desk sees these reports.
alter table gem_bid_submissions add column if not exists buyer_reports jsonb not null default '[]';
