require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const { fetchVancouverTrees } = require('./services/treeService');
const { fetchVancouverBuildings } = require('./services/buildingService');
const { fetchVancouverParkLocations } = require('./services/parkLocationsService');

const locationsRouter = require('./routes/locations');
const reportsRouter = require('./routes/reports');
const weatherRouter = require('./routes/weather');
const shadeRouter = require('./routes/shade');
const healthRouter = require('./routes/health');
const treesRouter = require('./routes/trees');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/health', healthRouter);
app.use('/api/weather', weatherRouter);
app.use('/api/shade', shadeRouter);
app.use('/api/trees', treesRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/reports', reportsRouter);

(async function start() {
  try {
    await mongoose.connect(
      process.env.MONGODB_URI || 'mongodb://localhost:27017/shadesafe'
    );
    console.log('MongoDB connected');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }

  await Promise.all([
    fetchVancouverTrees(),
    fetchVancouverBuildings(),
    fetchVancouverParkLocations(),
  ]);

  app.listen(PORT, () => {
    console.log(`ShadeSafe server listening on http://localhost:${PORT}`);
  });
})();
