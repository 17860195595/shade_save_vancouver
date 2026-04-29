import {
  initHeatmap,
  updateHeatmap,
  getLocationsCache,
  getHeatmapReports,
  setHeatmapReports,
} from './heatmap.js';
import { calculateRisk, getSunAngle, getVancouverNowHour } from './risk.js';
import { buildTripAdvisory } from './advisory.js';
import { formatHour12, timeAgo } from './lib/formatTime.js';
import { kmBetween, nearestLocation as nearestOf } from './lib/geo.js';
import {
  loadWeather,
  getWeather,
  weatherFootnote,
  weatherAtHourForRisk,
  fetchWeatherForPin,
} from './weatherClient.js';
import { persistLastHighRecord, renderLastHighAlert } from './lastHighAlert.js';

const VAN = { lat: 49.2827, lng: -123.1207 };

let dataHealth = { treeCount: 0, buildingCount: 0, parkCount: 0 };

async function loadDataHealth() {
  try {
    const r = await fetch('/api/health');
    if (!r.ok) throw new Error('bad status');
    const h = await r.json();
    dataHealth = {
      treeCount: typeof h.treeCount === 'number' ? h.treeCount : 0,
      buildingCount: typeof h.buildingCount === 'number' ? h.buildingCount : 0,
      parkCount: typeof h.parkCount === 'number' ? h.parkCount : 0,
    };
  } catch (e) {
    console.warn('Health fetch failed:', e);
    dataHealth = { treeCount: 0, buildingCount: 0, parkCount: 0 };
  }
}

function shadeAtHour(loc, hour) {
  const h = Number(hour);
  if (Array.isArray(loc.shadeByHour) && loc.shadeByHour[h] != null) {
    return loc.shadeByHour[h];
  }
  return loc.shadeScore ?? 50;
}
const NEAR_ALERT_KM = 0.85;
const NEAR_REPORT_KM = 0.28;

function debounce(fn, ms) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

let map;
let userMarker = null;
let treeMarkersLayer = null;
let locationMarkersLayer = null;
let treeFetchGeneration = 0;
let userLatLng = null;
let selectedLocation = null;
/** Avoid rebuilding park markers on every `openDetailSheet` (e.g. time slider). */
let lastParkSelectionRenderedId = null;
let reportsCache = [];
let alertDismissedUntil = 0;

function nearestLocation(lat, lng) {
  return nearestOf(getLocationsCache(), lat, lng);
}

function getSliderHour() {
  const el = document.getElementById('time-slider');
  return el ? Number(el.value) : getVancouverNowHour();
}

window.__shadeSafeGetHour = getSliderHour;

const REPORT_META = {
  too_hot: { label: 'Too hot', icon: '🔥' },
  great_shade: { label: 'Great shade', icon: '🌳' },
  needs_structure: { label: 'Needs shade structure', icon: '🏗️' },
};

function reportsForLocation(loc) {
  return reportsCache
    .filter((r) => {
      const d = kmBetween(
        { lat: loc.coordinates.lat, lng: loc.coordinates.lng },
        { lat: r.coordinates.lat, lng: r.coordinates.lng }
      );
      return d <= NEAR_REPORT_KM;
    })
    .slice(0, 5);
}

function safestHourRange(loc, weather) {
  const series = [];
  for (let h = 6; h <= 17; h += 1) {
    const shade = shadeAtHour(loc, h);
    const wx = weatherAtHourForRisk(weather, h);
    const r = calculateRisk(shade, h, wx.temperature, wx.uvIndex);
    series.push({ h, score: r.score, level: r.level });
  }
  let min = Math.min(...series.map((x) => x.score));
  const good = series.filter((x) => x.score <= min + 2);
  if (!good.length) return 'varies — stay shaded midday';
  const hs = good.map((x) => x.h);
  const lo = Math.min(...hs);
  const hi = Math.max(...hs);
  if (lo === hi) return `around ${formatHour12(lo)}`;
  return `${formatHour12(lo)} – ${formatHour12(hi)}`;
}

function renderHourlyBars(loc, weather, currentHour) {
  const wrap = document.getElementById('hourly-risk-bars');
  if (!wrap) return;
  wrap.innerHTML = '';
  let maxS = 0;
  const pts = [];
  for (let h = 6; h <= 17; h += 1) {
    const shade = shadeAtHour(loc, h);
    const wx = weatherAtHourForRisk(weather, h);
    const r = calculateRisk(shade, h, wx.temperature, wx.uvIndex);
    pts.push({ h, ...r });
    maxS = Math.max(maxS, r.score);
  }
  const scale = maxS > 0 ? maxS : 1;
  pts.forEach((p) => {
    const bar = document.createElement('div');
    bar.className = 'risk-bar';
    const hPct = Math.round((p.score / scale) * 100);
    bar.style.height = `${Math.max(8, hPct)}%`;
    bar.style.background = p.color;
    if (p.h === currentHour) bar.classList.add('current');
    bar.title = `${formatHour12(p.h)}: ${p.level} (${p.score.toFixed(1)})`;
    wrap.appendChild(bar);
  });
}

async function openDetailSheet(loc) {
  selectedLocation = loc;
  const sid = locationStableId(loc);
  if (sid !== lastParkSelectionRenderedId) {
    lastParkSelectionRenderedId = sid;
    refreshLocationMarkersInView();
  }
  const sheet = document.getElementById('detail-sheet');
  if (!sheet) return;
  const hour = getSliderHour();
  const weather = await fetchWeatherForPin(loc.coordinates.lat, loc.coordinates.lng, hour);
  const shadeNow = shadeAtHour(loc, hour);
  const risk = calculateRisk(shadeNow, hour, weather.temperature, weather.uvIndex);

  document.getElementById('sheet-title').textContent = loc.name;
  document.getElementById('sheet-borough').textContent = loc.borough || '';
  const badge = document.getElementById('sheet-risk-badge');
  badge.textContent = risk.level;
  badge.className = `risk-badge risk-${risk.level}`;

  document.getElementById('sheet-temp').textContent = `${weather.temperature}°C`;
  document.getElementById('sheet-humidity').textContent = `${weather.humidity}%`;
  document.getElementById('sheet-uv').textContent = String(weather.uvIndex);
  document.getElementById('sheet-shade').textContent = `${Math.round(shadeNow)}%`;

  const wxSrc = weatherFootnote(weather);
  document.getElementById('sheet-temp-src').textContent = wxSrc;
  document.getElementById('sheet-humidity-src').textContent = wxSrc;
  document.getElementById('sheet-uv-src').textContent = wxSrc;
  const shadeSrc =
    dataHealth.treeCount || dataHealth.buildingCount || dataHealth.parkCount
      ? `This pin · trees ≤80 m + building shadows ≤100 m · server loads ${dataHealth.treeCount} trees & ${dataHealth.buildingCount} buildings for the model · SunCalc`
      : 'Shade model · open data not loaded on server';
  document.getElementById('sheet-shade-src').textContent = shadeSrc;

  const prov = document.getElementById('sheet-provenance-body');
  if (prov) {
    const wxLine =
      weather.source === 'open-meteo'
        ? `Temperature, humidity, and UV for the selected slider hour use Open-Meteo’s hourly series for today’s Vancouver calendar date at this park’s coordinates (current conditions stay on the live “current” row; about every 10 minutes per ~1 km cell).`
        : 'Weather is using safe placeholder values because the forecast request failed.';
    const shadeLine =
      dataHealth.treeCount || dataHealth.buildingCount || dataHealth.parkCount
        ? `The shade percentage is estimated for this pin only (trees + building shadows). Map pins are parks from opendata.vancouver.ca (${dataHealth.parkCount || '…'} loaded). Building sample size ${dataHealth.buildingCount}; drag the time slider to shift shadows.`
        : 'The shade model normally uses Vancouver open data; the server cache is empty so scores may not reflect real canopy.';
    prov.textContent = `${wxLine} ${shadeLine}`;
  }

  renderHourlyBars(loc, weather, hour);
  document.getElementById('sheet-safest').textContent = safestHourRange(loc, weather);

  const adv = buildTripAdvisory({
    riskLevel: risk.level,
    riskScore: risk.score,
    temperature: weather.temperature,
    humidity: weather.humidity,
    uvIndex: weather.uvIndex,
    shadePct: shadeNow,
    hour,
  });
  const advVerdict = document.getElementById('sheet-advisory-verdict');
  const advSummary = document.getElementById('sheet-advisory-summary');
  const advTips = document.getElementById('sheet-advisory-tips');
  if (advVerdict) advVerdict.textContent = adv.verdict;
  if (advSummary) advSummary.textContent = adv.summary;
  if (advTips) {
    advTips.innerHTML = '';
    adv.tips.forEach((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      advTips.appendChild(li);
    });
  }

  const list = document.getElementById('sheet-reports');
  list.innerHTML = '';
  const nearby = reportsForLocation(loc);
  if (!nearby.length) {
    list.innerHTML = '<li class="text-muted small">No nearby reports in the last 24h.</li>';
  } else {
    nearby.forEach((r) => {
      const meta = REPORT_META[r.reportType] || { label: r.reportType, icon: '📌' };
      const li = document.createElement('li');
      li.className = 'sheet-report-item';
      li.innerHTML = `<span class="sheet-report-icon">${meta.icon}</span><div><div>${meta.label}</div><div class="small text-muted">${timeAgo(r.timestamp)}</div></div>`;
      list.appendChild(li);
    });
  }

  sheet.classList.add('open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.classList.add('shadesafe-sheet-open');
}

function closeDetailSheet() {
  selectedLocation = null;
  if (lastParkSelectionRenderedId != null) {
    lastParkSelectionRenderedId = null;
    refreshLocationMarkersInView();
  }
  const sheet = document.getElementById('detail-sheet');
  sheet?.classList.remove('open');
  sheet?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('shadesafe-sheet-open');
}

function refreshOpenSheet() {
  if (selectedLocation) openDetailSheet(selectedLocation);
}

async function fetchReports() {
  const r = await fetch('/api/reports');
  if (!r.ok) return;
  reportsCache = await r.json();
  setHeatmapReports(reportsCache);
  if (map) await updateHeatmap(getSliderHour());
}

function setAlertBanner(show, message) {
  const banner = document.getElementById('alert-banner');
  if (!banner) return;
  const text = document.getElementById('alert-banner-text');
  if (show && message) {
    if (text) text.textContent = message;
    banner.classList.remove('d-none');
  } else {
    banner.classList.add('d-none');
  }
}

async function evaluateUserRisk() {
  if (Date.now() < alertDismissedUntil) return;
  if (!userLatLng) return;
  const { location, distanceKm } = nearestLocation(userLatLng.lat, userLatLng.lng);
  if (!location || distanceKm > NEAR_ALERT_KM) {
    setAlertBanner(false);
    return;
  }
  const weather = getWeather();
  const hour = getSliderHour();
  let shade = shadeAtHour(location, hour);
  try {
    const r = await fetch(
      `/api/shade/at?lat=${encodeURIComponent(userLatLng.lat)}&lng=${encodeURIComponent(userLatLng.lng)}&hour=${hour}`
    );
    if (r.ok) {
      const j = await r.json();
      if (typeof j.shadeScore === 'number') shade = j.shadeScore;
    }
  } catch (_) {
    /* use shade from nearest location profile */
  }
  const risk = calculateRisk(shade, hour, weather.temperature, weather.uvIndex);
  if (risk.level === 'HIGH') {
    const msg = `High heat stress risk near ${location.name}. Seek shade and hydrate.`;
    setAlertBanner(true, msg);
    persistLastHighRecord({
      at: new Date().toISOString(),
      locationName: location.name,
      message: msg,
      riskScore: risk.score,
      hour,
    });
    renderLastHighAlert();
  } else {
    setAlertBanner(false);
  }
}

function addUserMarker(latlng) {
  const html = `<div class="user-pulse"><div class="user-dot"></div></div>`;
  const icon = L.divIcon({
    className: 'user-marker-wrap',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
  if (userMarker) map.removeLayer(userMarker);
  userMarker = L.marker(latlng, { icon }).addTo(map);
}

function setupGeolocation() {
  if (!navigator.geolocation) {
    map.setView([VAN.lat, VAN.lng], 13);
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => {
      const latlng = L.latLng(pos.coords.latitude, pos.coords.longitude);
      userLatLng = { lat: latlng.lat, lng: latlng.lng };
      addUserMarker(latlng);
      map.panTo(latlng, { animate: true, duration: 0.35 });
    },
    () => {
      userLatLng = null;
      map.setView([VAN.lat, VAN.lng], 13);
    },
    { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
  );
}

function setupMarkerLayers() {
  treeMarkersLayer = L.layerGroup().addTo(map);
  locationMarkersLayer = L.layerGroup().addTo(map);
}

function locationStableId(loc) {
  if (!loc || !loc.coordinates) return '';
  return (
    loc.id ||
    loc._id ||
    `${Number(loc.coordinates.lat).toFixed(5)},${Number(loc.coordinates.lng).toFixed(5)}`
  );
}

function isLocationSelected(loc) {
  if (!selectedLocation || !loc) return false;
  return locationStableId(selectedLocation) === locationStableId(loc);
}

/** Park pin: divIcon HTML (Material-style park glyph). */
function buildParkPinHtml(loc) {
  const selected = isLocationSelected(loc);
  const name = loc.name || 'Park';
  const esc = (s) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  const cls = `park-pin${selected ? ' park-pin--selected' : ''}`;
  return `<div class="${cls}" role="button" aria-label="${esc(name)}">
    <div class="park-pin__inner">
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="M17 12h2L12 2 5.05 12H7l-3.9 6h6.97v4h5.91v-4H22L17 12z"/></svg>
    </div>
    <div class="park-pin__stem" aria-hidden="true"></div>
  </div>`;
}

function parkLocationIcon(loc) {
  return L.divIcon({
    className: 'park-marker-wrap',
    html: buildParkPinHtml(loc),
    iconSize: [44, 52],
    iconAnchor: [22, 50],
    popupAnchor: [0, -46],
  });
}

/** Only show park pins (open data) that intersect the current viewport. */
function refreshLocationMarkersInView() {
  if (!map || !locationMarkersLayer) return;
  locationMarkersLayer.clearLayers();
  const b = map.getBounds();
  getLocationsCache().forEach((loc) => {
    const { lat, lng } = loc.coordinates;
    if (!b.contains(L.latLng(lat, lng))) return;
    const m = L.marker([lat, lng], {
      icon: parkLocationIcon(loc),
      keyboard: true,
      riseOnHover: true,
      zIndexOffset: isLocationSelected(loc) ? 750 : 0,
    });
    m.bindTooltip(loc.name || 'Park', {
      direction: 'top',
      sticky: true,
      opacity: 1,
      className: 'park-marker-tooltip',
    });
    m.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      openDetailSheet(loc);
    });
    m.addTo(locationMarkersLayer);
  });
}

/** Load Vancouver open-data trees visible in the current bbox (updates when you pan/zoom). */
async function refreshTreeMarkersInView() {
  if (!map || !treeMarkersLayer) return;
  const gen = ++treeFetchGeneration;
  const bounds = map.getBounds();
  const s = bounds.getSouth();
  const w = bounds.getWest();
  const n = bounds.getNorth();
  const e = bounds.getEast();
  try {
    const r = await fetch(
      `/api/trees/bounds?south=${encodeURIComponent(s)}&west=${encodeURIComponent(w)}&north=${encodeURIComponent(n)}&east=${encodeURIComponent(e)}&limit=350`
    );
    if (gen !== treeFetchGeneration) return;
    if (!r.ok) throw new Error('trees bounds');
    const data = await r.json();
    if (gen !== treeFetchGeneration) return;
    treeMarkersLayer.clearLayers();
    (data.trees || []).forEach((t) => {
      L.circleMarker([t.lat, t.lng], {
        radius: 4,
        color: '#1b5e20',
        weight: 1,
        fillColor: '#43a047',
        fillOpacity: 0.5,
      })
        .bindTooltip('City tree (open data)', { direction: 'top', sticky: true })
        .addTo(treeMarkersLayer);
    });
  } catch {
    if (gen === treeFetchGeneration) treeMarkersLayer.clearLayers();
  }
}

const debouncedRefreshMapPoints = debounce(() => {
  refreshLocationMarkersInView();
  refreshTreeMarkersInView();
}, 280);

function setupMapShell() {
  map = L.map('map', { zoomControl: true }).setView([VAN.lat, VAN.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap',
  }).addTo(map);

  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-heat-legend');
    div.innerHTML = `
      <div class="map-heat-legend__title">Heat layer</div>
      <div class="map-heat-legend__gradient" aria-hidden="true"></div>
      <div class="map-heat-legend__labels"><span>More shade</span><span>More sun / heat</span></div>
      <p class="map-heat-legend__note">Green dots = city trees in the current view (updates when you pan or zoom). Green pins = Vancouver parks from the City «parks» open dataset. Heat uses shade scores, sun angle, and the time slider — plus community pins.</p>
    `;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);
    return div;
  };
  legend.addTo(map);

  map.on('click', () => closeDetailSheet());

  setupMarkerLayers();
  map.on('moveend zoomend', debouncedRefreshMapPoints);
}

function setupTimeSlider() {
  const slider = document.getElementById('time-slider');
  const label = document.getElementById('time-display');
  const sunLabel = document.getElementById('sun-angle-display');
  if (!slider) return;
  const tick = async () => {
    const h = Number(slider.value);
    if (label) label.textContent = formatHour12(h);
    if (sunLabel) sunLabel.textContent = `${Math.round(getSunAngle(h))}° sun`;
    await updateHeatmap(h);
    refreshOpenSheet();
    evaluateUserRisk();
  };
  slider.addEventListener('input', tick);
  slider.value = String(getVancouverNowHour());
  tick();
}

function setupSheetChrome() {
  const back = document.getElementById('sheet-back');
  back?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeDetailSheet();
  });
  document.getElementById('alert-dismiss')?.addEventListener('click', () => {
    alertDismissedUntil = Date.now() + 5 * 60 * 1000;
    setAlertBanner(false);
  });
}

function showMapTab() {
  document.getElementById('alerts-view')?.classList.add('d-none');
  document.getElementById('map-wrap')?.classList.remove('d-none');
  document.querySelectorAll('.bottom-nav .nav-item').forEach((el) => el.classList.remove('active'));
  document.getElementById('nav-tab-map')?.classList.add('active');
  document.body.classList.remove('shadesafe-alerts-view');
  setTimeout(() => {
    map?.invalidateSize();
    debouncedRefreshMapPoints();
  }, 150);
}

function showAlertsTab() {
  closeDetailSheet();
  document.getElementById('map-wrap')?.classList.add('d-none');
  document.getElementById('alerts-view')?.classList.remove('d-none');
  document.querySelectorAll('.bottom-nav .nav-item').forEach((el) => el.classList.remove('active'));
  document.getElementById('nav-tab-alerts')?.classList.add('active');
  document.body.classList.add('shadesafe-alerts-view');
  renderLastHighAlert();
}

function setupBottomNav() {
  document.getElementById('nav-tab-map')?.addEventListener('click', (e) => {
    e.preventDefault();
    showMapTab();
  });
  document.getElementById('nav-tab-alerts')?.addEventListener('click', (e) => {
    e.preventDefault();
    showAlertsTab();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  const sliderPre = document.getElementById('time-slider');
  if (sliderPre) sliderPre.value = String(getVancouverNowHour());
  await Promise.all([loadWeather(), loadDataHealth()]);
  setInterval(loadWeather, 10 * 60 * 1000);
  setInterval(loadDataHealth, 15 * 60 * 1000);
  setupMapShell();
  await initHeatmap(map);
  reportsCache = getHeatmapReports();
  refreshLocationMarkersInView();
  refreshTreeMarkersInView();
  setupGeolocation();
  setupTimeSlider();
  setupSheetChrome();
  setupBottomNav();
  renderLastHighAlert();

  setInterval(evaluateUserRisk, 30000);
  evaluateUserRisk();

  window.addEventListener('shadesafe:reports-updated', () => {
    reportsCache = getHeatmapReports();
    refreshOpenSheet();
  });

  /** Default: always Map. Optional one-shot deep link: ?panel=alerts | ?panel=report (then strip from URL). */
  const params = new URLSearchParams(window.location.search);
  const panel = (params.get('panel') || '').toLowerCase();
  if (panel === 'alerts') {
    showAlertsTab();
    params.delete('panel');
    const q = params.toString();
    history.replaceState(null, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
  } else if (panel === 'report') {
    setTimeout(() => document.getElementById('fab-report')?.click(), 400);
    params.delete('panel');
    const q = params.toString();
    history.replaceState(null, '', q ? `${window.location.pathname}?${q}` : window.location.pathname);
  } else {
    showMapTab();
  }

  if (window.location.hash) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
  }
});
