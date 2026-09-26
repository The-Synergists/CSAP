"""NVIDIA model 2 — information extraction from OCR text.

Sends the OCR output to an NVIDIA-hosted LLM (OpenAI-compatible chat completions on
integrate.api.nvidia.com) and asks for strict JSON. Streaming is used because the hosted
Nemotron 3 Ultra endpoint only returns promptly in streaming mode; "thinking" is disabled
and temperature is 0 for deterministic output.

Every extracted value is then checked against the OCR text ("grounding"): a value the
model returns that does not appear in the document is flagged, so a hallucinated PAN can
never silently flow into verification.
"""

import json
import re
import time
from typing import Any, Dict

import requests

from src.core.config import settings
from src.nvidia.errors import NvidiaError, NvidiaNotConfigured

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

SCHEMAS = {
    "PAN": {
        "pan": "10-character Permanent Account Number exactly as printed (5 letters, 4 digits, 1 letter)",
        "name": "name of the PAN holder exactly as printed",
        "date_of_incorporation": "date of incorporation / birth as printed, or null",
        "category": "status of taxpayer (e.g. Company, Firm, Individual), or null",
    }
}

SYSTEM_PROMPT = (
    "You extract fields from OCR text of procurement documents. "
    "Use only information present in the text. If a field is absent, use null. "
    "Correct obvious OCR character confusions only when the document format makes the intended value certain. "
    "Respond with a single JSON object and nothing else."
)


def _normalise(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def _grounded(value: Any, ocr_text: str) -> bool:
    if value in (None, ""):
        return True
    return _normalise(str(value)) in _normalise(ocr_text)


def _parse_json(content: str) -> Dict[str, Any]:
    content = content.strip()
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise NvidiaError(f"Extraction model did not return JSON: {content[:200]}")
    return json.loads(match.group(0))


def run_extraction(document_type: str, ocr_text: str) -> Dict[str, Any]:
    schema = SCHEMAS.get(document_type)
    if schema is None:
        raise NvidiaError(f"Unsupported document type {document_type}.", status=400)
    if not settings.nvidia_extraction_api_key:
        raise NvidiaNotConfigured("NVIDIA_EXTRACTION_API_KEY is not set for the extraction model.")
    if not ocr_text.strip():
        raise NvidiaError("OCR produced no text to extract from.", status=422)

    user_prompt = (
        f"Document type: {document_type}\n"
        f"Return JSON with exactly these keys: {json.dumps(schema)}\n\n"
        f"OCR text:\n\"\"\"\n{ocr_text}\n\"\"\""
    )
    body = {
        "model": settings.nvidia_extraction_model,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user_prompt}],
        "temperature": 0,
        "max_tokens": 400,
        "stream": True,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    started = time.perf_counter()
    content = ""
    try:
        with requests.post(
            f"{settings.nvidia_extraction_base_url}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {settings.nvidia_extraction_api_key}", "Accept": "text/event-stream"},
            stream=True,
            timeout=(10, 120),
        ) as res:
            if not res.ok:
                raise NvidiaError(f"Extraction model returned HTTP {res.status_code}: {res.text[:300]}")
            for line in res.iter_lines():
                if not line or not line.startswith(b"data: ") or line == b"data: [DONE]":
                    continue
                chunk = json.loads(line[6:])
                if chunk.get("choices"):
                    content += chunk["choices"][0].get("delta", {}).get("content") or ""
    except requests.RequestException as exc:
        raise NvidiaError(f"Extraction model request failed: {exc}") from exc
    latency_ms = round((time.perf_counter() - started) * 1000)

    raw = _parse_json(content)
    fields = {key: raw.get(key) for key in schema}
    if isinstance(fields.get("pan"), str):
        fields["pan"] = fields["pan"].strip().upper().replace(" ", "")
    grounding = {key: _grounded(value, ocr_text) for key, value in fields.items()}
    warnings = [f"'{k}' value not found verbatim in the OCR text" for k, ok in grounding.items() if not ok]
    if fields.get("pan") and not PAN_RE.match(fields["pan"]):
        warnings.append("Extracted PAN does not have the 5-letter/4-digit/1-letter format")

    return {
        "model": settings.nvidia_extraction_model,
        "endpoint": f"{settings.nvidia_extraction_base_url}/chat/completions",
        "latencyMs": latency_ms,
        "documentType": document_type,
        "fields": fields,
        "grounding": grounding,
        "warnings": warnings,
        "rawOutput": content.strip(),
    }
