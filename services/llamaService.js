'use strict';

const axios = require('axios');

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const OLLAMA_MODEL    = process.env.OLLAMA_MODEL    || 'llama3.2';

/**
 * Builds the prompt for LLaMA based on the detected object and match results.
 *
 * @param {string} detectedObject - The Roboflow-detected object type.
 * @param {Array}  matches        - Scored match results from matchingService.
 * @param {string} matchStatus    - 'strong_match' | 'possible_match' | 'no_match'
 * @returns {string} Formatted prompt string.
 */
const buildPrompt = (detectedObject, matches, matchStatus) => {
  const matchSummary = matches.length > 0
    ? matches.map((m, idx) => {
        const { item, category, score, breakdown, strength } = m;
        return `
Match #${idx + 1}:
  - Category: ${category.toUpperCase()} item
  - Object Type: ${item.objectType}
  - Location: ${item.location}
  - Date: ${item.date}
  - Time: ${item.time}
  - Description: ${item.description || 'N/A'}
  - Score: ${score}/100 (${strength.replace('_', ' ')})
  - Score Breakdown: ObjectType=${breakdown.objectType}pts, Location=${breakdown.location}pts, Date=${breakdown.date}pts, Time=${breakdown.time}pts`.trim();
      }).join('\n\n')
    : 'No matching items found in the database.';

  return `You are an AI assistant for a campus Lost & Found system.

Detected object: ${detectedObject}

Match status: ${matchStatus.replace('_', ' ')}

Matching results:
${matchSummary}

Based on the above, generate a clear, concise, and friendly report that:
1. States whether a match was found and how strong it is.
2. Describes where and when the matching item was found/lost (if applicable).
3. Tells the user exactly what to do next (e.g., contact number, visit campus security, etc.).
4. Is written in simple English, 3–5 sentences maximum.
5. Do NOT add markdown formatting — plain text only.`;
};

/**
 * Calls the local Ollama API to generate an AI report.
 *
 * @param {string} detectedObject - The Roboflow-detected object type.
 * @param {Array}  matches        - Scored match results.
 * @param {string} matchStatus    - Overall match status string.
 * @returns {Promise<string>} The generated AI report text.
 */
const generateReport = async (detectedObject, matches, matchStatus) => {
  const prompt = buildPrompt(detectedObject, matches, matchStatus);

  let response;
  try {
    response = await axios.post(
      `${OLLAMA_BASE_URL}/api/generate`,
      {
        model:  OLLAMA_MODEL,
        prompt,
        stream: false,
        options: {
          temperature:  0.7,
          num_predict:  300,
        },
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 120000,   // 2 min timeout — LLaMA can be slow on CPU
      }
    );
  } catch (err) {
    if (err.code === 'ECONNREFUSED') {
      throw new Error('Ollama is not running. Please start it with `ollama serve`.');
    }
    if (err.response) {
      throw new Error(`Ollama API error (${err.response.status}): ${JSON.stringify(err.response.data)}`);
    }
    throw new Error(`Ollama request failed: ${err.message}`);
  }

  const report = response.data?.response;
  if (!report || report.trim().length === 0) {
    throw new Error('Ollama returned an empty response.');
  }

  return report.trim();
};

/**
 * Returns a safe fallback report when Ollama is unavailable.
 *
 * @param {string} detectedObject
 * @param {Array}  matches
 * @param {string} matchStatus
 * @returns {string}
 */
const fallbackReport = (detectedObject, matches, matchStatus) => {
  if (matchStatus === 'no_match' || matches.length === 0) {
    return `No matching items were found in the database for your ${detectedObject}. Please try again later or report it to campus security.`;
  }

  const top = matches[0];
  return (
    `Your ${detectedObject} likely matches a ${top.strength.replace('_', ' ')} in our database. ` +
    `A ${top.item.objectType} was ${top.category} near ${top.item.location} on ${top.item.date} at ${top.item.time}. ` +
    `Please contact: ${top.item.contact} to verify and reclaim your item.`
  );
};

module.exports = { generateReport, fallbackReport, buildPrompt };
