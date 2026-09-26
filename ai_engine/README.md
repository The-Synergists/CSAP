# BidSure verification engine

FastAPI service that checks a bid against each tender requirement. Called only by the backend.

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt     # .venv/bin on macOS/Linux
.venv/Scripts/python -m uvicorn src.main:app --port 8000
.venv/Scripts/python -m pytest -q
```

## What it does (and does not)

| Module | Behaviour |
| --- | --- |
| `discrepancy_detector/matcher.py` | Deterministic rules per requirement: turnover average vs benchmark, EMD amount / MSE exemption, OEM validity vs opening date + 90 days, local content %, PSU experience, missing certificates / affidavits / declarations. Each exception returns a finding with expected, submitted, comparison, evidence, impact and suggested action. |
| `risk_scorer/scorer.py` | Risk points per exception → LOW / MEDIUM / HIGH, plus an advisory suggested decision. |
| `nvidia/ocr.py` | **NVIDIA model 1 — Nemotron OCR V2** (hosted NIM, `…/v1/cv/nvidia/nemotron-ocr-v2`). Reads PNG/JPEG document images. No fallback: without a key it returns 503. Based on the team's Alpha-branch client, with the endpoint and response parsing corrected. |
| `nvidia/extraction.py` | **NVIDIA model 2 — information extraction** (`nvidia/nemotron-3-ultra-550b-a55b` via `integrate.api.nvidia.com`, streaming, thinking off, temperature 0). Returns PAN, name, date, category plus a *grounding* check that each value appears in the OCR text. |
| `ocr_processor/extractor.py` | Parses the pre-extracted text attached to bid documents (used by the rule engine). |
| `registry_verifier/checker.py` | GSTIN / PAN / Udyam format checks and GSTIN-embeds-PAN cross-check. **No live registry lookup**; results are marked `simulated`. |
| `prompts/templates.py` | Reserved for LLM-drafted narratives. Pass/fail never depends on a model. |

Endpoints: `POST /api/v1/documents/ocr` (stage 1), `POST /api/v1/documents/extract` (stage 2),
`POST /api/v1/verify` (rule engine), `GET /api/v1/health` (includes NVIDIA configuration).

`POST /api/v1/verify` request/response shapes: `src/schemas.py` and
`shared/domain/enginePayload.ts`. Tests (`tests/`) assert the engine reproduces all four demo
scenarios exactly; fixtures are exported from the shared demo dataset with
`npm --prefix database run export-engine-fixtures`.
