# BidSure frontend

React 19 + TypeScript + Vite + Tailwind CSS v4.

```bash
cp .env.example .env.local   # VITE_DATA_SOURCE=api (backend) or demo (in-browser dataset)
npm run dev                  # http://localhost:5173 — /api is proxied to http://localhost:5000
npm run typecheck && npm run lint && npm run build
```

## Structure

```
src/state/            AppProvider (api | demo data source), API client, demo write logic
src/pages/            one folder per area; pages/bids/ holds the bid workspace and its tabs
src/components/ui/    Badge, primitives (Card, Tabs, Modal, …), styles, toast
src/domain/labels.ts  status labels and tones (UI vocabulary)
@shared/…             domain model, selectors and demo dataset (../shared)
```

Routes: `/login`, `/dashboard`, `/tenders`, `/tenders/:id/:tab?`, `/bidders`,
`/bids/:bidId/:tab?` (overview, documents, emd, compliance, risk, evidence, decision,
activity), `/reviews`, `/alerts`, `/reports`, `/audit`, `/settings`. Unknown routes and IDs
show a not-found page — a bad bid ID never falls back to another bid.
