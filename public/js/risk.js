const VAN_LAT = 49.2827;
const VAN_LNG = -123.1207;

/**
 * Wall-clock hour 0–23 in America/Vancouver right now (matches server shadeService).
 */
export function getVancouverNowHour() {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Vancouver',
      hour: 'numeric',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .find((p) => p.type === 'hour').value
  );
}

/**
 * UTC Date for today's calendar date in Vancouver at the start of `targetHour` (iterative; same idea as server).
 */
export function dateForVancouverHour(targetHour) {
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

/**
 * Sun elevation 0–90° for Vancouver at the given local clock hour (America/Vancouver), not the browser's time zone.
 */
export function getSunAngle(hour) {
  const h = Number(hour);
  if (typeof SunCalc !== 'undefined') {
    const d = dateForVancouverHour(h);
    const pos = SunCalc.getPosition(d, VAN_LAT, VAN_LNG);
    const altDeg = Math.max(0, (pos.altitude * 180) / Math.PI);
    return Math.min(90, altDeg);
  }
  /* Fallback if SunCalc not loaded */
  if (h < 6 || h > 20) return 0;
  const t = (h - 6) / (20 - 6);
  return 90 * Math.sin(Math.PI * t);
}

export function getMockWeather() {
  return { temperature: 26, uvIndex: 7, humidity: 65 };
}

export function calculateRisk(shadeScore, hour, temperature, uvIndex) {
  const sunAngle = getSunAngle(hour);
  const shade = Math.max(0, Math.min(100, shadeScore));
  const sunFactor = sunAngle / 90 || 0;
  const adjustedHeat = temperature * (1 - (shade / 100) * 0.6) * sunFactor;
  const heatStressIndex =
    adjustedHeat * 0.5 + uvIndex * 3 + (100 - shade) * 0.2;

  if (heatStressIndex > 45) {
    return { level: 'HIGH', color: '#e24b4a', score: heatStressIndex };
  }
  if (heatStressIndex > 25) {
    return { level: 'MODERATE', color: '#ef9f27', score: heatStressIndex };
  }
  return { level: 'LOW', color: '#1d9e75', score: heatStressIndex };
}
