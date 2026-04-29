const express = require('express');
const { getTreesInBounds } = require('../services/treeService');

const router = express.Router();

router.get('/bounds', (req, res) => {
  const south = parseFloat(req.query.south);
  const west = parseFloat(req.query.west);
  const north = parseFloat(req.query.north);
  const east = parseFloat(req.query.east);
  const limit = parseInt(req.query.limit, 10);
  const trees = getTreesInBounds(south, west, north, east, limit);
  res.json({ count: trees.length, trees });
});

module.exports = router;
