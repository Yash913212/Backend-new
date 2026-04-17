'use strict';

const express   = require('express');
const router    = express.Router();
const FoundItem = require('../models/FoundItem');
const { upload, handleUploadErrors } = require('../middleware/upload');

// POST /api/found  — Report a newly found item
router.post('/', upload.single('image'), handleUploadErrors, async (req, res) => {
  try {
    const { objectType, description, location, date, time, contact } = req.body;
    if (!req.file) return res.status(400).json({ status: 'error', message: 'Image is required.' });

    const item = await FoundItem.create({
      image: req.file.filename,
      objectType,
      description,
      location,
      date,
      time,
      contact,
    });

    return res.status(201).json({ status: 'success', data: item });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/found  — Retrieve all found items
router.get('/', async (_req, res) => {
  try {
    const items = await FoundItem.find({ isResolved: false }).sort({ createdAt: -1 });
    return res.status(200).json({ status: 'success', count: items.length, data: items });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// GET /api/found/:id
router.get('/:id', async (req, res) => {
  try {
    const item = await FoundItem.findById(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Found item not found.' });
    return res.status(200).json({ status: 'success', data: item });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// PATCH /api/found/:id/resolve
router.patch('/:id/resolve', async (req, res) => {
  try {
    const item = await FoundItem.findByIdAndUpdate(req.params.id, { isResolved: true }, { new: true });
    if (!item) return res.status(404).json({ status: 'error', message: 'Found item not found.' });
    return res.status(200).json({ status: 'success', data: item });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// DELETE /api/found/:id
router.delete('/:id', async (req, res) => {
  try {
    const item = await FoundItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ status: 'error', message: 'Found item not found.' });
    return res.status(200).json({ status: 'success', message: 'Deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

module.exports = router;
