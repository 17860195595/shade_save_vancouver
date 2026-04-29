/**
 * One-off maintenance: remove legacy MongoDB Location documents from an older
 * seed workflow. Live park pins come from Vancouver open data at server boot
 * (services/parkLocationsService.js), not from this collection.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Location = require('../models/Location');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/shadesafe';

async function main() {
  await mongoose.connect(MONGODB_URI);
  const n = await Location.deleteMany({});
  console.log(
    `Removed ${n.deletedCount} legacy Location doc(s). Map locations = opendata.vancouver.ca dataset "parks".`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
