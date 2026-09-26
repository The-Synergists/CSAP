"""
CSAP Document Dropzone Watcher
Monitors `ai_engine/document_dropzone/input/` for new document images (.png, .jpg, .jpeg, .webp).
Automatically triggers NVIDIA Nemotron Parse 2.0 to extract structured data and writes results to `output/`.
"""

import sys
import os
import time
import json
import shutil
import logging
from pathlib import Path
from dotenv import load_dotenv

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Setup paths and environment
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
env_file = BASE_DIR / ".env"
load_dotenv(dotenv_path=env_file)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("CSAP.DropzoneWatcher")

from src.ocr_processor.extractor import DocumentOCRExtractor

DROPZONE_ROOT = BASE_DIR / "document_dropzone"
INPUT_DIR = DROPZONE_ROOT / "input"
OUTPUT_DIR = DROPZONE_ROOT / "output"
PROCESSED_DIR = DROPZONE_ROOT / "processed"

SUPPORTED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}


def setup_directories():
    """Ensure all dropzone folders exist."""
    INPUT_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)


def process_file(file_path: Path, extractor: DocumentOCRExtractor):
    """Process a single document file using Nemotron Parse 2.0."""
    print("\n" + "=" * 65)
    print(f"📄 [Nemotron Dropzone] New document detected: {file_path.name}")
    print(f"⏳ Calling NVIDIA Nemotron Parse 2.0...")
    print("=" * 65)

    try:
        # 1. Run visual extraction via Nemotron Parse 2.0
        result = extractor.extract_from_file(str(file_path))

        stem = file_path.stem
        output_json_path = OUTPUT_DIR / f"{stem}_parsed.json"
        output_md_path = OUTPUT_DIR / f"{stem}_layout.md"

        # 2. Save structured JSON result
        with open(output_json_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)

        # 3. Save layout markdown if present
        if result.get("layout_markdown"):
            with open(output_md_path, "w", encoding="utf-8") as f:
                f.write(result["layout_markdown"])

        # 4. Move original file to processed
        destination = PROCESSED_DIR / f"{int(time.time())}_{file_path.name}"
        shutil.move(str(file_path), str(destination))

        # 5. Display clean terminal summary
        ocr_status = result.get("ocr_status")

        if ocr_status == "COMPLETED":
            model_used = result.get("model_used", "NVIDIA Nemotron Parse 2.0")
            doc_type = result.get("document_type", "GENERAL_DOCUMENT")
            confidence = result.get("confidence", 0.0)
            extracted = result.get("extracted_fields", {})

            print(f"\n✅ [Extraction Complete]", flush=True)
            print(f"   • Model Used       : {model_used}", flush=True)
            print(f"   • Document Type    : {doc_type}", flush=True)
            print(f"   • Model Confidence : {confidence * 100:.1f}%", flush=True)
            print(f"   • Extracted Fields :", flush=True)
            for k, v in extracted.items():
                if v is not None:
                    print(f"       - {k}: {v}", flush=True)
            print(f"\n📁 Saved Output Files:", flush=True)
            print(f"   - JSON   : {output_json_path}", flush=True)
            if result.get("layout_markdown"):
                print(f"   - Layout : {output_md_path}", flush=True)
            print(f"   - Archived input to: {destination.name}", flush=True)
        else:
            error_detail = result.get("error", "Unknown error")
            print(f"\n❌ [Extraction Failed]", flush=True)
            print(f"   • Status           : {ocr_status}", flush=True)
            print(f"   • Error            : {error_detail}", flush=True)
            if "403" in error_detail or "Authorization" in error_detail:
                print(f"   • Solution         : Update NEMOTRON_PARSE_API_KEY in ai_engine/.env with a valid key from https://build.nvidia.com", flush=True)
            print(f"\n📁 Error log saved to : {output_json_path}", flush=True)
            print(f"   - Archived input to: {destination.name}", flush=True)

        print("=" * 65 + "\n", flush=True)

    except Exception as exc:
        logger.error(f"[Nemotron Dropzone] Failed to process {file_path.name}: {exc}", exc_info=True)


def start_watcher():
    """Continuous polling loop watching input/ directory."""
    setup_directories()
    extractor = DocumentOCRExtractor()

    print("\n" + "=" * 65, flush=True)
    print("  🚀 CSAP DOCUMENT DROPZONE WATCHER — ACTIVE", flush=True)
    print("  Powered by NVIDIA Nemotron Parse 2.0", flush=True)
    print(f"  📂 Drop files into : {INPUT_DIR}", flush=True)
    print(f"  📂 Results saved to: {OUTPUT_DIR}", flush=True)
    print("  Supported Formats  : PNG, JPG, JPEG, WEBP, BMP", flush=True)
    print("  Press Ctrl+C to stop.", flush=True)
    print("=" * 65 + "\n", flush=True)

    try:
        while True:
            # Check for candidate files
            for item in INPUT_DIR.iterdir():
                if item.is_file() and item.name != ".gitkeep":
                    if item.suffix.lower() in SUPPORTED_EXTENSIONS:
                        # Give a brief moment for OS file write to finish
                        time.sleep(0.5)
                        process_file(item, extractor)
                    else:
                        print(f"⚠️ [Dropzone] Unsupported file type: {item.name}. Expected images (PNG, JPG).")

            time.sleep(1.5)
    except KeyboardInterrupt:
        print("\n[Dropzone] Watcher stopped by user.")


if __name__ == "__main__":
    start_watcher()
