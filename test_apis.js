require('dotenv').config();
const fs = require('fs');
const axios = require('axios');
const path = require('path');
const { detectObject } = require('./services/roboflowService');
const { generateReport } = require('./services/llamaService');

const dummyMatches = [{
  item: { objectType: "phone", location: "Library Entrance", date: "2026-04-09", time: "15:00" },
  category: "found",
  score: 80,
  breakdown: { objectType: 40, location: 10, date: 20, time: 10, image: 0 },
  strength: "strong_match"
}];

const runTests = async () => {
  console.log("======================================");
  console.log("🚀 TESTING LLaMA 3.2 GENERATION");
  console.log("======================================");
  try {
    const startTime = Date.now();
    const report = await generateReport("phone", dummyMatches, "strong_match");
    console.log(`✅ LLaMA Success! (${Date.now() - startTime}ms)\nReport: "${report}"`);
  } catch (err) {
    console.log("❌ LLaMA Failed:", err.message);
  }

  console.log("\n======================================");
  console.log("🚀 TESTING ROBOFLOW WORKFLOW");
  console.log("======================================");
  const imgPath = path.join(__dirname, 'test_sample.jpg');
  try {
    // Download a tiny placeholder image if we don't have one
    if (!fs.existsSync(imgPath)) {
      console.log("Downloading sample image...");
      // Using a small public image of a phone for testing
      const response = await axios.get('https://upload.wikimedia.org/wikipedia/commons/b/b4/IPhone_5s_golden.jpg', { responseType: 'stream' });
      const writer = fs.createWriteStream(imgPath);
      response.data.pipe(writer);
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
      console.log("Sample image downloaded.");
    }

    const roboflowResult = await detectObject(imgPath);
    console.log(`✅ Roboflow Success!`);
    console.log(`Predicted object: "${roboflowResult.objectType}" (Confidence: ${(roboflowResult.confidence * 100).toFixed(1)}%)`);
  } catch (err) {
    console.log("❌ Roboflow Failed:", err.message);
  } finally {
    if (fs.existsSync(imgPath)) {
      fs.unlinkSync(imgPath);
    }
  }
};

runTests();
