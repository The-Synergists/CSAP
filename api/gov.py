"""Vercel serverless entry for the CSAP Government Gateway (simulated registries).
Public paths: /api/gov/*  (and the older /api/pan-registry/*)  →  gateway routes /v1/*."""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "gov_gateway"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from _asgi import StripPrefix  # noqa: E402
from app import app as gateway_app  # noqa: E402

app = StripPrefix(StripPrefix(gateway_app, "/api/pan-registry"), "/api/gov")
