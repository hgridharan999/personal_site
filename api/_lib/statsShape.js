import { parseFactKey, countCarries } from '../../src/private/trainers/core/facts.js';

export function factModesFor(mode) {
  return mode === 'standard' ? ['standard', 'drill'] : [mode];
}

export function timesGrid(rows) {
  return rows.flatMap((r) => {
    const f = parseFactKey(r.factKey);
    return f && f.op === 'mul' && f.b <= 20 ? [{ a: f.a, b: f.b, n: r.n, medianMs: r.medianMs }] : [];
  });
}

export function carriesBreakdown(rows) {
  const groups = new Map();
  for (const r of rows) {
    const f = parseFactKey(r.factKey);
    if (!f || (f.op !== 'add' && f.op !== 'sub')) continue;
    const key = `${r.qtype}|${countCarries(f.a, f.b)}`;
    const g = groups.get(key) || { qtype: r.qtype, carries: countCarries(f.a, f.b), n: 0, totalMs: 0 };
    g.n += r.n;
    g.totalMs += r.totalMs;
    groups.set(key, g);
  }
  return [...groups.values()]
    .map(({ qtype, carries, n, totalMs }) => ({ qtype, carries, n, meanMs: totalMs / n }))
    .sort((x, y) => x.qtype.localeCompare(y.qtype) || x.carries - y.carries);
}
