/**
 * Vancouver park points — 100% from City of Vancouver Open Data
 * Dataset: https://opendata.vancouver.ca/explore/dataset/parks/
 */
const PARKS_BASE =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/parks/records';

let cachedParkLocations = [];

function mapParkRecord(r) {
  const g = r.googlemapdest;
  if (!g || g.lat == null || g.lon == null) return null;
  const lat = Number(g.lat);
  const lng = Number(g.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) {
    return null;
  }
  const parkid = Number(r.parkid);
  if (!Number.isFinite(parkid)) return null;
  const id = `park-${parkid}`;
  return {
    _id: id,
    id,
    parkid,
    name: (r.name && String(r.name).trim()) || 'Park',
    borough: (r.neighbourhoodname && String(r.neighbourhoodname).trim()) || '',
    type: 'park',
    coordinates: { lat, lng },
    dataSource: 'opendata.vancouver.ca/parks',
  };
}

async function fetchVancouverParkLocations() {
  try {
    const first = await fetch(`${PARKS_BASE}?limit=1`).then((res) => {
      if (!res.ok) throw new Error(`parks ${res.status}`);
      return res.json();
    });
    const total = Math.min(Number(first.total_count) || 300, 500);
    const offsets = [];
    for (let o = 0; o < total; o += 100) offsets.push(o);

    const pages = await Promise.all(
      offsets.map((offset) =>
        fetch(`${PARKS_BASE}?limit=100&offset=${offset}`).then((res) => {
          if (!res.ok) throw new Error(`parks ${res.status}`);
          return res.json();
        })
      )
    );
    const merged = pages.flatMap((p) => p.results || []);
    const mapped = merged.map(mapParkRecord).filter(Boolean);
    const seen = new Set();
    cachedParkLocations = mapped.filter((p) => {
      if (seen.has(p.parkid)) return false;
      seen.add(p.parkid);
      return true;
    });
    console.log(
      `[parks] loaded ${cachedParkLocations.length} park locations from open data (dataset: parks)`
    );
  } catch (err) {
    console.warn('[parks] open-data location fetch failed:', err.message || err);
    cachedParkLocations = [];
  }
}

function getCachedParkLocations() {
  return cachedParkLocations;
}

function getParkLocationByParamId(paramId) {
  const raw = String(paramId);
  const parkid = parseInt(raw.startsWith('park-') ? raw.slice(5) : raw, 10);
  if (Number.isNaN(parkid)) return null;
  return cachedParkLocations.find((p) => p.parkid === parkid) || null;
}

module.exports = {
  fetchVancouverParkLocations,
  getCachedParkLocations,
  getParkLocationByParamId,
};
