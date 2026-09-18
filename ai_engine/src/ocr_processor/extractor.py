import hashlib
from typing import Dict, Any, List

class DocumentOCRExtractor:
    """Simulates/implements OCR document text and structured entity extraction."""

    def extract_document(self, file_name: str, file_bytes: bytes = None) -> Dict[str, Any]:
        doc_hash = hashlib.sha256(file_name.encode()).hexdigest()[:12]
        
        # Entity extraction mapping based on common procurement statutory certificates
        lower_name = file_name.lower()
        doc_type = "GENERAL_DOCUMENT"
        extracted_fields = {}

        if "gst" in lower_name:
            doc_type = "GST_REGISTRATION_CERTIFICATE"
            extracted_fields = {
                "gstin": "33AABCC1234F1Z5",
                "taxpayer_name": "Apex Infra Solutions Pvt Ltd",
                "status": "Active",
                "registration_date": "2018-04-12"
            }
        elif "pan" in lower_name:
            doc_type = "PAN_CARD"
            extracted_fields = {
                "pan": "AABCC1234F",
                "entity_type": "Company",
                "name": "Apex Infra Solutions Pvt Ltd"
            }
        elif "udyam" in lower_name or "msme" in lower_name:
            doc_type = "UDYAM_REGISTRATION_CERTIFICATE"
            extracted_fields = {
                "udyam_number": "UDYAM-TN-01-0012345",
                "enterprise_type": "Medium Enterprise",
                "major_activity": "Manufacturing"
            }
        elif "emd" in lower_name or "bg" in lower_name or "bank" in lower_name:
            doc_type = "BANK_GUARANTEE_EMD"
            extracted_fields = {
                "bank_name": "State Bank of India",
                "bg_number": "BG/2026/CPCL/98712",
                "amount": 2500000,
                "expiry_date": "2026-12-31"
            }

        return {
            "file_name": file_name,
            "document_hash": doc_hash,
            "document_type": doc_type,
            "ocr_status": "COMPLETED",
            "confidence": 0.98,
            "extracted_fields": extracted_fields
        }

    def batch_extract(self, documents: List[Dict[str, str]]) -> List[Dict[str, Any]]:
        return [self.extract_document(doc.get("name", "document.pdf")) for doc in documents]
