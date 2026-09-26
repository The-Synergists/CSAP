"""Universal OpenAI-compatible Reasoning Provider for NVIDIA NIM, OpenAI, Groq, or local LLMs."""

import json
import logging
import re
from typing import Any, Dict, List, Optional

import requests

from src.prompts.templates import (
    PROCUREMENT_REASONING_SYSTEM_PROMPT,
    format_tender_analysis_prompt,
    PROCUREMENT_ASSISTANT_SYSTEM_PROMPT,
    format_assistant_chat_prompt,
)
from src.reasoning_engine.base import BaseReasoningProvider
from src.reasoning_engine.deterministic_provider import DeterministicReasoningProvider

logger = logging.getLogger("CSAP.ReasoningEngine")


class OpenAICompatibleReasoningProvider(BaseReasoningProvider):
    """
    Adapter connecting to any OpenAI-compatible chat completions endpoint,
    such as NVIDIA NIM (Nemotron-3-nano-omni-30b-a3b-reasoning, Nemotron-3-super-120b, Llama-3.2-11b),
    OpenAI (GPT-4o), Groq, Together, or local vLLM instances.
    """

    def __init__(
        self,
        endpoint: str,
        model: str,
        api_key: str,
        fallback_models: Optional[List[str]] = None,
        fallback_provider: Optional[BaseReasoningProvider] = None,
    ) -> None:
        self.endpoint = endpoint
        self.model = model
        self.api_key = api_key
        self.fallback_models = fallback_models or []
        self.fallback = fallback_provider or DeterministicReasoningProvider()

    def _get_candidate_models(self) -> List[str]:
        """Return ordered list of models to try before falling back to deterministic."""
        candidates = [self.model]
        for m in self.fallback_models:
            if m and m not in candidates:
                candidates.append(m)
        # Built-in backup defaults known to be responsive
        builtin_backups = [
            "nvidia/nemotron-3-super-120b-a12b",
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
            "nvidia/llama-3.1-nemotron-70b-instruct",
        ]
        for b in builtin_backups:
            if b not in candidates:
                candidates.append(b)
        return candidates

    def _has_valid_api_key(self) -> bool:
        """Return True if api_key is non-empty and not a template placeholder."""
        if not self.api_key:
            return False
        cleaned = self.api_key.strip().lower()
        if cleaned in ("nvapi-your-key-here", "your-gemini-api-key", "your-api-key", ""):
            return False
        if "your-key" in cleaned or "your-api-key" in cleaned:
            return False
        return True

    def analyze_bid(
        self,
        tender_id: str,
        bid_id: str,
        tender_requirements: List[Dict[str, Any]],
        bidder_data: Dict[str, Any],
        ocr_results: Optional[List[Dict[str, Any]]] = None,
        registry_checks: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Send prompt to the reasoning endpoint and parse structured XAI report."""
        if not self._has_valid_api_key():
            logger.info("No valid API key configured for reasoning model; using deterministic audit engine.")
            return self.fallback.analyze_bid(
                tender_id=tender_id,
                bid_id=bid_id,
                tender_requirements=tender_requirements,
                bidder_data=bidder_data,
                ocr_results=ocr_results,
                registry_checks=registry_checks,
            )

        user_prompt = format_tender_analysis_prompt(
            tender_id=tender_id,
            bid_id=bid_id,
            tender_requirements=tender_requirements,
            bidder_data=bidder_data,
            ocr_results=ocr_results,
            registry_checks=registry_checks,
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        candidates = self._get_candidate_models()
        last_error = None

        for candidate_model in candidates:
            payload = {
                "model": candidate_model,
                "messages": [
                    {"role": "system", "content": PROCUREMENT_REASONING_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 1500,
            }

            try:
                logger.info(f"Attempting reasoning analysis with model: {candidate_model}")
                response = requests.post(self.endpoint, json=payload, headers=headers, timeout=25)
                response.raise_for_status()
                data = response.json()

                msg = data["choices"][0]["message"]
                content = msg.get("content", "")
                reasoning = msg.get("reasoning_content")

                parsed_report = self._parse_json_response(content)
                self._validate_schema(parsed_report)
                parsed_report["model"] = candidate_model
                if reasoning:
                    parsed_report["reasoning"] = reasoning

                logger.info(f"Successfully generated reasoning report using {candidate_model}")
                return parsed_report

            except Exception as exc:
                logger.warning(
                    f"Model {candidate_model} failed for analyze_bid ({exc}); trying next candidate..."
                )
                last_error = str(exc)

        logger.warning(f"All candidate models failed. Falling back to deterministic audit engine. Last error: {last_error}")
        fallback_result = self.fallback.analyze_bid(
            tender_id=tender_id,
            bid_id=bid_id,
            tender_requirements=tender_requirements,
            bidder_data=bidder_data,
            ocr_results=ocr_results,
            registry_checks=registry_checks,
        )
        fallback_result["_api_fallback_note"] = f"Generated by deterministic engine due to API error: {last_error}"
        return fallback_result

    @staticmethod
    def _parse_json_response(raw_text: str) -> Dict[str, Any]:
        """Extract and parse JSON object from LLM response text, stripping markdown fences."""
        text = raw_text.strip()
        # Remove reasoning tags if any
        text = re.sub(r"<think>[\s\S]*?</think>", "", text).strip()

        # Strip markdown ```json ... ``` code fences
        match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
        if match:
            text = match.group(1).strip()

        # If wrapped in braces
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            text = text[start : end + 1]

        return json.loads(text)

    @staticmethod
    def _validate_schema(data: Dict[str, Any]) -> None:
        """Guarantee all essential schema fields exist with correct fallback types."""
        if "executive_summary" not in data:
            data["executive_summary"] = "Procurement scrutiny completed."
        if "detailed_analysis" not in data:
            data["detailed_analysis"] = "Detailed clause scrutiny recorded in audit ledger."
        if "suggested_action" not in data:
            data["suggested_action"] = "MANUAL_REVIEW"
        if "confidence" not in data:
            data["confidence"] = 0.90
        if "risk_assessment" not in data or not isinstance(data["risk_assessment"], dict):
            data["risk_assessment"] = {
                "overall_risk_level": "MEDIUM",
                "risk_score": 50,
                "vector_scores": {"statutory": 50, "financial": 50, "emd": 50, "document": 50, "policy": 50},
            }
        if "pros" not in data or not isinstance(data["pros"], list):
            data["pros"] = []
        if "cons" not in data or not isinstance(data["cons"], list):
            data["cons"] = []
        if "evidence_items" not in data or not isinstance(data["evidence_items"], list):
            data["evidence_items"] = []

    def answer_question(
        self,
        question: str,
        tender_context: Optional[Dict[str, Any]] = None,
        bidder_context: Optional[Dict[str, Any]] = None,
        bidders_summary: Optional[List[Dict[str, Any]]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> Dict[str, Any]:
        """Send inquiry to the reasoning LLM endpoint and return structured advisory response."""
        if not self._has_valid_api_key():
            logger.info("No valid API key configured for reasoning model; using deterministic audit assistant.")
            return self.fallback.answer_question(
                question=question,
                tender_context=tender_context,
                bidder_context=bidder_context,
                bidders_summary=bidders_summary,
                chat_history=chat_history,
            )

        user_prompt = format_assistant_chat_prompt(
            question=question,
            tender_context=tender_context,
            bidder_context=bidder_context,
            bidders_summary=bidders_summary,
            chat_history=chat_history,
        )

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        candidates = self._get_candidate_models()
        last_error = None

        for candidate_model in candidates:
            payload = {
                "model": candidate_model,
                "messages": [
                    {"role": "system", "content": PROCUREMENT_ASSISTANT_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 800,
            }

            try:
                logger.info(f"Sending assistant inquiry to model: {candidate_model}")
                response = requests.post(self.endpoint, json=payload, headers=headers, timeout=18)
                response.raise_for_status()
                data = response.json()

                msg = data["choices"][0]["message"]
                content = msg.get("content", "").strip()
                reasoning = msg.get("reasoning_content")

                # Robust extraction: either parse JSON or use raw text if LLM replied in plain prose
                answer = content
                evidence_ref = None
                try:
                    parsed = self._parse_json_response(content)
                    if isinstance(parsed, dict):
                        answer = parsed.get("answer", content)
                        evidence_ref = parsed.get("evidence_ref")
                except Exception:
                    # Model returned plain text answer instead of JSON; accept it directly!
                    pass

                logger.info(f"Successfully answered inquiry with model: {candidate_model}")
                return {
                    "answer": answer,
                    "evidence_ref": evidence_ref,
                    "reasoning": reasoning,
                    "model": candidate_model,
                }

            except Exception as exc:
                logger.warning(
                    f"Assistant model {candidate_model} failed ({exc}); trying next candidate..."
                )
                last_error = str(exc)

        logger.warning(f"All candidate assistant models failed ({last_error}); falling back to deterministic assistant.")
        fallback_res = self.fallback.answer_question(
            question=question,
            tender_context=tender_context,
            bidder_context=bidder_context,
            bidders_summary=bidders_summary,
            chat_history=chat_history,
        )
        fallback_res["_api_fallback_note"] = f"Generated by fallback engine due to API error: {last_error}"
        return fallback_res
