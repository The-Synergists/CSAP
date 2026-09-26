-- Realtime fix: UPDATE events on rows with large jsonb columns (stored out-of-line / TOAST)
-- omit unchanged values, which broke postgres_changes delivery for these tables.
-- REPLICA IDENTITY FULL makes Postgres log complete rows so Realtime receives whole records.
alter table public.document_verification_runs replica identity full;
alter table public.ai_verification_runs replica identity full;
