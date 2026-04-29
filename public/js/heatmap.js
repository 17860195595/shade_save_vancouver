import { getSunAngle, getVancouverNowHour } from './risk.js';
import { timeAgo } from './lib/formatTime.js';

let mapInstance = null;
let heatLayer = null;
/** Pins for community reports (distinct icon per reportType). */
let reportMarkersLayer = null;
let locationsCache = [];
/** Community reports for heat layer (updated with locations on init / refresh only). */
let reportsCache = [];

const REPORT_MARKER_META = {
  too_hot: { label: 'Too hot', icon: '🔥', ring: '#c62828' },
  great_shade: { label: 'Great shade', icon: '🌳', ring: '#1b5e20' },
  needs_structure: { label: 'Needs shade structure', icon: '🏗️', ring: '#b35a00' },
};

function escapeAttr(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function redrawReportMarkers() {
  if (!mapInstance || !reportMarkersLayer) return;
  reportMarkersLayer.clearLayers();
  for (const rep of reportsCache) {
    if (
      !rep.coordinates ||
      typeof rep.coordinates.lat !== 'number' ||
      typeof rep.coordinates.lng !== 'number'
    ) {
      continue;
    }
    const meta = REPORT_MARKER_META[rep.reportType] || {
      label: 'Community report',
      icon: '📌',
      ring: '#5c6b62',
    };
    const icon = L.divIcon({
      className: 'report-marker-wrap',
      html: `<div class="report-map-pin" style="--report-ring:${meta.ring}" role="img" aria-label="${escapeAttr(meta.label)}"><span class="report-map-pin__ico" aria-hidden="true">${meta.icon}</span></div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 33],
    });
    const m = L.marker([rep.coordinates.lat, rep.coordinates.lng], {
      icon,
      interactive: true,
      zIndexOffset: 620,
    });
    const when = rep.timestamp ? timeAgo(rep.timestamp) : '';
    m.bindTooltip(`${meta.label}${when ? ` · ${when}` : ''}`, {
      direction: 'top',
      sticky: true,
      opacity: 1,
      className: 'report-marker-tooltip',
    });
    m.addTo(reportMarkersLayer);
  }
}

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

  reportMarkersLayer = L.layerGroup().addTo(mapInstance);
  redrawReportMarkers();
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
  redrawReportMarkers();
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
  redrawReportMarkers();
}
