import os
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parents[2] / ".env")


class Settings(BaseModel):
    app_name: str = "CSAP Verification Engine"
    port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
    environment: str = os.getenv("ENVIRONMENT", "development")
    # Only the backend gateway calls the engine; browsers never do.
    allowed_origins: list[str] = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5000").split(",") if o.strip()]

    # Shared secret required from the backend on every call except health (empty = not enforced).
    engine_api_key: str = os.getenv("ENGINE_API_KEY", "")

    # NVIDIA model 1 — Nemotron OCR V2 (hosted NIM)
    nvidia_ocr_api_key: str = os.getenv("NVIDIA_OCR_API_KEY", os.getenv("NVIDIA_API_KEY", ""))
    nemotron_ocr_endpoint: str = os.getenv("NEMOTRON_OCR_ENDPOINT", "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2")
    nemotron_ocr_merge_level: str = os.getenv("NEMOTRON_OCR_MERGE_LEVEL", "paragraph")

    # NVIDIA model 2 — language model for extraction, explanations and the assistant
    # (OpenAI-compatible chat completions). In use since 2026-09-27: nvidia/nemotron-3-super-120b-a12b
    # (replaced nemotron-3-ultra-550b-a55b: same results on CSAP's tasks, about ten times faster).
    nvidia_extraction_api_key: str = os.getenv("NVIDIA_EXTRACTION_API_KEY", os.getenv("NVIDIA_API_KEY", ""))
    nvidia_extraction_base_url: str = os.getenv("NVIDIA_EXTRACTION_BASE_URL", "https://integrate.api.nvidia.com/v1")
    nvidia_extraction_model: str = os.getenv("NVIDIA_EXTRACTION_MODEL", "nvidia/nemotron-3-super-120b-a12b")


settings = Settings()
