from src.ocr_processor.extractor import DocumentOCRExtractor
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.risk_scorer.scorer import MultiVectorRiskScorer
from src.main import app, _run_full_pipeline
from fastapi.testclient import TestClient

client = TestClient(app)

def test_ocr_extraction():
    extractor = DocumentOCRExtractor()
    # Test clean state without image bytes
    doc = extractor.extract_document("GST_Certificate_2026.pdf")
    assert doc["ocr_status"] == "PENDING"
    assert doc["extracted_fields"] == {}

    # Test with mocked requests response from Nemotron Parse 2.0
    from unittest.mock import MagicMock, patch
    dummy_bytes = b"fake_png_header"
    mock_resp = MagicMock()
    mock_resp.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": '{"document_type": "GST_REGISTRATION_CERTIFICATE", "confidence": 0.98, "extracted_fields": {"gstin": "33AABCC1234F1Z5"}, "raw_text": "Sample text", "layout_markdown": "# GST"}'
                }
            }
        ]
    }
    mock_resp.raise_for_status = MagicMock()

    with patch("requests.post", return_value=mock_resp):
        parsed = extractor.extract_document("GST_Certificate_2026.png", file_bytes=dummy_bytes)
        assert parsed["ocr_status"] == "COMPLETED"
        assert parsed["extracted_fields"]["gstin"] == "33AABCC1234F1Z5"

def test_registry_verifier():
    checker = StatutoryRegistryChecker()
    res = checker.verify_gstn("33AABCC1234F1Z5")
    assert res["status"] == "VERIFIED"
    assert res["portal"] == "GSTN"

def test_risk_scorer_low():
    scorer = MultiVectorRiskScorer()
    res = scorer.calculate_risk_score([])
    assert res["overall_risk_level"] == "LOW"
    assert res["recommendation"] == "RECOMMENDED_ACCEPT"

def test_documents_ingest_endpoint():
    payload = {
        "bidId": "BID-001",
        "tenderId": "GEM/2026/CPCL/001",
        "runId": "test-run-123",
        "documentId": "test-doc-456",
        "gstin": "33AABCC1234F1Z5",
        "pan": "AABCC1234F",
        "udyamNumber": "UDYAM-TN-01-0012345",
        "companyName": "Apex Infra Solutions",
        "enterpriseType": "small",
        "isBlacklisted": False,
        "tenderRequirements": [],
        "emd": {
            "requiredAmount": 2500000,
            "submittedAmount": 2500000,
            "instrumentType": "BANK_GUARANTEE",
            "transactionOrBgNo": "BG/2026/CPCL/98712",
            "validUntil": "2026-12-31"
        },
        "averageTurnover": 64000000,
        "minRequiredTurnover": 50000000,
        "makeInIndiaPercentage": 65,
        "documents": [{"id": "d1", "name": "GST_Certificate_2026.pdf", "url": "bids/BID-001/doc.pdf"}]
    }
    response = client.post("/api/v1/documents/ingest", json=payload)
    assert response.status_code == 202
    data = response.json()
    assert data["status"] == "ACCEPTED"
    assert "pipeline started" in data["message"].lower()

def test_run_full_pipeline():
    result = _run_full_pipeline(
        bid_id="BID-001",
        tender_id="GEM/2026/CPCL/001",
        gstin="33AABCC1234F1Z5",
        pan="AABCC1234F",
        udyam_number="UDYAM-TN-01-0012345",
        company_name="Apex Infra Solutions",
        enterprise_type="small",
        is_blacklisted=False,
        tender_requirements=[],
        emd={
            "requiredAmount": 2500000,
            "submittedAmount": 2500000,
            "instrumentType": "BANK_GUARANTEE",
            "transactionOrBgNo": "BG/2026/CPCL/98712",
            "validUntil": "2026-12-31"
        },
        average_turnover=64000000,
        min_required_turnover=50000000,
        make_in_india_percentage=65,
        documents=[{"id": "d1", "name": "GST_Certificate_2026.pdf", "url": "bids/BID-001/doc.pdf"}],
        run_id=None
    )
    assert "ocrResults" in result
    assert "registryChecks" in result
    assert "findings" in result
    assert result["aiRecommendation"]["suggestedAction"] in (
        "RECOMMENDED_ACCEPT",
        "APPROVE",
        "CLARIFICATION_SEEKED",
        "REQUEST_CLARIFICATION",
        "COMMITTEE_REVIEW",
    )
