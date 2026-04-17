'use strict';

const mongoose = require('mongoose');

/**
 * AIMatchLog Schema
 * Persists every AI detection attempt for audit / analytics.
 */
const aiMatchLogSchema = new mongoose.Schema(
  {
    uploadedFile: {
      type: String,         // filename of the uploaded image
      required: true,
    },
    detectedObject: {
      type: String,
      default: null,
    },
    confidence: {
      type: Number,
      default: null,
    },
    matchStatus: {
      type: String,
      enum: ['strong_match', 'possible_match', 'no_match', 'rejected', 'error'],
      required: true,
    },
    topMatchCount: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      default: null,
    },
    processingTimeMs: {
      type: Number,
      default: null,
    },
    aiReport: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AIMatchLog', aiMatchLogSchema);
