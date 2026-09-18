from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from src.ocr_processor.extractor import DocumentOCRExtractor
from src.registry_verifier.checker import StatutoryRegistryChecker
from src.discrepancy_detector.matcher import DiscrepancyDetector
from src.risk_scorer.scorer import MultiVectorRiskScorer
from src.core.config import settings

app = FastAPI(
    title="CSAP AI Verification Engine",
    description="Statutory Compliance, OCR extraction, and Discrepancy Detection Microservice",
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

class VerificationRequest(BaseModel):
    bidId: str
    tenderId: str
    gstin: str
    pan: str
    udyamNumber: Optional[str] = None
    documents: Optional[List[Dict[str, Any]]] = []

class OCRRequest(BaseModel):
    documents: List[Dict[str, str]]

@app.get("/api/v1/health")
def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "environment": settings.environment
    }

@app.post("/api/v1/ocr/extract")
def extract_documents(payload: OCRRequest):
    extracted = ocr_extractor.batch_extract(payload.documents)
    return {"status": "SUCCESS", "documents": extracted}

@app.post("/api/v1/verify")
def run_statutory_verification(payload: VerificationRequest):
    # 1. OCR Extraction
    ocr_results = ocr_extractor.batch_extract(payload.documents or [])

    # 2. Government Registry Cross-Check
    registry_results = registry_checker.verify_all(
        gstin=payload.gstin,
        pan=payload.pan,
        udyam_number=payload.udyamNumber
    )

    # 3. Discrepancy Detection
    findings = discrepancy_detector.evaluate_compliance([], {
        "gstin": payload.gstin,
        "pan": payload.pan,
        "udyam": payload.udyamNumber,
    })

    # 4. Multi-Vector Risk Calculation
    risk_assessment = risk_scorer.calculate_risk_score(findings)

    return {
        "status": "SUCCESS",
        "bidId": payload.bidId,
        "tenderId": payload.tenderId,
        "ocrResults": ocr_results,
        "registryChecks": registry_results,
        "findings": findings,
        "riskAssessment": risk_assessment
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="0.0.0.0", port=settings.port, reload=True)
