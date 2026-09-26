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

from src.core.config import settings
from src.nvidia.errors import NvidiaError, NvidiaNotConfigured

SUPPORTED_MIME = {"image/png", "image/jpeg"}
MAX_BYTES = 4 * 1024 * 1024


def run_ocr(image_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    if not settings.nvidia_ocr_api_key:
        raise NvidiaNotConfigured("NVIDIA_OCR_API_KEY is not set for Nemotron OCR V2.")
    if mime_type not in SUPPORTED_MIME:
        raise NvidiaError(f"Nemotron OCR accepts PNG or JPEG images; received {mime_type}.", status=415)
    if len(image_bytes) > MAX_BYTES:
        raise NvidiaError("Image is larger than 4 MB.", status=413)

    payload = {
        "input": [{"type": "image_url", "url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"}],
        "merge_levels": [settings.nemotron_ocr_merge_level],
    }
    started = time.perf_counter()
    try:
        res = requests.post(
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
