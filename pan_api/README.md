# Dummy PAN Verification API (CSAP prototype)

A separate service that represents the external PAN verification API CSAP would call in
production. It has **its own data source**, `data/pan_registry.json`; every answer is looked
up in that file (it is re-read on each request, so edits take effect immediately). All records
are fictitious.

```bash
# from the repo root (uses the ai_engine virtualenv)
npm run dev:pan-api      # http://localhost:8100
npm run test:pan-api
```

## API

`POST /v1/pan/verify` with header `x-api-key` (env `PAN_API_KEY`, default `csap-demo-pan-key`)

```json
{ "pan": "AABCA1234F", "name": "ABC Industrial Solutions Pvt Ltd" }
```

Response (VALID, name matches):

```json
{
  "status": "VALID", "pan": "AABCA1234F",
  "registered_name": "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED", "category": "Company",
  "name_match": "MATCH", "name_match_score": 1.0,
  "record_id": "PANREG-0001",
  "source": { "file": "pan_registry.json", "dataset": "CSAP dummy PAN registry", "version": "2026.09.1" },
  "request_id": "panreq_…", "timestamp": "…", "lookup_ms": 0.4
}
```

| Situation | Example PAN | Result |
| --- | --- | --- |
| Valid, name matches | `AABCA1234F`, `ABCDE1234A` | `VALID`, `name_match: MATCH` |
| Valid, name does not match | `AAGCK5566L` (sent with "Kaveri Safety Equipment…") | `VALID`, `name_match: NO_MATCH` |
| Invalid / deactivated | `AAECS7788K` / `AAFCR3322Q` | `INVALID` / `DEACTIVATED` |
| Not in registry | `AAHCZ9090P` | `NOT_FOUND` |
| Malformed | `12345ABCDE` | HTTP 400 `INVALID_FORMAT` |

Also: `GET /v1/health`, `GET /v1/dataset` (file, version, record count).
