const express = require('express');
const mongoose = require('mongoose');
const { getCachedTrees } = require('../services/treeService');
const { getCachedBuildings } = require('../services/buildingService');
const { getCurrentWeather } = require('../services/weatherService');
const { getCachedParkLocations } = require('../services/parkLocationsService');

const router = express.Router();

router.get('/', async (req, res) => {
  const mongo =
    mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const trees = getCachedTrees();
  const buildings = getCachedBuildings();
  const parks = getCachedParkLocations();
  const weather = await getCurrentWeather();
  res.json({
    server: 'ok',
    mongodb: mongo,
    treeData: trees.length ? `loaded (${trees.length} trees)` : 'fallback',
    buildingData: buildings.length
      ? `loaded (${buildings.length} buildings)`
      : 'fallback',
    parkLocations: parks.length
      ? `loaded (${parks.length} parks · opendata.vancouver.ca/parks)`
      : 'fallback',
    treeCount: trees.length,
    buildingCount: buildings.length,
    parkCount: parks.length,
    weatherData: {
      source: weather.source,
      temperature: weather.temperature,
      uvIndex: weather.uvIndex,
    },
  });
});

module.exports = router;
