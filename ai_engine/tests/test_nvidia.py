"""NVIDIA stages with the HTTP calls mocked (no network, no API cost)."""
import base64
import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)
PNG = base64.b64encode(b"\x89PNG fake").decode()

OCR_RESPONSE = {"data": [{"index": 0, "text_detections": [
    {"text_prediction": {"text": "Name", "confidence": 0.95}, "bounding_box": {"points": [{"x": 0.05, "y": 0.40}]}},
    {"text_prediction": {"text": "Permanent Account Number", "confidence": 0.93}, "bounding_box": {"points": [{"x": 0.05, "y": 0.25}]}},
    {"text_prediction": {"text": "AABCA1234F", "confidence": 0.97}, "bounding_box": {"points": [{"x": 0.05, "y": 0.31}]}},
    {"text_prediction": {"text": "ABC INDUSTRIAL SOLUTIONS PVT LTD", "confidence": 0.9}, "bounding_box": {"points": [{"x": 0.05, "y": 0.46}]}},
]}]}


def _ok(json_body):
    res = MagicMock(ok=True, status_code=200)
    res.json.return_value = json_body
    return res


def test_ocr_parses_detections_in_reading_order():
    with patch("src.nvidia.ocr.requests.post", return_value=_ok(OCR_RESPONSE)), patch("src.nvidia.ocr.settings") as s:
        s.nvidia_ocr_api_key, s.nemotron_ocr_endpoint, s.nemotron_ocr_merge_level = "k", "https://x", "paragraph"
        body = client.post("/api/v1/documents/ocr", json={"fileName": "a.png", "mimeType": "image/png", "contentBase64": PNG}).json()
    assert body["text"].split("\n") == ["Permanent Account Number", "AABCA1234F", "Name", "ABC INDUSTRIAL SOLUTIONS PVT LTD"]
    assert body["model"] == "nvidia/nemotron-ocr-v2"


def test_ocr_without_key_fails_instead_of_inventing_data():
    with patch("src.nvidia.ocr.settings") as s:
        s.nvidia_ocr_api_key = ""
        res = client.post("/api/v1/documents/ocr", json={"fileName": "a.png", "mimeType": "image/png", "contentBase64": PNG})
    assert res.status_code == 503
    assert res.json()["detail"]["code"] == "NVIDIA_NOT_CONFIGURED"


def _stream(content):
    chunks = [b"data: " + json.dumps({"choices": [{"delta": {"content": c}}]}).encode() for c in content] + [b"data: [DONE]"]
    res = MagicMock(ok=True, status_code=200)
    res.iter_lines.return_value = chunks
    res.__enter__ = lambda self: self
    res.__exit__ = lambda self, *a: None
    return res


OCR_TEXT = "Permanent Account Number\nAABCA1234F\nName\nABC INDUSTRIAL SOLUTIONS PVT LTD"


def _extract(model_output):
    with patch("src.nvidia.extraction.requests.post", return_value=_stream([model_output])), patch("src.nvidia.extraction.settings") as s:
        s.nvidia_extraction_api_key, s.nvidia_extraction_base_url, s.nvidia_extraction_model = "k", "https://x/v1", "m"
        return client.post("/api/v1/documents/extract", json={"documentType": "PAN", "ocrText": OCR_TEXT}).json()


def test_extraction_returns_grounded_fields():
    body = _extract('```json\n{"pan": "AABCA1234F", "name": "ABC INDUSTRIAL SOLUTIONS PVT LTD", "date_of_incorporation": null, "category": null}\n```')
    assert body["fields"]["pan"] == "AABCA1234F"
    assert all(body["grounding"].values())
    assert body["warnings"] == []


def test_extraction_flags_hallucinated_value():
    body = _extract('{"pan": "ZZZZZ9999Z", "name": "ABC INDUSTRIAL SOLUTIONS PVT LTD", "date_of_incorporation": null, "category": null}')
    assert body["grounding"]["pan"] is False
    assert any("pan" in w for w in body["warnings"])


def test_engine_key_enforced(monkeypatch):
    from src.core.config import settings
    monkeypatch.setattr(settings, "engine_api_key", "secret")
    assert client.post("/api/v1/documents/extract", json={"documentType": "PAN", "ocrText": "x"}).status_code == 401
    assert client.get("/api/v1/health").status_code == 200
