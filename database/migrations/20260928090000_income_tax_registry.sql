-- The Income Tax compliance check (PAN operative, Section 206AB specified person, returns filed per
-- assessment year) is a registry of its own in portal verification.
alter table portal_verifications drop constraint if exists portal_verifications_registry_check;
alter table portal_verifications add constraint portal_verifications_registry_check
  check (registry in ('PAN','INCOME_TAX','GSTN','UDYAM','MCA21','EPFO','ESIC','STARTUP_INDIA','NSIC','DEBARMENT','DIGILOCKER'));
