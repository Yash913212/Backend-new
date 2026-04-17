require('dotenv').config();
const mongoose = require('mongoose');
const { findMatches } = require('./services/matchingService');
const { generateReport, fallbackReport } = require('./services/llamaService');

const runDemo = async () => {
  // Connect to DB directly
  await mongoose.connect(process.env.MONGO_URI);
  
  // Simulated request context (User lost their phone near library)
  const detectedObject = 'phone';
  const confidence = 0.9421;
  const userContext = {
    location: 'Library',
    date: '2026-04-09',
    time: '14:30'
  };

  // Run the matching engine
  const { matches, matchStatus } = await findMatches(detectedObject, userContext);
  
  // Run LLaMA / Ollama generator
  let aiReport;
  let llamaUsed = true;
  try {
    aiReport = await generateReport(detectedObject, matches, matchStatus);
  } catch (err) {
    aiReport = fallbackReport(detectedObject, matches, matchStatus);
    llamaUsed = false;
  }
  
  // Construct the final payload similar to the controller
  const response = {
    status: 'success',
    detected_object: detectedObject,
    confidence: confidence,
    match_status: matchStatus,
    matches: matches.map(m => ({
      category: m.category,
      objectType: m.item.objectType,
      location: m.item.location,
      date: m.item.date,
      time: m.item.time,
      score: m.score,
      strength: m.strength,
      breakdown: m.breakdown
    })),
    ai_report: aiReport,
    llama_used: llamaUsed
  };

  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
};

runDemo();
