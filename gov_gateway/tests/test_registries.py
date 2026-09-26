from fastapi.testclient import TestClient

from app import app

client = TestClient(app)
KEY = {"x-api-key": "csap-demo-pan-key"}


def lookup(registry, identifier):
    return client.post(f"/v1/{registry}/lookup", json={"identifier": identifier}, headers=KEY)


def test_catalogue_lists_all_registries_with_their_files():
    regs = {r["registry"]: r for r in client.get("/v1/registries", headers=KEY).json()["registries"]}
    assert set(regs) == {"pan", "gstn", "udyam", "mca21", "epfo", "esic", "startup_india", "nsic", "debarment", "digilocker"}
    assert all(r["mode"] == "SIMULATED" and r["records"] > 0 for r in regs.values())


def test_gstn_active_with_full_filing_history():
    body = lookup("gstn", "33AABCA1234F1Z8").json()
    assert body["status"] == "FOUND"
    rec = body["record"]
    assert rec["status"] == "Active" and len(rec["filings"]) == 6
    assert all(f["status"] == "ON_TIME" for f in rec["filings"])
    assert body["source"]["file"] == "gstn.json"


def test_gstn_edge_cases():
    assert lookup("gstn", "33AAECS7788K1Z9").json()["record"]["status"] == "Cancelled"
    kaveri = lookup("gstn", "29AAGCK5566L1ZX").json()["record"]
    assert sum(f["status"] == "NOT_FILED" for f in kaveri["filings"]) == 3
    assert lookup("gstn", "27AAHCZ9090P1Z5").json()["status"] == "NOT_FOUND"
    assert lookup("gstn", "NOT-A-GSTIN").status_code == 400


def test_udyam_mca_epfo_esic_nsic_startup():
    assert lookup("udyam", "UDYAM-TN-02-0089142").json()["record"]["type"] == "Small"
    assert lookup("udyam", "UDYAM-KR-03-0055667").json()["record"]["type"] == "Medium"
    assert lookup("mca21", "U74999TN2012PTC088123").json()["record"]["company_status"] == "Strike Off"
    assert lookup("epfo", "UPNOI0078129").json()["record"]["latest_ecr_month"] == "2026-06"
    assert lookup("esic", "51000458920000101").json()["status"] == "FOUND"
    assert lookup("nsic", "NSIC/SPRS/TN/2024/00481").json()["record"]["status"] == "Valid"
    assert lookup("startup_india", "DIPP098765").json()["record"]["status"] == "Expired"


def test_debarment_active_past_and_clear():
    active = client.post("/v1/debarment/check", json={"pan": "AAFCR3322Q", "as_of": "2026-09-05"}, headers=KEY).json()
    assert active["status"] == "DEBARRED" and active["matches"][0]["authority"] == "MoPNG"
    past = client.post("/v1/debarment/check", json={"gstin": "33AAECS7788K1Z9", "as_of": "2026-09-05"}, headers=KEY).json()
    assert past["status"] == "CLEAR" and past["matches"][0]["active"] is False
    clear = client.post("/v1/debarment/check", json={"pan": "AABCA1234F", "name": "ABC Industrial Solutions Pvt Ltd"}, headers=KEY).json()
    assert clear["status"] == "CLEAR" and clear["matches"] == []


def test_digilocker_returns_issuer_documents():
    body = client.post("/v1/digilocker/issued", json={"identifiers": ["AABCA1234F", "33AABCA1234F1Z8", "UDYAM-TN-02-0045812"]}, headers=KEY).json()
    assert {d["doc_type"] for d in body["documents"]} == {"PANCR", "GSTRC", "UDCER"}


def test_unknown_registry_and_key_required():
    assert lookup("unknown", "X").status_code == 404
    assert client.post("/v1/gstn/lookup", json={"identifier": "33AABCA1234F1Z8"}).status_code == 401
