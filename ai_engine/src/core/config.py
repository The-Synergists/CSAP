import os
from pydantic import BaseModel

class Settings(BaseModel):
    app_name: str = "CSAP AI Verification Engine"
    port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
    environment: str = os.getenv("ENVIRONMENT", "development")
    nvidia_api_key: str = os.getenv("NVIDIA_API_KEY", "")
    nemotron_ocr_endpoint: str = os.getenv(
        "NEMOTRON_OCR_ENDPOINT",
        "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2/infer"
    )
    nemotron_ocr_merge_level: str = os.getenv("NEMOTRON_OCR_MERGE_LEVEL", "paragraph")
    enable_mock_registries: bool = os.getenv("ENABLE_MOCK_REGISTRIES", "true").lower() == "true"

settings = Settings()
