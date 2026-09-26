import os
from pathlib import Path
from typing import List
from dotenv import load_dotenv
from pydantic import BaseModel

# Load environment variables from .env file in ai_engine directory or parent
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
load_dotenv(dotenv_path=env_path)

class Settings(BaseModel):
    app_name: str = "CSAP AI Verification Engine"
    port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
    environment: str = os.getenv("ENVIRONMENT", "development")

    # Reasoning Model Configuration (Model-Agnostic)
    # Options for provider: 'nvidia' | 'openai' | 'gemini' | 'fallback'
    reasoning_provider: str = os.getenv("REASONING_PROVIDER", "nvidia")
    reasoning_model: str = os.getenv("REASONING_MODEL", "nvidia/nemotron-3-super-120b-a12b")
    fallback_reasoning_models: List[str] = [
        m.strip() for m in os.getenv(
            "FALLBACK_REASONING_MODELS",
            "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
        ).split(",") if m.strip()
    ]
    reasoning_endpoint: str = os.getenv(
        "REASONING_ENDPOINT",
        "https://integrate.api.nvidia.com/v1/chat/completions"
    )
    # API key resolution: checks REASONING_API_KEY, then NVIDIA_API_KEY, then OPENAI_API_KEY
    reasoning_api_key: str = os.getenv(
        "REASONING_API_KEY",
        os.getenv("NVIDIA_API_KEY", os.getenv("OPENAI_API_KEY", ""))
    )

    # Legacy / specific keys
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")

    # Registry simulation flag
    enable_mock_registries: bool = os.getenv("ENABLE_MOCK_REGISTRIES", "true").lower() == "true"

settings = Settings()

