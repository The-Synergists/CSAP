import pytest

from src.core.config import settings


@pytest.fixture(autouse=True)
def _no_engine_key(monkeypatch):
    """Unit tests call the engine directly; the backend-only key is tested separately."""
    monkeypatch.setattr(settings, "engine_api_key", "")
