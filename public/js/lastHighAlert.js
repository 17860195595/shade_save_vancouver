import { timeAgo } from './lib/formatTime.js';

const LAST_HIGH_STORAGE_KEY = 'shadesafe:lastHighAlert';

export function persistLastHighRecord(payload) {
  try {
    localStorage.setItem(LAST_HIGH_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {
    /* private mode / quota */
  }
}

export function renderLastHighAlert() {
  const body = document.getElementById('last-high-body');
  if (!body) return;
  try {
    const raw = localStorage.getItem(LAST_HIGH_STORAGE_KEY);
    if (!raw) {
      body.innerHTML =
        '<span class="text-muted">No HIGH reading saved yet. On the <strong>Map</strong> tab, allow location and stay within ~850 m of a park pin; when the model flags HIGH, we store the latest event here (this device only).</span>';
      return;
    }
    const d = JSON.parse(raw);
    const msg = typeof d.message === 'string' ? d.message : 'High heat stress risk.';
    const loc = typeof d.locationName === 'string' ? d.locationName : 'Unknown area';
    const score = d.riskScore != null ? Number(d.riskScore).toFixed(1) : '—';
    const when = d.at ? timeAgo(d.at) : 'unknown time';
    const hourNote =
      typeof d.hour === 'number' ? ` · slider hour ${d.hour}:00 (Vancouver clock)` : '';
    body.innerHTML = '';
    const lead = document.createElement('p');
    lead.className = 'mb-2';
    lead.textContent = msg;
    body.appendChild(lead);
    const meta = document.createElement('p');
    meta.className = 'small text-muted mb-0';
    meta.textContent = `Near ${loc} · ${when} · stress index ${score}${hourNote}`;
    body.appendChild(meta);
  } catch {
    body.innerHTML = '<span class="text-danger small">Could not read saved alert.</span>';
  }
}
