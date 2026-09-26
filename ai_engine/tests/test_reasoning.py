"""Comprehensive test suite for the pluggable reasoning engine."""

from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient

from src.main import app
from src.reasoning_engine.deterministic_provider import DeterministicReasoningProvider
from src.reasoning_engine.openai_compatible_provider import OpenAICompatibleReasoningProvider
from src.reasoning_engine.factory import get_reasoning_engine

client = TestClient(app)


def test_deterministic_reasoning_compliant_case():
    """A compliant bidder should yield LOW risk and RECOMMENDED_ACCEPT."""
    provider = DeterministicReasoningProvider()
    report = provider.analyze_bid(
        tender_id="GEM/2026/CPCL/001",
        bid_id="BID-001",
        tender_requirements=[],
        bidder_data={
            "companyName": "Apex Infra Solutions Pvt Ltd",
            "gstin": "33AABCC1234F1Z5",
            "pan": "AABCC1234F",
            "udyamNumber": "UDYAM-TN-01-0012345",
            "makeInIndiaPercentage": 65,
            "average_turnover": 64000000,
            "emd": {
                "requiredAmount": 2500000,
                "submittedAmount": 2500000,
                "instrumentType": "BANK_GUARANTEE",
                "transactionOrBgNo": "BG/2026/CPCL/98712",
                "validUntil": "2026-12-31"
            }
        }
    )

    assert "executive_summary" in report
    assert "detailed_analysis" in report
    assert report["suggested_action"] == "RECOMMENDED_ACCEPT"
    assert report["risk_assessment"]["overall_risk_level"] == "LOW"
    assert len(report["pros"]) > 0
    assert len(report["cons"]) == 0


def test_deterministic_reasoning_pan_gstin_mismatch():
    """Mismatched PAN and GSTIN must trigger a CRITICAL non-compliance evidence item."""
    provider = DeterministicReasoningProvider()
    report = provider.analyze_bid(
        tender_id="GEM/2026/CPCL/001",
        bid_id="BID-002",
        tender_requirements=[],
        bidder_data={
            "companyName": "Fraudulent Corp",
            "gstin": "33AABCC1234F1Z5",
            "pan": "ZZZXX9999Q",  # does not match AABCC1234F
            "average_turnover": 64000000,
            "emd": {"requiredAmount": 2500000, "submittedAmount": 2500000}
        }
    )

    assert report["suggested_action"] == "RECOMMENDED_REJECT"
    assert report["risk_assessment"]["overall_risk_level"] == "CRITICAL"
    assert len(report["evidence_items"]) >= 1
    ev = report["evidence_items"][0]
    assert "EV-" in ev["id"]
    assert ev["finding_type"] == "NON_COMPLIANCE"
    assert "PAN" in ev["ai_finding"]


def test_deterministic_reasoning_emd_deficit():
    """An EMD deficit must surface an evidence item and flag the deficit amount."""
    provider = DeterministicReasoningProvider()
    report = provider.analyze_bid(
        tender_id="GEM/2026/CPCL/001",
        bid_id="BID-003",
        tender_requirements=[],
        bidder_data={
            "companyName": "Budget Infra",
            "gstin": "33AABCC1234F1Z5",
            "pan": "AABCC1234F",
            "emd": {
                "requiredAmount": 2500000,
                "submittedAmount": 1500000,  # 10L deficit
                "instrumentType": "BANK_GUARANTEE"
            }
        }
    )

    assert len(report["evidence_items"]) >= 1
    emd_ev = [e for e in report["evidence_items"] if "EMD" in e["requirement_title"]][0]
    assert "10 Lakhs" in emd_ev["ai_finding"] or "1,000,000" in emd_ev["ai_finding"]
    assert report["suggested_action"] in ("RECOMMENDED_REJECT", "CLARIFICATION_SEEKED")


def test_openai_compatible_provider_live_mock():
    """OpenAI/NVIDIA compatible provider parses standard chat completions JSON."""
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "choices": [
            {
                "message": {
                    "content": """```json
{
  "executive_summary": "LLM Scrutiny: Bidder complies with all tender prerequisites.",
  "detailed_analysis": "All statutory and technical clauses were verified via LLM reasoning.",
  "suggested_action": "RECOMMENDED_ACCEPT",
  "confidence": 0.98,
  "risk_assessment": {
    "overall_risk_level": "LOW",
    "risk_score": 10,
    "vector_scores": {"statutory": 5, "financial": 10, "emd": 5, "document": 5, "policy": 5}
  },
  "pros": ["Valid GSTIN and PAN", "EMD Bank Guarantee confirmed"],
  "cons": [],
  "evidence_items": [
    {
      "id": "EV-01",
      "requirement_title": "GSTIN Validity",
      "finding_type": "VERIFIED",
      "ai_finding": "Active status verified on GSTN.",
      "submitted_document_name": "GST.pdf",
      "document_snippet": "GSTIN: 33AABCC1234F1Z5",
      "tender_clause_requirement": "Clause 2.1",
      "source": "Nemotron Reasoning Engine",
      "resolution_status": "RESOLVED"
    }
  ]
}
```"""
                }
            }
        ]
    }
    mock_response.raise_for_status = MagicMock()

    with patch("src.reasoning_engine.openai_compatible_provider.requests.post", return_value=mock_response):
        provider = OpenAICompatibleReasoningProvider(
            endpoint="https://integrate.api.nvidia.com/v1/chat/completions",
            model="nvidia/nemotron-3-super-120b-a12b",
            api_key="nvapi-test-key",
        )
        report = provider.analyze_bid(
            tender_id="GEM/2026/CPCL/001",
            bid_id="BID-001",
            tender_requirements=[],
            bidder_data={"companyName": "Test Bidder", "gstin": "33AABCC1234F1Z5", "pan": "AABCC1234F"},
        )

        assert report["suggested_action"] == "RECOMMENDED_ACCEPT"
        assert report["confidence"] == 0.98
        assert len(report["evidence_items"]) == 1
        assert report["evidence_items"][0]["id"] == "EV-01"


def test_factory_switching():
    """Factory should correctly instantiate providers based on string names."""
    fallback_engine = get_reasoning_engine("fallback")
    assert isinstance(fallback_engine, DeterministicReasoningProvider)

    nvidia_engine = get_reasoning_engine("nvidia")
    assert isinstance(nvidia_engine, OpenAICompatibleReasoningProvider)


def test_api_reasoning_analyze_endpoint():
    """POST /api/v1/reasoning/analyze returns structured XAI report."""
    payload = {
        "tenderId": "GEM/2026/CPCL/001",
        "bidId": "BID-001",
        "bidderData": {
            "companyName": "Apex Infra Solutions Pvt Ltd",
            "gstin": "33AABCC1234F1Z5",
            "pan": "AABCC1234F",
            "makeInIndiaPercentage": 60,
            "average_turnover": 64000000,
            "emd": {
                "requiredAmount": 2500000,
                "submittedAmount": 2500000,
                "instrumentType": "BANK_GUARANTEE"
            }
        }
    }
    res = client.post("/api/v1/reasoning/analyze", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert "report" in data
    assert "suggested_action" in data["report"]
    assert "evidence_items" in data["report"]


def test_api_verify_includes_reasoning_fields():
    """POST /api/v1/verify now includes aiRecommendation, evidenceItems, and detailed riskAssessment."""
    payload = {
        "bidId": "BID-001",
        "tenderId": "GEM/2026/CPCL/001",
        "gstin": "33AABCC1234F1Z5",
        "pan": "AABCC1234F",
        "documents": [{"name": "GST_Certificate_2026.pdf"}]
    }
    res = client.post("/api/v1/verify", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert "aiRecommendation" in data
    assert "summary" in data["aiRecommendation"]
    assert "suggestedAction" in data["aiRecommendation"]
    assert "pros" in data["aiRecommendation"]
    assert "evidenceItems" in data


def test_deterministic_assistant_qa():
    """Verify deterministic assistant handles bidder and statutory inquiries."""
    provider = DeterministicReasoningProvider()

    # Query about ABC Industrial
    res_abc = provider.answer_question("Why is ABC Industrial Solutions under manual review?")
    assert "ABC Industrial Solutions" in res_abc["answer"]
    assert "EVD-001" in res_abc["evidence_ref"]
    assert "Dräger Safety" in res_abc["answer"]

    # Query about EMD
    res_emd = provider.answer_question("What is the EMD requirement?", tender_context={"emdAmountFormatted": "₹2,00,000"})
    assert "₹2,00,000" in res_emd["answer"]
    assert "MSEs" in res_emd["answer"]

    # Query about Risk score calculation
    res_risk = provider.answer_question("How is the risk score calculated?")
    assert "multi-vector" in res_risk["answer"].lower() or "multi-factor" in res_risk["answer"].lower()


def test_api_assistant_chat_endpoint():
    """POST /api/v1/assistant/chat returns answer, evidence reference, and model info."""
    payload = {
        "question": "What is the discrepancy found in National Safety Systems?",
        "tenderContext": {
            "id": "GEM/2026/CPCL/001",
            "title": "Supply and Installation of Industrial Safety Systems",
            "emdAmountFormatted": "₹2,00,000"
        },
        "biddersSummary": [
            {"id": "BID-003", "companyName": "National Safety Systems", "riskLevel": "HIGH", "riskScore": 68}
        ]
    }
    res = client.post("/api/v1/assistant/chat", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "SUCCESS"
    assert "answer" in data
    assert "National Safety" in data["answer"]
    assert "model" in data
    if data.get("evidence"):
        assert "EVD" in data["evidence"] or "Clause" in data["evidence"] or isinstance(data["evidence"], str)
