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

from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from xml.sax.saxutils import quoteattr
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
    ds = json.loads((DATA_DIR / file).read_text(encoding="utf-8"))
    if file == "pan.json":
        ds["records"] = ds["records"] + extra_pan_records()
    return ds


def extra_pan_records() -> list:
    """Private test records (e.g. a team member's own PAN) from the PAN_EXTRA_RECORDS environment
    variable, a JSON list of {pan, registered_name, status?, category?}. They live only in the
    deployment's encrypted settings, never in the repository."""
    try:
        rows = json.loads(os.getenv("PAN_EXTRA_RECORDS", "[]"))
    except json.JSONDecodeError:
        return []
    out = []
    for i, r in enumerate(rows if isinstance(rows, list) else []):
        if not isinstance(r, dict) or not PAN_RE.match(str(r.get("pan", "")).upper()) or not r.get("registered_name"):
            continue
        out.append({
            "record_id": f"PANREG-PRIVATE-{i + 1}",
            "pan": r["pan"].upper(),
            "registered_name": str(r["registered_name"]).upper(),
            "status": r.get("status", "VALID"),
            "category": r.get("category", "Individual"),
            "date_of_incorporation": r.get("date_of_birth"),
            "aadhaar_seeding": r.get("aadhaar_seeding", "Y"),
            "last_updated": r.get("last_updated", "2026-09-27"),
            "remarks": "Private test record supplied through the deployment settings.",
        })
    return out


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


DATASET_FILES = {"pan": "pan.json", **{k: v[0] for k, v in LOOKUP_REGISTRIES.items()}, "debarment": "debarment.json", "digilocker": "digilocker.json"}


@app.get("/v1/{registry}/records")
def records(registry: str, x_api_key: Optional[str] = Header(default=None)):
    """The whole simulated dataset of one registry, so anyone can see exactly what it holds."""
    _auth(x_api_key)
    if registry not in DATASET_FILES:
        raise HTTPException(status_code=404, detail={"error": "UNKNOWN_REGISTRY", "message": f"No registry '{registry}'."})
    file = DATASET_FILES[registry]
    ds = load(file)
    rows = [r for r in ds["records"] if not str(r.get("record_id", "")).startswith("PANREG-PRIVATE")]  # private test PANs stay private
    return {"registry": registry, "file": file, "dataset": ds["dataset"], "version": ds["version"], "records": rows}


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


# ================================================================ API Setu and GSTN formats
#
# API Setu (apisetu.gov.in) certificate APIs, as published in its OpenAPI specifications:
#   POST https://apisetu.gov.in/<issuer>/v3/<doctype>/certificate
#   headers  X-APISETU-APIKEY, X-APISETU-CLIENTID
#   body     {"txnId": <uuid>, "format": "xml" | "pdf", "certificateParameters": {...}, "consentArtifact": {...}}
#   200      the certificate (application/xml here), 400/401/404/500 {"error", "errorDescription"}
# The GSTN public APIs (Search Taxpayer, Track Return) are reached through a GST Suvidha Provider.

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def setu_error(status: int, code: str, description: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": code, "errorDescription": description})


class SetuRequest(BaseModel):
    txnId: Optional[str] = None
    format: Optional[str] = None
    certificateParameters: Optional[dict] = None
    consentArtifact: Optional[dict] = None


def setu_check(body: SetuRequest, apikey: Optional[str], clientid: Optional[str], required: List[str]) -> Optional[JSONResponse]:
    if apikey != API_KEY or not clientid:
        return setu_error(401, "invalid_authentication", "Authentication failed")
    params = body.certificateParameters or {}
    if not body.txnId or not body.format or any(not str(params.get(k, "")).strip() for k in required):
        return setu_error(400, "missing_parameter", "Please provide all mandatory parameters")
    if not UUID_RE.match(body.txnId):
        return setu_error(400, "invalid_txnid", "The txnId parameter must be in UUID format")
    if body.format != "xml":
        # API Setu also offers "pdf"; this simulation issues the certificate as XML only.
        return setu_error(400, "invalid_format", "The format parameter is invalid")
    consent_id = ((body.consentArtifact or {}).get("consent") or {}).get("consentId")
    if consent_id and not UUID_RE.match(str(consent_id)):
        return setu_error(400, "invalid_consentid", "The consentId parameter must be in UUID format")
    return None


def attrs(**kv) -> str:
    return " ".join(f"{k}={quoteattr('' if v is None else str(v))}" for k, v in kv.items())


def ddmmyyyy(iso: Optional[str]) -> str:
    return f"{iso[8:10]}-{iso[5:7]}-{iso[0:4]}" if iso and len(iso) >= 10 else ""


def certificate(name: str, doc_type: str, txn: str, issuer: str, issued_to: str, data: str) -> Response:
    now = datetime.now(timezone.utc)
    head = attrs(language="99", name=name, type=doc_type, number=txn, issuedAt=now.strftime("%d-%m-%Y"), status="A")
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        f"<Certificate {head}>\n"
        f"  <IssuedBy><Organization {attrs(name=issuer, code='', tin='', uid='', type='CG')}/></IssuedBy>\n"
        f"  <IssuedTo>{issued_to}</IssuedTo>\n"
        f"  <CertificateData>{data}</CertificateData>\n"
        "</Certificate>"
    )
    return Response(content=xml, media_type="application/xml")


@app.post("/pan/v3/pancr/certificate")
def setu_pan(body: SetuRequest, x_apisetu_apikey: Optional[str] = Header(default=None), x_apisetu_clientid: Optional[str] = Header(default=None)):
    """API Setu: PAN Verification Record (Income Tax Department). certificateParameters: panno,
    PANFullName (+ FullName, DOB, GENDER, UID for individuals)."""
    err = setu_check(body, x_apisetu_apikey, x_apisetu_clientid, ["panno", "PANFullName"])
    if err:
        return err
    p = body.certificateParameters or {}
    pan = str(p["panno"]).strip().upper()
    if not PAN_RE.match(pan):
        return setu_error(400, "invalid_parameter", "Bad request")
    record = next((r for r in load("pan.json")["records"] if r["pan"] == pan), None)
    if record is None:
        return setu_error(404, "record_not_found", "No record found")
    score = name_similarity(str(p["PANFullName"]), record["registered_name"])
    now = datetime.now(timezone.utc).strftime("%d-%m-%Y %H:%M:%S")
    person = attrs(uid="", name=record["registered_name"], dob=ddmmyyyy(record.get("date_of_incorporation")), gender="", category=record["category"])
    # status and nameMatch are returned by this simulation so that the verification result is explicit.
    data = attrs(num=pan, verifiedOn=now, status=record["status"], nameMatch="Y" if score >= 0.8 else "N", nameMatchScore=score)
    return certificate("PAN Verification Record", "PANCR", body.txnId, "Income Tax Department", f"<Person {person}/>", f"<PANVerificationRecord {data}/>")


@app.post("/msme/v3/udcer/certificate")
def setu_udyam(body: SetuRequest, x_apisetu_apikey: Optional[str] = Header(default=None), x_apisetu_clientid: Optional[str] = Header(default=None)):
    """API Setu: Udyam Registration Certificate (Ministry of MSME). certificateParameters: udyamNumber,
    mobileNumber (the registered mobile; the real API requires it, this simulation accepts it when given)."""
    err = setu_check(body, x_apisetu_apikey, x_apisetu_clientid, ["udyamNumber"])
    if err:
        return err
    number = str((body.certificateParameters or {})["udyamNumber"]).strip().upper()
    if not LOOKUP_REGISTRIES["udyam"][3].match(number):
        return setu_error(400, "invalid_parameter", "Bad request")
    rec = next((r for r in load("udyam.json")["records"] if r["udyam_number"].upper() == number), None)
    if rec is None:
        return setu_error(404, "record_not_found", "No record found")
    org = attrs(name=rec["enterprise_name"], type=rec["type"])
    data = attrs(
        udyamNumber=number,
        enterpriseName=rec["enterprise_name"],
        enterpriseType=rec["type"],
        majorActivity=rec["major_activity"],
        nicCodes="; ".join(rec.get("nic_codes", [])),
        dateOfRegistration=ddmmyyyy(rec.get("date_of_registration")),
        classificationYear=rec.get("classification_year", ""),
        status=rec["status"],
        remarks=rec.get("remarks", ""),
    )
    return certificate("Udyam Registration Certificate", "UDCER", body.txnId, "Ministry of Micro, Small and Medium Enterprises", f"<Organization {org}/>", f"<UdyamRegistration {data}/>")


def gstn_error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"status_cd": "0", "error": {"error_cd": code, "message": message}})


def _gstn_record(gstin: str):
    return next((r for r in load("gstn.json")["records"] if r["gstin"].upper() == gstin), None)


@app.get("/commonapi/v1.1/search")
def gstn_search(action: str = Query(...), gstin: str = Query(...), x_api_key: Optional[str] = Header(default=None)):
    """GSTN public API, Search Taxpayer (action=TP): the registration details of a GSTIN."""
    if x_api_key != API_KEY:
        return gstn_error(401, "AUTH4033", "Invalid session or credentials")
    g = gstin.strip().upper()
    if action.upper() != "TP":
        return gstn_error(400, "SWEB_9000", "Invalid action")
    if not LOOKUP_REGISTRIES["gstn"][3].match(g):
        return gstn_error(400, "SWEB_9035", "Invalid GSTIN / UID")
    r = _gstn_record(g)
    if r is None:
        return gstn_error(404, "FO8000", "No records found for the provided GSTIN")
    reg = r.get("registration_date", "")
    return {
        "gstin": g,
        "lgnm": r["legal_name"],
        "tradeNam": r.get("trade_name", ""),
        "sts": r["status"],
        "dty": r.get("taxpayer_type", "Regular"),
        "ctb": r.get("constitution", ""),
        "rgdt": f"{reg[8:10]}/{reg[5:7]}/{reg[0:4]}" if len(reg) >= 10 else "",
        "cxdt": "",
        "stj": r.get("state", ""),
        "ctj": "",
        "nba": [],
        "lstupdt": "",
        "pradr": {"addr": {"bnm": r.get("principal_address", ""), "st": "", "loc": "", "bno": "", "stcd": r.get("state", ""), "dst": "", "city": "", "flno": "", "lt": "", "lg": "", "pncd": ""}, "ntr": ""},
    }


MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]


@app.get("/commonapi/v1.0/returns")
def gstn_returns(action: str = Query(...), gstin: str = Query(...), fy: str = Query(...), x_api_key: Optional[str] = Header(default=None)):
    """GSTN public API, Track Return (action=RETTRACK): the returns a GSTIN filed in a financial year."""
    if x_api_key != API_KEY:
        return gstn_error(401, "AUTH4033", "Invalid session or credentials")
    g = gstin.strip().upper()
    if action.upper() != "RETTRACK":
        return gstn_error(400, "SWEB_9000", "Invalid action")
    if not re.match(r"^\d{4}-\d{2}$", fy):
        return gstn_error(400, "RET11416", "Invalid financial year")
    r = _gstn_record(g)
    if r is None:
        return gstn_error(404, "FO8000", "No records found for the provided GSTIN")
    start = int(fy[:4])
    filed = []
    for n, f in enumerate(r.get("filings", [])):
        mon, year = f["period"].split()
        m, y = MONTHS.index(mon) + 1, int(year)
        in_fy = (y == start and m >= 4) or (y == start + 1 and m <= 3)
        if not in_fy or not f.get("filed_on"):
            continue
        d = f["filed_on"]
        filed.append({
            "valid": "Y",
            "mof": "ONLINE",
            "dof": f"{d[8:10]}-{d[5:7]}-{d[0:4]}",
            "rtntype": f.get("return_type", "GSTR-3B").replace("-", ""),
            "ret_prd": f"{m:02d}{y}",
            "arn": f"AA{g[:2]}{m:02d}{str(y)[2:]}{g[2:7]}{n:03d}",
            "status": "Filed",
        })
    return {"EFiledlist": filed}
