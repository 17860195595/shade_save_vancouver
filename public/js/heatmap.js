import { getSunAngle, getVancouverNowHour } from './risk.js';

let mapInstance = null;
let heatLayer = null;
let locationsCache = [];
/** Community reports for heat layer (updated with locations on init / refresh only). */
let reportsCache = [];

function getHourFn() {
  return typeof window.__shadeSafeGetHour === 'function'
    ? window.__shadeSafeGetHour()
    : getVancouverNowHour();
}

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}

function buildHeatPoints(hour, locations, reports) {
  const mult = (getSunAngle(hour) / 90) || 0;
  const pts = [];

  for (const loc of locations) {
    const shade = loc.shadeScore ?? 50;
    const intensity = ((100 - shade) / 100) * mult;
    pts.push([loc.coordinates.lat, loc.coordinates.lng, intensity]);
  }

  for (const rep of reports) {
    if (rep.reportType === 'too_hot') {
      pts.push([rep.coordinates.lat, rep.coordinates.lng, 0.8]);
    } else if (rep.reportType === 'great_shade') {
      pts.push([rep.coordinates.lat, rep.coordinates.lng, -0.3]);
    }
  }
  return pts;
}

const HEAT_GRADIENT = {
  0.0: '#1d9e75',
  0.4: '#ef9f27',
  0.7: '#e24b4a',
  1.0: '#a32d2d',
};

/**
 * @param {L.Map} map
 */
export async function initHeatmap(map) {
  mapInstance = map;
  const hour = getHourFn();
  const [locations, reports] = await Promise.all([
    fetchJSON('/api/locations'),
    fetchJSON('/api/reports'),
  ]);
  locationsCache = locations;
  reportsCache = reports;
  const data = buildHeatPoints(hour, locations, reportsCache);

  heatLayer = L.heatLayer(data, {
    radius: 52,
    blur: 38,
    maxZoom: 18,
    max: 1.0,
    minOpacity: 0.45,
    gradient: HEAT_GRADIENT,
  }).addTo(mapInstance);
}

export function getLocationsCache() {
  return locationsCache;
}

export function getHeatmapReports() {
  return reportsCache;
}

/** Keep heatmap reports in sync when another module refetches `/api/reports`. */
export function setHeatmapReports(reports) {
  reportsCache = Array.isArray(reports) ? reports : [];
}

/**
 * Recalculate intensities from sun angle and redraw heatmap.
 * @param {number} hour
 */
export async function updateHeatmap(hour) {
  if (!mapInstance) return;
  const data = buildHeatPoints(hour, locationsCache, reportsCache);
  if (heatLayer && typeof heatLayer.setLatLngs === 'function') {
    heatLayer.setLatLngs(data);
    heatLayer.redraw();
  }
}

/** Refetch API data after a new community report. */
export async function refreshAfterReport() {
  if (!mapInstance) return;
  const hour = getHourFn();
  const [locations, reports] = await Promise.all([
    fetchJSON('/api/locations'),
    fetchJSON('/api/reports'),
  ]);
  locationsCache = locations;
  reportsCache = reports;
  const data = buildHeatPoints(hour, locations, reportsCache);
  if (heatLayer && typeof heatLayer.setLatLngs === 'function') {
    heatLayer.setLatLngs(data);
    heatLayer.redraw();
  }
}
