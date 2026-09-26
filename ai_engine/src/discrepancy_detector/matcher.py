from typing import List, Dict, Any
from datetime import datetime, timezone


class DiscrepancyDetector:
    """
    Statutory rule engine — evaluates hard, objective compliance rules before the LLM runs.
    Each rule maps to a published CPCL tender clause or statutory regulation.
    """

    def evaluate_compliance(
        self, tender_requirements: List[Dict[str, Any]], bidder_data: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        findings: List[Dict[str, Any]] = []

        gstin: str = str(bidder_data.get("gstin", "")).strip().upper()
        pan: str = str(bidder_data.get("pan", "")).strip().upper()
        udyam: str = str(bidder_data.get("udyamNumber") or bidder_data.get("udyam_number", "")).strip()
        mii_pct: float = float(bidder_data.get("makeInIndiaPercentage", 0) or 0)
        is_blacklisted: bool = bool(bidder_data.get("isBlacklisted", False))
        enterprise_type: str = bidder_data.get("enterpriseType", "").lower()

        emd: Dict[str, Any] = bidder_data.get("emd") or {}
        emd_required_amount: float = float(emd.get("requiredAmount") or emd.get("required_amount") or 2500000)
        emd_submitted_amount: float = float(emd.get("submittedAmount") or emd.get("submitted_amount") or emd.get("amount") or 0)
        instrument_type: str = str(emd.get("instrumentType") or emd.get("instrument_type") or "BANK_GUARANTEE")
        valid_until: str = str(emd.get("validUntil") or emd.get("expiry_date") or "")

        min_required_turnover: float = float(bidder_data.get("min_required_turnover", 50_000_000))
        average_turnover: float = float(bidder_data.get("average_turnover", 64_000_000))

        # ── RULE 1: Blacklisting / Debarment ─────────────────────────────────
        if is_blacklisted:
            findings.append({
                "code": "DISC-STAT-00",
                "finding_type": "NON_COMPLIANCE",
                "category": "STATUTORY",
                "severity": "CRITICAL",
                "title": "Vendor Blacklisted / Debarred",
                "description": (
                    "Bidder appears on a government debarment / blacklisting list. "
                    "Participation in public procurement is prohibited (GFR 2017 Rule 151)."
                ),
            })

        # ── RULE 2: PAN–GSTIN Cross-Match ─────────────────────────────────────
        if gstin and pan:
            pan_in_gstin = gstin[2:12] if len(gstin) >= 12 else ""
            if pan_in_gstin != pan:
                findings.append({
                    "code": "DISC-STAT-01",
                    "finding_type": "NON_COMPLIANCE",
                    "category": "STATUTORY",
                    "severity": "CRITICAL",
                    "title": "PAN–GSTIN Identity Mismatch",
                    "description": (
                        f"PAN embedded in GSTIN (characters 3-12: '{pan_in_gstin}') does not match "
                        f"declared PAN '{pan}'. This indicates a possible identity substitution or data error. "
                        f"Clause 2.1: Bidder must hold valid PAN and GSTIN under identical corporate identity."
                    ),
                })

        # ── RULE 3: EMD Amount Adequacy ────────────────────────────────────────
        is_msme_exemption = instrument_type in ("MSME_EXEMPTION", "EXEMPTED") or emd_submitted_amount == 0
        if not is_msme_exemption and emd_submitted_amount < emd_required_amount:
            deficit = emd_required_amount - emd_submitted_amount
            findings.append({
                "code": "DISC-EMD-01",
                "finding_type": "NON_COMPLIANCE",
                "category": "EMD",
                "severity": "CRITICAL",
                "title": "EMD Bank Guarantee Deficit",
                "description": (
                    f"Submitted EMD/Bank Guarantee ₹{emd_submitted_amount:,.0f} is deficient by "
                    f"₹{deficit:,.0f} against mandatory tender requirement of ₹{emd_required_amount:,.0f}. "
                    f"Clause 3.1: Deficient EMD is liable for summary disqualification."
                ),
            })

        # ── RULE 4: Ineligible MSME Exemption ─────────────────────────────────
        if is_msme_exemption and "medium" in enterprise_type:
            findings.append({
                "code": "DISC-EMD-02",
                "finding_type": "NON_COMPLIANCE",
                "category": "EMD",
                "severity": "HIGH",
                "title": "Ineligible MSME Exemption Claim",
                "description": (
                    f"Bidder claims EMD exemption under MSME/Udyam but is classified as '{enterprise_type}'. "
                    f"Under MSE Procurement Policy Order 2012, only Micro and Small enterprises qualify. "
                    f"Medium enterprises must deposit full EMD."
                ),
            })

        # ── RULE 5: Bank Guarantee Validity Date ─────────────────────────────
        if valid_until and not is_msme_exemption:
            try:
                expiry_dt = datetime.strptime(valid_until, "%Y-%m-%d").replace(tzinfo=timezone.utc)
                days_remaining = (expiry_dt - datetime.now(timezone.utc)).days
                if days_remaining < 90:
                    findings.append({
                        "code": "DISC-EMD-03",
                        "finding_type": "NON_COMPLIANCE",
                        "category": "EMD",
                        "severity": "HIGH",
                        "title": "Bank Guarantee Validity Insufficient",
                        "description": (
                            f"Bank Guarantee expires on {valid_until} ({days_remaining} days remaining). "
                            f"Tender requires minimum 180-day validity from bid opening. "
                            f"Clause 3.3: BG must be valid for the full bid validity period."
                        ),
                    })
            except ValueError:
                pass  # unparseable date — let LLM handle it

        # ── RULE 6: Financial Turnover Threshold ──────────────────────────────
        if average_turnover < min_required_turnover:
            findings.append({
                "code": "DISC-FIN-01",
                "finding_type": "NON_COMPLIANCE",
                "category": "FINANCIAL",
                "severity": "HIGH",
                "title": "Annual Turnover Below Tender Threshold",
                "description": (
                    f"3-year average annual turnover ₹{average_turnover/1e7:.2f} Cr falls below "
                    f"mandatory threshold of ₹{min_required_turnover/1e7:.2f} Cr. "
                    f"Clause 4.1: Bidder must demonstrate sufficient financial capacity."
                ),
            })

        # ── RULE 7: Make-in-India Local Content ───────────────────────────────
        if mii_pct > 0 and mii_pct < 20:
            findings.append({
                "code": "DISC-POL-01",
                "finding_type": "NON_COMPLIANCE",
                "category": "POLICY",
                "severity": "HIGH",
                "title": "Make-in-India Local Content Below Minimum",
                "description": (
                    f"Declared local content ({mii_pct:.0f}%) is below the mandatory Class-II minimum of 20%. "
                    f"MII Order 2017: Products in notified categories must meet minimum local content thresholds."
                ),
            })

        return findings
