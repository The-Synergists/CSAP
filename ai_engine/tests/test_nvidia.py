"""NVIDIA stages with the HTTP calls mocked (no network, no API cost)."""
import base64
import json
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)
PNG = base64.b64encode(b"\x89PNG fake").decode()


def _ok(json_body):
    res = MagicMock(ok=True, status_code=200)
    res.json.return_value = json_body
    return res


def _ocr_stream(blocks):
    """blocks: list of (xmin, ymin, text, xmax, ymax, class_label)."""
    content = "\n\n".join(f"<x_{xmin}><y_{ymin}>{text}<x_{xmax}><y_{ymax}><class_{label}>" for xmin, ymin, text, xmax, ymax, label in blocks)
    return _stream([content])


def test_ocr_parses_detections_in_reading_order():
    blocks = [
        (0.05, 0.40, "Name", 0.30, 0.42, "Text"),
        (0.05, 0.25, "Permanent Account Number", 0.40, 0.27, "Text"),
        (0.05, 0.31, "AABCA1234F", 0.25, 0.33, "Text"),
        (0.05, 0.46, "ABC INDUSTRIAL SOLUTIONS PVT LTD", 0.50, 0.48, "Text"),
    ]
    with patch("src.nvidia.ocr.requests.post", return_value=_ocr_stream(blocks)), patch("src.nvidia.ocr.settings") as s:
        s.nvidia_ocr_api_key, s.nemotron_ocr_endpoint, s.nvidia_ocr_model = "k", "https://x", "nvidia/nemotron-parse-2.0"
        body = client.post("/api/v1/documents/ocr", json={"fileName": "a.png", "mimeType": "image/png", "contentBase64": PNG}).json()
    assert body["text"].split("\n") == ["Permanent Account Number", "AABCA1234F", "Name", "ABC INDUSTRIAL SOLUTIONS PVT LTD"]
    assert body["model"] == "nvidia/nemotron-parse-2.0"


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


def _extract(model_output, document_type="PAN", ocr_text=OCR_TEXT, raw=False):
    with patch("src.nvidia.extraction.requests.post", return_value=_stream([model_output])), patch("src.nvidia.extraction.settings") as s:
        s.nvidia_extraction_api_key, s.nvidia_extraction_base_url, s.nvidia_extraction_model = "k", "https://x/v1", "m"
        res = client.post("/api/v1/documents/extract", json={"documentType": document_type, "ocrText": ocr_text})
        return res if raw else res.json()


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


INDIVIDUAL_PAN = chr(10).join(["INCOME TAX DEPARTMENT", "GOVT. OF INDIA", "RAHUL KUMAR SHARMA", "SURESH KUMAR SHARMA", "14/08/1998", "Permanent Account Number", "BQXPS4821K"])


def test_individual_pan_card_fields():
    body = _extract('{"pan": "BQXPS4821K", "name": "RAHUL KUMAR SHARMA", "father_name": "SURESH KUMAR SHARMA", "date_of_birth": "14/08/1998", "date_of_incorporation": null, "category": "Individual"}', ocr_text=INDIVIDUAL_PAN)
    assert body["fields"]["father_name"] == "SURESH KUMAR SHARMA"
    assert body["fields"]["date_of_birth"] == "14/08/1998"
    # "Individual" is not printed on the card, so it is flagged rather than trusted.
    assert body["grounding"]["category"] is False


GST_TEXT = chr(10).join(["Form GST REG-06", "Registration Number: 09AABCN5544K1Z2", "Legal Name: NATIONAL SAFETY SYSTEMS", "Type of Registration: Regular"])


def test_gst_certificate_extraction_normalises_identifier():
    body = _extract('{"gstin": "09aabcn5544k1z2", "legal_name": "NATIONAL SAFETY SYSTEMS", "trade_name": null, "registration_type": "Regular", "address": null}', "GST_CERTIFICATE", GST_TEXT)
    assert body["documentType"] == "GST_CERTIFICATE"
    assert body["fields"]["gstin"] == "09AABCN5544K1Z2"
    assert all(body["grounding"].values())


def test_every_bid_document_type_has_a_schema():
    from src.nvidia.extraction import SCHEMAS
    for t in ["PAN", "GST_CERTIFICATE", "UDYAM_CERTIFICATE", "FINANCIAL_STATEMENTS", "MAKE_IN_INDIA", "OEM_AUTHORIZATION", "EMD", "EPFO_ESIC", "PAST_PERFORMANCE", "TEST_REPORT", "AFFIDAVIT", "LAND_BORDER"]:
        assert t in SCHEMAS


def test_unknown_document_type_rejected():
    assert _extract("{}", "PASSPORT", raw=True).status_code == 400


EVIDENCE = [
    {"id": "EVD-003", "text": "EMD shortfall: required INR 2,00,000, received INR 1,50,000 (NEFT TXN881294); 50,000 short."},
    {"id": "EVD-004", "text": "Average turnover INR 3.47 Cr against the INR 5.00 Cr benchmark."},
    {"id": "REQ-02", "text": "GST registration: met. Active regular registration."},
]


def _recommend(model_output):
    with patch("src.nvidia.extraction.requests.post", return_value=_stream([model_output])), patch("src.nvidia.extraction.settings") as s:
        s.nvidia_extraction_api_key, s.nvidia_extraction_base_url, s.nvidia_extraction_model = "k", "https://x/v1", "m"
        return client.post("/api/v1/recommendation/draft", json={"bidId": "BID-003", "bidder": "National Safety Systems", "tender": "T1", "suggestedDecision": "REJECT", "score": 41, "evidence": EVIDENCE}).json()


def test_recommendation_keeps_only_grounded_sentences():
    out = json.dumps({"sentences": [
        {"text": "The EMD received was 1,50,000, which is 50,000 short of the 2,00,000 required.", "citations": ["EVD-003"]},
        {"text": "Average turnover of 3.47 Cr is below the 5.00 Cr benchmark [EVD-004].", "citations": []},
        {"text": "The GST registration is active.", "citations": ["REQ-02"]},
        {"text": "The bidder has a strong track record.", "citations": []},
        {"text": "The bidder was blacklisted in 2024.", "citations": ["EVD-099"]},
        {"text": "The EMD is 75,000 short.", "citations": ["EVD-003"]},
    ]})
    body = _recommend(out)
    kept = [s["text"] for s in body["sentences"]]
    assert len(kept) == 3
    assert kept[1] == "Average turnover of 3.47 Cr is below the 5.00 Cr benchmark."  # inline citation parsed and stripped
    reasons = [d["reason"] for d in body["dropped"]]
    assert reasons[0] == "cites no evidence"
    assert "EVD-099" in reasons[1]
    assert "75000" in reasons[2]


def _pdf(pages):
    import pymupdf
    doc = pymupdf.open()
    for text in pages:
        doc.new_page().insert_text((72, 72), text)
    return doc.tobytes()


def test_pdf_pages_are_rendered_and_read_in_order():
    pdf = base64.b64encode(_pdf(["PAN AABCA1234F", "Page two"])).decode()
    page = _ocr_stream([(0.1, 0.1, "PAN AABCA1234F", 0.5, 0.2, "Text")])
    with patch("src.nvidia.ocr.requests.post", return_value=page) as post, patch("src.nvidia.ocr.settings") as s:
        s.nvidia_ocr_api_key, s.nemotron_ocr_endpoint, s.nvidia_ocr_model = "k", "https://x", "nvidia/nemotron-parse-2.0"
        body = client.post("/api/v1/documents/ocr", json={"fileName": "a.pdf", "mimeType": "application/pdf", "contentBase64": pdf}).json()
    assert post.call_count == 2  # one OCR call per page
    assert body["pages"] == 2
    assert body["blocks"][0]["page"] == 1 and body["blocks"][-1]["page"] == 2
    assert post.call_args_list[0].kwargs["json"]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/png;base64,")


def test_broken_pdf_is_rejected():
    with patch("src.nvidia.ocr.settings") as s:
        s.nvidia_ocr_api_key = "k"
        res = client.post("/api/v1/documents/ocr", json={"fileName": "a.pdf", "mimeType": "application/pdf", "contentBase64": base64.b64encode(b"not a pdf").decode()})
    assert res.status_code == 422
