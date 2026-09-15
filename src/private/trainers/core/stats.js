const WEEK_MS = 7 * 86400000;
const MIN_TREND_POINTS = 5;
const MIN_TREND_SPAN_MS = 3 * 86400000;

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

export const median = (values) => percentile(values, 50);

export function stdDev(values) {
  if (values.length < 2) return null;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

export function rollingAverage(values, window) {
  return values.map((_, i) => mean(values.slice(Math.max(0, i - window + 1), i + 1)));
}

export function trendPerWeek(points) {
  if (points.length < MIN_TREND_POINTS) return null;
  const ts = points.map((p) => p.t);
  if (Math.max(...ts) - Math.min(...ts) < MIN_TREND_SPAN_MS) return null;
  const mt = mean(ts);
  const my = mean(points.map((p) => p.y));
  let num = 0;
  let den = 0;
  for (const { t, y } of points) {
    num += (t - mt) * (y - my);
    den += (t - mt) ** 2;
  }
  return den === 0 ? null : (num / den) * WEEK_MS;
}

export function localDayKey(t) {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function bestPerDay(points, dayKey = localDayKey) {
  const best = new Map();
  for (const { t, y } of points) {
    const day = dayKey(t);
    if (!best.has(day) || y > best.get(day)) best.set(day, y);
  }
  return [...best.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, y]) => ({ day, y }));
}
