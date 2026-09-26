"""Dummy PAN Verification API for the CSAP prototype.

Represents the kind of external PAN verification service CSAP would call in production.
It is a separate service with its own data source: every answer is looked up in
data/pan_registry.json — nothing is hardcoded in CSAP or in this code.

    POST /v1/pan/verify   {"pan": "AABCA1234F", "name": "ABC Industrial Solutions Pvt Ltd"}
    GET  /v1/dataset      dataset metadata (which file, how many records)
    GET  /v1/health

Outcomes the dataset can produce:
    VALID + name MATCH, VALID + name NO_MATCH, INVALID, DEACTIVATED, NOT_FOUND, and
    HTTP 400 INVALID_FORMAT for a malformed PAN.
"""

import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

DATA_FILE = Path(os.getenv("PAN_DATA_FILE", Path(__file__).parent / "data" / "pan_registry.json"))
API_KEY = os.getenv("PAN_API_KEY", "csap-demo-pan-key")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

app = FastAPI(title="Dummy PAN Verification API (CSAP prototype)", version="1.0.0")


def load_dataset() -> dict:
    """Read the data file on every request so edits to it take effect immediately."""
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))


_SUFFIXES = {"PVT": "PRIVATE", "PRIVATE": "PRIVATE", "LTD": "LIMITED", "LIMITED": "LIMITED", "CO": "COMPANY", "&": "AND"}


def normalise_name(name: str) -> list[str]:
    tokens = re.sub(r"[^A-Z0-9& ]", " ", name.upper()).split()
    return [_SUFFIXES.get(t, t) for t in tokens]


def name_similarity(a: str, b: str) -> float:
    ta, tb = set(normalise_name(a)), set(normalise_name(b))
    return round(len(ta & tb) / len(ta | tb), 2) if ta and tb else 0.0


class VerifyRequest(BaseModel):
    pan: str
    name: Optional[str] = None


def _auth(key: Optional[str]) -> None:
    if key != API_KEY:
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Missing or invalid x-api-key."})


@app.get("/v1/health")
def health():
    ds = load_dataset()
    return {"status": "ok", "service": "dummy-pan-verification-api", "records": len(ds["records"])}


@app.get("/v1/dataset")
def dataset_info(x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    ds = load_dataset()
    return {
        "dataset": ds["dataset"],
        "file": DATA_FILE.name,
        "version": ds["version"],
        "updated_at": ds["updated_at"],
        "records": len(ds["records"]),
    }


@app.post("/v1/pan/verify")
def verify(body: VerifyRequest, x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    started = time.perf_counter()
    pan = body.pan.strip().upper()
    meta = {
        "request_id": f"panreq_{uuid.uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if not PAN_RE.match(pan):
        raise HTTPException(
            status_code=400,
            detail={**meta, "status": "INVALID_FORMAT", "pan": pan, "message": "PAN must be 5 letters, 4 digits, 1 letter."},
        )

    ds = load_dataset()
    record = next((r for r in ds["records"] if r["pan"] == pan), None)
    source = {"dataset": ds["dataset"], "file": DATA_FILE.name, "version": ds["version"]}

    if record is None:
        return {**meta, "status": "NOT_FOUND", "pan": pan, "message": "No record for this PAN in the registry.", "source": source,
                "lookup_ms": round((time.perf_counter() - started) * 1000, 2)}

    response = {
        **meta,
        "status": record["status"],
        "pan": pan,
        "registered_name": record["registered_name"],
        "category": record["category"],
        "date_of_incorporation": record["date_of_incorporation"],
        "aadhaar_seeding": record["aadhaar_seeding"],
        "last_updated": record["last_updated"],
        "remarks": record["remarks"],
        "record_id": record["record_id"],
        "source": source,
    }
    if body.name:
        score = name_similarity(body.name, record["registered_name"])
        response["name_match"] = "MATCH" if score >= 0.8 else "NO_MATCH"
        response["name_match_score"] = score
        response["name_submitted"] = body.name
    response["lookup_ms"] = round((time.perf_counter() - started) * 1000, 2)
    return response
