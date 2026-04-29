const express = require('express');
const Report = require('../models/Report');

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { reportType, coordinates } = req.body;
    if (!reportType || !coordinates || typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      return res.status(400).json({ error: 'reportType and coordinates { lat, lng } are required' });
    }
    const report = await Report.create({
      reportType,
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
    });
    res.status(201).json(report);
  } catch (err) {
    res.status(500).json({ error: 'Failed to create report' });
  }
});

router.get('/', async (req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const reports = await Report.find({ timestamp: { $gte: since } })
      .sort({ timestamp: -1 })
      .lean();
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

module.exports = router;
