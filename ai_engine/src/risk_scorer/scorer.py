from typing import List, Dict, Any

class MultiVectorRiskScorer:
    """Calculates multi-vector risk index (Low, Medium, High, Critical) based on compliance findings."""

    def calculate_risk_score(self, findings: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not findings:
            return {
                "overall_risk_level": "LOW",
                "risk_score": 12,
                "confidence": 0.96,
                "recommendation": "RECOMMENDED_ACCEPT",
                "summary": "All statutory and financial prerequisites satisfy tender stipulations."
            }

        critical_count = sum(1 for f in findings if f.get("severity") == "CRITICAL")
        high_count = sum(1 for f in findings if f.get("severity") == "HIGH")

        if critical_count > 0:
            risk_level = "CRITICAL"
            score = 88
            rec = "RECOMMENDED_REJECT"
        elif high_count > 0:
            risk_level = "HIGH"
            score = 65
            rec = "CLARIFICATION_SEEKED"
        else:
            risk_level = "MEDIUM"
            score = 42
            rec = "MANUAL_REVIEW"

        return {
            "overall_risk_level": risk_level,
            "risk_score": score,
            "confidence": 0.91,
            "findings_count": len(findings),
            "recommendation": rec,
            "summary": f"Detected {len(findings)} potential discrepancy item(s) requiring officer review."
        }
