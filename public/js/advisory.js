import { getSunAngle } from './risk.js';

/**
 * Short, location-specific outing guidance from model + forecast (not medical advice).
 * @param {object} p
 * @param {'HIGH'|'MODERATE'|'LOW'} p.riskLevel
 * @param {number} p.riskScore
 * @param {number} p.temperature
 * @param {number} p.humidity
 * @param {number} p.uvIndex
 * @param {number} p.shadePct 0–100
 * @param {number} p.hour 0–23 Vancouver slider hour
 */
export function buildTripAdvisory(p) {
  const {
    riskLevel,
    riskScore,
    temperature,
    humidity,
    uvIndex,
    shadePct,
    hour,
  } = p;
  const sun = getSunAngle(hour);
  const shade = Math.max(0, Math.min(100, shadePct));
  const uv = Number(uvIndex) || 0;
  const temp = Number(temperature) || 0;
  const hum = Number(humidity) || 0;
  const score = Number(riskScore) || 0;

  let verdict = '';
  let summary = '';

  if (riskLevel === 'HIGH') {
    verdict = 'Not ideal for long outdoor visits';
    summary = `Heat-stress risk is high at this hour (score ${score.toFixed(0)}). Sun, temperature, UV, and limited shade combine to make extended exposure uncomfortable or unsafe for many people.`;
  } else if (riskLevel === 'MODERATE') {
    verdict = 'Okay to visit — use caution';
    summary = `Conditions are manageable for shorter visits (score ${score.toFixed(0)}), but sun and warmth still add up. Plan breaks and shade, especially if you are sensitive to heat.`;
  } else {
    verdict = 'Generally good to go';
    summary = `Risk looks low at this hour (score ${score.toFixed(0)}). Still use common sense: water, sun protection if UV is up, and listen to your body.`;
  }

  if (sun < 8) {
    summary += ' With little direct sun now, heat stress is driven more by temperature and humidity than by solar load.';
  } else if (shade < 35 && sun >= 25) {
    summary += ' This pin looks relatively exposed at this time — shade along your route matters.';
  } else if (shade >= 55) {
    summary += ' Modelled shade here is fairly strong for this hour, which helps offset sun and warmth.';
  }

  const tips = [];
  const add = (t) => {
    if (t && !tips.includes(t)) tips.push(t);
  };

  if (riskLevel === 'HIGH') {
    add('Keep visits short; take frequent breaks in deep shade or indoors.');
    add('Drink water before you feel thirsty; add electrolytes if you sweat a lot.');
    add('Postpone strenuous exercise; children, older adults, and chronic conditions need extra care.');
  } else if (riskLevel === 'MODERATE') {
    add('Wear breathable clothing; rotate between sun and shade.');
    add('Carry water and sip regularly.');
  } else {
    add('Bring water anyway on warm days.');
  }

  if (sun >= 15 && uv >= 3) {
    add('Use broad-spectrum sunscreen (SPF 30+), hat, and sunglasses when UV is elevated.');
  }
  if (uv >= 6) {
    add('UV is strong — reapply sunscreen every ~2 hours if you stay out.');
  }
  if (temp >= 28) {
    add('Air temperature is quite warm — prioritize shade and hydration.');
  }
  if (hum >= 75 && temp >= 22) {
    add('High humidity can make it feel harder to cool down; slow your pace.');
  }
  if (shade < 30 && sun >= 20) {
    add('Expect limited shade here at this hour — consider timing your visit earlier or later.');
  }

  while (tips.length > 6) tips.pop();

  return { verdict, summary, tips };
}
