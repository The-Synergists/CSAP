from typing import List, Dict, Any

class DiscrepancyDetector:
    """Detects discrepancies between tender requirements and bidder submissions."""

    def evaluate_compliance(self, tender_requirements: List[Dict[str, Any]], bidder_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        findings = []
        
        # Example rule: EMD Verification
        emd_required = bidder_data.get("emd_required", True)
        has_emd = bidder_data.get("has_valid_emd", True)
        if emd_required and not has_emd:
            findings.append({
                "code": "DISC-EMD-01",
                "finding_type": "NON_COMPLIANCE",
                "category": "EMD",
                "severity": "CRITICAL",
                "title": "EMD BG Discrepancy",
                "description": "Submitted Bank Guarantee amount does not meet mandatory 2% tender requirement."
            })

        # Example rule: Turnover Verification
        min_turnover = bidder_data.get("min_required_turnover", 50000000)
        reported_turnover = bidder_data.get("average_turnover", 64000000)
        if reported_turnover < min_turnover:
            findings.append({
                "code": "DISC-FIN-02",
                "finding_type": "NON_COMPLIANCE",
                "category": "FINANCIAL",
                "severity": "HIGH",
                "title": "Turnover Threshold Deficit",
                "description": f"Annual turnover (₹{reported_turnover/1e7:.2f} Cr) is below required ₹{min_turnover/1e7:.2f} Cr."
            })

        return findings
