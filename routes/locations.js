const express = require('express');
const {
  getCachedParkLocations,
  getParkLocationByParamId,
} = require('../services/parkLocationsService');
const { getShadeProfile } = require('../services/shadeService');
const { hourFromQuery } = require('../utils/hourFromQuery');

const router = express.Router();

function enrichLocation(loc, hour) {
  const profile = getShadeProfile(loc.coordinates.lat, loc.coordinates.lng);
  return {
    ...loc,
    shadeScore: profile[hour],
    shadeByHour: profile,
  };
}

router.get('/', (req, res) => {
  try {
    const hour = hourFromQuery(req.query);
    const locations = getCachedParkLocations();
    if (!locations.length) {
      return res.json([]);
    }
    res.json(locations.map((loc) => enrichLocation(loc, hour)));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

router.get('/:id', (req, res) => {
  try {
    const hour = hourFromQuery(req.query);
    const location = getParkLocationByParamId(req.params.id);
    if (!location) {
      return res.status(404).json({ error: 'Location not found' });
    }
    res.json(enrichLocation(location, hour));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch location' });
  }
});

module.exports = router;
