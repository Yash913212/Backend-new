'use strict';

const LostItem  = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');

// ─── Scoring weights ─────────────────────────────────────────────────────────
const WEIGHTS = {
  objectType: 40,
  location:   20,
  date:       20,
  time:       10,
  image:      10,
};

const STRONG_MATCH_THRESHOLD   = parseInt(process.env.STRONG_MATCH_THRESHOLD  || '70', 10);
const POSSIBLE_MATCH_THRESHOLD = parseInt(process.env.POSSIBLE_MATCH_THRESHOLD || '50', 10);
const TOP_MATCHES              = parseInt(process.env.TOP_MATCHES              || '5',  10);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Computes how many tokens (words) two location strings share,
 * normalized to a 0–1 similarity score.
 */
const locationSimilarity = (loc1 = '', loc2 = '') => {
  const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(Boolean);
  const a = new Set(tokenize(loc1));
  const b = new Set(tokenize(loc2));
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = [...a].filter((t) => b.has(t)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
};

/**
 * Returns the absolute difference in days between two "YYYY-MM-DD" strings.
 * Returns Infinity if parsing fails.
 */
const dayDifference = (d1 = '', d2 = '') => {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (isNaN(t1) || isNaN(t2)) return Infinity;
  return Math.abs((t1 - t2) / (1000 * 60 * 60 * 24));
};

/**
 * Returns the absolute difference in hours between two "HH:MM" strings.
 * Returns Infinity if parsing fails.
 */
const hourDifference = (t1 = '', t2 = '') => {
  const parse = (s) => {
    const [h, m] = s.split(':').map(Number);
    return isNaN(h) || isNaN(m) ? null : h * 60 + m;
  };
  const m1 = parse(t1);
  const m2 = parse(t2);
  if (m1 === null || m2 === null) return Infinity;
  return Math.abs(m1 - m2) / 60;
};

/**
 * Determines the match strength label from a numeric score.
 */
const matchStrength = (score) => {
  if (score >= STRONG_MATCH_THRESHOLD)   return 'strong_match';
  if (score >= POSSIBLE_MATCH_THRESHOLD) return 'possible_match';
  return 'no_match';
};

/**
 * Scores a single database item against the detected object and upload image.
 *
 * @param {object} dbItem        - Mongoose document (LostItem or FoundItem)
 * @param {string} detectedType  - Lowercase object type from Roboflow
 * @param {string} itemCategory  - 'lost' | 'found'
 * @returns {object} Scored result object
 */
const scoreItem = (dbItem, detectedType, itemCategory) => {
  let score = 0;
  const breakdown = {};

  // 1️⃣  Object type match (40 pts)
  const dbType = (dbItem.objectType || '').toLowerCase().trim();
  if (dbType === detectedType) {
    score += WEIGHTS.objectType;
    breakdown.objectType = WEIGHTS.objectType;
  } else if (detectedType.includes(dbType) || dbType.includes(detectedType)) {
    score += WEIGHTS.objectType * 0.5;
    breakdown.objectType = WEIGHTS.objectType * 0.5;
  } else {
    breakdown.objectType = 0;
  }

  // 2️⃣  Location match (20 pts)
  const locSim = locationSimilarity(dbItem.location, '');
  // Location for the uploaded image isn't known at matching time,
  // so we grant partial points based on whether the item has a known location.
  // In practice the frontend can pass location in the body — handled below.
  breakdown.location = 0; // updated by scoreItems() when userLocation is provided

  // 3️⃣  Date match (20 pts)  — scored later in scoreItems()
  breakdown.date = 0;

  // 4️⃣  Time match (10 pts)  — scored later in scoreItems()
  breakdown.time = 0;

  // 5️⃣  Image similarity placeholder (10 pts)
  //     Full implementation would use face/embedding vectors;
  //     currently awarded 0 unless overridden.
  breakdown.image = 0;

  return {
    item:      dbItem.toObject(),
    category:  itemCategory,
    score,
    breakdown,
  };
};

/**
 * Fetches all active (unresolved) items from MongoDB,
 * scores each against the detected type + optional context,
 * and returns the top N sorted results.
 *
 * @param {string} detectedType    - Object type detected by Roboflow
 * @param {object} [context={}]    - Optional { location, date, time } from request body
 * @returns {Promise<{ matches: Array, matchStatus: string }>}
 */
const findMatches = async (detectedType, context = {}) => {
  const { location: userLocation = '', date: userDate = '', time: userTime = '' } = context;

  // Fetch all unresolved items in parallel
  const [lostItems, foundItems] = await Promise.all([
    LostItem.find({ isResolved: false }),
    FoundItem.find({ isResolved: false }),
  ]);

  const allItems = [
    ...lostItems.map((i)  => ({ doc: i, category: 'lost'  })),
    ...foundItems.map((i) => ({ doc: i, category: 'found' })),
  ];

  const scored = allItems.map(({ doc, category }) => {
    let score = 0;
    const breakdown = {};

    // ── Object type ───────────────────────────────────────────────────────
    const dbType = (doc.objectType || '').toLowerCase().trim();
    if (dbType === detectedType) {
      score += WEIGHTS.objectType;
      breakdown.objectType = WEIGHTS.objectType;
    } else if (detectedType.includes(dbType) || dbType.includes(detectedType)) {
      score += WEIGHTS.objectType * 0.5;
      breakdown.objectType = WEIGHTS.objectType * 0.5;
    } else {
      breakdown.objectType = 0;
    }

    // ── Location ──────────────────────────────────────────────────────────
    if (userLocation) {
      const sim = locationSimilarity(userLocation, doc.location);
      const locScore = Math.round(sim * WEIGHTS.location);
      score += locScore;
      breakdown.location = locScore;
    } else {
      breakdown.location = 0;
    }

    // ── Date ──────────────────────────────────────────────────────────────
    if (userDate) {
      const dayDiff = dayDifference(userDate, doc.date);
      let dateScore = 0;
      if (dayDiff === 0)       dateScore = WEIGHTS.date;
      else if (dayDiff <= 1)   dateScore = Math.round(WEIGHTS.date * 0.8);
      else if (dayDiff <= 3)   dateScore = Math.round(WEIGHTS.date * 0.5);
      else if (dayDiff <= 7)   dateScore = Math.round(WEIGHTS.date * 0.2);
      score += dateScore;
      breakdown.date = dateScore;
    } else {
      breakdown.date = 0;
    }

    // ── Time ──────────────────────────────────────────────────────────────
    if (userTime) {
      const hourDiff = hourDifference(userTime, doc.time);
      let timeScore = 0;
      if (hourDiff <= 1)        timeScore = WEIGHTS.time;
      else if (hourDiff <= 3)   timeScore = Math.round(WEIGHTS.time * 0.6);
      else if (hourDiff <= 6)   timeScore = Math.round(WEIGHTS.time * 0.3);
      score += timeScore;
      breakdown.time = timeScore;
    } else {
      breakdown.time = 0;
    }

    // ── Image similarity (placeholder) ────────────────────────────────────
    breakdown.image = 0;

    return {
      item:      doc.toObject(),
      category,
      score,
      breakdown,
      strength:  matchStrength(score),
    };
  });

  // Filter out no_match and sort descending by score
  const matches = scored
    .filter((r) => r.score >= POSSIBLE_MATCH_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_MATCHES);

  // Determine overall status
  let matchStatus = 'no_match';
  if (matches.length > 0) {
    matchStatus = matches[0].score >= STRONG_MATCH_THRESHOLD ? 'strong_match' : 'possible_match';
  }

  return { matches, matchStatus };
};

module.exports = { findMatches, matchStrength, WEIGHTS };
