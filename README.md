# CSAP — AI-assisted bid verification for CPCL (prototype)

A procurement officer's workspace: select a tender, open a bid, see how it was checked
against every tender requirement, inspect the evidence for each exception, read the
advisory AI recommendation, and record the decision — which is written to the audit trail.

> Prototype. Tender data is illustrative. OCR and extraction run on live NVIDIA models; government
> registries (PAN, GSTN, Udyam, MCA21, EPFO, ESIC, Startup India, NSIC, debarment, DigiLocker) are a
> simulated Government Gateway with one dataset per registry; bank integrations are simulated.
> AI output is advisory; the designated procurement officer makes the final decision.

## Architecture

```
frontend/  React UI ──/api──► backend/ Express gateway ──► Supabase (Postgres, Auth, Storage, Realtime)
   ▲                             │
   │ Supabase Realtime           ├──► ai_engine/  FastAPI: rule engine + NVIDIA OCR + NVIDIA extraction
   └─────────────────────────────┴──► gov_gateway/ Simulated government registries (one dataset file each)
shared/    domain model, selectors, demo dataset — imported by frontend, backend, seed and tests
database/  SQL migrations (+ runner), seed script, sample PAN documents, schema docs
```

### PAN verification pipeline (bid → "PAN verification" tab)

```
PAN document (bucket bid-documents) → NVIDIA Nemotron OCR V2 → OCR text
  → NVIDIA extraction model → PAN, name, … (each value checked against the OCR text)
  → POST gov_gateway /v1/pan/verify → lookup in pan.json → response
  → CSAP compares document vs registry vs bid record → verdict
```

Each stage is written to `document_verification_runs` as it completes and streamed to the
officer's screen through Supabase Realtime; every call to the PAN API is logged in
`external_api_calls`. Decisions, audit events and verification runs are also live across
officers' screens.

- **shared/domain** — the normalised data model (`types.ts`) and the joins every screen uses
  (`selectors.ts`). A bid's scores, EMD, findings, decision and audit history always come from
  the same rows.
- **backend** — validates the officer's Supabase session, reads/writes under the officer's JWT
  (RLS applies), records decisions through the `submit_officer_decision` RPC, and runs
  verification through the engine. It never reports a check as passed if the engine is down.
- **ai_engine** — deterministic rules that compare each tender requirement with the bid's data
  and documents, and explain every exception (requirement → submission → comparison →
  evidence → impact → suggested action), plus risk level and an advisory recommendation.
- **frontend** — talks only to the backend (`VITE_DATA_SOURCE=api`), or runs fully in the
  browser on the demo dataset (`VITE_DATA_SOURCE=demo`) for static previews.

## Run locally

Prerequisites: Node 20+, Python 3.11+.

```bash
npm install                                   # installs frontend, backend, database workspaces
python -m venv ai_engine/.venv
ai_engine/.venv/Scripts/pip install -r ai_engine/requirements.txt   # (bin/ on macOS/Linux)

cp backend/.env.example backend/.env          # fill SUPABASE_URL / ANON / SERVICE_ROLE keys
cp frontend/.env.example frontend/.env.local  # VITE_DATA_SOURCE=api

npm run seed          # optional: load the demo dataset (backs up every table first)

cp ai_engine/.env.example ai_engine/.env      # NVIDIA keys
cp database/.env.example database/.env        # DATABASE_URL (for migrations)
npm run migrate       # apply pending SQL migrations

npm run dev:engine    # terminal 1 — http://localhost:8000
npm run dev:gateway   # terminal 2 — http://localhost:8100
npm run dev:backend   # terminal 3 — http://localhost:5000/api/health
npm run dev           # terminal 4 — http://localhost:5173
```

Demo login: employee ID `CPCL10421` (or `rk.ramanathan@cpcl.co.in`), password `Cpcl@2026`.

## Tests

| Command | What it checks |
| --- | --- |
| `npm run test:engine` | Engine rules reproduce all four demo scenarios exactly; NVIDIA stages with mocked HTTP |
| `npm run test:gateway` | Government Gateway: PAN cases, every registry lookup, debarment, DigiLocker, API key |
| `npm run test:live` | Against the running backend + Supabase: every bid reads back identical to the demo dataset |
| `npm run typecheck` / `npm run lint` / `npm run build` | Static checks and production build |

## Demo scenarios (tender GEM/2026/CPCL/001)

| Bid | Bidder | Compliance | Risk | Primary issue | Status |
| --- | --- | --- | --- | --- | --- |
| BID-001 | ABC Industrial Solutions Pvt. Ltd. | 92 | Low | OEM authorization 35 days short of required validity | Clarification Required |
| BID-002 | Bharat Engineering Works | 87 | Medium | Turnover meets average, FY24 below benchmark | Under Review |
| BID-003 | National Safety Systems | 74 | High | EMD shortfall ₹50,000 (+ turnover, local content, missing documents) | Under Review |
| BID-004 | Prime Tech Solutions | 96 | Low | None — MSE EMD exemption confirmed | Recommended Accept |

## Security notes

- `SUPABASE_SERVICE_ROLE_KEY` lives only in `backend/.env`; NVIDIA keys only in `ai_engine/.env`;
  the DB connection string only in `database/.env`. The frontend holds only the public anon key
  (for Realtime, with RLS applying to the officer's own JWT).
- `.env*` files and `database/backups/` are git-ignored.
