import { refreshAfterReport } from './heatmap.js';

const MODAL_ID = 'reportModal';
const TOAST_ID = 'report-toast';
const ALERT_ID = 'report-error-alert';
const TOAST_VISIBLE_CLASS = 'report-toast--visible';
/** Avoid clashing with Bootstrap’s `.show`; keep timer off the DOM node. */
let toastHideTimer = null;
const TOAST_MS = 3200;

function showToast(message) {
  let el = document.getElementById(TOAST_ID);
  if (!el) {
    el = document.createElement('div');
    el.id = TOAST_ID;
    el.className = 'report-toast';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.setAttribute('aria-hidden', 'false');
  el.classList.add(TOAST_VISIBLE_CLASS);
  clearTimeout(toastHideTimer);
  toastHideTimer = setTimeout(() => {
    toastHideTimer = null;
    el.classList.remove(TOAST_VISIBLE_CLASS);
    el.setAttribute('aria-hidden', 'true');
  }, TOAST_MS);
}

function getSelectedReportType() {
  const selected = document.querySelector('#reportModal .report-option.selected');
  return selected ? selected.dataset.reportType : null;
}

function setModalError(visible, msg) {
  const box = document.getElementById(ALERT_ID);
  if (!box) return;
  box.textContent = msg || 'Could not submit. Check your connection.';
  box.classList.toggle('d-none', !visible);
}

function getCoordsFromNavigator() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no geo'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('denied')),
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 12000 }
    );
  });
}

/** Prefer live GPS; otherwise same stand-in as the map (see map.js MOCK_USER_LOCATION). */
async function resolveCoordsForReport() {
  try {
    return await getCoordsFromNavigator();
  } catch {
    const u = window.__shadeSafeUserLatLng;
    if (u && Number.isFinite(u.lat) && Number.isFinite(u.lng)) {
      return { lat: u.lat, lng: u.lng };
    }
    const m = window.__shadeSafeMockUserLatLng;
    if (m && Number.isFinite(m.lat) && Number.isFinite(m.lng)) {
      return { lat: m.lat, lng: m.lng };
    }
    throw new Error('no position');
  }
}

function setupOptionCards() {
  const modal = document.getElementById(MODAL_ID);
  if (!modal) return;
  modal.querySelectorAll('.report-option').forEach((card) => {
    card.addEventListener('click', () => {
      modal.querySelectorAll('.report-option').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });
}

function setupSubmit() {
  const btn = document.getElementById('report-submit-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    setModalError(false);
    const reportType = getSelectedReportType();
    if (!reportType) {
      setModalError(true, 'Please choose a report type.');
      return;
    }
    let coords;
    try {
      coords = await resolveCoordsForReport();
    } catch {
      setModalError(true, 'Could not determine location. Reload the page and try again.');
      return;
    }
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportType, coordinates: coords }),
      });
      if (!res.ok) throw new Error('bad status');
      const modalEl = document.getElementById(MODAL_ID);
      if (modalEl && window.bootstrap) {
        const inst = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        inst.hide();
      }
      modalEl?.querySelectorAll('.report-option').forEach((c) => c.classList.remove('selected'));
      showToast('Report submitted! Your pin is live on the map.');
      await refreshAfterReport();
      window.dispatchEvent(new CustomEvent('shadesafe:reports-updated'));
    } catch {
      setModalError(true, 'Could not submit. Check your connection.');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupOptionCards();
  setupSubmit();
  function openReportModal() {
    const modalEl = document.getElementById(MODAL_ID);
    if (!modalEl || !window.bootstrap) return;
    setModalError(false);
    let inst = bootstrap.Modal.getInstance(modalEl);
    if (!inst) inst = new bootstrap.Modal(modalEl);
    inst.show();
  }

  const fab = document.getElementById('fab-report');
  if (fab) fab.addEventListener('click', openReportModal);
});
