from src.ocr_processor.extractor import DocumentOCRExtractor
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.risk_scorer.scorer import MultiVectorRiskScorer

def test_ocr_extraction():
    extractor = DocumentOCRExtractor()
    doc = extractor.extract_document("GST_Certificate_2026.pdf")
    assert doc["ocr_status"] == "COMPLETED"
    assert "gstin" in doc["extracted_fields"]

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
