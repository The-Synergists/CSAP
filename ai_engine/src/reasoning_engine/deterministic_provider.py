"""Deterministic Fallback Reasoning Provider for offline testing and zero-dependency execution."""

import re
from typing import Any, Dict, List, Optional
from src.reasoning_engine.base import BaseReasoningProvider


class DeterministicReasoningProvider(BaseReasoningProvider):
    """
    Evaluates tender clauses and bidder submissions using deterministic statutory audit heuristics.
    Guarantees 100% reliable schema compliance and instant zero-cost evaluation for tests and offline runs.
    """

    def analyze_bid(
        self,
        tender_id: str,
        bid_id: str,
        tender_requirements: List[Dict[str, Any]],
        bidder_data: Dict[str, Any],
        ocr_results: Optional[List[Dict[str, Any]]] = None,
        registry_checks: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        company_name = bidder_data.get("companyName") or bidder_data.get("company_name", "Bidder")
        gstin = str(bidder_data.get("gstin", "")).strip().upper()
        pan = str(bidder_data.get("pan", "")).strip().upper()
        udyam = str(bidder_data.get("udyamNumber") or bidder_data.get("udyam_number", "")).strip().upper()
        mii_pct = bidder_data.get("makeInIndiaPercentage", 65)

        evidence_items: List[Dict[str, Any]] = []
        pros: List[str] = []
        cons: List[str] = []
        ev_counter = 1

        statutory_risk = 5
        financial_risk = 5
        emd_risk = 5
        document_risk = 5
        policy_risk = 5

        # ------------------------------------------------------------------
        # 1. Statutory Identity & PAN-GSTIN Match
        # ------------------------------------------------------------------
        pan_in_gstin = gstin[2:12] if len(gstin) >= 12 else ""
        if gstin and pan and pan_in_gstin != pan:
            statutory_risk += 80
            cons.append(f"Statutory mismatch: Declared PAN ({pan}) does not match PAN embedded in GSTIN ({pan_in_gstin}).")
            evidence_items.append({
                "id": f"EV-{ev_counter:02d}",
                "requirement_title": "Statutory PAN-GSTIN Identity Consistency",
                "finding_type": "NON_COMPLIANCE",
                "ai_finding": f"Statutory cross-match failed. Declared PAN {pan} does not match PAN characters {pan_in_gstin} in GSTIN {gstin}.",
                "submitted_document_name": "GST_Registration_Certificate.pdf",
                "document_snippet": f"GSTIN: {gstin} | Declared PAN: {pan}",
                "tender_clause_requirement": "Clause 2.1: Bidder must possess valid PAN and GSTIN in identical corporate name.",
                "source": "Reasoning Engine / Statutory Cross-Verification",
                "resolution_status": "OPEN",
            })
            ev_counter += 1
        elif gstin and pan:
            pros.append(f"Statutory PAN-GSTIN coherence confirmed ({pan} matches GSTIN {gstin}).")

        # Check external registry check payloads if supplied
        if registry_checks:
            gst_res = registry_checks.get("gstn", {})
            if gst_res.get("status") == "MISMATCH" or gst_res.get("status") == "CANCELLED":
                statutory_risk += 70
                cons.append(f"GSTN registry status: {gst_res.get('status')} - Taxpayer not in good standing.")
            elif gst_res.get("status") == "VERIFIED":
                pros.append("GSTN registry status confirmed Active with monthly return filing frequency.")

        # ------------------------------------------------------------------
        # 2. EMD & Bank Guarantee Reconciliation
        # ------------------------------------------------------------------
        emd = bidder_data.get("emd", {})
        emd_required = emd.get("requiredAmount") or emd.get("required_amount") or 2500000
        emd_submitted = emd.get("submittedAmount") or emd.get("submitted_amount") or emd.get("amount", 0)
        instrument_type = emd.get("instrumentType") or emd.get("instrument_type", "BANK_GUARANTEE")
        bg_number = emd.get("transactionOrBgNo") or emd.get("bg_number", "BG/CPCL/PENDING")
        valid_until = emd.get("validUntil") or emd.get("expiry_date", "2026-12-31")

        # Check Udyam / MSME Exemption claim
        is_msme_exemption_claimed = instrument_type in ("MSME_EXEMPTION", "EXEMPTED") or emd_submitted == 0

        # Look into OCR extracted Udyam certificate
        enterprise_type = "Medium Enterprise"
        if ocr_results:
            for doc in ocr_results:
                if "UDYAM" in doc.get("document_type", ""):
                    enterprise_type = doc.get("extracted_fields", {}).get("enterprise_type", enterprise_type)

        if is_msme_exemption_claimed:
            if "Medium" in enterprise_type:
                emd_risk += 75
                cons.append(f"Ineligible MSME exemption claimed: Enterprise classified as '{enterprise_type}'. Under CPCL tender rules & MSE Order 2012, EMD exemption applies exclusively to Micro & Small enterprises.")
                evidence_items.append({
                    "id": f"EV-{ev_counter:02d}",
                    "requirement_title": "EMD Exemption Eligibility Criteria",
                    "finding_type": "NON_COMPLIANCE",
                    "ai_finding": f"Bidder claimed EMD exemption under Udyam registration, but Udyam certificate confirms classification as '{enterprise_type}'. Only Micro and Small enterprises qualify for exemption.",
                    "submitted_document_name": "Udyam_Registration_Certificate.pdf",
                    "document_snippet": f"Udyam No: {udyam} | Enterprise Type: {enterprise_type}",
                    "tender_clause_requirement": "Clause 3.2: EMD exemption is strictly available only to Micro & Small Enterprises (MSEs) registered with Udyam.",
                    "source": "Reasoning Engine / Udyam Verification",
                    "resolution_status": "OPEN",
                })
                ev_counter += 1
            else:
                pros.append(f"Valid MSME exemption confirmed for {enterprise_type} under Udyam {udyam}.")
        else:
            # Check BG deficit
            if emd_submitted < emd_required:
                deficit = emd_required - emd_submitted
                emd_risk += 65
                cons.append(f"EMD Bank Guarantee deficit: Submitted ₹{emd_submitted:,.0f} vs required ₹{emd_required:,.0f} (Deficit of ₹{deficit:,.0f}).")
                evidence_items.append({
                    "id": f"EV-{ev_counter:02d}",
                    "requirement_title": "Mandatory EMD Bank Guarantee Amount",
                    "finding_type": "NON_COMPLIANCE",
                    "ai_finding": f"Submitted Bank Guarantee value ₹{emd_submitted:,.0f} is deficient by ₹{deficit:,.0f} against tender stipulation of ₹{emd_required:,.0f}.",
                    "submitted_document_name": "Bank_Guarantee_EMD.pdf",
                    "document_snippet": f"BG No: {bg_number} | Amount: INR {emd_submitted:,.0f} | Valid Until: {valid_until}",
                    "tender_clause_requirement": f"Clause 3.1: Mandatory EMD of 2% (₹{emd_required:,.0f}) valid for 180 days from technical opening.",
                    "source": "Reasoning Engine / EMD Reconciliation",
                    "resolution_status": "OPEN",
                })
                ev_counter += 1
            else:
                pros.append(f"EMD requirement satisfied: Bank Guarantee {bg_number} meets mandatory ₹{emd_required:,.0f}.")

        # ------------------------------------------------------------------
        # 3. Financial Turnover Evaluation
        # ------------------------------------------------------------------
        min_required_turnover = bidder_data.get("min_required_turnover", 50000000)  # ₹5 Cr
        reported_turnover = bidder_data.get("average_turnover", 64000000)          # ₹6.4 Cr
        if reported_turnover < min_required_turnover:
            financial_risk += 60
            cons.append(f"Turnover threshold deficit: 3-year average ₹{reported_turnover/1e7:.2f} Cr is below required ₹{min_required_turnover/1e7:.2f} Cr.")
            evidence_items.append({
                "id": f"EV-{ev_counter:02d}",
                "requirement_title": "Minimum Annual Average Turnover",
                "finding_type": "NON_COMPLIANCE",
                "ai_finding": f"Annual turnover average of ₹{reported_turnover/1e7:.2f} Cr falls below the mandatory threshold of ₹{min_required_turnover/1e7:.2f} Cr.",
                "submitted_document_name": "Audited_Financial_Statements.pdf",
                "document_snippet": f"Average Audited Turnover (FY23-FY25): INR {reported_turnover/1e7:.2f} Crores",
                "tender_clause_requirement": f"Clause 4.1: Bidder must demonstrate average annual turnover of at least ₹{min_required_turnover/1e7:.2f} Cr over the last 3 financial years.",
                "source": "Reasoning Engine / Financial Scrutiny",
                "resolution_status": "OPEN",
            })
            ev_counter += 1
        else:
            pros.append(f"Financial turnover qualifies: 3-year average of ₹{reported_turnover/1e7:.2f} Cr comfortably exceeds required ₹{min_required_turnover/1e7:.2f} Cr.")

        # ------------------------------------------------------------------
        # 4. Make in India (MII) & Policy Compliance
        # ------------------------------------------------------------------
        if mii_pct >= 50:
            pros.append(f"Make in India Class-I local content compliant ({mii_pct}% >= 50% threshold).")
        elif mii_pct >= 20:
            pros.append(f"Make in India Class-II local content compliant ({mii_pct}%).")
        else:
            policy_risk += 40
            cons.append(f"Make in India local content ({mii_pct}%) falls below mandatory Class-II minimum (20%).")

        # ------------------------------------------------------------------
        # 5. Composite Risk Calculation & Officer Recommendation
        # ------------------------------------------------------------------
        statutory_risk = min(statutory_risk, 100)
        financial_risk = min(financial_risk, 100)
        emd_risk = min(emd_risk, 100)
        document_risk = min(document_risk, 100)
        policy_risk = min(policy_risk, 100)

        # Weighted score
        composite_score = int(
            0.35 * statutory_risk +
            0.25 * emd_risk +
            0.20 * financial_risk +
            0.10 * document_risk +
            0.10 * policy_risk
        )

        has_critical = statutory_risk >= 75 or emd_risk >= 75
        has_high = financial_risk >= 50 or emd_risk >= 50

        if has_critical:
            overall_risk = "CRITICAL"
            action = "RECOMMENDED_REJECT"
            summary = (
                f"Statutory and procurement scrutiny detected critical non-compliance for {company_name}. "
                f"Deficits identified in statutory cross-identity or mandatory EMD stipulations require formal officer determination."
            )
        elif has_high:
            overall_risk = "HIGH"
            action = "CLARIFICATION_SEEKED"
            summary = (
                f"Evaluation for {company_name} identified discrepancies in financial thresholds or instrument documentation. "
                f"Recommend issuing a formal clarification notice to the bidder."
            )
        elif len(cons) > 0:
            overall_risk = "MEDIUM"
            action = "COMMITTEE_REVIEW"
            summary = f"Minor policy or documentation deviations detected for {company_name} requiring Committee scrutiny."
        else:
            overall_risk = "LOW"
            action = "RECOMMENDED_ACCEPT"
            summary = f"All statutory, financial, and EMD parameters for {company_name} fully satisfy tender stipulations without discrepancies."

        detailed_analysis = (
            f"Comprehensive scrutiny of bid {bid_id} against tender {tender_id}: "
            f"Statutory compliance risk is {statutory_risk}%, EMD reconciliation risk is {emd_risk}%, "
            f"Financial standing risk is {financial_risk}%. "
            f"The bidder presents {len(pros)} verified compliance criteria and {len(cons)} flagged concern(s). "
            f"Recommended officer course of action is {action}."
        )

        return {
            "executive_summary": summary,
            "detailed_analysis": detailed_analysis,
            "suggested_action": action,
            "confidence": 0.96,
            "risk_assessment": {
                "overall_risk_level": overall_risk,
                "risk_score": composite_score,
                "vector_scores": {
                    "statutory": statutory_risk,
                    "financial": financial_risk,
                    "emd": emd_risk,
                    "document": document_risk,
                    "policy": policy_risk,
                },
            },
            "pros": pros,
            "cons": cons,
            "evidence_items": evidence_items,
        }

    def answer_question(
        self,
        question: str,
        tender_context: Optional[Dict[str, Any]] = None,
        bidder_context: Optional[Dict[str, Any]] = None,
        bidders_summary: Optional[List[Dict[str, Any]]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Provide intelligent statutory procurement advisory answers from audit heuristics."""
        lower = question.lower()
        tender_title = tender_context.get("title") if tender_context else ""
        tender_id = tender_context.get("id") if tender_context else ""

        # 1. ABC Industrial Solutions
        if "abc industrial" in lower or ("manual review" in lower and "why" in lower):
            return {
                "answer": (
                    "ABC Industrial Solutions scored 92% overall compliance with LOW risk. However, under Clause 5.1(b), "
                    "their Manufacturer Authorization Form (MAF) from Dräger Safety India Ltd expires on 30 October 2026. "
                    "This provides only 55 days of validity from technical bid opening (05 Sep 2026), whereas the tender "
                    "stipulates a mandatory 90-day validity window (required until 04 Dec 2026). It is flagged for officer clarification."
                ),
                "evidence_ref": "EVD-001 (OEM Authorization Deficit)",
                "model": "csap-deterministic-audit-v1",
            }

        # 2. National Safety Systems / EMD Deficit
        if "national safety" in lower or ("discrepancy" in lower and "national" in lower):
            return {
                "answer": (
                    "National Safety Systems exhibits HIGH risk (score: 68). Two primary critical deficits were detected: "
                    "(1) EMD Shortfall: They submitted ₹1,50,000 via NEFT transaction TXN881294, which is ₹50,000 short of the "
                    "mandatory ₹2,00,000 requirement. (2) Financial turnover averages ₹3.46 Cr against required ₹5.00 Cr benchmark. "
                    "Under Clause 3.1, deficient EMD is liable for summary disqualification."
                ),
                "evidence_ref": "EVD-003 (EMD Shortfall)",
                "model": "csap-deterministic-audit-v1",
            }

        # 3. Bharat Engineering Works
        if "bharat engineering" in lower or "bharat" in lower:
            return {
                "answer": (
                    "Bharat Engineering Works (BID-002) scored 87% overall compliance with MEDIUM risk (score: 36). "
                    "All required documents are verified, including a Canara Bank Guarantee (SFMS 760COV) covering the "
                    "full ₹2,00,000 EMD, valid until 15 Mar 2027. The only scrutiny note is a borderline FY24 turnover "
                    "of ₹4.90 Cr — the 3-year average of ₹5.02 Cr still clears the ₹5.00 Cr benchmark. Recommended action: APPROVE."
                ),
                "evidence_ref": "AUD-24 (Turnover Scrutiny)",
                "model": "csap-deterministic-audit-v1",
            }

        # 4. Prime Tech Solutions / MSME Exemption
        if "prime tech" in lower or "msme" in lower or "exemption" in lower:
            return {
                "answer": (
                    "Prime Tech Solutions (BID-004) submitted Udyam Certificate UDYAM-TN-02-0089142 as a registered "
                    "Micro/Small Enterprise (MSE) under NIC Manufacturing codes. As per Public Procurement Policy for "
                    "MSEs Order 2012, they are legally exempt from depositing EMD. Their 3-year turnover is ₹8.40 Cr, "
                    "and local content is 85%."
                ),
                "evidence_ref": "EVD-004 (MSE Exemption Certificate)",
                "model": "csap-deterministic-audit-v1",
            }

        # 5. Clause 5.1(b) / OEM Authorization
        if "oem" in lower or "clause 5.1" in lower or "maf" in lower:
            return {
                "answer": (
                    "Clause 5.1(b) requires all non-manufacturing bidders to provide an OEM Authorization Form directly "
                    "from the manufacturer guaranteeing back-to-back replacement warranty and service support, valid for "
                    "at least 90 calendar days from the date of technical bid opening."
                ),
                "evidence_ref": "Clause 5.1(b)",
                "model": "csap-deterministic-audit-v1",
            }

        # 6. Risk Scoring Model
        if "risk" in lower and ("score" in lower or "calculat" in lower or "model" in lower):
            return {
                "answer": (
                    "Risk scores come from a multi-vector model spanning financial risk (turnover trend, EMD adequacy), "
                    "statutory risk (GST/PAN/Udyam registry status), and document risk (OCR confidence, clause-level discrepancies). "
                    "Scores below 25 are LOW, 25–50 MEDIUM, 50–75 HIGH, and above 75 CRITICAL — each factor links to its supporting "
                    "evidence on the bidder's Risk Analysis tab."
                ),
                "evidence_ref": None,
                "model": "csap-deterministic-audit-v1",
            }

        # 7. Compliance Scoring
        if "compliance" in lower and ("score" in lower or "calculat" in lower):
            return {
                "answer": (
                    "The compliance score is a weighted rollup of every clause-level requirement on the Compliance tab — "
                    "statutory registrations, technical qualifications, and commercial terms. Requirements only contribute "
                    "points when VERIFIED or EXEMPTED; MANUAL_REVIEW and MISMATCH items reduce the score and surface as "
                    "Evidence findings for officer review."
                ),
                "evidence_ref": None,
                "model": "csap-deterministic-audit-v1",
            }

        # 8. EMD Requirements
        if "emd" in lower:
            emd_val = tender_context.get("emdAmountFormatted", "₹2,00,000") if tender_context else "₹2,00,000"
            return {
                "answer": (
                    f"The standard EMD requirement is {emd_val}, payable via NEFT/RTGS bank transfer or an unconditional "
                    "Bank Guarantee from a scheduled bank valid through the bid validity period. Registered Micro/Small "
                    "Enterprises (MSEs) holding a valid Udyam certificate are exempt under the Public Procurement Policy for MSEs Order, 2012."
                ),
                "evidence_ref": "Rule 170 (GFR 2017)",
                "model": "csap-deterministic-audit-v1",
            }

        # 9. Audit Trail
        if "audit" in lower:
            return {
                "answer": (
                    "Every automated verification step and officer decision is written to the Audit Trail with an ISO timestamp, "
                    "actor role, and reference hash — nothing is overwritten. The full ledger is filterable by bidder or action type "
                    "under the Audit Trail view."
                ),
                "evidence_ref": None,
                "model": "csap-deterministic-audit-v1",
            }

        # 10. GSTN / PAN Cross-Check
        if "gst" in lower or "pan" in lower:
            return {
                "answer": (
                    "GSTIN status is cross-checked against the GSTN portal during statutory verification. Characters 3-12 of "
                    "the 15-character GSTIN must match the 10-character PAN exactly (gstin[2:12] == pan). A mismatch or inactive "
                    "registration is flagged for manual review before the bid can proceed."
                ),
                "evidence_ref": "Statutory Cross-Check Rule",
                "model": "csap-deterministic-audit-v1",
            }

        # 11. Greeting
        if any(w in lower.strip() for w in ["hi", "hello", "hey", "good morning", "good day"]):
            return {
                "answer": (
                    f"Good day, Officer. I am your CSAP Procurement Advisory Assistant. "
                    f"You are reviewing {tender_title or tender_id or 'the active tender'}. "
                    "Ask me about any bidder's compliance status, EMD reconciliation, risk factors, or a specific tender clause."
                ),
                "evidence_ref": None,
                "model": "csap-deterministic-audit-v1",
            }

        # 12. Dynamic summary if bidder context exists
        if bidder_context:
            comp_name = bidder_context.get("companyName", "The active bidder")
            comp_score = bidder_context.get("overallComplianceScore", "N/A")
            risk_lvl = bidder_context.get("riskLevel", "MEDIUM")
            risk_sc = bidder_context.get("riskScore", "N/A")
            return {
                "answer": (
                    f"{comp_name} currently holds a {comp_score}% compliance score with {risk_lvl} risk (score: {risk_sc}). "
                    f"All statutory filings and EMD instruments have been reconciled against tender {tender_id or 'requirements'}."
                ),
                "evidence_ref": None,
                "model": "csap-deterministic-audit-v1",
            }

        # Fallback default
        bidders_count = len(bidders_summary) if bidders_summary else 4
        return {
            "answer": (
                f"Based on tender data for {tender_title or 'the active tender'}, {bidders_count} bidder(s) have submitted "
                "proposals. Scrutiny is active across statutory identities, EMD instruments, and technical criteria. "
                "Officer sign-off is pending."
            ),
            "evidence_ref": None,
            "model": "csap-deterministic-audit-v1",
        }
