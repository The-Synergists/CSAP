# CSAP AI Engine — Statutory Verification Microservice

Python + FastAPI microservice powering Central Statutory Authentication Platform (CSAP) automated verification pipelines, document OCR extraction, government registry cross-checks, discrepancy detection, and multi-vector risk calculation.

## Architecture

```
ai_engine/
├── src/
│   ├── core/                     # Configuration and settings
│   ├── ocr_processor/            # Document text, table & entity extraction
│   ├── registry_verifier/        # Statutory checking (GSTN, MCA21, EPFO, ESIC, MSME)
│   ├── discrepancy_detector/     # Bid vs Tender requirement evaluation
│   ├── risk_scorer/              # Multi-vector risk assessment & index calculation
│   ├── prompts/                  # Advisory templates for LLMs
│   └── main.py                   # FastAPI REST microservice
├── tests/                        # Verification pipeline test suite
├── requirements.txt
├── .env.example
└── README.md
```

## OCR Engine — NVIDIA Nemotron OCR V2

Document text extraction is exclusively powered by **[nemotron-ocr-v2](https://build.nvidia.com/nvidia/nemotron-ocr-v2)** via the NVIDIA NIM hosted API.

| Setting | Environment Variable | Default |
|---|---|---|
| API Key (required) | `NVIDIA_API_KEY` | — |
| Inference endpoint | `NEMOTRON_OCR_ENDPOINT` | `https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2/infer` |
| Text merge level | `NEMOTRON_OCR_MERGE_LEVEL` | `paragraph` (`word` / `sentence` / `paragraph`) |

Get your API key and test the model at **[build.nvidia.com/nvidia/nemotron-ocr-v2](https://build.nvidia.com/nvidia/nemotron-ocr-v2)**.

When `NVIDIA_API_KEY` is not set or no image bytes are supplied, the extractor falls back to a deterministic keyword-seeded response so the rest of the verification pipeline keeps running.

## Quickstart

### 1. Create Virtual Environment
```bash
python -m venv .venv
# On Windows
.venv\Scripts\activate
# On Linux/macOS
source .venv/bin/activate
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Run Development Server
```bash
uvicorn src.main:app --reload --port 8000
```
API documentation will be available at `http://localhost:8000/docs`.

### 4. Run Tests
```bash
pytest
```
