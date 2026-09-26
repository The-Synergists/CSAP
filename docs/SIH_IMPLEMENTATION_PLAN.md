# CSAP — Implementation Plan for SIH26100

**Problem statement:** SIH26100, *AI-Powered Integrated Bid Compliance Verification Platform for GeM Procurement* (MoPNG / CPCL).
**Deadline:** 30 September 2026.
**Principle:** everything the judges see must be *really computed*. Integrations that we cannot access are
**simulated services with their own data**, behind the same adapter a real API would use, and are always
**labelled** in the UI as `Live provider`, `Simulated registry` or `Document only`.

This document is also the working brief for the build: each phase lists what to build, the definition of done,
and how it is tested.

---

## 1. The end-to-end story we will demo

```
 GeM portal (simulated)                         CSAP
 ─────────────────────                          ────────────────────────────────────────────────
 CPCL publishes tender  ───── tender feed ────► Tender + requirements imported
 Bidder uploads bid pkg ───── bid webhook ────► Bid ingested, documents stored (bucket bid-documents)
                                                 │
                                                 ▼  automatic, streamed live (Supabase Realtime)
                                                 1. Document intelligence  (NVIDIA OCR → NVIDIA extraction, every doc)
                                                 2. Portal verification    (Government Gateway: PAN, GSTN, Udyam, MCA21,
                                                                            EPFO/ESIC, Startup India, NSIC, debarment,
                                                                            DigiLocker) — simulated + 1 live provider
                                                 3. Cross-document consistency (same name/PAN/GSTIN/address everywhere)
                                                 4. Tender compliance engine (tender-specific rules)
                                                 5. Explainable compliance score + risk level
                                                 6. AI recommendation (NVIDIA LLM, grounded on findings)
                                                 ▼
                                                Officer reviews evidence → records decision (final authority)
                                                 ▼
                                                Tamper-evident audit trail + evidence pack export
```

Mapping to the problem statement's 14 expected outcomes is in section 7.

---

## 2. Target architecture

| Component | Where | Purpose |
| --- | --- | --- |
| `frontend/` | Vercel static | CSAP officer app **and** the GeM simulator pages (separate branding and layout at `/gem`) |
| `backend/` | Vercel Node function `/api/*` | Orchestration, auth, ingestion webhook, adapters to every registry |
| `ai_engine/` | Vercel Python function `/api/engine/*` | NVIDIA OCR, NVIDIA extraction (all document types), rule engine, scoring, LLM recommendation |
| `gov_gateway/` (evolves from `pan_api/`) | Vercel Python function `/api/gov/*` | **Simulated government registries**, each with its own dataset file |
| Supabase | Postgres, Auth, Storage, Realtime | System of record, documents, live updates |
| External provider | e.g. gstinapi.com | **Live** GSTIN + return-filing lookup (free credits) |

### The adapter layer (key design point)

Every registry is reached through one backend interface:

```ts
interface RegistryAdapter {
  registry: 'PAN' | 'GSTN' | 'UDYAM' | 'MCA21' | 'EPFO' | 'ESIC' | 'STARTUP_INDIA' | 'NSIC' | 'DEBARMENT' | 'DIGILOCKER';
  mode: 'LIVE_PROVIDER' | 'SIMULATED';
  verify(input): Promise<RegistryResult>;   // normalised result, raw response kept for audit
}
```

Switching a registry from simulated to real (API Setu, a commercial provider) means writing one adapter and
changing configuration. Nothing else in the system changes. This is the production story we tell the judges.

---

## 3. External providers: what is realistic and free

| Need | Option | Free? | Use in demo |
| --- | --- | --- | --- |
| GSTIN + **return-filing history** | [gstinapi.com](https://gstinapi.com/) | 20 free credits after email verification; returns filing history | **Yes: the live integration** |
| GSTIN (backup) | [gstinapi.in](https://www.gstinapi.in/) | Up to 100 free lookups | Backup key |
| PAN, GSTIN, MCA, Udyam, DigiLocker (one vendor) | [Sandbox.co.in](https://sandbox.co.in/kyc) | Free trial; prices not public | Optional, if the trial allows |
| DigiLocker (official) | [API Setu partners](https://partners.apisetu.gov.in/signup) | Free, but needs organisation onboarding and review | Not feasible by 30 Sep; show as adapter-ready plus simulated |

Rules for live calls: cache every response (credits are scarce), never block the pipeline if the provider fails
(fall back to *not verified*, never to a fake pass), and log each call in `external_api_calls`.

Real PAN verification is **not free** anywhere we found, so PAN stays on the simulated registry for the demo.

---

## 4. Phases (in priority order)

Legend: **MUST** = required to meet the problem statement convincingly, **SHOULD** = strong differentiator,
**COULD** = only if time remains.

### Phase 1: Government Gateway (simulated registries). MUST (about 1 day)

Build:
1. Rename and extend `pan_api/` into `gov_gateway/`, with one router and one dataset file per registry:
   - PAN: status, name, category.
   - GSTN: status, legal name, address, **GSTR-3B/GSTR-1 filing history for 6 months**.
   - Udyam: category (micro, small or medium), activity, NIC codes.
   - MCA21: CIN, company status, directors, incorporation date.
   - EPFO / ESIC: establishment status and last ECR month.
   - Startup India (DPIIT) and NSIC: certificate validity, which drives EMD exemption.
   - Debarment: CPPP / GeM / MoPNG / CPCL debarment list with period and reason.
   - DigiLocker: issuer-verified document metadata and hash, so a document "pulled from DigiLocker" can be
     compared with the uploaded copy.
2. Datasets cover the 4 demo bidders consistently, plus edge cases for each registry (valid, invalid, not
   found, mismatch, expired, debarred, non-filer).
3. Backend adapters for each registry. A new table `portal_verifications` (run_id, bid_id, registry, identifier,
   mode, request, response, normalised result, checked_at) is published to Realtime.
4. The Compliance tab shows the **source badge** per requirement: Live provider / Simulated registry / Document only.

Done when: each bid shows registry results for all applicable registries, and each result opens its raw
request and response.
Tests: pytest per registry (every edge case), plus a backend integration test that runs all adapters for all 4 bids.

### Phase 2: One live provider (GSTIN + return filing). MUST (about 0.5 day)

1. Team signs up at gstinapi.com (or gstinapi.in). The key goes only into Vercel env `GSTIN_PROVIDER_KEY`.
2. `GstnLiveAdapter`: normalise the response to the same shape as the simulated GSTN registry; cache by GSTIN
   for 24 hours; if there is no key or no credits, fall back to *simulated*, clearly labelled.
3. New tender requirement: "GST returns filed for the last 6 months". The rule engine evaluates the filing history.

Done when: entering any real public GSTIN (for example CPCL's own) on a bid shows live status and filing history,
labelled `Live provider`.

### Phase 3: Document intelligence for every document type. MUST (about 1 day)

1. Extraction schemas in `ai_engine/src/nvidia/extraction.py` for: e-PAN letter **and individual PAN card**,
   GST certificate, Udyam certificate, OEM authorization (manufacturer, validity date, warranty clause),
   EMD bank guarantee / payment receipt (amount, bank, validity), audited financials (turnover per year),
   EPFO/ESIC challan, Startup India and NSIC certificates, non-blacklisting affidavit.
2. Generalise `document_verification_runs` to any document type, and run it for every document in a bid package.
3. Extracted values replace the pre-typed document text as input to the rule engine.
4. **Cross-document consistency**: name, PAN, GSTIN (and PAN embedded in GSTIN), Udyam number and address must
   agree across all documents and registries. Each disagreement becomes a finding with evidence from both sides.
5. Specimen documents for each type (clearly watermarked) for the demo.

Done when: uploading a full bid package produces extracted fields for every document, and a deliberately
inconsistent package produces a consistency finding.

### Phase 4: Explainable score and AI recommendation. MUST (about 0.5 day)

1. Compliance score = Σ(weight × outcome) / Σ(weight). The weights are per requirement (mandatory eligibility
   items weigh more) and are shown in the UI. Outcomes: met 1.0, review 0.5, not met / missing 0. The formula
   and each requirement's contribution appear on the Compliance tab.
2. Risk level is derived from the findings, as today.
3. NVIDIA LLM drafts the recommendation narrative **from the findings only**. Pass/fail and the suggested
   decision stay rule-based. Any claim the LLM makes must cite a finding ID, otherwise it is dropped.

Done when: the score changes correctly when a check changes, and the "Why this score?" panel adds up.

### Phase 5: GeM portal (simulated) and automatic ingestion. SHOULD (about 1 day)

Why: GeM does not offer a public API for third parties to pull bids. A simulated GeM makes the flow
"bidder submits on GeM → CSAP verifies automatically" demonstrable end to end.

1. `/gem` pages with GeM-style branding, clearly marked *Simulated GeM portal*:
   - Tender listing (CPCL tenders).
   - Bidder "Submit bid" form: company details and upload of the document set.
2. GeM-side storage (tables `gem_tenders`, `gem_bid_submissions`), separate from CSAP tables.
3. On submission, GeM calls CSAP's **ingestion webhook** `/api/integrations/gem/bids` (signed with a shared
   secret). CSAP creates the bidder, bid and documents and **starts the full pipeline automatically**.
4. The officer sees the new bid appear live on the dashboard (Realtime), with verification progressing.
5. CSAP tender setup: an officer can create a tender from a requirement template (so the demo is not limited
   to one pre-loaded tender).

Done when: a new bid submitted on `/gem` shows up in CSAP within seconds and is fully verified with no manual step.

### Phase 6: Audit and impact. SHOULD (about 0.5 day)

1. **Hash-chained audit trail**: each audit event stores `hash = sha256(prev_hash + event)`. A "Verify
   integrity" button re-computes the chain.
2. Evidence pack export per bid: printable report of checks, findings, registry responses and the decision.
3. **Time-saved metric**: record automated verification time per bid, compared with a documented manual
   baseline per check. This supports the "60–80% reduction" claim with numbers.

### Phase 7: Submission material. MUST (parallel, last day)

1. Architecture diagram (section 2), data flow, and the adapter/production story.
2. Presentation following the SIH template: problem, solution, demo screenshots, technology (NVIDIA models,
   Supabase, Vercel), feasibility, impact numbers.
3. 3–4 minute demo video following section 1.

### Suggested schedule

| Day | Work |
| --- | --- |
| 26–27 Sep | Phase 1, Phase 2 |
| 28 Sep | Phase 3, Phase 4 |
| 29 Sep | Phase 5 (core flow), Phase 6 (hash chain and time saved) |
| 30 Sep | Buffer, full regression on production, Phase 7 (presentation and video) |

If time runs short, cut Phase 6's evidence export and Phase 5's tender-setup screen, not Phases 1–4.

---

## 5. How we test and verify (including with a real PAN)

| Level | What | How |
| --- | --- | --- |
| Unit | Each registry, each rule, each extraction schema | pytest (engine, gateway), mocked NVIDIA calls |
| Integration | Live DB round-trip, all adapters, pipeline per document type | `npm run test:live`, backend integration tests |
| End to end | GeM submission → auto verification → officer decision → audit | Playwright suites against the **production URL** |
| Real-world | Real documents and identifiers (below) | Manual, on a test bid |

### Testing with your own PAN card

- **Through the simulated registry (free, works today after Phase 3):** add your PAN, name and status as a
  record in the gateway's PAN dataset (a small admin screen or the JSON file). Upload a photo of your PAN card
  in the PAN verification tab. Expected result: NVIDIA reads the card, extracts PAN, name, father's name and
  date of birth, the registry returns VALID with a name match. Then edit the dataset name to see NAME_MISMATCH.
  This proves the whole pipeline on a real document.
- **Through a real PAN provider:** requires a paid provider (for example a Sandbox.co.in plan); free sandboxes
  only accept their own test PANs.
- **Privacy:** a PAN card is personal data. The image is sent to NVIDIA's hosted OCR and stored in the private
  `bid-documents` bucket. Use it only with your own consent, delete the test upload afterwards (a delete action
  will be added), and never commit it to git.

### Testing the live GSTIN integration

Use any real, publicly known GSTIN (for example CPCL's own GSTIN from its invoices or website). The result must
show `Live provider`, the legal name and the filing history. Each call spends one free credit, so results are
cached.

---

## 6. Honesty rules (apply everywhere)

- Never show "verified" for something that was not checked. Unavailable means **not verified**, not passed.
- Every result carries its source: Live provider / Simulated registry / Document only.
- Simulated datasets are fictitious except the demo team's own records added for testing.
- The AI recommends; the officer decides. Every decision is recorded with reason and remarks.

---

## 7. Coverage of the problem statement (target after this plan)

| # | Expected outcome | After this plan |
| --- | --- | --- |
| 1 | Integrate with government portals | Adapter layer, 10 registries (simulated) + live GSTIN |
| 2 | Udyam / MSME | Udyam registry + certificate extraction |
| 3 | GST registration and return filing | Live provider + rule on 6-month filing |
| 4 | PAN and Income Tax | PAN pipeline (existing) + ITR / specified-person check |
| 5 | Make in India | Declaration extraction + threshold rule |
| 6 | EPFO / ESIC | Registries + challan extraction |
| 7 | Startup India, NSIC, OEM | Registries + certificate / OEM extraction, EMD exemption rules |
| 8 | DigiLocker / document verification | DigiLocker-simulated issuer verification + NVIDIA on every document |
| 9 | Blacklisting / debarment | Debarment registry lookup |
| 10 | Tender-specific checks | Rule engine + tender setup from templates |
| 11 | Missing / inconsistent info | Missing-document detection + cross-document consistency |
| 12 | Compliance score and risk | Explainable weighted score + risk level |
| 13 | AI recommendation | Rule-based decision + NVIDIA-drafted grounded narrative |
| 14 | Auditable record | Hash-chained audit trail + evidence pack |
| — | Officer decides | Existing decision workflow |

## 8. Open items for the team

1. Sign up for the GSTIN provider (gstinapi.com) with a team email and share the key privately (it goes into Vercel env only).
2. Confirm the GeM simulator should live at `/gem` in the same deployment (recommended) rather than a separate URL.
3. Decide who records the demo video and owns the presentation.
