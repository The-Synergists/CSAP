# BidSure database

```
migrations/   Supabase SQL schema (tables, views, RLS, submit_officer_decision RPC)
seeds/        seed.ts — loads the shared demo dataset; export-engine-fixtures.ts
schema/       schema documentation, including the storage conventions the backend uses
backups/      JSON backups written by the seed script (git-ignored)
```

```bash
npm run seed                     # reads ../backend/.env; backs up every table first
npm run export-engine-fixtures   # refresh ai_engine test fixtures from the demo dataset
```

Apply migrations with the Supabase CLI (`supabase db push`) or the SQL editor.
