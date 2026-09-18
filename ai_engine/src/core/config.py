import os
from pydantic import BaseModel

class Settings(BaseModel):
    app_name: str = "CSAP AI Verification Engine"
    port: int = int(os.getenv("AI_ENGINE_PORT", "8000"))
    environment: str = os.getenv("ENVIRONMENT", "development")
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    enable_mock_registries: bool = os.getenv("ENABLE_MOCK_REGISTRIES", "true").lower() == "true"

settings = Settings()
