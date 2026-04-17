'use strict';

/**
 * Seed script — populates MongoDB with sample lost & found items for testing.
 * Run with: npm run seed
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const mongoose = require('mongoose');
const LostItem  = require('../models/LostItem');
const FoundItem = require('../models/FoundItem');

const LOST_ITEMS = [
  {
    image:       'sample_lost_phone.jpg',
    objectType:  'phone',
    description: 'Black iPhone 14 Pro in a clear case, lost near main gate',
    location:    'Main Gate',
    date:        '2026-04-08',
    time:        '14:30',
    contact:     '+91-9876543210',
  },
  {
    image:       'sample_lost_wallet.jpg',
    objectType:  'wallet',
    description: 'Brown leather wallet with student ID inside',
    location:    'Library Block B',
    date:        '2026-04-09',
    time:        '11:00',
    contact:     '+91-9123456789',
  },
  {
    image:       'sample_lost_bag.jpg',
    objectType:  'bag',
    description: 'Blue Wildcraft backpack with laptop inside',
    location:    'Cafeteria',
    date:        '2026-04-07',
    time:        '13:15',
    contact:     '+91-9988776655',
  },
  {
    image:       'sample_lost_keys.jpg',
    objectType:  'keys',
    description: 'Set of 3 keys on a Honda keychain',
    location:    'Parking Lot A',
    date:        '2026-04-09',
    time:        '09:45',
    contact:     '+91-9000111222',
  },
  {
    image:       'sample_lost_glasses.jpg',
    objectType:  'glasses',
    description: 'Metal frame prescription glasses',
    location:    'Auditorium',
    date:        '2026-04-10',
    time:        '10:00',
    contact:     '+91-9444555666',
  },
];

const FOUND_ITEMS = [
  {
    image:       'sample_found_phone.jpg',
    objectType:  'phone',
    description: 'Found a black smartphone near the library entrance',
    location:    'Library Entrance',
    date:        '2026-04-09',
    time:        '15:00',
    contact:     '+91-9777888999',
  },
  {
    image:       'sample_found_wallet.jpg',
    objectType:  'wallet',
    description: 'Black leather wallet found on cafeteria table',
    location:    'Cafeteria',
    date:        '2026-04-09',
    time:        '12:30',
    contact:     '+91-9111222333',
  },
  {
    image:       'sample_found_bag.jpg',
    objectType:  'bag',
    description: 'Grey backpack left unattended in lecture hall 3',
    location:    'Lecture Hall 3',
    date:        '2026-04-08',
    time:        '16:00',
    contact:     '+91-9222333444',
  },
  {
    image:       'sample_found_bottle.jpg',
    objectType:  'bottle',
    description: 'Steel water bottle found near sports ground',
    location:    'Sports Ground',
    date:        '2026-04-10',
    time:        '08:30',
    contact:     '+91-9333444555',
  },
  {
    image:       'sample_found_card.jpg',
    objectType:  'card',
    description: 'Student ID card found near admin block',
    location:    'Admin Block',
    date:        '2026-04-10',
    time:        '09:00',
    contact:     '+91-9555666777',
  },
];

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('✅  Connected to MongoDB');

    // Clear existing data
    await LostItem.deleteMany({});
    await FoundItem.deleteMany({});
    console.log('🧹  Cleared existing data');

    // Insert seed data
    await LostItem.insertMany(LOST_ITEMS);
    await FoundItem.insertMany(FOUND_ITEMS);

    console.log(`🌱  Seeded ${LOST_ITEMS.length} lost items and ${FOUND_ITEMS.length} found items`);

    await mongoose.disconnect();
    console.log('✅  Done. MongoDB disconnected.');
    process.exit(0);
  } catch (err) {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
