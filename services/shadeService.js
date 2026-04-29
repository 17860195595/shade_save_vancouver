const SunCalc = require('suncalc');
const { getCachedTrees } = require('./treeService');
const { getCachedBuildings } = require('./buildingService');

const VAN_LAT = 49.2827;
const VAN_LNG = -123.1207;
const DOWNTOWN_RADIUS_M = 2500;
const TREE_RADIUS_M = 80;
const BUILDING_RADIUS_M = 100;
const SHADOW_CROSS_MAX_M = 30;

function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (x) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isDowntown(lat, lng) {
  return haversineMeters(lat, lng, VAN_LAT, VAN_LNG) <= DOWNTOWN_RADIUS_M;
}

/** Wall-clock hour in America/Vancouver for "today" (iterative UTC alignment). */
function dateForVancouverHour(targetHour) {
  const h = Math.max(0, Math.min(23, Number(targetHour) || 0));
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year').value);
  const mo = Number(parts.find((p) => p.type === 'month').value);
  const da = Number(parts.find((p) => p.type === 'day').value);
  let guessMs = Date.UTC(y, mo - 1, da, 12, 0, 0);
  for (let k = 0; k < 28; k += 1) {
    const d = new Date(guessMs);
    const hh = Number(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Vancouver',
        hour: 'numeric',
        hourCycle: 'h23',
      })
        .formatToParts(d)
        .find((p) => p.type === 'hour').value
    );
    if (hh === h) return d;
    guessMs += (h - hh) * 3600000;
  }
  return new Date(guessMs);
}

function treeShadeSum(lat, lng) {
  const trees = getCachedTrees();
  let sum = 0;
  for (const t of trees) {
    if (haversineMeters(lat, lng, t.lat, t.lng) > TREE_RADIUS_M) continue;
    const raw = (t.diameter / 60) * (t.height / 15) * 20;
    const c = Math.min(20, raw);
    sum += c;
  }
  return Math.min(100, sum);
}

/**
 * SunCalc: azimuth from South toward West, altitude above horizon (radians).
 * Shadow on ground extends from building opposite to the sun (horizontal).
 */
function pointInBuildingShadow(lat, lng, b, shadowLengthM, sunPos) {
  if (shadowLengthM <= 0 || !Number.isFinite(shadowLengthM)) return false;
  const meanLat = ((lat + b.lat) / 2) * (Math.PI / 180);
  const east = (lng - b.lng) * Math.cos(meanLat) * 111320;
  const north = (lat - b.lat) * 111320;
  const az = sunPos.azimuth;
  const uEast = Math.sin(az);
  const uNorth = Math.cos(az);
  const shadowEast = -uEast;
  const shadowNorth = -uNorth;
  const along = east * shadowEast + north * shadowNorth;
  const cross = Math.abs(east * shadowNorth - north * shadowEast);
  return along > 0 && along <= shadowLengthM && cross <= SHADOW_CROSS_MAX_M;
}

function buildingShadeSum(lat, lng, hour) {
  const buildings = getCachedBuildings();
  const date = dateForVancouverHour(hour);
  const sunPos = SunCalc.getPosition(date, lat, lng);
  const alt = sunPos.altitude;

  if (alt <= 0) {
    if (isDowntown(lat, lng)) return 20;
    return 0;
  }

  let buildingShade = 0;
  for (const b of buildings) {
    if (haversineMeters(lat, lng, b.lat, b.lng) > BUILDING_RADIUS_M) continue;
    const sunAtBuilding = SunCalc.getPosition(date, b.lat, b.lng);
    if (sunAtBuilding.altitude <= 0) continue;
    const tanAlt = Math.tan(sunAtBuilding.altitude);
    if (tanAlt <= 0) continue;
    const shadowLength = b.height / tanAlt;
    if (pointInBuildingShadow(lat, lng, b, shadowLength, sunAtBuilding)) {
      buildingShade += Math.min(b.height * 1.5, 25);
    }
  }
  return buildingShade;
}

function calculateShadeFromTrees(lat, lng, hour) {
  const t = treeShadeSum(lat, lng);
  const b = buildingShadeSum(lat, lng, hour);
  return Math.min(100, t + b);
}

function getShadeProfile(lat, lng) {
  const t = treeShadeSum(lat, lng);
  const profile = [];
  for (let h = 0; h < 24; h += 1) {
    const b = buildingShadeSum(lat, lng, h);
    profile.push(Math.min(100, t + b));
  }
  return profile;
}

function getVancouverCurrentHour() {
  const hourPart = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(new Date()).find((p) => p.type === 'hour');
  return Math.min(23, Math.max(0, parseInt(hourPart.value, 10)));
}

module.exports = {
  calculateShadeFromTrees,
  getShadeProfile,
  getVancouverCurrentHour,
};
