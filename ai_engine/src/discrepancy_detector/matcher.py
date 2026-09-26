"""Evaluates a bid against each tender requirement.

For every requirement the detector reads the relevant structured data (EMD transaction,
audited turnover, declared local content) and the fields extracted from the matching bid
document, compares them with the tender benchmark and returns a check result. When a check is
not met it also returns a finding that spells out the full chain an officer needs:
requirement → what was submitted → comparison → evidence → impact → suggested action.

Rules are deterministic; an LLM (see src/prompts) can later be layered on top to draft the
narrative, but pass/fail never depends on a model's free-text output.
"""

import re
from datetime import date, datetime, timedelta
from typing import Callable, Dict, List, Optional

from src.ocr_processor.extractor import parse_fields
from src.schemas import CheckResult, Document, Finding, Requirement, VerifyRequest

PSU_BUYERS = ("IOCL", "BPCL", "HPCL", "CPCL", "ONGC", "GAIL", "OIL INDIA", "NRL", "MRPL")
OEM_VALIDITY_DAYS = 90
LOCAL_CONTENT_MIN = 50.0


def _inr(amount: float) -> str:
    """₹2,00,000 style (Indian digit grouping)."""
    n = int(round(amount))
    s = str(n)
    if len(s) > 3:
        head, tail = s[:-3], s[-3:]
        head = re.sub(r"(\d)(?=(\d{2})+$)", r"\1,", head)
        s = f"{head},{tail}"
    return f"₹{s}"


def _cr(value: float) -> str:
    return f"₹{value:.2f} Cr"


def _parse_date(text: str) -> Optional[date]:
    for fmt in ("%d %b %Y", "%d-%b-%Y", "%Y-%m-%d", "%d %B %Y"):
        try:
            return datetime.strptime(text.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _fmt_date(d: date) -> str:
    return d.strftime("%d %b %Y")


def _benchmark_cr(req: Requirement, default: float = 5.0) -> float:
    m = re.search(r"₹\s*([\d.]+)\s*(?:Cr|crore)", f"{req.benchmark or ''} {req.criterion}", re.I)
    return float(m.group(1)) if m else default


class _Ctx:
    def __init__(self, payload: VerifyRequest):
        self.p = payload
        self.docs_by_req: Dict[str, Document] = {d.requirementCode: d for d in payload.documents if d.requirementCode}

    def doc(self, req: Requirement) -> Optional[Document]:
        return self.docs_by_req.get(req.code)

    def fields(self, req: Requirement) -> Dict[str, str]:
        d = self.doc(req)
        return parse_fields(d.extractedText) if d else {}

    def opening_date(self) -> date:
        return date.fromisoformat(self.p.tender.technicalOpeningDate[:10])


def _result(req: Requirement, status: str, submitted: str, note: str, doc: Optional[Document] = None,
            finding: Optional[Finding] = None, points: int = 0) -> CheckResult:
    return CheckResult(requirementCode=req.code, status=status, submitted=submitted, note=note,
                       documentId=doc.id if doc else None, finding=finding, riskPoints=points)


def _missing(req: Requirement, ctx: _Ctx, severity: str = "MEDIUM", points: int = 12) -> CheckResult:
    return _result(
        req, "MISSING", "Not submitted", "No matching document in the bid package.",
        finding=Finding(
            title=f"{req.title} not submitted",
            severity=severity,
            expected=req.benchmark or req.criterion,
            submitted="Not submitted",
            comparison="Mandatory document absent from the bid package",
            evidenceExcerpt=f"Bid package contains {len(ctx.p.documents)} documents; none matches this requirement.",
            evidenceSource="Bid package index",
            impact="Mandatory document missing.",
            suggestedAction="Officer review required.",
        ),
        points=points,
    )


# ---------------------------------------------------------------- individual rules

def rule_turnover(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    years = ctx.p.bidder.turnover
    if not years:
        return _missing(req, ctx, "HIGH", 25)
    bench = _benchmark_cr(req)
    avg = sum(t.amountCr for t in years) / len(years)
    low_years = [t for t in years if t.amountCr < bench]
    series = " · ".join(f"{t.financialYear} {_cr(t.amountCr)}" for t in years)
    submitted = f"Average {_cr(avg)} ({series})"
    excerpt = doc.extractedText if doc else series
    source = doc.fileName if doc else "Declared turnover"
    if avg < bench:
        gap = bench - avg
        return _result(req, "NOT_MET", f"Average {_cr(avg)}", f"{_cr(gap)} below the {_cr(bench)} benchmark.", doc,
                       Finding(title=f"Average turnover below the {_cr(bench)} benchmark", severity="HIGH",
                               expected=f"Average annual turnover over {len(years)} years ≥ {_cr(bench)}",
                               submitted=submitted,
                               comparison=f"{_cr(gap)} below the benchmark ({gap / bench:.0%} short)",
                               evidenceExcerpt=excerpt, evidenceSource=source,
                               impact="Does not meet a mandatory financial eligibility criterion.",
                               suggestedAction="Verify the audited figures. If confirmed, the bidder does not meet eligibility."),
                       30)
    if low_years:
        worst = min(low_years, key=lambda t: t.amountCr)
        return _result(req, "REVIEW", f"Average {_cr(avg)}; {worst.financialYear} {_cr(worst.amountCr)}",
                       f"Meets the average, but {len(low_years)} year(s) below {_cr(bench)}.", doc,
                       Finding(title="Turnover meets the average but one year is below the benchmark", severity="MEDIUM",
                               expected=f"Average annual turnover over {len(years)} years ≥ {_cr(bench)}",
                               submitted=submitted,
                               comparison=f"Average is {_cr(avg - bench)} above the benchmark; {worst.financialYear} is {_cr(bench - worst.amountCr)} below it",
                               evidenceExcerpt=excerpt, evidenceSource=source,
                               impact="Meets the clause as worded (average), but with a thin margin.",
                               suggestedAction="Confirm the audited figures and record how the average clause was applied."),
                       25)
    return _result(req, "MET", f"Average {_cr(avg)}", f"Average exceeds the {_cr(bench)} benchmark.", doc)


def rule_gst(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "HIGH", 15)
    f = ctx.fields(req)
    gstin, status = f.get("gstin", ""), f.get("status", "")
    if gstin != ctx.p.bidder.gstin or "active" not in status.lower():
        return _result(req, "REVIEW", f"GSTIN {gstin or '—'} — {status or 'status not found'}",
                       "Certificate does not match the declared GSTIN or is not active.", doc,
                       Finding(title="GST certificate does not match the declared registration", severity="MEDIUM",
                               expected=f"Active GSTIN {ctx.p.bidder.gstin}", submitted=f"{gstin} ({status})",
                               comparison="GSTIN or status mismatch", evidenceExcerpt=doc.extractedText,
                               evidenceSource=doc.fileName, impact="Statutory eligibility unconfirmed.",
                               suggestedAction="Ask the bidder for a current GST certificate."), 8)
    return _result(req, "MET", f"GSTIN {gstin} — Active", "Active registration; matches the declared GSTIN.", doc)


def rule_udyam(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _result(req, "MET", "Not claimed", "Not required unless claiming MSE benefits.")
    f = ctx.fields(req)
    number = f.get("udyam_no", ctx.p.bidder.udyamNumber or "")
    return _result(req, "MET", f"{number} — {f.get('category', ctx.p.bidder.msmeCategory or '')}".strip(" —"),
                   "Valid certificate.", doc)


def rule_local_content(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    pct = ctx.p.makeInIndiaPercentage
    if pct < LOCAL_CONTENT_MIN:
        return _result(req, "NOT_MET", f"{pct:g}% local content", f"Below the {LOCAL_CONTENT_MIN:g}% threshold.", doc,
                       Finding(title=f"Local content below the {LOCAL_CONTENT_MIN:g}% threshold", severity="MEDIUM",
                               expected=f"≥ {LOCAL_CONTENT_MIN:g}% local content (Class-I local supplier)",
                               submitted=f"{pct:.1f}% declared",
                               comparison=f"{LOCAL_CONTENT_MIN - pct:g} percentage points below the threshold",
                               evidenceExcerpt=doc.extractedText if doc else f"Declared {pct}%",
                               evidenceSource=doc.fileName if doc else "Bid form",
                               impact="Bidder does not qualify as a Class-I local supplier for this tender.",
                               suggestedAction="Confirm the declaration and the supporting auditor certificate."), 15)
    return _result(req, "MET", f"{pct:g}% local content", "Class-I local supplier.", doc)


def rule_oem(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "HIGH", 15)
    f = ctx.fields(req)
    maker = f.get("manufacturer", "OEM")
    valid_until = _parse_date(f.get("valid_until", ""))
    required = ctx.opening_date() + timedelta(days=OEM_VALIDITY_DAYS)
    if "not stated" in f.get("warranty_clause", "").lower() or f.get("warranty", "") == "":
        return _result(req, "REVIEW", f"{maker} authorization, no warranty clause",
                       "Back-to-back warranty undertaking not stated.", doc,
                       Finding(title="OEM authorization missing warranty undertaking", severity="MEDIUM",
                               expected="Authorization with a back-to-back warranty undertaking",
                               submitted=f"{maker} authorization; warranty clause not stated",
                               comparison="Required warranty undertaking absent",
                               evidenceExcerpt=doc.extractedText, evidenceSource=doc.fileName,
                               impact="Potential non-compliance with a mandatory technical requirement.",
                               suggestedAction="Ask for a revised authorization including the warranty undertaking."), 12)
    if valid_until is None:
        return _result(req, "REVIEW", f"{maker} authorization", "Validity date could not be read.", doc, None, 10)
    if valid_until < required:
        short = (required - valid_until).days
        after = (valid_until - ctx.opening_date()).days
        return _result(req, "REVIEW", f"{maker} authorization valid until {_fmt_date(valid_until)}",
                       f"Validity ends {after} days after opening; {OEM_VALIDITY_DAYS} days required.", doc,
                       Finding(title="OEM authorization expires before the required date", severity="MEDIUM",
                               expected=f"Valid until at least {_fmt_date(required)} ({OEM_VALIDITY_DAYS} days after bid opening on {_fmt_date(ctx.opening_date())})",
                               submitted=f"Valid until {_fmt_date(valid_until)}",
                               comparison=f"{short} days short of the required validity",
                               evidenceExcerpt=doc.extractedText, evidenceSource=doc.fileName,
                               impact="Potential non-compliance with a mandatory technical requirement. Usually curable if the OEM issues an extended authorization.",
                               suggestedAction=f"Request an extended OEM authorization valid to at least {_fmt_date(required)}."), 12)
    return _result(req, "MET", f"{maker} authorization valid until {_fmt_date(valid_until)}",
                   f"More than {OEM_VALIDITY_DAYS} days after opening.", doc)


def rule_emd(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    emd = ctx.p.emd
    if emd is None:
        return _missing(req, ctx, "HIGH", 35)
    if emd.instrument == "MSME_EXEMPTION":
        category = (ctx.p.bidder.msmeCategory or "").lower()
        if ("micro" in category or "small" in category) and ctx.p.bidder.udyamNumber:
            return _result(req, "EXEMPTED", f"MSE exemption (Udyam, {ctx.p.bidder.msmeCategory})",
                           "Exemption conditions met.", doc)
        return _result(req, "NOT_MET", "MSE exemption claimed", "Bidder is not a micro/small enterprise.", doc,
                       Finding(title="EMD exemption claimed without eligibility", severity="HIGH",
                               expected=f"{_inr(emd.requiredAmount)} or valid MSE exemption",
                               submitted=f"Exemption claimed; category {ctx.p.bidder.msmeCategory or 'not declared'}",
                               comparison="Only micro and small enterprises are eligible",
                               evidenceExcerpt=doc.extractedText if doc else "", evidenceSource=doc.fileName if doc else "Bid form",
                               impact="Potential non-compliance with a mandatory condition.",
                               suggestedAction="Officer review required."), 35)
    how = "bank guarantee" if emd.instrument == "BANK_GUARANTEE" else "NEFT"
    submitted = f"{_inr(emd.submittedAmount)} via {how} ({emd.reference})"
    if emd.submittedAmount < emd.requiredAmount:
        gap = emd.requiredAmount - emd.submittedAmount
        return _result(req, "NOT_MET", submitted, f"{_inr(gap)} short of the required {_inr(emd.requiredAmount)}.", doc,
                       Finding(title=f"EMD shortfall of {_inr(gap)}", severity="HIGH",
                               expected=f"{_inr(emd.requiredAmount)}",
                               submitted=submitted,
                               comparison=f"{_inr(gap)} shortfall ({gap / emd.requiredAmount:.0%} below the required amount)",
                               evidenceExcerpt=doc.extractedText if doc else emd.reference,
                               evidenceSource=f"{doc.fileName}; EMD transaction record" if doc else "EMD transaction record",
                               impact="Potential non-compliance with a mandatory condition. The tender states that bids with short EMD are liable for rejection.",
                               suggestedAction="Officer review required. Confirm no top-up was received before the deadline."), 35)
    return _result(req, "MET", submitted, "Full amount received.", doc)


def rule_pan_itr(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "MEDIUM", 10)
    pan = ctx.fields(req).get("pan", "")
    if pan != ctx.p.bidder.pan:
        return _result(req, "REVIEW", f"PAN {pan or '—'}", "PAN on document does not match the declared PAN.", doc, None, 8)
    return _result(req, "MET", f"PAN {pan}; 3 years filed", "All three years filed.", doc)


def rule_epfo(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "MEDIUM", 10)
    f = ctx.fields(req)
    gap = next((k for k, v in f.items() if "not found" in v.lower()), None)
    if gap:
        month = gap.replace("_ecr", "").replace("_", " ").title()
        return _result(req, "REVIEW", f"{month} ECR not found", f"Latest challan found is for {f.get('latest_ecr_found', 'an earlier month')}.", doc,
                       Finding(title=f"Latest EPFO challan ({month}) not found", severity="LOW",
                               expected="Active codes with the latest monthly ECR",
                               submitted=f"Latest ECR found is for {f.get('latest_ecr_found', 'an earlier month')}",
                               comparison="One month of challan missing",
                               evidenceExcerpt=doc.extractedText, evidenceSource=doc.fileName,
                               impact="Minor statutory gap; may indicate delayed remittance.",
                               suggestedAction=f"Ask the bidder for the {month} ECR."), 8)
    return _result(req, "MET", "Active codes; recent ECR present", "Recent challan present.", doc)


def rule_experience(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "MEDIUM", 10)
    orders = [p.strip() for p in doc.extractedText.split("|") if p.strip()]
    psu = [o for o in orders if any(b in o.upper() for b in PSU_BUYERS)]
    if len(psu) >= 2:
        return _result(req, "MET", f"{len(psu)} completed PSU orders", "Two completed PSU orders.", doc)
    return _result(req, "REVIEW", f"{len(orders)} orders, {len(psu)} from PSU / oil & gas",
                   "No PSU or oil & gas orders submitted." if not psu else "Fewer than 2 PSU orders.", doc,
                   Finding(title="No PSU or oil & gas experience submitted" if not psu else "Insufficient PSU experience",
                           severity="LOW",
                           expected="2 completed similar contracts for PSU or oil & gas customers",
                           submitted=f"{len(orders)} orders submitted; {len(psu)} from PSU / oil & gas customers",
                           comparison="Customer type does not match the clause",
                           evidenceExcerpt=doc.extractedText, evidenceSource=doc.fileName,
                           impact='Experience criterion may not be met; depends on how "similar work" is interpreted.',
                           suggestedAction="Officer to decide whether the submitted orders qualify."), 8)


def rule_certificate(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "MEDIUM", 12)
    f = ctx.fields(req)
    verdict = f.get("verdict") or f.get("result") or ""
    if "pass" not in verdict.lower():
        return _result(req, "REVIEW", f"{f.get('lab', 'Lab')} — {verdict or 'no verdict'}", "Test verdict not PASS.", doc, None, 10)
    return _result(req, "MET", f"{f.get('lab', 'Lab')} — PASS", "NABL-accredited lab.", doc)


def rule_affidavit(req: Requirement, ctx: _Ctx) -> CheckResult:
    doc = ctx.doc(req)
    if not doc:
        return _missing(req, ctx, "MEDIUM", 12)
    dated = ctx.fields(req).get("affidavit_dated", "")
    return _result(req, "MET", f"Affidavit dated {dated}".strip(), "No debarment declared.", doc)


def rule_declaration(req: Requirement, ctx: _Ctx) -> CheckResult:
    """Declarations can legitimately be embedded in a general undertaking, so a missing
    standalone document is flagged for review rather than treated as missing."""
    doc = ctx.doc(req)
    if doc:
        return _result(req, "MET", "Signed declaration", "Declaration present.", doc)
    return _result(req, "REVIEW", "No separate declaration", "Not found as a separate document; may be covered by the general undertaking.",
                   None,
                   Finding(title=f"{req.title} not submitted separately", severity="LOW",
                           expected=req.benchmark or req.criterion,
                           submitted="No separate document in the bid package",
                           comparison=f"{len(ctx.p.documents)} of {len(ctx.p.requirements)} required documents in the bid package",
                           evidenceExcerpt=f"Bid package contains {len(ctx.p.documents)} documents; no standalone declaration found.",
                           evidenceSource="Bid package index",
                           impact="Documentation gap. Does not affect eligibility if the bidder confirms the declaration.",
                           suggestedAction="Include in the clarification request."), 5)


# Requirement title keywords → rule. Order matters (first match wins).
RULES: List[tuple] = [
    (("turnover",), rule_turnover),
    (("gst",), rule_gst),
    (("udyam", "msme"), rule_udyam),
    (("local content", "make in india"), rule_local_content),
    (("oem",), rule_oem),
    (("earnest money", "emd"), rule_emd),
    (("pan", "income tax"), rule_pan_itr),
    (("epfo", "esic"), rule_epfo),
    (("execution", "experience"), rule_experience),
    (("test certificate", "nabl", "certification"), rule_certificate),
    (("blacklisting",), rule_affidavit),
    (("declaration", "land border"), rule_declaration),
]


def _rule_for(req: Requirement) -> Callable[[Requirement, _Ctx], CheckResult]:
    title = req.title.lower()
    for keywords, rule in RULES:
        if any(k in title for k in keywords):
            return rule
    return lambda r, c: (_result(r, "MET", "Document present", "Document present.", c.doc(r)) if c.doc(r) else _missing(r, c))


class DiscrepancyDetector:
    def evaluate(self, payload: VerifyRequest) -> List[CheckResult]:
        ctx = _Ctx(payload)
        return [_rule_for(req)(req, ctx) for req in payload.requirements]
