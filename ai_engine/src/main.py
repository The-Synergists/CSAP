import base64
import binascii

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from src.core.config import settings
from src.discrepancy_detector.matcher import DiscrepancyDetector
from src.ocr_processor.extractor import DocumentOCRExtractor
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.risk_scorer.scorer import MultiVectorRiskScorer
from src.nvidia.errors import NvidiaError
from src.nvidia.extraction import run_extraction
from src.nvidia.ocr import run_ocr
from src.nvidia.recommendation import draft_recommendation
from src.nvidia.split import split_package
from src.nvidia.extraction import stream_chat
from src.schemas import OcrRequest, VerifyRequest

ENGINE_VERSION = "rules-2026.09"

app = FastAPI(
    title="CSAP Verification Engine",
    description="Checks a bid against tender requirements and explains every exception. Advisory only.",
    version="1.1.0",
)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_methods=["*"], allow_headers=["*"])

@app.middleware("http")
async def require_engine_key(request: Request, call_next):
    """Only the CSAP backend may call the engine (it spends NVIDIA credits)."""
    if settings.engine_api_key and not request.url.path.endswith("/health"):
        if request.headers.get("x-engine-key") != settings.engine_api_key:
            return JSONResponse(status_code=401, content={"detail": {"code": "UNAUTHORIZED", "message": "Missing or invalid engine key."}})
    return await call_next(request)


ocr_extractor = DocumentOCRExtractor()
registry_checker = StatutoryRegistryChecker()
detector = DiscrepancyDetector()
risk_scorer = MultiVectorRiskScorer()


@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "engineVersion": ENGINE_VERSION,
        "environment": settings.environment,
        "nvidia": {
            "ocr": {"model": "nvidia/nemotron-ocr-v2", "configured": bool(settings.nvidia_ocr_api_key)},
            "extraction": {"model": settings.nvidia_extraction_model, "configured": bool(settings.nvidia_extraction_api_key)},
        },
    }


class DocumentOcrRequest(BaseModel):
    fileName: str
    mimeType: str
    contentBase64: str


class ExtractionRequest(BaseModel):
    documentType: str
    ocrText: str


def _nvidia_call(fn, *args):
    try:
        return fn(*args)
    except NvidiaError as exc:
        raise HTTPException(status_code=exc.status, detail={"code": "NVIDIA_NOT_CONFIGURED" if exc.status == 503 else "NVIDIA_ERROR", "message": str(exc)})


@app.post("/api/v1/documents/ocr")
def document_ocr(payload: DocumentOcrRequest):
    """Stage 1: NVIDIA Nemotron OCR V2 reads the document image."""
    try:
        data = base64.b64decode(payload.contentBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail={"code": "BAD_FILE", "message": "contentBase64 is not valid base64."})
    return {"fileName": payload.fileName, **_nvidia_call(run_ocr, data, payload.mimeType)}


class SplitRequest(BaseModel):
    contentBase64: str
    requirements: list


@app.post("/api/v1/documents/split")
def document_split(payload: SplitRequest):
    """A combined bid PDF: every page read and assigned to a requirement, one PDF per requirement."""
    try:
        data = base64.b64decode(payload.contentBase64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail={"code": "BAD_FILE", "message": "contentBase64 is not valid base64."})
    return _nvidia_call(split_package, data, payload.requirements)


@app.post("/api/v1/documents/extract")
def document_extract(payload: ExtractionRequest):
    """Stage 2: an NVIDIA LLM extracts structured fields from the OCR text."""
    return _nvidia_call(run_extraction, payload.documentType, payload.ocrText)


class RecommendationRequest(BaseModel):
    bidId: str
    bidder: str
    tender: str
    suggestedDecision: str
    score: int
    evidence: list


@app.post("/api/v1/recommendation/draft")
def recommendation_draft(payload: RecommendationRequest):
    """An NVIDIA LLM explains the rule-based suggestion; unsupported sentences are removed."""
    return _nvidia_call(draft_recommendation, payload.model_dump())


class ChatRequest(BaseModel):
    system: str
    user: str
    maxTokens: int = 700


@app.post("/api/v1/llm/chat")
def llm_chat(payload: ChatRequest):
    """One NVIDIA chat completion for the officer assistant (the backend builds the grounded prompt)."""
    def run():
        content, latency_ms = stream_chat(payload.system, payload.user, max(100, min(payload.maxTokens, 1200)))
        from src.core.config import settings
        return {"content": content, "latencyMs": latency_ms, "model": settings.nvidia_extraction_model}
    return _nvidia_call(run)


@app.post("/api/v1/ocr/extract")
def extract_documents(payload: OcrRequest):
    return {"status": "SUCCESS", "documents": ocr_extractor.batch_extract(payload.documents)}


@app.post("/api/v1/verify")
def verify_bid(payload: VerifyRequest):
    documents = ocr_extractor.batch_extract(payload.documents)
    registry = registry_checker.verify_all(payload.bidder.gstin, payload.bidder.pan, payload.bidder.udyamNumber)
    checks = detector.evaluate(payload)
    titles = {r.code: r.title for r in payload.requirements}
    risk = risk_scorer.assess(checks, titles)

    counts = {s: sum(1 for c in checks if c.status == s) for s in ("MET", "EXEMPTED", "REVIEW", "NOT_MET", "MISSING")}
    return {
        "status": "SUCCESS",
        "engineVersion": ENGINE_VERSION,
        "advisory": True,
        "bidId": payload.bidId,
        "tenderId": payload.tender.id,
        "summary": {
            "met": counts["MET"] + counts["EXEMPTED"],
            "review": counts["REVIEW"],
            "notMet": counts["NOT_MET"],
            "missing": counts["MISSING"],
            "total": len(checks),
        },
        "checks": [c.model_dump() for c in checks],
        "risk": {k: v for k, v in risk.items() if k != "recommendation"},
        "recommendation": risk["recommendation"],
        "registryChecks": registry,
        "documents": documents,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="127.0.0.1", port=settings.port, reload=True)
