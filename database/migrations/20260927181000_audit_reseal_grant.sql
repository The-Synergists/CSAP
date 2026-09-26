-- The demo reset (seed, service role) re-seals the audit chain after removing demo events.
grant execute on function reseal_audit_chain() to service_role;
