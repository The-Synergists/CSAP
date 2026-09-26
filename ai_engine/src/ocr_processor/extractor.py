"""Document field extraction.

The prototype does not run OCR on real PDFs yet: bid documents arrive with their text already
extracted ("Label: value | Label: value"). This module parses that text into structured
fields and classifies the document type. A real OCR backend (e.g. Tesseract / a document AI
service) would replace `_read_text` without changing the callers.
"""

import re
from typing import Any, Dict, List

from src.schemas import Document

_DOC_TYPES = [
    ("gst", "GST_REGISTRATION"),
    ("oem", "OEM_AUTHORIZATION"),
    ("emd", "EMD_INSTRUMENT"),
    ("bank guarantee", "EMD_INSTRUMENT"),
    ("financial", "AUDITED_FINANCIALS"),
    ("udyam", "UDYAM_CERTIFICATE"),
    ("make in india", "LOCAL_CONTENT_DECLARATION"),
    ("pan", "PAN_ITR"),
    ("epfo", "EPFO_ESIC"),
    ("past", "EXPERIENCE_RECORD"),
    ("nabl", "TEST_CERTIFICATE"),
    ("test", "TEST_CERTIFICATE"),
    ("blacklisting", "NON_BLACKLISTING_AFFIDAVIT"),
    ("land border", "LAND_BORDER_DECLARATION"),
]


def parse_fields(text: str) -> Dict[str, str]:
    """'GSTIN: X | Status: Active' -> {'gstin': 'X', 'status': 'Active'}."""
    fields: Dict[str, str] = {}
    for part in (text or "").split("|"):
        if ":" not in part:
            continue
        key, value = part.split(":", 1)
        key = re.sub(r"[^a-z0-9]+", "_", key.strip().lower()).strip("_")
        if key:
            fields[key] = value.strip()
    return fields


def classify(name: str) -> str:
    lower = name.lower()
    for needle, doc_type in _DOC_TYPES:
        if needle in lower:
            return doc_type
    return "GENERAL_DOCUMENT"


class DocumentOCRExtractor:
    def _read_text(self, document: Document) -> str:
        return document.extractedText

    def extract_document(self, document: Document) -> Dict[str, Any]:
        text = self._read_text(document)
        fields = parse_fields(text)
        return {
            "documentId": document.id,
            "fileName": document.fileName,
            "documentType": classify(document.name),
            "status": "EXTRACTED" if fields else "NO_FIELDS_FOUND",
            "fields": fields,
            "source": "Pre-extracted text supplied with the bid (OCR is not run in this prototype).",
        }

    def batch_extract(self, documents: List[Document]) -> List[Dict[str, Any]]:
        return [self.extract_document(d) for d in documents]
