"""Splits one combined bid PDF (every document in a single file) into one PDF per requirement.

Sellers often merge all their documents into a single PDF. CSAP reads every page with Nemotron
OCR V2, decides which tender requirement each page belongs to, and cuts the file into one PDF per
requirement, so each document is then read and verified exactly like a separately uploaded one.

Page classification:
  1. keyword signals (a document's own title words, e.g. "EARNEST MONEY", "Form GST REG-06");
     a page is assigned when one requirement clearly leads;
  2. the remaining pages go to the reasoning model in one call (temperature 0, JSON only), which
     must answer with a requirement code or null for each page;
  3. a page still unassigned directly after an assigned page is treated as its continuation.
"""

import base64
import json
import re
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Dict, List, Optional

from src.nvidia.errors import NvidiaError
from src.nvidia.extraction import stream_chat
from src.nvidia.ocr import run_ocr

MAX_PAGES = 40

# Title words per requirement of the safety-equipment template (weight 2 = decisive title words).
SIGNALS: Dict[str, List[tuple]] = {
    "REQ-01": [("AUDITED FINANCIAL", 2), ("BALANCE SHEET", 2), ("PROFIT AND LOSS", 2), ("TURNOVER", 1), ("UDIN", 1)],
    "REQ-02": [("REG-06", 2), ("GST REGISTRATION", 2), ("GOODS AND SERVICES TAX", 2), ("GSTIN", 1)],
    "REQ-03": [("UDYAM REGISTRATION", 2), ("UDYAM", 1), ("MICRO, SMALL", 1)],
    "REQ-04": [("LOCAL CONTENT", 2), ("MAKE IN INDIA", 2), ("CLASS-I", 1)],
    "REQ-05": [("AUTHORIZATION CERTIFICATE", 2), ("AUTHORISATION", 2), ("MANUFACTURER AUTHORI", 2), ("OEM", 1), ("AUTHORIZED PARTNER", 1)],
    "REQ-06": [("EARNEST MONEY", 2), ("BANK GUARANTEE", 2), ("EMD", 1), ("NEFT", 1), ("UTR", 1)],
    "REQ-07": [("PERMANENT ACCOUNT NUMBER", 2), ("INCOME TAX DEPARTMENT", 2), ("E-PAN", 2), ("ITR-V", 1), ("ACKNOWLEDGEMENT", 1)],
    "REQ-08": [("EPFO", 2), ("ESIC", 2), ("ELECTRONIC CHALLAN", 2), ("ECR", 1), ("PROVIDENT FUND", 1)],
    "REQ-09": [("PURCHASE ORDER", 2), ("PAST PERFORMANCE", 2), ("COMPLETION CERTIFICATE", 2), ("WORK ORDER", 1)],
    "REQ-10": [("TEST REPORT", 2), ("NABL", 2), ("LABORATORY", 1)],
    "REQ-11": [("AFFIDAVIT", 2), ("BLACKLIST", 2), ("DEBAR", 1)],
    "REQ-12": [("LAND BORDER", 2), ("SHARES A LAND BORDER", 2)],
}

SYSTEM = (
    "You sort the pages of a combined tender bid PDF into the tender's required documents. "
    "For each page decide which requirement's document it belongs to, using only the page text. "
    "Answer null when the page does not clearly belong to any requirement. "
    'Respond with JSON only: {"pages": [{"page": 1, "requirement": "REQ-02"}]}'
)


def _render(pdf_bytes: bytes):
    import pymupdf

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:
        raise NvidiaError(f"The PDF could not be opened: {exc}", status=422) from exc
    if doc.needs_pass:
        raise NvidiaError("The PDF is password-protected.", status=422)
    if doc.page_count == 0:
        raise NvidiaError("The PDF has no pages.", status=422)
    if doc.page_count > MAX_PAGES:
        raise NvidiaError(f"The combined PDF has {doc.page_count} pages; at most {MAX_PAGES} are supported.", status=413)
    return doc


def _keyword_guess(text: str, codes: List[str]) -> Optional[str]:
    upper = text.upper()
    scores = {c: sum(w for kw, w in SIGNALS.get(c, []) if kw in upper) for c in codes}
    ranked = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
    if not ranked or ranked[0][1] < 2:
        return None
    if len(ranked) > 1 and ranked[1][1] >= ranked[0][1]:
        return None  # a tie is decided by the model
    return ranked[0][0]


def _model_guess(pages: Dict[int, str], requirements: List[Dict[str, str]]) -> Dict[int, Optional[str]]:
    if not pages:
        return {}
    codes = {r["code"] for r in requirements}
    listing = "\n".join(f"{r['code']}: {r['title']}" for r in requirements)
    body = "\n\n".join(f"--- PAGE {p} ---\n{t[:900]}" for p, t in sorted(pages.items()))
    content, _ = stream_chat(SYSTEM, f"REQUIREMENTS:\n{listing}\n\nPAGES:\n{body}", max_tokens=600)
    match = re.search(r"\{.*\}", content.strip(), re.S)
    if not match:
        return {}
    try:
        rows = json.loads(match.group(0)).get("pages", [])
    except json.JSONDecodeError:
        return {}
    out: Dict[int, Optional[str]] = {}
    for r in rows:
        if isinstance(r, dict) and isinstance(r.get("page"), int):
            code = r.get("requirement")
            out[r["page"]] = code if code in codes else None
    return out


def split_package(pdf_bytes: bytes, requirements: List[Dict[str, str]]) -> Dict[str, Any]:
    import pymupdf

    doc = _render(pdf_bytes)
    images = [doc.load_page(i).get_pixmap(dpi=150).tobytes("png") for i in range(doc.page_count)]
    with ThreadPoolExecutor(max_workers=4) as pool:
        ocr = list(pool.map(lambda img: run_ocr(img, "image/png"), images))
    texts = {i + 1: r.get("text", "") for i, r in enumerate(ocr)}

    codes = [r["code"] for r in requirements]
    assigned: Dict[int, Optional[str]] = {}
    how: Dict[int, str] = {}
    for p, t in texts.items():
        g = _keyword_guess(t, codes)
        if g:
            assigned[p], how[p] = g, "title words"
    unsure = {p: t for p, t in texts.items() if p not in assigned and t.strip()}
    for p, g in _model_guess(unsure, requirements).items():
        if g:
            assigned[p], how[p] = g, "reasoning model"
    for p in sorted(texts):
        if p not in assigned and assigned.get(p - 1):
            assigned[p], how[p] = assigned[p - 1], f"continues page {p - 1}"

    groups: Dict[str, List[int]] = {}
    for p in sorted(assigned):
        if assigned[p]:
            groups.setdefault(assigned[p], []).append(p)

    documents = []
    for code in codes:
        pages = groups.get(code)
        if not pages:
            continue
        part = pymupdf.open()
        for p in pages:
            part.insert_pdf(doc, from_page=p - 1, to_page=p - 1)
        documents.append({
            "requirementCode": code,
            "pages": pages,
            "how": sorted({how[p] for p in pages}),
            "contentBase64": base64.b64encode(part.tobytes()).decode("ascii"),
        })
    unassigned = [p for p in sorted(texts) if not assigned.get(p)]
    return {"pages": doc.page_count, "documents": documents, "unassigned": unassigned}
