"""Prompt templates for LLM-assisted tender discrepancy detection and advisory formulation."""

import json
from typing import Any, Dict, List, Optional

PROCUREMENT_REASONING_SYSTEM_PROMPT = """You are the Senior Statutory Procurement Auditor for CPCL (Chennai Petroleum Corporation Limited) and the CSAP (Central Statutory Authentication Platform) AI Verification Engine.

Your role is to perform rigorous, objective, and audit-grade scrutiny of bidder submissions against official Notice Inviting Tender (NIT) stipulations, document OCR extractions, and statutory government registry checks.

Core Evaluation Mandates:
1. STATUTORY COMPLIANCE:
   - Validate GSTIN, PAN, and Udyam status.
   - Cross-check PAN against GSTIN: characters 3-12 of GSTIN must exactly equal the 10-character PAN (gstin[2:12] == pan).
   - Verify MSME exemption eligibility: Under the Public Procurement Policy for MSEs Order, only Micro and Small enterprises qualify for EMD exemption. Medium enterprises DO NOT qualify for exemption.
2. EMD & BANK GUARANTEE RECONCILIATION:
   - Check if submitted Bank Guarantee / payment meets the mandatory tender requirement (e.g. 2% of estimated value).
   - Check if Bank Guarantee validity date covers the required tender validity period.
3. FINANCIAL & POLICY THRESHOLDS:
   - Compare 3-year average annual turnover against the tender benchmark threshold.
   - Verify Make-in-India (MII) local content declaration percentage against Class-I (>=50%) or Class-II (>=20%) requirements.
4. EXPLAINABLE EVIDENCE (XAI):
   - Every identified discrepancy, ambiguity, or passed statutory condition must cite an evidence item ID (EV-01, EV-02, etc.).
   - Include exact document name, extracted text snippet, and the corresponding tender clause requirement.
5. OBJECTIVE ADVISORY:
   - Formulate clear, factual Pros (compliant strengths) and Cons (deficits, discrepancies, risks).
   - Provide an executive summary and detailed clause-by-clause scrutiny narrative.
   - Recommend a definitive officer action:
     * "RECOMMENDED_ACCEPT" (if fully compliant with low risk)
     * "RECOMMENDED_REJECT" (if critical breach, blacklisted, or statutory mismatch)
     * "CLARIFICATION_SEEKED" (if resolvable deficit such as minor EMD short or missing endorsement)
     * "COMMITTEE_REVIEW" (if complex ambiguous technical evaluation)

OUTPUT FORMAT:
You MUST respond with valid, parseable JSON matching the following schema EXACTLY (no additional text outside JSON):
{
  "executive_summary": "Concise high-level verdict for the Chief Procurement Officer",
  "detailed_analysis": "In-depth clause-by-clause analysis of statutory, financial, and technical standing",
  "suggested_action": "RECOMMENDED_ACCEPT" | "RECOMMENDED_REJECT" | "CLARIFICATION_SEEKED" | "COMMITTEE_REVIEW",
  "confidence": 0.94,
  "risk_assessment": {
    "overall_risk_level": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
    "risk_score": 15,
    "vector_scores": {
      "statutory": 10,
      "financial": 10,
      "emd": 50,
      "document": 10,
      "policy": 5
    }
  },
  "pros": [
    "Factual strength 1",
    "Factual strength 2"
  ],
  "cons": [
    "Identified risk or deficit 1"
  ],
  "evidence_items": [
    {
      "id": "EV-01",
      "requirement_title": "EMD Bank Guarantee Value",
      "finding_type": "NON_COMPLIANCE",
      "ai_finding": "Submitted Bank Guarantee amount has a deficit of ₹10 Lakhs against tender stipulation.",
      "submitted_document_name": "Bank_Guarantee_EMD.pdf",
      "document_snippet": "Bank Guarantee No: BG/2026/CPCL/98712 for INR 15,00,000 valid up to 31-12-2026",
      "tender_clause_requirement": "Clause 3.2: Mandatory EMD of 2% (₹25,00,000) or valid Micro/Small Udyam exemption",
      "source": "Nemotron Reasoning Engine / OCR Extraction",
      "resolution_status": "OPEN"
    }
  ]
}
"""

# Backward compatibility alias
PROCUREMENT_ANALYSIS_SYSTEM_PROMPT = PROCUREMENT_REASONING_SYSTEM_PROMPT


def format_tender_analysis_prompt(
    tender_id: str,
    bid_id: str,
    tender_requirements: List[Dict[str, Any]],
    bidder_data: Dict[str, Any],
    ocr_results: Optional[List[Dict[str, Any]]] = None,
    registry_checks: Optional[Dict[str, Any]] = None,
) -> str:
    """Format the user prompt containing tender requirements, bidder submission, OCR text, and registry data."""
    sections = [
        f"# TENDER & BIDDER SCRUTINY CASE",
        f"**Tender ID**: {tender_id}",
        f"**Bid ID**: {bid_id}",
        "",
        "## 1. OFFICIAL TENDER REQUIREMENTS & CLAUSES",
    ]

    if tender_requirements:
        for idx, req in enumerate(tender_requirements, 1):
            category = req.get("category", "GENERAL")
            title = req.get("title", req.get("requirementName", "Requirement"))
            criterion = req.get("criterion", req.get("notes", ""))
            mandatory = req.get("mandatory", True)
            benchmark = req.get("benchmarkValue", "")
            sections.append(
                f"- **Clause [{req.get('id', f'REQ-{idx}')}] ({category})**: {title}"
                f"\n  * Criterion: {criterion}"
                f"{f' | Benchmark: {benchmark}' if benchmark else ''}"
                f" | Mandatory: {mandatory}"
            )
    else:
        sections.append("- Standard CPCL Tender Requirements: 2% EMD, 3-Yr Turnover benchmark, Active GSTN/PAN, MII >= 50%.")

    sections.extend([
        "",
        "## 2. BIDDER SUBMISSION PROFILE & DECLARED VALUES",
        f"- **Company Name**: {bidder_data.get('companyName', 'Unknown')}",
        f"- **Vendor Code**: {bidder_data.get('vendorCode', 'N/A')}",
        f"- **GSTIN**: {bidder_data.get('gstin', 'N/A')}",
        f"- **PAN**: {bidder_data.get('pan', 'N/A')}",
        f"- **Udyam Number**: {bidder_data.get('udyamNumber', 'None (Non-MSME)')}",
        f"- **Make In India Local Content**: {bidder_data.get('makeInIndiaPercentage', 'N/A')}%",
    ])

    # Turnover details
    turnover = bidder_data.get("turnoverLast3Years") or bidder_data.get("average_turnover")
    if turnover:
        sections.append(f"- **Turnover Figures**: {turnover}")

    # EMD details
    emd = bidder_data.get("emd")
    if emd and isinstance(emd, dict):
        sections.extend([
            f"- **EMD Instrument**: {emd.get('instrumentType', 'N/A')}",
            f"- **EMD Submitted Amount**: ₹{emd.get('submittedAmount', emd.get('amount', 0)):,}",
            f"- **EMD Required Amount**: ₹{emd.get('requiredAmount', 0):,}",
            f"- **EMD Transaction/BG No**: {emd.get('transactionOrBgNo', emd.get('bg_number', 'N/A'))}",
            f"- **EMD Validity Date**: {emd.get('validUntil', emd.get('expiry_date', 'N/A'))}",
            f"- **EMD Status**: {emd.get('paymentStatus', emd.get('verificationResult', 'N/A'))}",
        ])

    sections.extend([
        "",
        "## 3. STATUTORY REGISTRY CROSS-CHECK TELEMETRY",
    ])
    if registry_checks:
        sections.append(f"```json\n{json.dumps(registry_checks, indent=2)}\n```")
    else:
        sections.append("No external registry telemetry provided (perform validation from declared identifiers).")

    sections.extend([
        "",
        "## 4. OCR EXTRACTED DOCUMENT ENTITIES & SNIPPETS",
    ])
    if ocr_results:
        for doc in ocr_results:
            file_name = doc.get("file_name", "document")
            doc_type = doc.get("document_type", "UNKNOWN")
            fields = doc.get("extracted_fields", {})
            snippets = doc.get("raw_text_blocks", [])
            sections.append(f"### Document: {file_name} ({doc_type})")
            sections.append(f"- **Extracted Fields**: {json.dumps(fields)}")
            if snippets:
                sample_texts = [b.get("text", "") for b in snippets[:6] if b.get("text")]
                sections.append(f"- **Text Excerpts**: {' | '.join(sample_texts)}")
    else:
        sections.append("No raw document OCR snippets supplied.")

    sections.extend([
        "",
        "## INSTRUCTIONS",
        "Perform deep reasoning across all 4 sections above.",
        "Detect any mismatches between Tender Clauses and Bidder Submissions/OCR/Registries.",
        "Output ONLY the specified JSON format with executive_summary, detailed_analysis, suggested_action, confidence, risk_assessment, pros, cons, and evidence_items.",
    ])

    return "\n".join(sections)


PROCUREMENT_ASSISTANT_SYSTEM_PROMPT = """You are the Senior Statutory Procurement Advisory Assistant for CPCL (Chennai Petroleum Corporation Limited) and the CSAP (Central Statutory Authentication Platform) AI Verification Engine.

Your role is to assist procurement officers and tender scrutiny committee members by answering questions about active tenders, bidder compliance standing, statutory discrepancies, EMD reconciliation, and multi-vector risk scores.

Guidelines:
1. Ground your answers strictly on the provided tender context, bidder records, and statutory rules (CPP Portal / GeM norms / MSME Order 2012 / GFR 2017).
2. If citing a specific discrepancy or document finding, reference the evidence ID (e.g. EVD-001, EV-01) or clause number (e.g. Clause 5.1(b)).
3. Keep answers clear, objective, concise, and audit-ready.
4. If asked about a bidder or tender condition not present in the provided context, state clearly what information is available and what needs officer clarification.

OUTPUT FORMAT:
You MUST respond with valid, parseable JSON matching the following schema EXACTLY:
{
  "answer": "Your detailed explanation and advisory response to the officer",
  "evidence_ref": "Specific evidence identifier if applicable (e.g. 'EVD-001 (OEM Authorization Deficit)') or null"
}
"""


def format_assistant_chat_prompt(
    question: str,
    tender_context: Optional[Dict[str, Any]] = None,
    bidder_context: Optional[Dict[str, Any]] = None,
    bidders_summary: Optional[List[Dict[str, Any]]] = None,
    chat_history: Optional[List[Dict[str, str]]] = None,
) -> str:
    """Construct the structured context prompt for interactive officer inquiries."""
    sections = [
        "# CONTEXT FOR OFFICER INQUIRY",
        "",
        "## ACTIVE TENDER CONTEXT",
    ]
    if tender_context:
        sections.append(f"```json\n{json.dumps(tender_context, indent=2)}\n```")
    else:
        sections.append("No active tender selected.")

    sections.extend([
        "",
        "## CURRENT BIDDER SCRUTINY CONTEXT",
    ])
    if bidder_context:
        sections.append(f"```json\n{json.dumps(bidder_context, indent=2)}\n```")
    else:
        sections.append("No single active bidder selected.")

    if bidders_summary:
        sections.extend([
            "",
            "## ALL BIDDERS IN THIS TENDER",
            f"```json\n{json.dumps(bidders_summary, indent=2)}\n```",
        ])

    if chat_history:
        sections.extend([
            "",
            "## RECENT CONVERSATION HISTORY",
        ])
        for msg in chat_history[-6:]:
            sender = msg.get("sender", "user").capitalize()
            text = msg.get("text", "")
            sections.append(f"- **{sender}**: {text}")

    sections.extend([
        "",
        "## OFFICER QUESTION",
        question,
        "",
        "## INSTRUCTIONS",
        "Provide a factual, authoritative, and helpful answer in the required JSON format: {'answer': '...', 'evidence_ref': '...'}.",
    ])

    return "\n".join(sections)

