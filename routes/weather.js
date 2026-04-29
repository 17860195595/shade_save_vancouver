const express = require('express');
const { getWeather } = require('../services/weatherService');

const router = express.Router();

router.get('/', async (req, res) => {
  const hasPin = req.query.lat != null && req.query.lng != null;
  const data = await getWeather(req.query.lat, req.query.lng, req.query.hour, {
    compact: !hasPin,
  });
  res.json(data);
});

module.exports = router;
