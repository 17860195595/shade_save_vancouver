export function kmBetween(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** @param {Array<{ coordinates: { lat: number, lng: number } }>} locs */
export function nearestLocation(locs, lat, lng) {
  let best = null;
  let bestD = Infinity;
  for (const loc of locs) {
    const d = kmBetween({ lat, lng }, { lat: loc.coordinates.lat, lng: loc.coordinates.lng });
    if (d < bestD) {
      bestD = d;
      best = loc;
    }
  }
  return { location: best, distanceKm: bestD };
}
