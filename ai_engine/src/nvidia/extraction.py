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

from src.nvidia import backoff

from src.core.config import settings
from src.nvidia.errors import NvidiaError, NvidiaNotConfigured

PAN_RE = re.compile(r"^[A-Z]{5}[0-9]{4}[A-Z]$")

# One schema per document type. Every schema names the entity the document is issued to, so
# CSAP can check that all documents in a bid belong to the same bidder (cross-document check).
NAME = "name of the bidder / enterprise / holder exactly as printed on the document, or null"
SCHEMAS = {
    # e-PAN letter of a company and the individual PAN card use the same schema.
    "PAN": {
        "pan": "10-character Permanent Account Number exactly as printed (5 letters, 4 digits, 1 letter)",
        "name": "name of the PAN holder exactly as printed",
        "father_name": "father's name as printed (individual PAN cards only), or null",
        "date_of_birth": "date of birth as printed (individual PAN cards only), or null",
        "date_of_incorporation": "date of incorporation / formation as printed (companies and firms), or null",
        "category": "status of taxpayer (e.g. Company, Firm, Individual), or null",
    },
    "GST_CERTIFICATE": {
        "gstin": "15-character GSTIN exactly as printed",
        "legal_name": "legal name of business exactly as printed",
        "trade_name": "trade name as printed, or null",
        "registration_type": "type of registration or status as printed (e.g. Regular, Active), or null",
        "address": "principal place of business as printed, or null",
    },
    "UDYAM_CERTIFICATE": {
        "udyam_number": "Udyam registration number exactly as printed (UDYAM-XX-00-0000000)",
        "enterprise_name": NAME,
        "category": "enterprise type as printed (Micro, Small or Medium), or null",
        "activity": "major activity as printed (Manufacturing, Services, Trading), or null",
    },
    "FINANCIAL_STATEMENTS": {
        "entity_name": NAME,
        "turnover_fy_2022_23": "turnover for FY 2022-23 exactly as printed, or null",
        "turnover_fy_2023_24": "turnover for FY 2023-24 exactly as printed, or null",
        "turnover_fy_2024_25": "turnover for FY 2024-25 exactly as printed, or null",
        "udin": "UDIN of the auditor's certificate as printed, or null",
    },
    "MAKE_IN_INDIA": {
        "entity_name": NAME,
        "local_content_percent": "declared local content percentage exactly as printed",
        "classification": "supplier class as printed (Class-I local, Class-II local, Non-local), or null",
        "manufacturing_location": "manufacturing location as printed, or null",
    },
    "OEM_AUTHORIZATION": {
        "manufacturer": "name of the manufacturer (OEM) as printed",
        "authorized_partner": "name of the authorized dealer / partner as printed",
        "valid_until": "validity end date as printed, or null",
        "warranty": "warranty undertaking as printed (e.g. Back-to-back), or 'Not stated' if the text says so, or null",
    },
    "EMD": {
        "entity_name": "name of the remitter / applicant / enterprise as printed, or null",
        "instrument": "EMD instrument type only if printed (e.g. Bank Guarantee, MSE exemption), otherwise null",
        "reference": "transaction ID, bank guarantee number or Udyam number as printed, or null",
        "amount": "amount exactly as printed, or null",
        "bank": "issuing / remitting bank as printed, or null",
        "valid_until": "validity end date as printed (bank guarantees), or null",
    },
    "EPFO_ESIC": {
        "entity_name": NAME,
        "epfo_code": "EPFO establishment code exactly as printed, or null",
        "esic_code": "ESIC employer code exactly as printed, or null",
        "latest_return_month": "latest month for which the return / ECR was paid, as printed, or null",
    },
    "PAST_PERFORMANCE": {
        "entity_name": NAME,
        "order_1": "first purchase order: buyer, order number and value exactly as printed, or null",
        "order_2": "second purchase order: buyer, order number and value exactly as printed, or null",
    },
    "TEST_REPORT": {
        "entity_name": NAME,
        "laboratory": "testing laboratory as printed",
        "standard": "standard(s) tested against as printed, or null",
        "result": "test result as printed (e.g. PASS), or null",
    },
    "AFFIDAVIT": {
        "entity_name": NAME,
        "date": "date of the affidavit as printed, or null",
        "declaration": "the declaration made, as printed",
    },
    "LAND_BORDER": {
        "entity_name": NAME,
        "declaration": "the declaration made, as printed",
        "signatory": "who signed, as printed, or null",
    },
}

SYSTEM_PROMPT = (
    "You extract fields from OCR text of procurement documents. "
    "Use only information present in the text. If a field is absent, use null. "
    "Correct obvious OCR character confusions only when the document format makes the intended value certain. "
    "Copy every value exactly as printed (same spelling, digits and punctuation); never compute, convert or reformat. "
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


def stream_chat(system: str, user: str, max_tokens: int) -> tuple:
    """One streamed chat completion from the NVIDIA-hosted model; returns (text, latency_ms).

    The hosted model occasionally closes a stream without sending any text; such a reply is
    requested again (up to three attempts in total) instead of being passed on as an answer.
    """
    started = time.perf_counter()
    content = ""
    for _ in range(3):
        content, _latency = _stream_chat_once(system, user, max_tokens)
        if content.strip():
            break
    return content, round((time.perf_counter() - started) * 1000)


def _stream_chat_once(system: str, user: str, max_tokens: int) -> tuple:
    if not settings.nvidia_extraction_api_key:
        raise NvidiaNotConfigured("NVIDIA_EXTRACTION_API_KEY is not set for the extraction model.")
    body = {
        "model": settings.nvidia_extraction_model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "temperature": 0,
        "max_tokens": max_tokens,
        "stream": True,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    started = time.perf_counter()
    content = ""
    try:
        with backoff.post(
            f"{settings.nvidia_extraction_base_url}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {settings.nvidia_extraction_api_key}", "Accept": "text/event-stream"},
            stream=True,
            timeout=(10, 120),
        ) as res:
            if not res.ok:
                raise NvidiaError(f"NVIDIA model returned HTTP {res.status_code}: {res.text[:300]}")
            for line in res.iter_lines():
                if not line or not line.startswith(b"data: ") or line == b"data: [DONE]":
                    continue
                chunk = json.loads(line[6:])
                if chunk.get("choices"):
                    content += chunk["choices"][0].get("delta", {}).get("content") or ""
    except requests.RequestException as exc:
        raise NvidiaError(f"NVIDIA model request failed: {exc}") from exc
    return content, round((time.perf_counter() - started) * 1000)


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
    content, latency_ms = stream_chat(SYSTEM_PROMPT, user_prompt, max_tokens=700)

    raw = _parse_json(content)
    fields = {key: raw.get(key) for key in schema}
    for key in ("pan", "gstin", "udyam_number", "epfo_code", "esic_code"):
        if isinstance(fields.get(key), str):
            fields[key] = fields[key].strip().upper().replace(" ", "")
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
