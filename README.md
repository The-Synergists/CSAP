# CSAP — Central Statutory Authentication Platform

CSAP is an AI-assisted procurement bid verification platform built around a CPCL (Chennai Petroleum Corporation Limited) public tender workflow. A procurement officer reviews vendor bids against statutory requirements, reviews automated registry checks (GSTN, MCA21, EPFO, ESIC, MSME), examines AI-surfaced discrepancies backed by evidence, and records formal decisions with complete auditability.

---

## 🏛️ System Architecture

CSAP is organized as a modular 4-tier architecture:

```
CSAP/
├── frontend/             # React 19 + TypeScript + Vite + Tailwind CSS portal
├── backend/              # Express + TypeScript API Gateway
├── ai_engine/            # Python + FastAPI Statutory Verification & OCR Engine
└── database/             # PostgreSQL / Supabase Migrations, Seeds & Schemas
```

### Module Responsibilities

| Pillar | Tech Stack | Role |
|---|---|---|
| **`frontend/`** | React 19, Vite, Tailwind CSS v4, Lucide React | Procurement Officer Web Portal, evaluation workspaces, alert dashboards, document previewers, and floating AI assistant. |
| **`backend/`** | Node.js, Express, TypeScript, Supabase JS | API gateway handling tenders, bids, statutory verifications, officer decisions, and audit logging. |
| **`ai_engine/`** | Python 3, FastAPI, Pydantic | Microservice for document OCR extraction, government registry cross-checks (GSTN/EPFO/ESIC/MCA21), discrepancy detection, and multi-vector risk scoring. |
| **`database/`** | PostgreSQL, Supabase Migrations, TSX | Relational schema definitions, enum constraints, foreign keys, and seed scripts with realistic CPCL procurement data. |

---

## 🚀 Quickstart Guide

### 1. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Accessible at: `http://localhost:5173`

Demo credentials on login screen:
- **Employee Code**: `CPCL-PROC-0841`
- **Password**: `Cpcl@2026`

### 2. Backend Setup
```bash
cd backend
npm install
npm run dev
```
Runs at: `http://localhost:5000` (Health check: `http://localhost:5000/api/health`)

### 3. AI Engine Setup
```bash
cd ai_engine
python -m venv .venv
# Activate virtualenv (Windows: .venv\Scripts\activate, Linux/macOS: source .venv/bin/activate)
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8000
```
Interactive Swagger docs: `http://localhost:8000/docs`

### 4. Database Seeding & Migrations
```bash
cd database
npm install
npm run seed
```

---

## 📦 Root Convenience Scripts

You can also run commands from the repository root:

- `npm run dev:frontend` — Launches the frontend development server.
- `npm run build:frontend` — Builds the frontend for production.
- `npm run lint:frontend` — Runs oxlint against frontend source files.
- `npm run dev:backend` — Launches the backend development server.
- `npm run build:backend` — Compiles TypeScript for the backend.
- `npm run seed:db` — Runs the database seeder script.
