'use strict';

const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

// ─── Ensure upload directory exists ─────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ─── Allowed MIME types ──────────────────────────────────────────────────────
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

// ─── Storage engine ──────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `ai_upload_${uniqueSuffix}${ext}`);
  },
});

// ─── File filter ─────────────────────────────────────────────────────────────
const fileFilter = (_req, file, cb) => {
  if (ALLOWED_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new multer.MulterError(
        'LIMIT_UNEXPECTED_FILE',
        `Unsupported file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`
      ),
      false
    );
  }
};

// ─── Multer instance ─────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// ─── Error handler middleware ─────────────────────────────────────────────────
/**
 * Must be used AFTER the multer middleware in a route:
 *   router.post('/match', upload.single('image'), handleUploadErrors, controller)
 */
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    let message;
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = err.field || 'Unexpected file upload error.';
        break;
      default:
        message = err.message || 'File upload error.';
    }
    return res.status(400).json({ status: 'error', message });
  }
  next(err);
};

module.exports = { upload, handleUploadErrors };
