from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging

from src.ocr_processor.extractor import DocumentOCRExtractor
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.discrepancy_detector.matcher import DiscrepancyDetector
from src.risk_scorer.scorer import MultiVectorRiskScorer
from src.reasoning_engine.factory import get_reasoning_engine
from src.core.config import settings
from src.core.supabase_client import write_verification_results, update_run_steps

logger = logging.getLogger("CSAP.API")

app = FastAPI(
    title="CSAP AI Verification Engine",
    description="Statutory Compliance, OCR extraction, Discrepancy Detection, and Reasoning Microservice",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ocr_extractor = DocumentOCRExtractor()
registry_checker = StatutoryRegistryChecker()
discrepancy_detector = DiscrepancyDetector()
risk_scorer = MultiVectorRiskScorer()
reasoning_engine = get_reasoning_engine()


# ─────────────────────────────────────────────────────────────────────────────
# Request / Response Models
# ─────────────────────────────────────────────────────────────────────────────

class VerificationRequest(BaseModel):
    bidId: str
    tenderId: str
    gstin: str
    pan: str
    udyamNumber: Optional[str] = None
    companyName: Optional[str] = None
    tenderRequirements: Optional[List[Dict[str, Any]]] = []
    emd: Optional[Dict[str, Any]] = None
    turnoverLast3Years: Optional[List[str]] = None
    averageTurnover: Optional[float] = None
    makeInIndiaPercentage: Optional[float] = None
    documents: Optional[List[Dict[str, Any]]] = []


class IngestRequest(BaseModel):
    """
    Document-arrival triggered verification request.
    Called automatically by the backend when bid documents reach their storage destination.
    Runs the full 6-step pipeline and writes results directly to Supabase.
    """
    bidId: str = Field(..., description="Database UUID of the bid")
    tenderId: str = Field(..., description="Tender ID string (e.g. GEM/2026/CPCL/001)")
    runId: Optional[str] = Field(default=None, description="ai_verification_runs row ID to update on completion")
    documentId: Optional[str] = Field(default=None, description="Uploaded bid_documents row ID")
    gstin: str
    pan: str
    udyamNumber: Optional[str] = None
    companyName: Optional[str] = None
    enterpriseType: Optional[str] = None
    isBlacklisted: Optional[bool] = False
    tenderRequirements: Optional[List[Dict[str, Any]]] = []
    emd: Optional[Dict[str, Any]] = None
    averageTurnover: Optional[float] = None
    minRequiredTurnover: Optional[float] = None
    makeInIndiaPercentage: Optional[float] = None
    documents: Optional[List[Dict[str, Any]]] = []


class ReasoningAnalysisRequest(BaseModel):
    tenderId: str = Field(..., examples=["GEM/2026/CPCL/001"])
    bidId: str = Field(..., examples=["BID-001"])
    bidderData: Dict[str, Any] = Field(..., description="Bidder profile, identifiers, turnover, and EMD")
    tenderRequirements: Optional[List[Dict[str, Any]]] = Field(default=[], description="List of tender requirement clauses")
    documents: Optional[List[Dict[str, Any]]] = Field(default=[], description="OCR extracted documents")
    registryChecks: Optional[Dict[str, Any]] = Field(default=None, description="External statutory check results")


class OCRRequest(BaseModel):
    documents: List[Dict[str, str]]


class AssistantChatRequest(BaseModel):
    question: str = Field(..., description="Officer inquiry or prompt")
    tenderContext: Optional[Dict[str, Any]] = Field(default=None, description="Active tender metadata and clauses")
    bidderContext: Optional[Dict[str, Any]] = Field(default=None, description="Active bidder submission context")
    biddersSummary: Optional[List[Dict[str, Any]]] = Field(default=None, description="High-level summary of all bidders")
    chatHistory: Optional[List[Dict[str, str]]] = Field(default=[], description="Previous conversation messages")


# ─────────────────────────────────────────────────────────────────────────────
# Internal Pipeline
# ─────────────────────────────────────────────────────────────────────────────

def _emit_step_progress(run_id: Optional[str], active_step_idx: int):
    if not run_id:
        return
    step_names = [
        "Documents OCR Extraction",
        "Government Registry Cross-Check (GSTN / MCA21)",
        "EMD & Payment Gateway Reconciliation",
        "Tender Rule & Eligibility Evaluation",
        "Discrepancy & Deficit Detection",
        "Compliance & Multi-Vector Risk Calculation",
    ]
    steps = []
    for idx, name in enumerate(step_names):
        if idx < active_step_idx:
            steps.append({"name": name, "status": "completed"})
        elif idx == active_step_idx:
            steps.append({"name": name, "status": "in-progress"})
        else:
            steps.append({"name": name, "status": "pending"})
    update_run_steps(run_id, steps, status="RUNNING")


def _run_full_pipeline(
    bid_id: str,
    tender_id: str,
    gstin: str,
    pan: str,
    udyam_number: Optional[str],
    company_name: Optional[str],
    enterprise_type: Optional[str],
    is_blacklisted: bool,
    tender_requirements: List[Dict[str, Any]],
    emd: Optional[Dict[str, Any]],
    average_turnover: Optional[float],
    min_required_turnover: Optional[float],
    make_in_india_percentage: Optional[float],
    documents: List[Dict[str, Any]],
    run_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Shared 6-step verification pipeline used by both /verify and /documents/ingest.
    Emits progressive step status to Supabase Realtime when run_id is supplied.
    Returns the full result dict.
    """
    # Step 1 — OCR Extraction
    _emit_step_progress(run_id, 0)
    ocr_results = ocr_extractor.batch_extract(documents)

    # Step 2 — Government Registry Cross-Check
    _emit_step_progress(run_id, 1)
    registry_results = registry_checker.verify_all(
        gstin=gstin,
        pan=pan,
        udyam_number=udyam_number,
    )

    # Step 3 — Bidder Context Aggregation & EMD
    _emit_step_progress(run_id, 2)
    bidder_context: Dict[str, Any] = {
        "companyName": company_name or "Unknown Bidder",
        "gstin": gstin,
        "pan": pan,
        "udyamNumber": udyam_number,
        "enterpriseType": enterprise_type or "",
        "isBlacklisted": is_blacklisted,
        "makeInIndiaPercentage": make_in_india_percentage if make_in_india_percentage is not None else 65,
        "average_turnover": average_turnover if average_turnover is not None else 64_000_000,
        "min_required_turnover": min_required_turnover if min_required_turnover is not None else 50_000_000,
        "emd": emd or {
            "requiredAmount": 2_500_000,
            "submittedAmount": 2_500_000,
            "instrumentType": "BANK_GUARANTEE",
            "transactionOrBgNo": "BG/2026/CPCL/PENDING",
            "validUntil": "2026-12-31",
        },
    }

    # Step 4 — Discrepancy Detection (Rule Engine)
    _emit_step_progress(run_id, 3)
    findings = discrepancy_detector.evaluate_compliance(tender_requirements, bidder_context)

    # Step 5 — Multi-Vector Risk Scoring
    _emit_step_progress(run_id, 4)
    risk_assessment = risk_scorer.calculate_risk_score(findings)

    # Step 6 — Deep Reasoning & XAI Advisory
    _emit_step_progress(run_id, 5)
    engine = get_reasoning_engine()
    reasoning_report = engine.analyze_bid(
        tender_id=tender_id,
        bid_id=bid_id,
        tender_requirements=tender_requirements,
        bidder_data=bidder_context,
        ocr_results=ocr_results,
        registry_checks=registry_results,
    )

    return {
        "ocrResults": ocr_results,
        "registryChecks": registry_results,
        "findings": findings,
        "riskAssessment": reasoning_report.get("risk_assessment", risk_assessment),
        "aiRecommendation": {
            "summary": reasoning_report.get("executive_summary", ""),
            "details": reasoning_report.get("detailed_analysis", ""),
            "suggestedAction": reasoning_report.get("suggested_action", "RECOMMENDED_ACCEPT"),
            "pros": reasoning_report.get("pros", []),
            "cons": reasoning_report.get("cons", []),
            "confidence": reasoning_report.get("confidence", 0.95),
            "reasoning": reasoning_report.get("reasoning"),
            "model": reasoning_report.get("model", settings.reasoning_model),
        },
        "evidenceItems": reasoning_report.get("evidence_items", []),
        "_raw_reasoning_report": reasoning_report,
    }


def _ingest_background(payload: IngestRequest) -> None:
    """Background task: run full pipeline and write results to Supabase."""
    try:
        result = _run_full_pipeline(
            bid_id=payload.bidId,
            tender_id=payload.tenderId,
            gstin=payload.gstin,
            pan=payload.pan,
            udyam_number=payload.udyamNumber,
            company_name=payload.companyName,
            enterprise_type=payload.enterpriseType,
            is_blacklisted=bool(payload.isBlacklisted),
            tender_requirements=payload.tenderRequirements or [],
            emd=payload.emd,
            average_turnover=payload.averageTurnover,
            min_required_turnover=payload.minRequiredTurnover,
            make_in_india_percentage=payload.makeInIndiaPercentage,
            documents=payload.documents or [],
            run_id=payload.runId,
        )

        # Write results directly to Supabase so the frontend picks them up via real-time
        write_verification_results(
            bid_id=payload.bidId,
            run_id=payload.runId,
            ai_report=result["_raw_reasoning_report"],
            findings=result["findings"],
            document_id=payload.documentId,
            registry_checks=result.get("registryChecks"),
            ocr_results=result.get("ocrResults"),
        )
        logger.info(f"[Ingest] Pipeline completed for bid {payload.bidId}")
    except Exception as exc:
        logger.error(f"[Ingest] Pipeline failed for bid {payload.bidId}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.get("/api/v1/health")
@app.get("/health")
@app.get("/")
def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment,
        "reasoning_provider": settings.reasoning_provider,
        "reasoning_model": settings.reasoning_model,
    }


@app.post("/api/v1/ocr/extract")
def extract_documents(payload: OCRRequest):
    extracted = ocr_extractor.batch_extract(payload.documents)
    return {"status": "SUCCESS", "documents": extracted}


@app.post("/api/v1/documents/ingest", status_code=202)
async def ingest_documents(payload: IngestRequest, background_tasks: BackgroundTasks):
    """
    AUTO-TRIGGER ENDPOINT — called by the backend the moment bid documents
    arrive at their storage destination.

    Immediately returns HTTP 202 Accepted, then runs the full 6-step
    verification pipeline as a background task and writes results to Supabase.
    The frontend subscribes to Supabase real-time and updates automatically.
    """
    background_tasks.add_task(_ingest_background, payload)
    return {
        "status": "ACCEPTED",
        "message": "Verification pipeline started. Results will be written to Supabase automatically.",
        "bidId": payload.bidId,
        "tenderId": payload.tenderId,
    }


@app.post("/api/v1/reasoning/analyze")
def analyze_with_reasoning(payload: ReasoningAnalysisRequest):
    """
    On-demand endpoint to run LLM reasoning analysis on a bidder submission.
    Produces executive summary, clause-by-clause analysis, EV-xx evidence items, pros/cons, and recommended action.
    """
    engine = get_reasoning_engine()
    report = engine.analyze_bid(
        tender_id=payload.tenderId,
        bid_id=payload.bidId,
        tender_requirements=payload.tenderRequirements or [],
        bidder_data=payload.bidderData,
        ocr_results=payload.documents or [],
        registry_checks=payload.registryChecks,
    )
    return {
        "status": "SUCCESS",
        "tenderId": payload.tenderId,
        "bidId": payload.bidId,
        "report": report,
    }


@app.post("/api/v1/assistant/chat")
def chat_with_assistant(payload: AssistantChatRequest):
    """
    Interactive Q&A assistant for procurement officers.
    Answers inquiries using the reasoning engine (Nemotron or deterministic fallback),
    linking evidence citations and tender clauses.
    """
    engine = get_reasoning_engine()
    result = engine.answer_question(
        question=payload.question,
        tender_context=payload.tenderContext,
        bidder_context=payload.bidderContext,
        bidders_summary=payload.biddersSummary,
        chat_history=payload.chatHistory or [],
    )
    return {
        "status": "SUCCESS",
        "answer": result.get("answer", ""),
        "evidence": result.get("evidence_ref"),
        "reasoning": result.get("reasoning"),
        "model": result.get("model", settings.reasoning_model),
        "provider": settings.reasoning_provider,
        "is_fallback": bool(result.get("_api_fallback_note")),
        "fallback_note": result.get("_api_fallback_note"),
    }


@app.post("/api/v1/verify")
def run_statutory_verification(payload: VerificationRequest):
    """
    Synchronous full-pipeline endpoint (used by backend for direct calls).
    Runs all 6 steps and returns the complete result.
    """
    result = _run_full_pipeline(
        bid_id=payload.bidId,
        tender_id=payload.tenderId,
        gstin=payload.gstin,
        pan=payload.pan,
        udyam_number=payload.udyamNumber,
        company_name=payload.companyName,
        enterprise_type=None,
        is_blacklisted=False,
        tender_requirements=payload.tenderRequirements or [],
        emd=payload.emd,
        average_turnover=payload.averageTurnover,
        min_required_turnover=None,
        make_in_india_percentage=payload.makeInIndiaPercentage,
        documents=payload.documents or [],
    )
    return {
        "status": "SUCCESS",
        "bidId": payload.bidId,
        "tenderId": payload.tenderId,
        **{k: v for k, v in result.items() if k != "_raw_reasoning_report"},
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=settings.port, reload=True)
