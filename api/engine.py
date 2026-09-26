"""Vercel serverless entry for the CSAP verification engine (FastAPI, NVIDIA models).
Public path: /api/engine/*  →  engine routes /api/v1/*."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "ai_engine"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _asgi import StripPrefix  # noqa: E402
from src.main import app as engine_app  # noqa: E402

app = StripPrefix(engine_app, "/api/engine")
