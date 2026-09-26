# CSAP Document Dropzone

This directory allows you to manually drop document images to test **NVIDIA Nemotron Parse 2.0**.

### Folders:
* **`input/`**: Drop your document images (`.png`, `.jpg`, `.jpeg`, `.webp`) here.
* **`output/`**: Nemotron Parse 2.0 will generate structured extraction files here:
  - `<document_name>_parsed.json`: Extracted statutory key-values, classification, confidence, and verification flags.
  - `<document_name>_layout.md`: Layout-aware visual markdown text extracted from the document.
* **`processed/`**: Original files are moved here after processing to prevent duplicate runs.

### How to Run:
In your terminal:
```powershell
cd ai_engine
..\.venv\Scripts\python.exe src/dropzone_watcher.py
```
Then simply copy or drag any document image into `document_dropzone/input/` and watch Nemotron Parse 2.0 process it live!
