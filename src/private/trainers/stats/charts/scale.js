export function extent(values) {
  if (!values.length) return null;
  return [Math.min(...values), Math.max(...values)];
}

export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  return (v) => (span === 0 ? (r0 + r1) / 2 : r0 + ((v - d0) / span) * (r1 - r0));
}

export function niceStep(raw) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / pow;
  for (const m of [1, 2, 5, 10]) {
    if (fraction <= m + 1e-9) return m * pow;
  }
  return 10 * pow;
}

export function niceTicks(min, max, count = 4) {
  let lo = min;
  let hi = max;
  if (lo === hi) {
    const pad = Math.abs(lo) || 1;
    lo -= pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / count);
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 1e9) / 1e9);
  return ticks;
}
