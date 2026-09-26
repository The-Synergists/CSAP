"""Base interface for pluggable reasoning engine providers."""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseReasoningProvider(ABC):
    """Abstract base class for model-agnostic procurement reasoning providers."""

    @abstractmethod
    def analyze_bid(
        self,
        tender_id: str,
        bid_id: str,
        tender_requirements: List[Dict[str, Any]],
        bidder_data: Dict[str, Any],
        ocr_results: Optional[List[Dict[str, Any]]] = None,
        registry_checks: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Analyze a bidder submission against tender criteria and return an explainable AI report.

        Returns:
            Dict matching schema:
            {
                "executive_summary": str,
                "detailed_analysis": str,
                "suggested_action": str,
                "confidence": float,
                "risk_assessment": {
                    "overall_risk_level": str,
                    "risk_score": int,
                    "vector_scores": Dict[str, int]
                },
                "pros": List[str],
                "cons": List[str],
                "evidence_items": List[Dict[str, Any]]
            }
        """
        pass

    @abstractmethod
    def answer_question(
        self,
        question: str,
        tender_context: Optional[Dict[str, Any]] = None,
        bidder_context: Optional[Dict[str, Any]] = None,
        bidders_summary: Optional[List[Dict[str, Any]]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """
        Answer an interactive inquiry from a procurement officer regarding tender stipulations,
        bidder scrutiny findings, EMD reconciliation, or risk scores.

        Returns:
            Dict matching schema:
            {
                "answer": str,
                "evidence_ref": Optional[str],
                "model": str,
            }
        """
        pass

