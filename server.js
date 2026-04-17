'use strict';

require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');

const connectDB = require('./config/db');
const aiMatchRoutes = require('./routes/aiMatchRoutes');
const lostItemRoutes = require('./routes/lostItemRoutes');
const foundItemRoutes = require('./routes/foundItemRoutes');

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = process.env.PORT || 5000;

// ─── Ensure required directories exist ───────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
const LOG_DIR = './logs';
[UPLOAD_DIR, LOG_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve uploaded images statically (images only — no directory listing)
app.use('/uploads', express.static(path.resolve(UPLOAD_DIR)));

// ─── Request logger (development) ────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
    next();
  });
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/ai', aiMatchRoutes);
app.use('/api/lost', lostItemRoutes);
app.use('/api/found', foundItemRoutes);

// ─── Root ping ────────────────────────────────────────────────────────────────
app.get('/', (_req, res) => {
  res.json({
    project: 'CampusHub Lost & Found API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      aiMatch: 'POST /api/ai/match',
      aiLogs: 'GET  /api/ai/logs',
      aiHealth: 'GET  /api/ai/health',
      lostItems: 'GET/POST /api/lost',
      foundItems: 'GET/POST /api/found',
    },
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ status: 'error', message: 'Route not found.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('💥  Unhandled error:', err.message);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error.',
    detail: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// ─── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀  CampusHub Lost & Found API`);
  console.log(`   ➜  http://localhost:${PORT}`);
  console.log(`   ➜  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   ➜  AI Match endpoint: POST http://localhost:${PORT}/api/ai/match\n`);
});

module.exports = app;
