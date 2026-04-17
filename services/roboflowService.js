'use strict';

const axios = require('axios');
const fs    = require('fs');

const ROBOFLOW_API_KEY  = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_WS       = process.env.ROBOFLOW_WORKSPACE;
const ROBOFLOW_WORKFLOW = process.env.ROBOFLOW_WORKFLOW;
const MIN_CONFIDENCE    = parseFloat(process.env.MIN_CONFIDENCE || '0.6');

/**
 * Reads an image file from disk and converts it to a base64 string.
 * @param {string} filePath - Absolute path to the image file.
 * @returns {string} Base64-encoded image string.
 */
const imageToBase64 = (filePath) => {
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
};

/**
 * Validates that the Roboflow configuration is present.
 * Throws an error if any required env var is missing.
 */
const validateConfig = () => {
  if (!ROBOFLOW_API_KEY || ROBOFLOW_API_KEY === 'your_roboflow_api_key_here') {
    throw new Error('ROBOFLOW_API_KEY is not set in .env');
  }
  if (!ROBOFLOW_WS || !ROBOFLOW_WORKFLOW) {
    throw new Error('ROBOFLOW_WORKSPACE or ROBOFLOW_WORKFLOW is missing in .env');
  }
};

/**
 * Calls the Roboflow Serverless Workflow API to detect objects in an image.
 *
 * @param {string} imagePath - Absolute path to the uploaded image.
 * @returns {{ objectType: string, confidence: number, allPredictions: Array }}
 * @throws Error with a descriptive message on failure.
 */
const detectObject = async (imagePath) => {
  validateConfig();

  const base64Image = imageToBase64(imagePath);

  const url = `https://serverless.roboflow.com/${ROBOFLOW_WS}/workflows/${ROBOFLOW_WORKFLOW}`;

  const payload = {
    api_key: ROBOFLOW_API_KEY,
    inputs: {
      image: {
        type: 'base64',
        value: base64Image,
      },
    },
  };

  let response;
  try {
    response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,  // 30 s timeout
    });
  } catch (err) {
    if (err.response) {
      const detail = err.response.data?.message || JSON.stringify(err.response.data);
      throw new Error(`Roboflow API error (${err.response.status}): ${detail}`);
    }
    throw new Error(`Roboflow request failed: ${err.message}`);
  }

  // ─── Parse response ───────────────────────────────────────────────────────
  const data = response.data;

  // Roboflow Workflows return outputs keyed by step name.
  // We extract prediction arrays from whichever key is present.
  let predictions = [];

  if (Array.isArray(data?.outputs)) {
    // Workflow batch output
    for (const output of data.outputs) {
      const preds =
        output?.predictions?.predictions ||
        output?.object_detection_predictions?.predictions ||
        [];
      predictions.push(...preds);
    }
  } else if (data?.predictions?.predictions) {
    predictions = data.predictions.predictions;
  } else if (Array.isArray(data?.predictions)) {
    predictions = data.predictions;
  }

  if (!predictions || predictions.length === 0) {
    throw new Error('NO_PREDICTIONS: No objects detected in the image.');
  }

  // Sort by confidence descending and take the top prediction
  predictions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  const top = predictions[0];

  if ((top.confidence || 0) < MIN_CONFIDENCE) {
    throw new Error(
      `LOW_CONFIDENCE: Detected object confidence (${(top.confidence * 100).toFixed(1)}%) ` +
      `is below the required threshold of ${(MIN_CONFIDENCE * 100).toFixed(0)}%.`
    );
  }

  return {
    objectType:     (top.class || top.label || 'unknown').toLowerCase().trim(),
    confidence:     top.confidence,
    allPredictions: predictions,
  };
};

module.exports = { detectObject, imageToBase64 };
