"""NVIDIA model 1 — Nemotron OCR V2 (hosted NIM on build.nvidia.com).

Based on the team's initial integration (branch Alpha), corrected for the hosted API:
  POST https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2
  body     {"input": [{"type": "image_url", "url": "data:image/png;base64,..."}], "merge_levels": ["paragraph"]}
  response {"data": [{"index": 0, "text_detections": [{"text_prediction": {"text", "confidence"},
                                                       "bounding_box": {"points": [...]}}]}]}
There is no fallback: if the key is missing or the call fails, an error is raised.
"""

import base64
import time
from typing import Any, Dict, List

import requests

from src.nvidia import backoff

from src.core.config import settings
from src.nvidia.errors import NvidiaError, NvidiaNotConfigured

SUPPORTED_MIME = {"image/png", "image/jpeg"}
MAX_BYTES = 4 * 1024 * 1024


MAX_PDF_PAGES = 4


def pdf_to_images(pdf_bytes: bytes) -> List[bytes]:
    """Renders the first pages of a PDF to PNG images (150 dpi) for OCR."""
    import pymupdf

    try:
        doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    except Exception as exc:  # corrupt or encrypted file
        raise NvidiaError(f"The PDF could not be opened: {exc}", status=422) from exc
    if doc.needs_pass:
        raise NvidiaError("The PDF is password-protected.", status=422)
    pages = [doc.load_page(i).get_pixmap(dpi=150).tobytes("png") for i in range(min(doc.page_count, MAX_PDF_PAGES))]
    if not pages:
        raise NvidiaError("The PDF has no pages.", status=422)
    return pages


def run_ocr(image_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    """OCR for an image, or for each page of a PDF (first MAX_PDF_PAGES pages), combined."""
    if mime_type == "application/pdf":
        if not settings.nvidia_ocr_api_key:
            raise NvidiaNotConfigured("NVIDIA_OCR_API_KEY is not set for Nemotron OCR V2.")
        results = [run_ocr(page, "image/png") for page in pdf_to_images(image_bytes)]
        blocks = [dict(b, page=i + 1) for i, r in enumerate(results) for b in r["blocks"]]
        confidences = [b["confidence"] for b in blocks]
        return {
            **results[0],
            "latencyMs": sum(r["latencyMs"] for r in results),
            "blocks": blocks,
            "text": chr(10).join(r["text"] for r in results),
            "meanConfidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
            "pages": len(results),
        }
    return _run_ocr_image(image_bytes, mime_type)


def _run_ocr_image(image_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    if not settings.nvidia_ocr_api_key:
        raise NvidiaNotConfigured("NVIDIA_OCR_API_KEY is not set for Nemotron OCR V2.")
    if mime_type not in SUPPORTED_MIME:
        raise NvidiaError(f"Upload a PDF, PNG or JPEG file; received {mime_type}.", status=415)
    if len(image_bytes) > MAX_BYTES:
        raise NvidiaError("Image is larger than 4 MB.", status=413)

    payload = {
        "input": [{"type": "image_url", "url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"}],
        "merge_levels": [settings.nemotron_ocr_merge_level],
    }
    started = time.perf_counter()
    try:
        res = backoff.post(
            settings.nemotron_ocr_endpoint,
            json=payload,
            headers={"Authorization": f"Bearer {settings.nvidia_ocr_api_key}", "Accept": "application/json"},
            timeout=90,
        )
    except requests.RequestException as exc:
        raise NvidiaError(f"Nemotron OCR request failed: {exc}") from exc
    latency_ms = round((time.perf_counter() - started) * 1000)
    if not res.ok:
        raise NvidiaError(f"Nemotron OCR returned HTTP {res.status_code}: {res.text[:300]}")

    detections = (res.json().get("data") or [{}])[0].get("text_detections", [])
    blocks: List[Dict[str, Any]] = []
    for det in detections:
        pred = det.get("text_prediction", {})
        text = (pred.get("text") or "").strip()
        if text:
            blocks.append({
                "text": text,
                "confidence": round(float(pred.get("confidence", 0)), 4),
                "boundingBox": [(round(p["x"], 4), round(p["y"], 4)) for p in det.get("bounding_box", {}).get("points", [])],
            })
    # Reading order: top-to-bottom, then left-to-right.
    blocks.sort(key=lambda b: (round(b["boundingBox"][0][1], 2) if b["boundingBox"] else 0, b["boundingBox"][0][0] if b["boundingBox"] else 0))
    confidences = [b["confidence"] for b in blocks]
    return {
        "model": "nvidia/nemotron-ocr-v2",
        "endpoint": settings.nemotron_ocr_endpoint,
        "latencyMs": latency_ms,
        "blocks": blocks,
        "text": "\n".join(b["text"] for b in blocks),
        "meanConfidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
    }
