from fastapi.testclient import TestClient

from app import app

client = TestClient(app)
KEY = {"x-api-key": "csap-demo-pan-key"}


def verify(pan, name=None):
    return client.post("/v1/pan/verify", json={"pan": pan, "name": name}, headers=KEY)


def test_valid_pan_with_matching_name():
    body = verify("AABCA1234F", "ABC Industrial Solutions Pvt. Ltd.").json()
    assert body["status"] == "VALID"
    assert body["registered_name"] == "ABC INDUSTRIAL SOLUTIONS PRIVATE LIMITED"
    assert body["name_match"] == "MATCH"
    assert body["source"]["file"] == "pan.json"


def test_valid_pan_but_name_does_not_match():
    body = verify("AAGCK5566L", "Kaveri Safety Equipment Pvt Ltd").json()
    assert body["status"] == "VALID"
    assert body["name_match"] == "NO_MATCH"


def test_invalid_and_deactivated_pan():
    assert verify("AAECS7788K").json()["status"] == "INVALID"
    assert verify("AAFCR3322Q").json()["status"] == "DEACTIVATED"


def test_pan_not_found():
    body = verify("AAHCZ9090P").json()
    assert body["status"] == "NOT_FOUND"


def test_malformed_pan_rejected():
    res = verify("12345ABCDE")
    assert res.status_code == 400
    assert res.json()["detail"]["status"] == "INVALID_FORMAT"


def test_api_key_required():
    assert client.post("/v1/pan/verify", json={"pan": "AABCA1234F"}).status_code == 401


def test_reference_example_from_brief():
    body = verify("ABCDE1234A", "ABC INDUSTRIAL SOLUTIONS PVT LTD").json()
    assert body["status"] == "VALID" and body["name_match"] == "MATCH"
