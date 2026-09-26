"""Generates one specimen image per bid document (bid_package/<BID>/<DOC>.png) for the NVIDIA
document-intelligence pipeline. Content comes from bid_package/manifest.json (exported from the
shared demo seed), so every image says exactly what the database says.

Every image is watermarked SPECIMEN and states it was not issued by any authority. One
deliberate inconsistency is built in for the demo: BID-003's Udyam certificate names a different
enterprise ("National Safety Solutions"), which the cross-document check must catch.

    npx tsx database/sample_documents/export_manifest.ts
    ai_engine/.venv/Scripts/python database/sample_documents/generate_bid_package.py
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).parent
OUT = HERE / "bid_package"
FONT = "C:/Windows/Fonts/arial.ttf"
BOLD = "C:/Windows/Fonts/arialbd.ttf"

# Title and the label under which the bidder's name is printed, per tender requirement.
LAYOUT = {
    "REQ-01": ("AUDITED FINANCIAL STATEMENTS - TURNOVER SUMMARY", "Name of the Entity"),
    "REQ-02": ("GOODS AND SERVICES TAX - REGISTRATION CERTIFICATE (FORM GST REG-06)", None),
    "REQ-03": ("UDYAM REGISTRATION CERTIFICATE - MINISTRY OF MSME", "Name of Enterprise"),
    "REQ-04": ("MAKE IN INDIA - LOCAL CONTENT SELF-DECLARATION", "Bidder"),
    "REQ-05": ("OEM AUTHORIZATION LETTER (MANUFACTURER'S AUTHORIZATION FORM)", None),
    "REQ-06": ("EARNEST MONEY DEPOSIT - PAYMENT / GUARANTEE RECORD", "Remitter / Applicant"),
    "REQ-07": ("PAN DETAILS - BIDDER SUBMISSION", None),
    "REQ-08": ("EPFO & ESIC - CONTRIBUTION CHALLANS", "Establishment"),
    "REQ-09": ("PAST PERFORMANCE - PURCHASE ORDERS EXECUTED", "Supplier"),
    "REQ-10": ("NABL TEST REPORT", "Applicant"),
    "REQ-11": ("AFFIDAVIT - NON-BLACKLISTING AND INTEGRITY PACT", "Deponent"),
    "REQ-12": ("DECLARATION UNDER RULE 144(xi) GFR - LAND BORDER", "Bidder"),
}
# Snippet keys that already carry the bidder's name (no extra name line needed).
NAME_KEYS = {"Legal Name", "Enterprise", "Authorized Partner"}
# The deliberate cross-document inconsistency (document id -> name printed instead).
NAME_OVERRIDE = {"DOC-305": "National Safety Solutions"}


def fields(doc):
    rows = []
    for part in doc["text"].split("|"):
        part = part.strip()
        if not part:
            continue
        label, _, value = part.partition(":")
        # Arial has no rupee sign; print "Rs." so OCR reads amounts correctly.
        rows.append((label.strip(), value.strip().replace("₹", "Rs. ")) if value else ("Detail", part.replace("₹", "Rs. ")))
    title, name_label = LAYOUT[doc["requirement"]]
    printed_name = NAME_OVERRIDE.get(doc["id"], doc["bidder"]["name"])
    if name_label and not any(label in NAME_KEYS for label, _ in rows):
        rows.insert(0, (name_label, printed_name))
    elif doc["id"] in NAME_OVERRIDE:
        rows = [(label, printed_name if label in NAME_KEYS else value) for label, value in rows]
    return title, rows


def render(doc):
    title, rows = fields(doc)
    f_title, f_label, f_value, f_small = ImageFont.truetype(BOLD, 26), ImageFont.truetype(FONT, 21), ImageFont.truetype(BOLD, 25), ImageFont.truetype(FONT, 17)
    w = 1100
    h = 190 + 78 * len(rows) + 90
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    d.rectangle([18, 18, w - 18, h - 18], outline=0, width=3)
    d.text((46, 42), title, font=f_title, fill=0)
    d.text((46, 84), f"{doc['name']}  -  submitted with bid {doc['bidId']} for tender {doc.get('tender', 'GEM/2026/CPCL/001')}", font=f_small, fill=60)
    d.line([46, 116, w - 46, 116], fill=120, width=2)
    y = 138
    for label, value in rows:
        d.text((46, y), label, font=f_label, fill=70)
        d.text((46, y + 28), value, font=f_value, fill=0)
        y += 78
    # Corner stamp instead of a diagonal watermark: OCR must not read the stamp into a field value.
    d.rectangle([w - 370, h - 72, w - 40, h - 30], outline=110, width=2)
    d.text((w - 352, h - 66), "SPECIMEN - CSAP DEMO", font=ImageFont.truetype(BOLD, 24), fill=110)
    d.text((46, h - 52), "Specimen document for the CSAP prototype. Not issued by any authority.", font=f_small, fill=90)
    target = doc.get("target") or OUT / doc["bidId"] / f"{doc['id']}.png"
    target.parent.mkdir(parents=True, exist_ok=True)
    img.save(target, optimize=True)
    return target


if __name__ == "__main__":
    manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
    written = [render(doc) for doc in manifest if doc["requirement"] != "REQ-07"]  # PAN images exist already
    print(f"wrote {len(written)} images, {sum(p.stat().st_size for p in written) // 1024} KB")

    # GeM demo kit (Phase 5): a fictitious bidder's complete document set for the simulated GeM portal.
    kit_dir = HERE / "gem_demo_kit"
    kit = json.loads((kit_dir / "kit.json").read_text(encoding="utf-8"))
    for d in kit["documents"]:
        render({"id": d["requirement"], "bidId": "(new GeM bid)", "tender": kit["tender"], "requirement": d["requirement"], "name": d["name"],
                "text": d["text"], "bidder": {"name": kit["company"]["name"]}, "target": kit_dir / f"{d['requirement']}.png"})
    print(f"wrote {len(kit['documents'])} GeM demo kit images")
