const mongoose = require('mongoose');

/**
 * Legacy MongoDB model only. Park geometry for the app is loaded from
 * opendata.vancouver.ca in memory (see parkLocationsService). Use
 * `npm run clear-legacy-locations` to drop old seeded documents.
 */
const locationSchema = new mongoose.Schema({
  name: { type: String, required: true },
  coordinates: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  borough: String,
  shadeScore: { type: Number, min: 0, max: 100 },
  type: {
    type: String,
    enum: ['park', 'plaza', 'beach', 'street'],
    required: true,
  },
});

module.exports = mongoose.model('Location', locationSchema);
