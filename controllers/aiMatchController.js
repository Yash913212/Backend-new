'use strict';

const fs     = require('fs');
const path   = require('path');
const sharp  = require('sharp');

const { detectObject }                  = require('../services/roboflowService');
const { findMatches }                   = require('../services/matchingService');
const { generateReport, fallbackReport } = require('../services/llamaService');
const AIMatchLog                        = require('../models/AIMatchLog');

// ─── Blur detection threshold ────────────────────────────────────────────────
// Laplacian variance below this value → image considered blurry
const BLUR_THRESHOLD = 100;

/**
 * Computes a basic sharpness score via pixel-level Laplacian approximation.
 * Uses sharp to get raw pixel data, then calculates variance.
 *
 * @param {string} imagePath - Absolute path to image file.
 * @returns {Promise<number>} Variance score (higher = sharper).
 */
const computeSharpness = async (imagePath) => {
  try {
    const { data, info } = await sharp(imagePath)
      .greyscale()
      .resize(256, 256, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const pixels = new Uint8Array(data);
    const width  = info.width;
    const height = info.height;

    // Simple Laplacian 3×3 convolution
    let sum    = 0;
    let count  = 0;
    const lap  = (i) => pixels[i] !== undefined ? pixels[i] : 0;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        const val =
          -lap(idx - width - 1) - lap(idx - width) - lap(idx - width + 1)
          - lap(idx - 1)        + 8 * lap(idx)      - lap(idx + 1)
          - lap(idx + width - 1) - lap(idx + width) - lap(idx + width + 1);
        sum   += val * val;
        count += 1;
      }
    }

    return count > 0 ? sum / count : 0;
  } catch {
    // If sharp fails, skip blur check
    return Infinity;
  }
};

/**
 * Safely deletes a file from disk (fire-and-forget).
 * @param {string} filePath
 */
const deleteFile = (filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* ignore */
  }
};

// ─── Controllers ──────────────────────────────────────────────────────────────

/**
 * POST /api/ai/match
 *
 * Pipeline:
 *  1. Validate upload
 *  2. Blur detection
 *  3. Roboflow object detection
 *  4. Match against DB
 *  5. LLaMA report generation
 *  6. Log & respond
 */
const aiMatch = async (req, res) => {
  const startTime = Date.now();
  let   uploadedFilePath = null;

  try {
    // ── Step 1: Validate file upload ────────────────────────────────────────
    if (!req.file) {
      return res.status(400).json({
        status:  'error',
        message: 'No image uploaded. Please attach an image with field name "image".',
      });
    }

    uploadedFilePath = req.file.path;
    const filename   = req.file.filename;

    // ── Step 2: Blur detection ───────────────────────────────────────────────
    const sharpness = await computeSharpness(uploadedFilePath);

    if (sharpness < BLUR_THRESHOLD) {
      deleteFile(uploadedFilePath);

      await AIMatchLog.create({
        uploadedFile:    filename,
        matchStatus:     'rejected',
        errorMessage:    `Image too blurry (sharpness score: ${sharpness.toFixed(2)})`,
        processingTimeMs: Date.now() - startTime,
      });

      return res.status(422).json({
        status:  'error',
        message: 'The uploaded image appears to be blurry. Please upload a clear photo.',
      });
    }

    // ── Step 3: Roboflow detection ───────────────────────────────────────────
    let detectionResult;
    try {
      detectionResult = await detectObject(uploadedFilePath);
    } catch (detectionErr) {
      // Specific user-facing messages for known error codes
      const msg = detectionErr.message || '';

      if (msg.startsWith('NO_PREDICTIONS')) {
        deleteFile(uploadedFilePath);
        await AIMatchLog.create({
          uploadedFile:    filename,
          matchStatus:     'rejected',
          errorMessage:    msg,
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(422).json({
          status:  'no_detection',
          message: 'Could not detect any object in the image. Please try a clearer photo with the object visible.',
        });
      }

      if (msg.startsWith('LOW_CONFIDENCE')) {
        deleteFile(uploadedFilePath);
        await AIMatchLog.create({
          uploadedFile:    filename,
          matchStatus:     'rejected',
          errorMessage:    msg,
          processingTimeMs: Date.now() - startTime,
        });
        return res.status(422).json({
          status:  'low_confidence',
          message: 'Object detected with low confidence. Please upload a well-lit, focused image.',
        });
      }

      // Unknown detection error
      throw detectionErr;
    }

    const { objectType, confidence, allPredictions } = detectionResult;

    console.log(`🔍  Detected: "${objectType}" (confidence: ${(confidence * 100).toFixed(1)}%)`);

    // ── Step 4: Match against DB ─────────────────────────────────────────────
    const context = {
      location: req.body?.location || '',
      date:     req.body?.date     || '',
      time:     req.body?.time     || '',
    };

    const { matches, matchStatus } = await findMatches(objectType, context);

    // ── Step 5: Generate AI report ───────────────────────────────────────────
    let aiReport;
    let llamaUsed = true;

    try {
      aiReport = await generateReport(objectType, matches, matchStatus);
    } catch (llamaErr) {
      console.warn(`⚠️   LLaMA unavailable, using fallback report: ${llamaErr.message}`);
      aiReport  = fallbackReport(objectType, matches, matchStatus);
      llamaUsed = false;
    }

    const processingTimeMs = Date.now() - startTime;

    // ── Step 6: Log to DB ────────────────────────────────────────────────────
    await AIMatchLog.create({
      uploadedFile:    filename,
      detectedObject:  objectType,
      confidence,
      matchStatus,
      topMatchCount:   matches.length,
      processingTimeMs,
      aiReport,
    });

    console.log(`✅  AI match complete in ${processingTimeMs}ms — status: ${matchStatus}, matches: ${matches.length}`);

    // ── Final response ───────────────────────────────────────────────────────
    if (matchStatus === 'no_match') {
      return res.status(200).json({
        status:          'no_match',
        detected_object:  objectType,
        confidence:       parseFloat(confidence.toFixed(4)),
        matches:          [],
        ai_report:        aiReport,
        llama_used:       llamaUsed,
        processing_ms:    processingTimeMs,
      });
    }

    return res.status(200).json({
      status:          'success',
      detected_object:  objectType,
      confidence:       parseFloat(confidence.toFixed(4)),
      match_status:     matchStatus,
      matches:          matches.map((m) => ({
        id:          m.item._id,
        category:    m.category,
        objectType:  m.item.objectType,
        description: m.item.description,
        location:    m.item.location,
        date:        m.item.date,
        time:        m.item.time,
        contact:     m.item.contact,
        score:       m.score,
        strength:    m.strength,
        breakdown:   m.breakdown,
      })),
      ai_report:       aiReport,
      llama_used:      llamaUsed,
      processing_ms:   processingTimeMs,
    });

  } catch (err) {
    console.error('❌  aiMatch controller error:', err.message);

    // Clean up uploaded file on unexpected errors
    if (uploadedFilePath) deleteFile(uploadedFilePath);

    // Log the error
    try {
      await AIMatchLog.create({
        uploadedFile:    req.file?.filename || 'unknown',
        matchStatus:     'error',
        errorMessage:    err.message,
        processingTimeMs: Date.now() - startTime,
      });
    } catch {
      /* ignore log errors */
    }

    return res.status(500).json({
      status:  'error',
      message: 'Internal server error during AI match. Please try again.',
      detail:  process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};

/**
 * GET /api/ai/logs
 * Returns the most recent 50 AI detection logs (newest first).
 */
const getLogs = async (_req, res) => {
  try {
    const logs = await AIMatchLog.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({ status: 'success', count: logs.length, logs });
  } catch (err) {
    console.error('❌  getLogs error:', err.message);
    return res.status(500).json({ status: 'error', message: 'Failed to fetch logs.' });
  }
};

/**
 * GET /api/ai/health
 * Quick health-check for Ollama connectivity.
 */
const healthCheck = async (_req, res) => {
  const axios = require('axios');
  const results = { mongodb: 'unknown', ollama: 'unknown' };

  // MongoDB
  const mongoose = require('mongoose');
  results.mongodb = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

  // Ollama
  try {
    await axios.get(`${process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'}/api/tags`, { timeout: 3000 });
    results.ollama = 'connected';
  } catch {
    results.ollama = 'disconnected';
  }

  return res.status(200).json({ status: 'success', services: results });
};

module.exports = { aiMatch, getLogs, healthCheck };
