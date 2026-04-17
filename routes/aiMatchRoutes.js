'use strict';

const express = require('express');
const router  = express.Router();

const { upload, handleUploadErrors } = require('../middleware/upload');
const { aiMatch, getLogs, healthCheck } = require('../controllers/aiMatchController');

/**
 * POST /api/ai/match
 * Upload an image → Roboflow detection → DB matching → LLaMA report
 *
 * Form-data fields:
 *   - image    (required) — the image file
 *   - location (optional) — where the item was last seen
 *   - date     (optional) — YYYY-MM-DD
 *   - time     (optional) — HH:MM
 */
router.post(
  '/match',
  upload.single('image'),
  handleUploadErrors,
  aiMatch
);

/**
 * GET /api/ai/logs
 * Retrieve the last 50 AI detection logs (newest first).
 */
router.get('/logs', getLogs);

/**
 * GET /api/ai/health
 * Check connectivity to MongoDB and Ollama.
 */
router.get('/health', healthCheck);

module.exports = router;
