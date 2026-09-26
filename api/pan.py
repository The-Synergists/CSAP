"""Vercel serverless entry for the dummy PAN Verification API (own dataset file).
Public path: /api/pan-registry/*  →  PAN API routes /v1/*."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "pan_api"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _asgi import StripPrefix  # noqa: E402
from app import app as pan_app  # noqa: E402

app = StripPrefix(pan_app, "/api/pan-registry")
