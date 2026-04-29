export function formatHour12(h) {
  const hour = Number(h);
  const am = hour < 12;
  const h12 = hour % 12 || 12;
  return `${h12}${am ? ' AM' : ' PM'}`;
}

export function timeAgo(iso) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
