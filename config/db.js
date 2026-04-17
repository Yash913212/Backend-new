'use strict';

const mongoose = require('mongoose');

/**
 * Connects to MongoDB using the URI from .env
 * Retries on failure with exponential back-off (max 5 retries).
 */
const connectDB = async (retries = 5, delay = 3000) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const conn = await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      console.log(`✅  MongoDB connected: ${conn.connection.host}`);
      return;
    } catch (err) {
      console.error(`❌  MongoDB connection attempt ${attempt}/${retries} failed: ${err.message}`);
      if (attempt === retries) {
        console.error('💀  All MongoDB connection attempts exhausted. Exiting.');
        process.exit(1);
      }
      await new Promise((res) => setTimeout(res, delay * attempt));
    }
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️   MongoDB disconnected. Attempting to reconnect…');
});

module.exports = connectDB;
