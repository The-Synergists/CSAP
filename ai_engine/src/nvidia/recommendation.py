"""NVIDIA-drafted explanation of the recommendation, grounded in the evidence.

The suggested decision is computed by CSAP's rules; the model only explains it in plain words.
Every sentence must cite evidence items (finding IDs such as EVD-003, or met requirements such
as REQ-02). CSAP then removes any sentence that
  - cites nothing,
  - cites an ID that is not in the evidence, or
  - states a number that does not appear in the evidence it cites,
and reports what it removed, so the officer never reads an unsupported claim.
"""

import json
import re
from typing import Any, Dict, List

from src.core.config import settings
from src.nvidia.errors import NvidiaError
from src.nvidia.extraction import stream_chat

SYSTEM_PROMPT = (
    "You write the explanation part of an advisory recommendation for a government procurement officer. "
    "Rules: use only the evidence items you are given. Every sentence must cite the IDs of the evidence items it "
    "relies on. Never add facts, amounts, percentages or dates that are not in the cited items. Do not make the "
    "decision: the suggested decision is given to you and the officer decides. Plain, neutral English, 3 to 5 sentences. "
    'Respond with JSON only: {"sentences": [{"text": "...", "citations": ["EVD-003"]}]}'
)

ID_RE = re.compile(r"\b(?:EVD|REQ)-\d{2,4}\b")
NUM_RE = re.compile(r"\d[\d,]*(?:\.\d+)?")


def _numbers(text: str) -> List[str]:
    out = []
    for n in NUM_RE.findall(text):
        n = n.replace(",", "").rstrip(".")
        if "." in n:
            n = n.rstrip("0").rstrip(".")
        out.append(n)
    return out


def _parse(content: str) -> List[Dict[str, Any]]:
    content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip())
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        raise NvidiaError(f"Recommendation model did not return JSON: {content[:200]}")
    rows = json.loads(match.group(0)).get("sentences", [])
    return [r for r in rows if isinstance(r, dict) and isinstance(r.get("text"), str)]


def validate(sentences: List[Dict[str, Any]], evidence: Dict[str, str]) -> Dict[str, list]:
    kept, dropped = [], []
    for s in sentences[:8]:
        text = s["text"].strip()
        cited = {c.strip().upper() for c in (s.get("citations") or []) if isinstance(c, str)}
        cited |= set(ID_RE.findall(text))  # IDs written inline in the text also count
        text = re.sub(r"\s*\[(?:\s*(?:EVD|REQ)-\d{2,4}\s*,?)+\]", "", text).strip()
        unknown = sorted(c for c in cited if c not in evidence)
        if not cited:
            dropped.append({"text": text, "reason": "cites no evidence"})
            continue
        if unknown:
            dropped.append({"text": text, "reason": f"cites {', '.join(unknown)}, which is not in the evidence"})
            continue
        source = " ".join(evidence[c] for c in cited)
        known = set(_numbers(source))
        missing = [n for n in _numbers(text) if n not in known]
        if missing:
            dropped.append({"text": text, "reason": f"states {', '.join(missing)}, which the cited evidence does not contain"})
            continue
        kept.append({"text": text, "citations": sorted(cited)})
    return {"sentences": kept[:5], "dropped": dropped}


def draft_recommendation(payload: Dict[str, Any]) -> Dict[str, Any]:
    evidence = {e["id"].upper(): e["text"] for e in payload.get("evidence", []) if e.get("id") and e.get("text")}
    if not evidence:
        raise NvidiaError("No evidence was provided to explain.", status=400)
    user = (
        f"Bid {payload.get('bidId')} by {payload.get('bidder')} for tender {payload.get('tender')}.\n"
        f"Suggested decision (computed by CSAP rules): {payload.get('suggestedDecision')}.\n"
        f"Compliance score: {payload.get('score')}/100.\n\n"
        "Evidence items (ID: text):\n" + "\n".join(f"{k}: {v}" for k, v in evidence.items())
    )
    content, latency_ms = stream_chat(SYSTEM_PROMPT, user, max_tokens=900)
    result = validate(_parse(content), evidence)
    return {
        "model": settings.nvidia_extraction_model,
        "latencyMs": latency_ms,
        **result,
        "rawOutput": content.strip(),
    }
