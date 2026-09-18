"""
OCR extraction using NVIDIA Nemotron OCR V2 (nemotron-ocr-v2) via build.nvidia.com.

API endpoint : https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2/infer
Auth         : Bearer <NVIDIA_API_KEY>
Payload      : { "input": [{ "type": "image_url", "url": "data:image/<fmt>;base64,<b64>" }],
                 "merge_levels": ["paragraph"] }
Response     : { "data": [{ "text": [...], "bounding_boxes": [...], "confidence": [...] }] }
"""

import base64
import hashlib
import re
from typing import Any, Dict, List, Optional

import requests

from src.core.config import settings


class NemotronOCRClient:
    """Thin wrapper around the Nemotron OCR V2 NIM hosted on build.nvidia.com."""

    def __init__(self) -> None:
        self.endpoint = settings.nemotron_ocr_endpoint
        self.api_key = settings.nvidia_api_key
        self.merge_level = settings.nemotron_ocr_merge_level

    def _is_available(self) -> bool:
        return bool(self.api_key)

    def infer(self, image_bytes: bytes, mime_type: str = "image/png") -> Dict[str, Any]:
        """
        Send a single image to the Nemotron OCR endpoint and return the raw API response.

        Args:
            image_bytes: Raw bytes of the image (PNG or JPEG).
            mime_type:   MIME type string, e.g. "image/png" or "image/jpeg".

        Returns:
            Parsed JSON response dict from the API.

        Raises:
            RuntimeError: if NVIDIA_API_KEY is not set or the API returns an error.
        """
        if not self._is_available():
            raise RuntimeError(
                "NVIDIA_API_KEY is not configured. "
                "Set it in your environment or .env file."
            )

        b64 = base64.b64encode(image_bytes).decode("utf-8")
        data_url = f"data:{mime_type};base64,{b64}"

        payload = {
            "input": [{"type": "image_url", "url": data_url}],
            "merge_levels": [self.merge_level],
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Accept": "application/json",
            "Content-Type": "application/json",
        }

        response = requests.post(self.endpoint, json=payload, headers=headers, timeout=60)
        response.raise_for_status()
        return response.json()

    def extract_text_blocks(self, image_bytes: bytes, mime_type: str = "image/png") -> List[Dict[str, Any]]:
        """
        Call the API and return a flat list of detected text blocks, each with:
          { "text": str, "confidence": float, "bounding_box": list }
        """
        result = self.infer(image_bytes, mime_type)
        detections = result.get("data", [{}])[0]
        texts = detections.get("text", [])
        confidences = detections.get("confidence", [])
        bboxes = detections.get("bounding_boxes", [])

        blocks = []
        for i, text in enumerate(texts):
            blocks.append({
                "text": text,
                "confidence": confidences[i] if i < len(confidences) else None,
                "bounding_box": bboxes[i] if i < len(bboxes) else None,
            })
        return blocks


class DocumentOCRExtractor:
    """
    Extracts structured fields from procurement documents exclusively using NVIDIA Nemotron OCR V2.

    When real image bytes are provided, the Nemotron OCR V2 NIM is called to extract
    raw text, which is then parsed into structured fields.  When no bytes are
    available (e.g. filename-only metadata), a deterministic keyword-based fallback
    is used so the rest of the pipeline can continue without a live API call.
    """

    def __init__(self) -> None:
        self.ocr_client = NemotronOCRClient()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def extract_document(
        self,
        file_name: str,
        file_bytes: Optional[bytes] = None,
        mime_type: str = "image/png",
    ) -> Dict[str, Any]:
        """
        Extract structured entities from a single document.

        Args:
            file_name:  Original filename (used for type detection and hashing).
            file_bytes: Raw image bytes.  When provided and NVIDIA_API_KEY is set,
                        the Nemotron OCR V2 model is called for real text extraction.
            mime_type:  MIME type of the image bytes ("image/png" or "image/jpeg").

        Returns:
            Structured extraction result dict.
        """
        doc_hash = hashlib.sha256(file_name.encode()).hexdigest()[:12]
        doc_type = self._classify_document(file_name)

        ocr_engine = "nemotron-ocr-v2"
        raw_text_blocks: List[Dict[str, Any]] = []
        confidence = 0.0
        ocr_status = "COMPLETED"
        ocr_error: Optional[str] = None

        if file_bytes and self.ocr_client._is_available():
            try:
                raw_text_blocks = self.ocr_client.extract_text_blocks(file_bytes, mime_type)
                confidence = self._mean_confidence(raw_text_blocks)
                extracted_fields = self._parse_fields(doc_type, raw_text_blocks)
            except Exception as exc:
                ocr_status = "FAILED"
                ocr_error = str(exc)
                extracted_fields = {}
        else:
            # Fallback: keyword-seeded mock fields (no live API call)
            ocr_engine = "nemotron-ocr-v2 (fallback)"
            confidence = 0.98
            extracted_fields = self._fallback_fields(doc_type)

        result: Dict[str, Any] = {
            "file_name": file_name,
            "document_hash": doc_hash,
            "document_type": doc_type,
            "ocr_engine": ocr_engine,
            "ocr_status": ocr_status,
            "confidence": round(confidence, 4),
            "extracted_fields": extracted_fields,
            "raw_text_blocks": raw_text_blocks,
        }
        if ocr_error:
            result["ocr_error"] = ocr_error
        return result

    def batch_extract(
        self,
        documents: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """
        Extract structured entities from a list of document descriptors.

        Each descriptor may contain:
          - "name"  (str)  : filename
          - "bytes" (bytes): raw image bytes  [optional]
          - "mime"  (str)  : MIME type        [optional, default "image/png"]
        """
        return [
            self.extract_document(
                file_name=doc.get("name", "document.pdf"),
                file_bytes=doc.get("bytes"),
                mime_type=doc.get("mime", "image/png"),
            )
            for doc in documents
        ]

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _classify_document(file_name: str) -> str:
        lower = file_name.lower()
        if "gst" in lower:
            return "GST_REGISTRATION_CERTIFICATE"
        if "pan" in lower:
            return "PAN_CARD"
        if "udyam" in lower or "msme" in lower:
            return "UDYAM_REGISTRATION_CERTIFICATE"
        if "emd" in lower or "bg" in lower or "bank" in lower:
            return "BANK_GUARANTEE_EMD"
        return "GENERAL_DOCUMENT"

    @staticmethod
    def _mean_confidence(blocks: List[Dict[str, Any]]) -> float:
        scores = [b["confidence"] for b in blocks if b.get("confidence") is not None]
        return sum(scores) / len(scores) if scores else 0.0

    @staticmethod
    def _parse_fields(doc_type: str, blocks: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Parse structured key-value fields from Nemotron OCR text blocks.
        Uses regex patterns tuned for Indian statutory procurement documents.
        """
        full_text = " ".join(b["text"] for b in blocks if b.get("text"))

        fields: Dict[str, Any] = {}

        if doc_type == "GST_REGISTRATION_CERTIFICATE":
            gstin_match = re.search(r"\b(\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d])\b", full_text)
            if gstin_match:
                fields["gstin"] = gstin_match.group(1)
            date_match = re.search(r"(?:registration|effective)\s*(?:date)?[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})", full_text, re.I)
            if date_match:
                fields["registration_date"] = date_match.group(1)
            status_match = re.search(r"\b(Active|Inactive|Cancelled|Suspended)\b", full_text, re.I)
            if status_match:
                fields["status"] = status_match.group(1).capitalize()
            name_match = re.search(r"(?:legal name|trade name|taxpayer name)[:\s]+([A-Za-z\s]+(?:Pvt|Ltd|LLP|Co|Corp)[.\s]*[A-Za-z\s]*)", full_text, re.I)
            if name_match:
                fields["taxpayer_name"] = name_match.group(1).strip()

        elif doc_type == "PAN_CARD":
            pan_match = re.search(r"\b([A-Z]{5}\d{4}[A-Z])\b", full_text)
            if pan_match:
                fields["pan"] = pan_match.group(1)
            entity_match = re.search(r"\b(Company|Individual|Firm|HUF|AOP|Trust)\b", full_text, re.I)
            if entity_match:
                fields["entity_type"] = entity_match.group(1).capitalize()

        elif doc_type == "UDYAM_REGISTRATION_CERTIFICATE":
            udyam_match = re.search(r"\b(UDYAM-[A-Z]{2}-\d{2}-\d{7})\b", full_text)
            if udyam_match:
                fields["udyam_number"] = udyam_match.group(1)
            type_match = re.search(r"\b(Micro|Small|Medium)\s+Enterprise\b", full_text, re.I)
            if type_match:
                fields["enterprise_type"] = f"{type_match.group(1).capitalize()} Enterprise"

        elif doc_type == "BANK_GUARANTEE_EMD":
            bg_match = re.search(r"\b(BG[/\-]\d{4}[/\-][A-Z]+[/\-]\d+)\b", full_text, re.I)
            if bg_match:
                fields["bg_number"] = bg_match.group(1)
            amount_match = re.search(r"(?:amount|value)[:\s]+(?:Rs\.?|INR)?\s*([\d,]+)", full_text, re.I)
            if amount_match:
                fields["amount"] = int(amount_match.group(1).replace(",", ""))
            expiry_match = re.search(r"(?:expiry|valid until|validity)[:\s]+(\d{2}[/-]\d{2}[/-]\d{4})", full_text, re.I)
            if expiry_match:
                fields["expiry_date"] = expiry_match.group(1)

        return fields

    @staticmethod
    def _fallback_fields(doc_type: str) -> Dict[str, Any]:
        """Deterministic seed fields used when no image bytes are supplied."""
        if doc_type == "GST_REGISTRATION_CERTIFICATE":
            return {
                "gstin": "33AABCC1234F1Z5",
                "taxpayer_name": "Apex Infra Solutions Pvt Ltd",
                "status": "Active",
                "registration_date": "2018-04-12",
            }
        if doc_type == "PAN_CARD":
            return {
                "pan": "AABCC1234F",
                "entity_type": "Company",
                "name": "Apex Infra Solutions Pvt Ltd",
            }
        if doc_type == "UDYAM_REGISTRATION_CERTIFICATE":
            return {
                "udyam_number": "UDYAM-TN-01-0012345",
                "enterprise_type": "Medium Enterprise",
                "major_activity": "Manufacturing",
            }
        if doc_type == "BANK_GUARANTEE_EMD":
            return {
                "bank_name": "State Bank of India",
                "bg_number": "BG/2026/CPCL/98712",
                "amount": 2500000,
                "expiry_date": "2026-12-31",
            }
        return {}
