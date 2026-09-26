"""
CSAP Interactive Document Image Test Tool
Test NVIDIA Nemotron Parse 2.0 with any document image.

Usage:
    python test_document.py [path_to_image]

Examples:
    python test_document.py
    python test_document.py document_dropzone/sample_inputs/SAMPLE_PAN_invalid_Sunrise.png
    python test_document.py C:/Users/.../my_pan.jpg
"""

import sys
import os
import json
from pathlib import Path

# Setup paths and environment
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

from dotenv import load_dotenv
load_dotenv(BASE_DIR / ".env")

from src.ocr_processor.extractor import DocumentOCRExtractor

def main():
    print("\n" + "=" * 70)
    print("  🔍 CSAP DOCUMENT IMAGE TESTER — NVIDIA NEMOTRON PARSE 2.0")
    print("=" * 70)

    sample_dir = BASE_DIR / "document_dropzone" / "sample_inputs"
    available_samples = list(sample_dir.glob("*.png")) + list(sample_dir.glob("*.jpg"))

    chosen_path = None

    if len(sys.argv) > 1:
        chosen_path = Path(sys.argv[1])
    else:
        print("\nAvailable pre-loaded sample statutory documents:")
        for idx, sample in enumerate(available_samples, 1):
            print(f"  [{idx}] {sample.name}")
        print("  [C] Custom path (enter your own image file)")

        choice = input("\nSelect an image number [1-3] or enter file path: ").strip()

        if choice.isdigit() and 1 <= int(choice) <= len(available_samples):
            chosen_path = available_samples[int(choice) - 1]
        elif choice.upper() == "C":
            custom = input("Enter full path to image (.png, .jpg, .webp): ").strip().strip('"').strip("'")
            chosen_path = Path(custom)
        elif choice:
            chosen_path = Path(choice.strip('"').strip("'"))
        else:
            if available_samples:
                chosen_path = available_samples[0]
                print(f"Defaulting to: {chosen_path.name}")
            else:
                print("No image provided. Exiting.")
                return

    if not chosen_path or not chosen_path.exists():
        print(f"\n❌ Error: File not found at '{chosen_path}'.")
        return

    print(f"\n📄 Testing File : {chosen_path.resolve()}")
    print(f"📦 File Size    : {chosen_path.stat().st_size:,} bytes")
    print("⏳ Invoking NVIDIA Nemotron Parse 2.0...")

    extractor = DocumentOCRExtractor()
    result = extractor.extract_from_file(str(chosen_path))

    status = result.get("ocr_status")
    print("\n" + "-" * 70)
    print(f"📊 Extraction Status: {status}")

    if status == "COMPLETED":
        print(f"✅ Document Type    : {result.get('document_type')}")
        print(f"🎯 Model Confidence : {result.get('confidence', 0) * 100:.1f}%")
        print(f"🤖 Model Used       : {result.get('model_used')}")
        print("\n📋 Extracted Entities:")
        fields = result.get("extracted_fields", {})
        for k, v in fields.items():
            if v is not None:
                print(f"   • {k:<20}: {v}")

        raw_snippet = result.get("raw_text", "")
        if raw_snippet:
            print("\n📝 Raw Text Snippet:")
            print("   " + raw_snippet[:300].replace("\n", "\n   ") + "...")

        # Save output
        out_dir = BASE_DIR / "document_dropzone" / "output"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file = out_dir / f"{chosen_path.stem}_parsed.json"
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"\n💾 Full JSON Output saved to: {out_file}")

    else:
        print("❌ Extraction did not complete.")
        error = result.get("error", "Unknown error")
        print(f"⚠️ Error Details: {error}")

        if "403" in error or "Authorization" in error:
            print("\n💡 NOTE ON 403 AUTHORIZATION:")
            print("   The NVIDIA API key in `ai_engine/.env` needs to be an active key from NVIDIA Build.")
            print("   To update:")
            print("   1. Generate a free API key at https://build.nvidia.com")
            print("   2. Open `ai_engine/.env`")
            print("   3. Replace NEMOTRON_PARSE_API_KEY=nvapi-... with your key")
            print("   4. Re-run this test script!")

    print("=" * 70 + "\n")

if __name__ == "__main__":
    main()
