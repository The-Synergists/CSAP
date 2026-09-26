"""Generates the specimen PAN documents used in the CSAP demo (PNG, OCR-friendly).

Each file is a plain "PAN details" sheet as a bidder might submit it, clearly watermarked
SPECIMEN. They are not replicas of government-issued cards. Run:
    ai_engine/.venv/Scripts/python database/sample_documents/generate.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
FONT = "C:/Windows/Fonts/arial.ttf"
BOLD = "C:/Windows/Fonts/arialbd.ttf"

DOCS = [
    # file, PAN, name as printed, incorporation date, category, note
    ("BID-001_PAN_ABC_Industrial.png", "AABCA1234F", "ABC INDUSTRIAL SOLUTIONS PVT LTD", "14/05/2014", "Company"),
    ("BID-002_PAN_Bharat_Engineering.png", "AABCB9876E", "BHARAT ENGINEERING WORKS", "19/08/2011", "Firm"),
    ("BID-003_PAN_National_Safety.png", "AABCN5544K", "NATIONAL SAFETY SYSTEMS", "08/01/2018", "Firm"),
    ("BID-004_PAN_Prime_Tech.png", "AAACP4419M", "PRIME TECH SOLUTIONS", "22/03/2016", "Firm"),
    # Edge cases for demonstration (upload against any bid)
    ("SAMPLE_PAN_invalid_Sunrise.png", "AAECS7788K", "SUNRISE SAFETY TRADERS", "03/07/2019", "Firm"),
    ("SAMPLE_PAN_not_found_Zenith.png", "AAHCZ9090P", "ZENITH SAFETY CORPORATION PVT LTD", "12/02/2020", "Company"),
    ("SAMPLE_PAN_name_mismatch_Kaveri.png", "AAGCK5566L", "KAVERI SAFETY EQUIPMENT PVT LTD", "09/09/2015", "Company"),
    # Individual PAN (fictitious person): father's name and date of birth instead of incorporation
    ("SAMPLE_PAN_individual_Priya.png", "AXKPI7310Q", "PRIYA SPECIMEN IYER", "12/03/1994", "Individual"),
]
FATHER = {"AXKPI7310Q": "RAMESH IYER"}


def render(file, pan, name, date, category):
    w, h = 1000, 620
    img = Image.new("L", (w, h), 255)
    d = ImageDraw.Draw(img)
    f_title, f_label, f_value, f_small = ImageFont.truetype(BOLD, 34), ImageFont.truetype(FONT, 24), ImageFont.truetype(BOLD, 30), ImageFont.truetype(FONT, 18)
    d.rectangle([20, 20, w - 20, h - 20], outline=0, width=3)
    d.text((50, 45), "PAN DETAILS - BIDDER SUBMISSION", font=f_title, fill=0)
    d.text((50, 95), "Tender GEM/2026/CPCL/001 - Supporting document (Clause 4.3)", font=f_small, fill=60)
    if category == "Individual":
        rows = [("Permanent Account Number", pan), ("Name", name), ("Father's Name", FATHER[pan]), ("Date of Birth", date)]
    else:
        rows = [("Permanent Account Number", pan), ("Name", name), ("Date of Incorporation", date), ("Status of Taxpayer", category)]
    y = 160
    for label, value in rows:
        d.text((50, y), label, font=f_label, fill=70)
        d.text((50, y + 32), value, font=f_value, fill=0)
        y += 95
    # Diagonal watermark
    wm = Image.new("L", (w, h), 0)
    ImageDraw.Draw(wm).text((150, 250), "SPECIMEN - CSAP DEMO", font=ImageFont.truetype(BOLD, 64), fill=255)
    wm = wm.rotate(18, expand=False)
    img.paste(Image.new("L", (w, h), 215), mask=wm.point(lambda v: 90 if v else 0))
    d.text((50, h - 55), "Specimen document for the CSAP prototype. Not issued by any authority.", font=f_small, fill=90)
    img.save(OUT / file, optimize=True)


if __name__ == "__main__":
    for doc in DOCS:
        render(*doc)
        print("wrote", doc[0], (OUT / doc[0]).stat().st_size, "bytes")
