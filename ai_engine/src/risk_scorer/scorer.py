"""Risk assessment and advisory recommendation from check results.

Each exception carries risk points set by the rule that raised it (mandatory EMD and
financial failures weigh most). The total maps to LOW / MEDIUM / HIGH. The recommendation
is advisory only — the procurement officer records the actual decision.
"""

from typing import Any, Dict, List

from src.schemas import CheckResult

LOW_MAX = 24
MEDIUM_MAX = 49
FINANCIAL_OR_EMD = ("turnover", "earnest money", "emd")


class MultiVectorRiskScorer:
    def assess(self, checks: List[CheckResult], requirement_titles: Dict[str, str]) -> Dict[str, Any]:
        exceptions = [c for c in checks if c.status in ("REVIEW", "NOT_MET", "MISSING")]
        score = min(95, sum(c.riskPoints for c in exceptions))
        level = "LOW" if score <= LOW_MAX else "MEDIUM" if score <= MEDIUM_MAX else "HIGH"
        drivers = [
            {"requirementCode": c.requirementCode, "status": c.status, "points": c.riskPoints}
            for c in sorted(exceptions, key=lambda c: -c.riskPoints)
        ]
        return {"level": level, "score": score, "drivers": drivers, "recommendation": self._recommend(exceptions, requirement_titles)}

    def _recommend(self, exceptions: List[CheckResult], titles: Dict[str, str]) -> Dict[str, str]:
        def is_core(c: CheckResult) -> bool:
            return any(k in titles.get(c.requirementCode, "").lower() for k in FINANCIAL_OR_EMD)

        hard_fail = [c for c in exceptions if c.status == "NOT_MET" and is_core(c)]
        if hard_fail:
            return {
                "suggestedDecision": "REJECT",
                "summary": "Potential non-compliance on mandatory conditions ("
                + ", ".join(titles.get(c.requirementCode, c.requirementCode) for c in hard_fail)
                + "). Officer review required.",
            }
        if not exceptions:
            return {"suggestedDecision": "APPROVE", "summary": "All requirements met. No exceptions found."}
        if all(c.status == "REVIEW" and is_core(c) for c in exceptions):
            return {
                "suggestedDecision": "APPROVE",
                "summary": "Meets all requirements; a borderline financial figure should be confirmed by the officer.",
            }
        return {
            "suggestedDecision": "REQUEST_CLARIFICATION",
            "summary": f"{len(exceptions)} item(s) need clarification before a final decision.",
        }
