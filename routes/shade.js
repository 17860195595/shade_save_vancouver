const express = require('express');
const { calculateShadeFromTrees } = require('../services/shadeService');
const { hourFromQuery } = require('../utils/hourFromQuery');

const router = express.Router();

router.get('/at', (req, res) => {
  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return res.status(400).json({ error: 'lat and lng query params required' });
  }
  const hour = hourFromQuery(req.query);
  const shadeScore = calculateShadeFromTrees(lat, lng, hour);
  res.json({ shadeScore, hour });
});

module.exports = router;
