"""Statutory identifier checks.

No live GSTN / MCA21 / Udyam / EPFO integration exists in this prototype. What *is* checked
here is real and deterministic: identifier formats, and that the PAN embedded in the GSTIN
matches the bidder's declared PAN. Every result is marked `simulated` for the registry-status
part so the UI never presents it as an official government confirmation.
"""

import re
from datetime import datetime, timezone
from typing import Any, Dict, Optional

GSTIN_RE = re.compile(r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
PAN_RE = re.compile(r"^[A-Z]{5}\d{4}[A-Z]$")
UDYAM_RE = re.compile(r"^UDYAM-[A-Z]{2}-\d{2}-\d{7}$")

NOTE = "Format check only. Live registry lookup is not connected in this prototype."


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class StatutoryRegistryChecker:
    def verify_gstin(self, gstin: str, pan: str) -> Dict[str, Any]:
        format_ok = bool(GSTIN_RE.match(gstin or ""))
        pan_matches = format_ok and gstin[2:12] == pan
        status = "VERIFIED" if format_ok and pan_matches else "MISMATCH"
        detail = "GSTIN format valid and embeds the declared PAN." if status == "VERIFIED" else (
            "GSTIN format invalid." if not format_ok else "PAN embedded in GSTIN does not match the declared PAN."
        )
        return {"portal": "GSTN", "checkType": "GSTIN_STATUS", "identifier": gstin, "status": status,
                "detail": detail, "simulated": True, "note": NOTE, "checkedAt": _now()}

    def verify_pan(self, pan: str) -> Dict[str, Any]:
        ok = bool(PAN_RE.match(pan or ""))
        return {"portal": "INCOME_TAX", "checkType": "PAN_VALIDATION", "identifier": pan,
                "status": "VERIFIED" if ok else "MISMATCH",
                "detail": "PAN format valid." if ok else "PAN format invalid.",
                "simulated": True, "note": NOTE, "checkedAt": _now()}

    def verify_udyam(self, udyam: Optional[str]) -> Dict[str, Any]:
        if not udyam:
            return {"portal": "UDYAM", "checkType": "UDYAM_STATUS", "identifier": None, "status": "PENDING",
                    "detail": "No Udyam number declared.", "simulated": True, "note": NOTE, "checkedAt": _now()}
        ok = bool(UDYAM_RE.match(udyam))
        return {"portal": "UDYAM", "checkType": "UDYAM_STATUS", "identifier": udyam,
                "status": "VERIFIED" if ok else "MISMATCH",
                "detail": "Udyam number format valid." if ok else "Udyam number format invalid.",
                "simulated": True, "note": NOTE, "checkedAt": _now()}

    def verify_all(self, gstin: str, pan: str, udyam: Optional[str]) -> list:
        return [self.verify_gstin(gstin, pan), self.verify_pan(pan), self.verify_udyam(udyam)]
