"""Factory for instantiating the configured reasoning provider."""

from src.core.config import settings
from src.reasoning_engine.base import BaseReasoningProvider
from src.reasoning_engine.deterministic_provider import DeterministicReasoningProvider
from src.reasoning_engine.openai_compatible_provider import OpenAICompatibleReasoningProvider


def get_reasoning_engine(provider_name: str = None) -> BaseReasoningProvider:
    """
    Instantiate and return the appropriate reasoning provider based on configuration.

    Supports:
    - 'nvidia'  : NVIDIA NIM hosted reasoning endpoint (Nemotron, Llama 3.1 Nemotron 70B, etc.)
    - 'openai'  : OpenAI or compatible endpoint (GPT-4o, etc.)
    - 'fallback': Pure deterministic rule engine (no network calls, zero external dependencies)
    """
    name = (provider_name or settings.reasoning_provider).lower().strip()

    if name in ("nvidia", "openai", "custom"):
        endpoint = settings.reasoning_endpoint
        model = settings.reasoning_model
        fallback_models = getattr(settings, "fallback_reasoning_models", [])
        api_key = settings.reasoning_api_key or settings.nvidia_api_key
        return OpenAICompatibleReasoningProvider(
            endpoint=endpoint,
            model=model,
            api_key=api_key,
            fallback_models=fallback_models,
            fallback_provider=DeterministicReasoningProvider(),
        )

    # Default to deterministic fallback
    return DeterministicReasoningProvider()
