export const formatSeconds = (ms, digits = 2) => (ms == null ? '—' : `${(ms / 1000).toFixed(digits)} s`);

export function formatClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const formatPercent = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export const formatDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
