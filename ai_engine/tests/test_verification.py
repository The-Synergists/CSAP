from unittest.mock import MagicMock, patch

from src.ocr_processor.extractor import DocumentOCRExtractor, NemotronOCRClient
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.risk_scorer.scorer import MultiVectorRiskScorer


# ---------------------------------------------------------------------------
# OCR extraction — fallback path (no API key / no image bytes)
# ---------------------------------------------------------------------------
def test_ocr_extraction_fallback():
    """Filename-only extraction uses the deterministic fallback (no API call)."""
    extractor = DocumentOCRExtractor()
    doc = extractor.extract_document("GST_Certificate_2026.pdf")
    assert doc["ocr_status"] == "COMPLETED"
    assert "gstin" in doc["extracted_fields"]
    assert doc["ocr_engine"] == "nemotron-ocr-v2 (fallback)"


def test_ocr_extraction_batch_fallback():
    """batch_extract works across multiple doc types without image bytes."""
    extractor = DocumentOCRExtractor()
    docs = [
        {"name": "GST_cert.pdf"},
        {"name": "PAN_card.pdf"},
        {"name": "UDYAM_cert.pdf"},
        {"name": "Bank_Guarantee.pdf"},
    ]
    results = extractor.batch_extract(docs)
    assert len(results) == 4
    types = [r["document_type"] for r in results]
    assert "GST_REGISTRATION_CERTIFICATE" in types
    assert "PAN_CARD" in types
    assert "UDYAM_REGISTRATION_CERTIFICATE" in types
    assert "BANK_GUARANTEE_EMD" in types


# ---------------------------------------------------------------------------
# OCR extraction — live Nemotron OCR path (mocked HTTP)
# ---------------------------------------------------------------------------
def test_ocr_extraction_nemotron_live():
    """When image bytes and an API key are present, Nemotron OCR V2 is called."""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "data": [{
            "text": [
                "GSTIN: 33AABCC1234F1Z5",
                "Legal Name: Apex Infra Solutions Pvt Ltd",
                "Status: Active",
                "Registration Date: 12/04/2018",
            ],
            "confidence": [0.99, 0.97, 0.98, 0.96],
            "bounding_boxes": [[0, 0, 100, 20]] * 4,
        }]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("src.ocr_processor.extractor.requests.post", return_value=mock_response), \
         patch("src.ocr_processor.extractor.settings") as mock_settings:
        mock_settings.nvidia_api_key = "nvapi-test-key"
        mock_settings.nemotron_ocr_endpoint = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2/infer"
        mock_settings.nemotron_ocr_merge_level = "paragraph"

        extractor = DocumentOCRExtractor()
        doc = extractor.extract_document(
            file_name="GST_Certificate_2026.png",
            file_bytes=b"fake-image-bytes",
            mime_type="image/png",
        )

    assert doc["ocr_status"] == "COMPLETED"
    assert doc["ocr_engine"] == "nemotron-ocr-v2"
    assert len(doc["raw_text_blocks"]) == 4
    assert doc["confidence"] > 0


def test_nemotron_client_raises_without_key():
    """NemotronOCRClient raises RuntimeError when no API key is configured."""
    with patch("src.ocr_processor.extractor.settings") as mock_settings:
        mock_settings.nvidia_api_key = ""
        mock_settings.nemotron_ocr_endpoint = "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2/infer"
        mock_settings.nemotron_ocr_merge_level = "paragraph"
        client = NemotronOCRClient()
        try:
            client.infer(b"bytes")
            assert False, "Should have raised RuntimeError"
        except RuntimeError as exc:
            assert "NVIDIA_API_KEY" in str(exc)

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
