import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from src.main import app
from src.ocr_processor.extractor import parse_fields
from src.registry_verifier.checker import StatutoryRegistryChecker

CASES = json.loads((Path(__file__).parent / "fixtures" / "demo_bids.json").read_text(encoding="utf-8"))
client = TestClient(app)


def _verify(case):
    res = client.post("/api/v1/verify", json=case["payload"])
    assert res.status_code == 200, res.text
    return res.json()


@pytest.mark.parametrize("case", CASES, ids=[c["payload"]["bidId"] for c in CASES])
def test_engine_reproduces_demo_scenario(case):
    """Every requirement status, the risk level and the suggested decision must match the
    verification record shown in the app for that bid."""
    body = _verify(case)
    got = {c["requirementCode"]: c["status"] for c in body["checks"]}
    assert got == case["expected"]["checks"]
    assert body["risk"]["level"] == case["expected"]["riskLevel"]
    assert body["recommendation"]["suggestedDecision"] == case["expected"]["suggestedDecision"]
    assert body["advisory"] is True


def _case(bid_id):
    return next(c for c in CASES if c["payload"]["bidId"] == bid_id)


def test_emd_shortfall_explains_the_gap():
    body = _verify(_case("BID-003"))
    emd = next(c for c in body["checks"] if c["requirementCode"] == "REQ-06")
    f = emd["finding"]
    assert f["title"] == "EMD shortfall of ₹50,000"
    assert f["expected"] == "₹2,00,000"
    assert "₹1,50,000" in f["submitted"]
    assert f["comparison"].startswith("₹50,000 shortfall")
    assert f["severity"] == "HIGH"


def test_oem_validity_computed_from_opening_date():
    body = _verify(_case("BID-001"))
    oem = next(c for c in body["checks"] if c["requirementCode"] == "REQ-05")
    assert oem["status"] == "REVIEW"
    assert "04 Dec 2026" in oem["finding"]["expected"]
    assert oem["finding"]["comparison"] == "35 days short of the required validity"


def test_emd_topped_up_passes():
    case = json.loads(json.dumps(_case("BID-003")))
    case["payload"]["emd"]["submittedAmount"] = 200000
    body = _verify(case)
    emd = next(c for c in body["checks"] if c["requirementCode"] == "REQ-06")
    assert emd["status"] == "MET"


def test_ocr_parses_fields_without_inventing_data():
    assert parse_fields("GSTIN: 33AABCA1234F1Z8 | Status: Active Regular") == {"gstin": "33AABCA1234F1Z8", "status": "Active Regular"}
    assert parse_fields("") == {}


def test_registry_check_cross_validates_pan_in_gstin():
    checker = StatutoryRegistryChecker()
    assert checker.verify_gstin("33AABCA1234F1Z8", "AABCA1234F")["status"] == "VERIFIED"
    assert checker.verify_gstin("33AABCA1234F1Z8", "AABCB9876E")["status"] == "MISMATCH"
    assert checker.verify_gstin("33AABCA1234F1Z8", "AABCA1234F")["simulated"] is True


def test_health():
    assert client.get("/api/v1/health").json()["status"] == "healthy"
