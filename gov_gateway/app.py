"""CSAP Government Gateway — simulated government registries for the prototype.

Represents the external portals CSAP verifies bidders against. Each registry is a separate
data source (data/<registry>.json); every answer is looked up in that file, re-read on each
request, so nothing is hardcoded in CSAP. In production each registry is replaced by a real
integration (API Setu, GSTN GSP, commercial KYC providers) behind the same backend adapter.

    POST /v1/pan/verify               {"pan", "name"?}                 PAN status + name match
    POST /v1/{registry}/lookup        {"identifier"}                   gstn, udyam, mca21, epfo, esic, startup_india, nsic
    POST /v1/debarment/check          {"pan"?, "gstin"?, "name"?}      active and past debarments
    POST /v1/digilocker/issued        {"identifiers": [..]}            issuer-held documents
    GET  /v1/registries                                                catalogue of registries and datasets
    GET  /v1/health
All endpoints except health require the header x-api-key.
"""

import json
import os
import re
import time
import uuid
from datetime import date, datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

DATA_DIR = Path(os.getenv("GOV_DATA_DIR", Path(__file__).parent / "data"))
API_KEY = os.getenv("PAN_API_KEY", "csap-demo-pan-key")
PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# registry -> (data file, identifier field, display name, formats)
LOOKUP_REGISTRIES = {
    "gstn": ("gstn.json", "gstin", "GSTN — GST registration & returns", re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")),
    "udyam": ("udyam.json", "udyam_number", "Udyam — MSME registration", re.compile(r"^UDYAM-[A-Z]{2}-\d{2}-\d{7}$")),
    "mca21": ("mca21.json", "cin", "MCA21 — company master data", re.compile(r"^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$")),
    "epfo": ("epfo.json", "establishment_code", "EPFO — establishment & ECR", re.compile(r"^[A-Z]{5}\d{7,10}$")),
    "esic": ("esic.json", "employer_code", "ESIC — employer registration", re.compile(r"^\d{17}$")),
    "startup_india": ("startup_india.json", "dpiit_number", "Startup India — DPIIT recognition", re.compile(r"^DIPP\d{3,7}$")),
    "nsic": ("nsic.json", "registration_number", "NSIC — Single Point Registration", re.compile(r"^NSIC/[A-Z]+/[A-Z]{2}/\d{4}/\d{5}$")),
}

app = FastAPI(title="CSAP Government Gateway (simulated registries)", version="2.0.0")


def load(file: str) -> dict:
    return json.loads((DATA_DIR / file).read_text(encoding="utf-8"))


def envelope(registry: str, ds: dict, file: str, started: float) -> dict:
    return {
        "registry": registry,
        "request_id": f"gov_{uuid.uuid4().hex[:12]}",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": {"dataset": ds["dataset"], "file": file, "version": ds["version"]},
        "lookup_ms": round((time.perf_counter() - started) * 1000, 2),
    }


def _auth(key: Optional[str]) -> None:
    if key != API_KEY:
        raise HTTPException(status_code=401, detail={"error": "UNAUTHORIZED", "message": "Missing or invalid x-api-key."})


# ---------------------------------------------------------------- name matching (PAN registry)

_SUFFIXES = {"PVT": "PRIVATE", "PRIVATE": "PRIVATE", "LTD": "LIMITED", "LIMITED": "LIMITED", "CO": "COMPANY", "&": "AND"}


def normalise_name(name: str) -> list[str]:
    tokens = re.sub(r"[^A-Z0-9& ]", " ", name.upper()).split()
    return [_SUFFIXES.get(t, t) for t in tokens]


def name_similarity(a: str, b: str) -> float:
    ta, tb = set(normalise_name(a)), set(normalise_name(b))
    return round(len(ta & tb) / len(ta | tb), 2) if ta and tb else 0.0


# ---------------------------------------------------------------- endpoints

@app.get("/v1/health")
def health():
    pan = load("pan.json")
    return {"status": "ok", "service": "csap-government-gateway", "records": len(pan["records"]),
            "registries": ["pan", *LOOKUP_REGISTRIES.keys(), "debarment", "digilocker"]}


@app.get("/v1/registries")
def registries(x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    out = [{"registry": "pan", "name": "PAN — Income Tax Department", "file": "pan.json"}]
    out += [{"registry": k, "name": v[2], "file": v[0]} for k, v in LOOKUP_REGISTRIES.items()]
    out += [{"registry": "debarment", "name": "Debarment list (CPPP / GeM / MoPNG / CPCL)", "file": "debarment.json"},
            {"registry": "digilocker", "name": "DigiLocker — issued documents", "file": "digilocker.json"}]
    for r in out:
        ds = load(r["file"])
        r.update({"dataset": ds["dataset"], "version": ds["version"], "records": len(ds["records"]), "mode": "SIMULATED"})
    return {"registries": out}


# Kept backwards compatible with the PAN pipeline (/v1/pan/verify).
class PanRequest(BaseModel):
    pan: str
    name: Optional[str] = None


@app.post("/v1/pan/verify")
def verify_pan(body: PanRequest, x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    started = time.perf_counter()
    pan = body.pan.strip().upper()
    ds = load("pan.json")
    meta = envelope("pan", ds, "pan.json", started)
    if not PAN_RE.match(pan):
        raise HTTPException(status_code=400, detail={**meta, "status": "INVALID_FORMAT", "pan": pan, "message": "PAN must be 5 letters, 4 digits, 1 letter."})
    record = next((r for r in ds["records"] if r["pan"] == pan), None)
    if record is None:
        return {**meta, "status": "NOT_FOUND", "pan": pan, "message": "No record for this PAN in the registry."}
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
    }
    if body.name:
        score = name_similarity(body.name, record["registered_name"])
        response.update({"name_match": "MATCH" if score >= 0.8 else "NO_MATCH", "name_match_score": score, "name_submitted": body.name})
    return response


class LookupRequest(BaseModel):
    identifier: str


@app.post("/v1/{registry}/lookup")
def lookup(registry: str, body: LookupRequest, x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    if registry not in LOOKUP_REGISTRIES:
        raise HTTPException(status_code=404, detail={"error": "UNKNOWN_REGISTRY", "message": f"No registry '{registry}'."})
    started = time.perf_counter()
    file, key, _name, fmt = LOOKUP_REGISTRIES[registry]
    identifier = body.identifier.strip().upper()
    ds = load(file)
    meta = envelope(registry, ds, file, started)
    if not fmt.match(identifier):
        raise HTTPException(status_code=400, detail={**meta, "status": "INVALID_FORMAT", "identifier": identifier, "message": f"Not a valid {key.replace('_', ' ')}."})
    record = next((r for r in ds["records"] if r[key].upper() == identifier), None)
    if record is None:
        return {**meta, "status": "NOT_FOUND", "identifier": identifier, "message": "No record for this identifier in the registry."}
    return {**meta, "status": "FOUND", "identifier": identifier, "record": record}


class DebarmentRequest(BaseModel):
    pan: Optional[str] = None
    gstin: Optional[str] = None
    name: Optional[str] = None
    as_of: Optional[str] = None  # ISO date; defaults to today


@app.post("/v1/debarment/check")
def debarment(body: DebarmentRequest, x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    started = time.perf_counter()
    ds = load("debarment.json")
    as_of = date.fromisoformat(body.as_of) if body.as_of else date.today()

    def matches(r):
        if body.pan and r.get("pan") == body.pan.upper():
            return "PAN"
        if body.gstin and r.get("gstin") == body.gstin.upper():
            return "GSTIN"
        if body.name and name_similarity(body.name, r["entity_name"]) >= 0.8:
            return "NAME"
        return None

    hits = []
    for r in ds["records"]:
        how = matches(r)
        if how:
            active = date.fromisoformat(r["debarred_from"]) <= as_of <= date.fromisoformat(r["debarred_until"])
            hits.append({**r, "matched_on": how, "active": active})
    return {
        **envelope("debarment", ds, "debarment.json", started),
        "status": "DEBARRED" if any(h["active"] for h in hits) else "CLEAR",
        "as_of": as_of.isoformat(),
        "matches": hits,
    }


class DigiLockerRequest(BaseModel):
    identifiers: List[str]


@app.post("/v1/digilocker/issued")
def digilocker(body: DigiLockerRequest, x_api_key: Optional[str] = Header(default=None)):
    _auth(x_api_key)
    started = time.perf_counter()
    ds = load("digilocker.json")
    wanted = {i.strip().upper() for i in body.identifiers if i}
    docs = [r for r in ds["records"] if r["identifier"].upper() in wanted]
    return {**envelope("digilocker", ds, "digilocker.json", started), "status": "FOUND" if docs else "NOT_FOUND", "documents": docs}
