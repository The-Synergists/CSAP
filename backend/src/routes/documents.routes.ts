import { Router } from 'express';
import multer from 'multer';
import { uploadBidDocument, listBidDocuments } from '../controllers/documents.controller.js';

const router = Router();

// Store files in memory (buffer) — we stream them straight to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/tiff'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
    }
  },
});

// POST /api/documents/upload  — multipart/form-data with a single "file" field
router.post('/upload', upload.single('file'), uploadBidDocument);

// GET  /api/documents/:bidId  — list all documents for a bid
router.get('/:bidId', listBidDocuments);

export default router;
