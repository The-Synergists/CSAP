# CSAP Backend — API Gateway

Express + TypeScript backend service providing REST API endpoints for procurement operations, tender lifecycle tracking, bid discrepancy orchestration, statutory validation, and officer decisions.

## Features

- **Tenders & Bids API**: CRUD and query endpoints for tenders, requirements, bidder submissions, and documents.
- **Verification Orchestrator**: Triggers multi-step statutory verification runs with automated logging into `ai_verification_runs` and `gov_portal_verification_log`.
- **AI Engine Bridge**: Seamless HTTP integration with the Python `ai_engine` microservice for OCR extraction and risk scoring.
- **Officer Decisions & Audit Logging**: Records procurement officer determinations (`APPROVE`, `REJECT`, `REQUEST_CLARIFICATION`) and synchronizes with immutable audit logs.

## Quickstart

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```
Ensure `VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are configured.

### 3. Run Development Server
```bash
npm run dev
```
The server will start at `http://localhost:5000`.

### 4. Build for Production
```bash
npm run build
npm start
```
