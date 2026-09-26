# BidSure backend (API gateway)

Express + TypeScript, run with `tsx`. Sits between the frontend, Supabase and the Python
verification engine.

```bash
cp .env.example .env   # SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, AI_ENGINE_URL
npm run dev            # http://localhost:5000
npm run typecheck
npm run test:live      # integration check against the running server + database
```

## Endpoints

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET | `/api/health` | — | Database and engine status |
| POST | `/api/auth/login` | — | `{ identifier, password }` → session tokens (employee ID or email) |
| POST | `/api/auth/refresh` | — | `{ refreshToken }` → new tokens |
| GET | `/api/me` | Bearer | Signed-in officer profile |
| GET | `/api/workspace` | Bearer | Whole normalised dataset (see `shared/domain/types.ts`) |
| GET | `/api/tenders`, `/api/tenders/:id` | Bearer | Tenders and requirements |
| GET | `/api/bids?tenderId=`, `/api/bids/:id` | Bearer | Joined bid views |
| POST | `/api/decisions` | Bearer | `{ bidId, decision, reason, remarks }` via `submit_officer_decision` RPC |
| POST | `/api/verification/run` | Bearer | `{ bidId }` — re-run through the engine; 503 if the engine is down |

Officer requests run under the officer's own JWT (`userClient`), so Postgres RLS and
`auth.uid()` apply. The service-role key is used only to resolve employee IDs at login.

## Layout

```
src/config/env.ts                 environment (fails fast if keys are missing)
src/lib/                          Supabase clients, HttpError / asyncHandler
src/middlewares/                  auth (token → officer client), error handler
src/db/conventions.ts             how the domain model maps onto the existing schema
src/db/workspace.repository.ts    live rows → domain Database
src/services/                     auth, decisions, verification, engine client
src/routes/index.ts               HTTP routes
tests/live-parity.ts              integration check
```
