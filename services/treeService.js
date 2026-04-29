const TREES_BASE =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records';

let cachedTrees = [];

function mapTreeRecord(r) {
  const g = r.geo_point_2d;
  if (!g) return null;
  const lat = g.lat;
  const lng = g.lon != null ? g.lon : g.lng;
  if (lat == null || lng == null || lat === 0 || lng === 0) return null;
  return {
    lat: Number(lat),
    lng: Number(lng),
    diameter: Number(r.diameter_cm) || 10,
    height: Number(r.height_m) || 3,
  };
}

async function fetchVancouverTrees() {
  try {
    const offsets = [0, 100, 200, 300, 400];
    const pages = await Promise.all(
      offsets.map((offset) => {
        const qs = new URLSearchParams({
          limit: '100',
          where: 'geo_point_2d is not null',
          offset: String(offset),
        });
        return fetch(`${TREES_BASE}?${qs}`).then((res) => {
          if (!res.ok) throw new Error(`trees ${res.status}`);
          return res.json();
        });
      })
    );
    const merged = pages.flatMap((p) => p.results || []);
    cachedTrees = merged.map(mapTreeRecord).filter(Boolean);
    console.log(`[trees] loaded ${cachedTrees.length} public trees`);
  } catch (err) {
    console.warn('[trees] fetch failed, using empty cache:', err.message || err);
    cachedTrees = [];
  }
}

function getCachedTrees() {
  return cachedTrees;
}

/**
 * Trees whose coordinates fall inside the map viewport (for client markers).
 * @param {number} limit max points returned (cap performance)
 */
function getTreesInBounds(south, west, north, east, limit = 200) {
  const s = Number(south);
  const w = Number(west);
  const n = Number(north);
  const e = Number(east);
  if ([s, w, n, e].some((x) => Number.isNaN(x))) return [];
  if (s >= n || w >= e) return [];
  if (n - s > 2.5 || e - w > 3.5) return [];
  const cap = Math.min(500, Math.max(1, Number(limit) || 200));
  const out = [];
  for (const t of cachedTrees) {
    if (t.lat >= s && t.lat <= n && t.lng >= w && t.lng <= e) {
      out.push({ lat: t.lat, lng: t.lng });
      if (out.length >= cap) break;
    }
  }
  return out;
}

module.exports = {
  fetchVancouverTrees,
  getCachedTrees,
  getTreesInBounds,
};
