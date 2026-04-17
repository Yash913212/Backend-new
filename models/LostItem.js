'use strict';

const mongoose = require('mongoose');

/**
 * LostItem Schema
 * Represents an item reported as lost by a campus user.
 */
const lostItemSchema = new mongoose.Schema(
  {
    image: {
      type: String,       // relative path stored under /uploads
      required: [true, 'Image is required'],
    },
    objectType: {
      type: String,
      required: [true, 'Object type is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    location: {
      type: String,
      required: [true, 'Location is required'],
      trim: true,
    },
    date: {
      type: String,       // "YYYY-MM-DD"
      required: [true, 'Date is required'],
    },
    time: {
      type: String,       // "HH:MM"
      required: [true, 'Time is required'],
    },
    contact: {
      type: String,
      required: [true, 'Contact info is required'],
      trim: true,
    },
    isResolved: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('LostItem', lostItemSchema);
