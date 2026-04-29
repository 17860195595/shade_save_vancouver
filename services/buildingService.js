const BUILDINGS_BASE =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/building-footprints-2009/records';

let cachedBuildings = [];

function buildingHeightM(r) {
  const h =
    Number(r.hgt_agl) ||
    Number(r.avght_m) ||
    Number(r.maxht_m) ||
    Number(r.minht_m) ||
    5;
  return Math.max(1, h);
}

function mapBuildingRecord(r) {
  const g = r.geo_point_2d;
  if (!g) return null;
  const lat = g.lat;
  const lng = g.lon != null ? g.lon : g.lng;
  if (lat == null || lng == null || lat === 0 || lng === 0) return null;
  return {
    lat: Number(lat),
    lng: Number(lng),
    height: buildingHeightM(r),
  };
}

async function fetchVancouverBuildings() {
  try {
    const offsets = [0, 100, 200, 300, 400];
    const pages = await Promise.all(
      offsets.map((offset) => {
        const qs = new URLSearchParams({
          limit: '100',
          where: 'geom is not null',
          offset: String(offset),
        });
        return fetch(`${BUILDINGS_BASE}?${qs}`).then((res) => {
          if (!res.ok) throw new Error(`buildings ${res.status}`);
          return res.json();
        });
      })
    );
    const merged = pages.flatMap((p) => p.results || []);
    cachedBuildings = merged.map(mapBuildingRecord).filter(Boolean);
    console.log(`[buildings] loaded ${cachedBuildings.length} footprints`);
  } catch (err) {
    console.warn('[buildings] fetch failed, using empty cache:', err.message || err);
    cachedBuildings = [];
  }
}

function getCachedBuildings() {
  return cachedBuildings;
}

module.exports = {
  fetchVancouverBuildings,
  getCachedBuildings,
};
