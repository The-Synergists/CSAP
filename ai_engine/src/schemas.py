"""Request / response models for the verification engine API."""

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

CheckStatus = Literal["MET", "EXEMPTED", "REVIEW", "NOT_MET", "MISSING"]
Severity = Literal["HIGH", "MEDIUM", "LOW"]
RiskLevel = Literal["LOW", "MEDIUM", "HIGH"]
Decision = Literal["APPROVE", "REJECT", "REQUEST_CLARIFICATION", "COMMITTEE_REVIEW"]


class Requirement(BaseModel):
    code: str
    title: str
    category: str
    criterion: str
    benchmark: Optional[str] = None
    mandatory: bool = True


class Document(BaseModel):
    id: str
    requirementCode: Optional[str] = None
    name: str
    fileName: str
    extractedText: str = ""


class Emd(BaseModel):
    requiredAmount: float
    submittedAmount: float
    instrument: str
    reference: str = ""
    bankName: str = ""
    validUntil: Optional[str] = None


class Turnover(BaseModel):
    financialYear: str
    amountCr: float


class Bidder(BaseModel):
    companyName: str
    gstin: str
    pan: str
    udyamNumber: Optional[str] = None
    msmeCategory: Optional[str] = None
    turnover: List[Turnover] = Field(default_factory=list)


class Tender(BaseModel):
    id: str
    title: str
    technicalOpeningDate: str  # ISO date
    emdAmount: float


class VerifyRequest(BaseModel):
    bidId: str
    tender: Tender
    requirements: List[Requirement]
    bidder: Bidder
    makeInIndiaPercentage: float
    documents: List[Document] = Field(default_factory=list)
    emd: Optional[Emd] = None


class Finding(BaseModel):
    title: str
    severity: Severity
    expected: str
    submitted: str
    comparison: str
    evidenceExcerpt: str
    evidenceSource: str
    impact: str
    suggestedAction: str


class CheckResult(BaseModel):
    requirementCode: str
    status: CheckStatus
    submitted: str
    note: str
    documentId: Optional[str] = None
    finding: Optional[Finding] = None
    riskPoints: int = 0


class OcrRequest(BaseModel):
    documents: List[Document]
