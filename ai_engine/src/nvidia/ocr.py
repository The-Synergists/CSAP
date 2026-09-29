"""NVIDIA model 1 — Nemotron Parse 2.0 (hosted NIM on build.nvidia.com, OpenAI-compatible chat
completions). Replaced Nemotron OCR V2 on 2026-09-29; verified directly against the hosted API:

  POST https://integrate.api.nvidia.com/v1/chat/completions
  body     {"model": "nvidia/nemotron-parse-2.0",
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": "</s><s><predict_bbox><predict_classes><output_markdown><predict_text_in_pic>"},
                {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}]}],
            "temperature": 0, "top_p": 1, "max_tokens": 2048, "stream": true}
  The model's total context (input + output) is only 4096 tokens, so max_tokens is kept well
  under that to leave room for the image; a dense page may still be truncated (see MAX_PDF_PAGES).
  response (Server-Sent Events, reassembled like the extraction model's stream) is one string of
  blocks, each shaped "<x_XMIN><y_YMIN>markdown text<x_XMAX><y_YMAX><class_LABEL>" with normalised
  (0-1) coordinates — parsed below into the same {text, confidence, boundingBox} blocks the rest of
  the pipeline already expects.

  Streaming is required: the hosted instance answers HTTP 500/502 in non-streaming mode, reproduced
  even against NVIDIA's own published example image, so `stream: true` is not optional here.
There is no fallback: if the key is missing or the call fails, an error is raised.
"""

import base64
import json
import re
import time
from typing import Any, Dict, List

import requests

from src.nvidia import backoff

from src.core.config import settings
from src.nvidia.errors import NvidiaError, NvidiaNotConfigured

SUPPORTED_MIME = {"image/png", "image/jpeg"}
MAX_BYTES = 4 * 1024 * 1024

MAX_PDF_PAGES = 4

PARSE_PROMPT = "</s><s><predict_bbox><predict_classes><output_markdown><predict_text_in_pic>"
BLOCK_RE = re.compile(r"<x_([\d.]+)><y_([\d.]+)>(.*?)<x_([\d.]+)><y_([\d.]+)><class_([^>]+)>", re.S)


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
            raise NvidiaNotConfigured("NVIDIA_OCR_API_KEY is not set for Nemotron Parse.")
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


def _clean_markdown(text: str) -> str:
    """Strips the markdown decoration Parse adds (headings, bold, line breaks) so the text reads
    like plain OCR output, matching what the rest of the pipeline expected from the previous model."""
    text = text.replace("<br>", "\n")
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"^#+\s*", "", text, flags=re.M)
    return text.strip()


def _run_ocr_image(image_bytes: bytes, mime_type: str) -> Dict[str, Any]:
    if not settings.nvidia_ocr_api_key:
        raise NvidiaNotConfigured("NVIDIA_OCR_API_KEY is not set for Nemotron Parse.")
    if mime_type not in SUPPORTED_MIME:
        raise NvidiaError(f"Upload a PDF, PNG or JPEG file; received {mime_type}.", status=415)
    if len(image_bytes) > MAX_BYTES:
        raise NvidiaError("Image is larger than 4 MB.", status=413)

    payload = {
        "model": settings.nvidia_ocr_model,
        "messages": [{"role": "user", "content": [
            {"type": "text", "text": PARSE_PROMPT},
            {"type": "image_url", "image_url": {"url": f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode()}"}},
        ]}],
        "temperature": 0,
        "top_p": 1,
        "max_tokens": 2048,
        "stream": True,
    }
    started = time.perf_counter()
    content = ""
    try:
        with backoff.post(
            settings.nemotron_ocr_endpoint,
            json=payload,
            headers={"Authorization": f"Bearer {settings.nvidia_ocr_api_key}", "Accept": "text/event-stream"},
            stream=True,
            timeout=(10, 120),
        ) as res:
            if not res.ok:
                raise NvidiaError(f"Nemotron Parse returned HTTP {res.status_code}: {res.text[:300]}")
            for line in res.iter_lines():
                if not line or not line.startswith(b"data: ") or line == b"data: [DONE]":
                    continue
                chunk = json.loads(line[6:])
                if chunk.get("choices"):
                    content += chunk["choices"][0].get("delta", {}).get("content") or ""
    except requests.RequestException as exc:
        raise NvidiaError(f"Nemotron Parse request failed: {exc}") from exc
    latency_ms = round((time.perf_counter() - started) * 1000)

    blocks: List[Dict[str, Any]] = []
    for xmin, ymin, raw_text, xmax, ymax, label in BLOCK_RE.findall(content):
        text = _clean_markdown(raw_text)
        if text:
            blocks.append({
                "text": text,
                "confidence": 1.0,
                "class": label.strip(),
                "boundingBox": [(round(float(xmin), 4), round(float(ymin), 4)), (round(float(xmax), 4), round(float(ymax), 4))],
            })
    if not blocks and content.strip():
        # Unexpected shape (e.g. the model answered in plain text instead of tagged blocks): keep
        # what it actually read rather than silently discarding it.
        blocks = [{"text": _clean_markdown(content), "confidence": 1.0, "class": "Text", "boundingBox": []}]

    # Reading order: top-to-bottom, then left-to-right.
    blocks.sort(key=lambda b: (b["boundingBox"][0][1] if b["boundingBox"] else 0, b["boundingBox"][0][0] if b["boundingBox"] else 0))
    confidences = [b["confidence"] for b in blocks]
    return {
        "model": settings.nvidia_ocr_model,
        "endpoint": settings.nemotron_ocr_endpoint,
        "latencyMs": latency_ms,
        "blocks": blocks,
        "text": "\n".join(b["text"] for b in blocks),
        "meanConfidence": round(sum(confidences) / len(confidences), 4) if confidences else 0.0,
    }
