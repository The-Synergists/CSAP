"""
Document OCR & Visual Entity Extractor powered by NVIDIA Nemotron Parse 2.0.
Reads configuration purely from ai_engine/.env.
"""

import os
import json
import base64
import hashlib
import logging
from typing import Dict, Any, List, Optional
from pathlib import Path
from dotenv import load_dotenv
import requests

# Load environment configuration (.env)
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

logger = logging.getLogger("CSAP.NemotronParse")

PARSE_PROMPT = """You are NVIDIA Nemotron Parse 2.0, a Vision-Language Document Intelligence engine specialized in Indian Public Procurement (GeM / CPCL / MoPNG statutory documents).

Analyze this document image carefully. Extract all visual text, table layouts, and statutory procurement credentials.

Respond ONLY with a valid JSON object matching this schema:
{
  "document_type": "GST_REGISTRATION_CERTIFICATE" | "PAN_CARD" | "UDYAM_REGISTRATION_CERTIFICATE" | "BANK_GUARANTEE_EMD" | "OEM_AUTHORIZATION" | "FINANCIAL_STATEMENT" | "GENERAL_DOCUMENT",
  "confidence": 0.95,
  "summary": "Brief 1-sentence description of the document",
  "extracted_fields": {
    "gstin": "15-digit GSTIN or null",
    "pan": "10-digit PAN or null",
    "udyam_number": "UDYAM number or null",
    "legal_name": "Entity name or null",
    "enterprise_type": "Micro / Small / Medium or null",
    "bank_name": "Bank name or null",
    "bg_number": "Instrument / BG number or null",
    "amount": null,
    "expiry_date": "YYYY-MM-DD or null",
    "is_unconditional": true,
    "stamp_detected": true,
    "signature_detected": true
  },
  "raw_text": "Complete visual text extracted from the document",
  "layout_markdown": "Full layout-aware Markdown representation with tables preserved"
}"""


class DocumentOCRExtractor:
    """Document OCR and entity extraction using NVIDIA Nemotron Parse 2.0."""

    def __init__(self):
        # All configuration is loaded directly from .env
        self.endpoint = os.getenv("NEMOTRON_PARSE_ENDPOINT", "")
        self.model = os.getenv("NEMOTRON_PARSE_MODEL", "nvidia/nemotron-parse-2.0")
        self.api_key = (
            os.getenv("NEMOTRON_PARSE_API_KEY")
            or os.getenv("NVIDIA_API_KEY")
            or ""
        )

    def extract_from_file(self, file_path: str) -> Dict[str, Any]:
        """Read a local image file and send to Nemotron Parse 2.0."""
        p = Path(file_path)
        if not p.exists():
            return {"file_name": p.name, "ocr_status": "FAILED", "error": f"File not found: {file_path}"}

        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".bmp": "image/bmp",
        }
        mime_type = mime_map.get(p.suffix.lower(), "image/png")
        return self.extract_document(file_name=p.name, file_bytes=p.read_bytes(), mime_type=mime_type)

    def extract_document(
        self,
        file_name: str,
        file_bytes: Optional[bytes] = None,
        mime_type: str = "image/png"
    ) -> Dict[str, Any]:
        """
        Send document image to Nemotron Parse 2.0 API.
        """
        doc_hash = hashlib.sha256(file_bytes or file_name.encode()).hexdigest()[:12]

        # If no file bytes provided
        if not file_bytes:
            return {
                "file_name": file_name,
                "document_hash": doc_hash,
                "ocr_status": "PENDING",
                "extracted_fields": {},
                "raw_text": "",
            }

        # If API credentials not configured in .env
        if not self.api_key or not self.endpoint:
            logger.error("[NemotronParse] NEMOTRON_PARSE_API_KEY or NEMOTRON_PARSE_ENDPOINT is missing in .env")
            return {
                "file_name": file_name,
                "document_hash": doc_hash,
                "ocr_status": "FAILED",
                "error": "NEMOTRON_PARSE_API_KEY or NEMOTRON_PARSE_ENDPOINT not configured in .env",
                "extracted_fields": {},
            }

        # 1. Base64 encode image for Vision API
        b64_image = base64.b64encode(file_bytes).decode("utf-8")

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        payload = {
            "model": self.model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": PARSE_PROMPT},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{b64_image}"},
                        },
                    ],
                }
            ],
            "temperature": 0.05,
            "max_tokens": 2048,
        }

        # 2. Call Nemotron Parse 2.0 API endpoint
        try:
            logger.info(f"[NemotronParse] Calling {self.model} at {self.endpoint}...")
            response = requests.post(self.endpoint, json=payload, headers=headers, timeout=45)
            if response.status_code == 403:
                error_msg = (
                    "NVIDIA API Error 403: Authorization failed. Please verify that NEMOTRON_PARSE_API_KEY "
                    "in ai_engine/.env is an active, valid key with credits from https://build.nvidia.com"
                )
                logger.error(f"[NemotronParse] {error_msg}")
                return {
                    "file_name": file_name,
                    "document_hash": doc_hash,
                    "ocr_status": "FAILED",
                    "error": error_msg,
                    "extracted_fields": {},
                    "raw_text": "",
                }

            response.raise_for_status()
            data = response.json()

            raw_content = data["choices"][0]["message"].get("content", "").strip()

            # Clean markdown code block wraps if returned
            if raw_content.startswith("```json"):
                raw_content = raw_content[7:]
            if raw_content.startswith("```"):
                raw_content = raw_content[3:]
            if raw_content.endswith("```"):
                raw_content = raw_content[:-3]

            result = json.loads(raw_content.strip())
            result["file_name"] = file_name
            result["document_hash"] = doc_hash
            result["ocr_status"] = "COMPLETED"
            result["model_used"] = self.model
            return result

        except Exception as exc:
            logger.error(f"[NemotronParse] Extraction failed for {file_name}: {exc}")
            return {
                "file_name": file_name,
                "document_hash": doc_hash,
                "ocr_status": "FAILED",
                "error": str(exc),
                "extracted_fields": {},
                "raw_text": "",
            }

    def batch_extract(self, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Batch extract multiple documents, automatically resolving file bytes from
        local disk path, Supabase storage path, base64 payload, or HTTP URL.
        """
        results = []
        for doc in documents:
            file_name = doc.get("name") or doc.get("file_name", "document.png")
            file_bytes = doc.get("file_bytes")

            # 1. Base64 encoded payload
            if not file_bytes and doc.get("base64"):
                try:
                    file_bytes = base64.b64decode(doc["base64"])
                except Exception:
                    pass

            # 2. Local file path check
            path_str = doc.get("path") or doc.get("file_path") or doc.get("url")
            if not file_bytes and path_str:
                p = Path(path_str)
                if p.exists() and p.is_file():
                    try:
                        file_bytes = p.read_bytes()
                    except Exception as e:
                        logger.warning(f"Could not read local file {p}: {e}")

            # 3. Supabase Storage path check (e.g. bids/...)
            if not file_bytes and path_str and not str(path_str).startswith("http"):
                try:
                    from src.core.supabase_client import get_supabase
                    sb = get_supabase()
                    if sb:
                        file_bytes = sb.storage.from_("bid-documents").download(path_str)
                except Exception as sb_err:
                    logger.debug(f"Could not download from Supabase storage '{path_str}': {sb_err}")

            # 4. HTTP URL check
            if not file_bytes and path_str and str(path_str).startswith("http"):
                try:
                    r = requests.get(path_str, timeout=15)
                    if r.status_code == 200:
                        file_bytes = r.content
                except Exception as http_err:
                    logger.warning(f"Could not fetch URL {path_str}: {http_err}")

            mime_map = {
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".bmp": "image/bmp",
            }
            ext = Path(file_name).suffix.lower()
            mime_type = mime_map.get(ext, "image/png")

            results.append(self.extract_document(file_name=file_name, file_bytes=file_bytes, mime_type=mime_type))

        return results
