let currentWeather = {
  temperature: 22,
  humidity: 65,
  uvIndex: 5,
  source: 'fallback',
  cachedAt: null,
};

const WX_CLIENT_TTL_MS = 8 * 60 * 1000;
let wxClientCache = null; // { key, at, row }

function weatherGridKey(lat, lng) {
  return `${Number(lat).toFixed(2)},${Number(lng).toFixed(2)}`;
}

function sliceWeatherForHour(base, hour) {
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const slot = base.hourlyToday && base.hourlyToday[h];
  const out = { ...base, weatherScope: 'hourly', localHour: h };
  if (slot && typeof slot.temperature === 'number') {
    out.temperature = slot.temperature;
    out.humidity = typeof slot.humidity === 'number' ? slot.humidity : base.humidity;
    out.uvIndex = typeof slot.uvIndex === 'number' ? slot.uvIndex : base.uvIndex;
  }
  return out;
}

export function getWeather() {
  return currentWeather;
}

export function weatherFootnote(w) {
  if (w.source !== 'open-meteo') {
    return 'Offline placeholder (API unavailable)';
  }
  const la = typeof w.queryLatitude === 'number' ? w.queryLatitude : null;
  const ln = typeof w.queryLongitude === 'number' ? w.queryLongitude : null;
  const where =
    la != null && ln != null ? `${la.toFixed(2)}°, ${ln.toFixed(2)}°` : 'Vancouver core';
  if (w.weatherScope === 'hourly' && typeof w.localHour === 'number') {
    return `Open-Meteo · ${where} · hourly forecast ${String(w.localHour).padStart(2, '0')}:00 (Vancouver date)`;
  }
  return `Open-Meteo · ${where} · current conditions`;
}

/** @param {any} weather API payload with optional hourlyToday[0..23] */
export function weatherAtHourForRisk(weather, h) {
  const slot = weather.hourlyToday && weather.hourlyToday[h];
  if (slot && typeof slot.temperature === 'number') {
    return {
      temperature: slot.temperature,
      humidity: typeof slot.humidity === 'number' ? slot.humidity : weather.humidity,
      uvIndex: typeof slot.uvIndex === 'number' ? slot.uvIndex : weather.uvIndex,
    };
  }
  return {
    temperature: weather.temperature,
    humidity: weather.humidity,
    uvIndex: weather.uvIndex,
  };
}

export async function loadWeather() {
  try {
    const r = await fetch('/api/weather');
    if (!r.ok) throw new Error('bad status');
    const data = await r.json();
    currentWeather = {
      temperature: data.temperature,
      humidity: data.humidity,
      uvIndex: data.uvIndex,
      source: data.source || 'open-meteo',
      cachedAt: data.cachedAt || null,
    };
  } catch (e) {
    console.warn('Weather fetch failed:', e);
    currentWeather = {
      temperature: 22,
      humidity: 65,
      uvIndex: 5,
      source: 'fallback',
      cachedAt: null,
    };
  }
}

export async function fetchWeatherForPin(lat, lng, hour) {
  const h = Math.max(0, Math.min(23, Number(hour) || 0));
  const key = weatherGridKey(lat, lng);
  const now = Date.now();
  if (
    wxClientCache &&
    wxClientCache.key === key &&
    now - wxClientCache.at < WX_CLIENT_TTL_MS &&
    Array.isArray(wxClientCache.row.hourlyToday)
  ) {
    return sliceWeatherForHour(wxClientCache.row, h);
  }
  try {
    const r = await fetch(
      `/api/weather?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&hour=${encodeURIComponent(h)}`
    );
    if (!r.ok) throw new Error('bad status');
    const row = await r.json();
    if (row.source === 'open-meteo' && Array.isArray(row.hourlyToday)) {
      wxClientCache = { key, at: now, row: { ...row } };
    }
    return row;
  } catch (e) {
    console.warn('Weather fetch for pin failed:', e);
    return getWeather();
  }
}
