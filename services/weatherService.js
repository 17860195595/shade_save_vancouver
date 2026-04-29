const DOWNTOWN_LAT = 49.2827;
const DOWNTOWN_LNG = -123.1207;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 48;

const cache = new Map(); // key -> { bundle, fetchedAt }
/** In-flight Open-Meteo fetches per grid cell (coalesce parallel misses). */
const openMeteoInflight = new Map();

function normalizeCoords(lat, lng) {
  const la = parseFloat(lat);
  const ln = parseFloat(lng);
  if (
    Number.isFinite(la) &&
    Number.isFinite(ln) &&
    la >= -90 &&
    la <= 90 &&
    ln >= -180 &&
    ln <= 180
  ) {
    return { lat: la, lng: ln };
  }
  return { lat: DOWNTOWN_LAT, lng: DOWNTOWN_LNG };
}

function cacheKey(lat, lng) {
  const { lat: la, lng: ln } = normalizeCoords(lat, lng);
  return `${la.toFixed(2)},${ln.toFixed(2)}`;
}

function trimCache() {
  while (cache.size > MAX_CACHE_ENTRIES) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
}

function vancouverYmdString() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Vancouver',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year').value;
  const mo = parts.find((p) => p.type === 'month').value;
  const d = parts.find((p) => p.type === 'day').value;
  return `${y}-${mo}-${d}`;
}

/** Open-Meteo returns local wall time without Z; parse as plain Y-M-DTHH:mm. */
function parseOpenMeteoLocalTime(iso) {
  const s = String(iso);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], h: parseInt(m[4], 10) };
}

function buildHourlyToday(hourly, currentFlat) {
  const today = vancouverYmdString();
  const out = Array.from({ length: 24 }, () => null);
  const times = hourly?.time || [];
  const t2 = hourly?.temperature_2m || [];
  const rh = hourly?.relative_humidity_2m || [];
  const uv = hourly?.uv_index || [];
  for (let i = 0; i < times.length; i += 1) {
    const p = parseOpenMeteoLocalTime(times[i]);
    if (!p || `${p.y}-${p.mo}-${p.d}` !== today) continue;
    if (p.h < 0 || p.h > 23) continue;
    out[p.h] = {
      temperature: t2[i],
      humidity: rh[i],
      uvIndex: uv[i] != null ? uv[i] : 0,
    };
  }
  const fill = {
    temperature: currentFlat.temperature,
    humidity: currentFlat.humidity,
    uvIndex: currentFlat.uvIndex,
  };
  for (let h = 0; h < 24; h += 1) {
    const slot = out[h];
    if (slot == null) {
      out[h] = { ...fill };
    } else {
      if (slot.temperature == null) slot.temperature = fill.temperature;
      if (slot.humidity == null) slot.humidity = fill.humidity;
      if (slot.uvIndex == null) slot.uvIndex = fill.uvIndex;
    }
  }
  return out;
}

function pickFromHourlyToday(hourlyToday, h, currentFlat) {
  const hh = Math.max(0, Math.min(23, Number(h) || 0));
  const slot = hourlyToday[hh];
  if (slot && typeof slot.temperature === 'number') {
    return {
      temperature: slot.temperature,
      humidity: typeof slot.humidity === 'number' ? slot.humidity : currentFlat.humidity,
      uvIndex: typeof slot.uvIndex === 'number' ? slot.uvIndex : currentFlat.uvIndex,
    };
  }
  return { ...currentFlat };
}

function parseHourQuery(q) {
  if (q === undefined || q === '') return null;
  const n = parseInt(q, 10);
  if (Number.isNaN(n) || n < 0 || n > 23) return null;
  return n;
}

const FALLBACK = (lat, lng) => {
  const { lat: la, lng: ln } = normalizeCoords(lat, lng);
  const fill = { temperature: 22, humidity: 65, uvIndex: 5 };
  const hourlyToday = Array.from({ length: 24 }, () => ({ ...fill }));
  return {
    temperature: fill.temperature,
    humidity: fill.humidity,
    uvIndex: fill.uvIndex,
    source: 'fallback',
    cachedAt: new Date().toISOString(),
    queryLatitude: la,
    queryLongitude: ln,
    weatherScope: 'fallback',
    localHour: null,
    hourlyToday,
  };
};

function buildUrl(lat, lng) {
  const { lat: la, lng: ln } = normalizeCoords(lat, lng);
  return (
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${encodeURIComponent(la)}&longitude=${encodeURIComponent(ln)}` +
    '&current=temperature_2m,relative_humidity_2m,uv_index' +
    '&hourly=temperature_2m,relative_humidity_2m,uv_index' +
    '&forecast_days=3' +
    '&timezone=America%2FVancouver'
  );
}

async function fetchBundle(la, ln) {
  const res = await fetch(buildUrl(la, ln));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  const cur = json.current || {};
  const temperature = cur.temperature_2m;
  const humidity = cur.relative_humidity_2m;
  const uvIndex = cur.uv_index;
  if (temperature == null || humidity == null || uvIndex == null) {
    throw new Error('missing current fields');
  }
  const currentFlat = { temperature, humidity, uvIndex };
  const hourlyToday = buildHourlyToday(json.hourly, currentFlat);
  return {
    currentFlat,
    hourlyToday,
    cachedAt: new Date().toISOString(),
  };
}

async function fetchBundleDeduped(la, ln) {
  const key = cacheKey(la, ln);
  const pending = openMeteoInflight.get(key);
  if (pending) return pending;
  const p = fetchBundle(la, ln).finally(() => {
    openMeteoInflight.delete(key);
  });
  openMeteoInflight.set(key, p);
  return p;
}

/**
 * @param {string|number|undefined} lat
 * @param {string|number|undefined} lng
 * @param {string|number|undefined} hourQuery 0–23 for hourly slice; omit for “current”
 * @param {{ compact?: boolean }} opts compact: omit hourlyToday (e.g. global /api/weather)
 */
async function getWeather(lat, lng, hourQuery, opts = {}) {
  const { compact = false } = opts;
  const { lat: la, lng: ln } = normalizeCoords(lat, lng);
  const key = cacheKey(la, ln);
  const now = Date.now();
  let row = cache.get(key);
  if (!row || row.bundle.source !== 'open-meteo' || now - row.fetchedAt >= CACHE_TTL_MS) {
    try {
      const bundle = await fetchBundleDeduped(la, ln);
      row = {
        fetchedAt: now,
        bundle: {
          source: 'open-meteo',
          queryLatitude: la,
          queryLongitude: ln,
          ...bundle,
        },
      };
      cache.set(key, row);
      trimCache();
    } catch (err) {
      console.warn('[weather] Open-Meteo fetch failed:', err.message || err);
      return FALLBACK(la, ln);
    }
  }

  const { bundle } = row;
  const currentFlat = bundle.currentFlat;
  const hourlyToday = bundle.hourlyToday;

  if (compact) {
    return {
      temperature: currentFlat.temperature,
      humidity: currentFlat.humidity,
      uvIndex: currentFlat.uvIndex,
      source: 'open-meteo',
      cachedAt: bundle.cachedAt,
      queryLatitude: la,
      queryLongitude: ln,
      weatherScope: 'current',
      localHour: null,
    };
  }

  const h = parseHourQuery(hourQuery);
  let temperature;
  let humidity;
  let uvIndex;
  let weatherScope;
  let localHour = null;

  if (h == null) {
    temperature = currentFlat.temperature;
    humidity = currentFlat.humidity;
    uvIndex = currentFlat.uvIndex;
    weatherScope = 'current';
    localHour = null;
  } else {
    const picked = pickFromHourlyToday(hourlyToday, h, currentFlat);
    temperature = picked.temperature;
    humidity = picked.humidity;
    uvIndex = picked.uvIndex;
    weatherScope = 'hourly';
    localHour = h;
  }

  return {
    temperature,
    humidity,
    uvIndex,
    source: 'open-meteo',
    cachedAt: bundle.cachedAt,
    queryLatitude: la,
    queryLongitude: ln,
    weatherScope,
    localHour,
    hourlyToday,
  };
}

/** @deprecated use getWeather(lat,lng,null,{compact:true}) */
async function getCurrentWeather(lat, lng) {
  return getWeather(lat, lng, null, { compact: true });
}

module.exports = {
  getWeather,
  getCurrentWeather,
};
