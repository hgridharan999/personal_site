import { mean, stdDev } from './stats.js';

// Zetamac fact keys (spec §4.3) and drill weakness ranking (spec §4.4).
// Shared by the drill API (server) and the drill generator (client).

export const DRILL_UNLOCK_GAMES = 3;
export const DRILL_RECENT_GAMES = 20;
export const DRILL_POOL_SIZE = 40;

const FACT = /^(add|sub|mul|div):(\d+)([+\-x/])(\d+)$/;
const OPERATOR = { add: '+', sub: '-', mul: 'x', div: '/' };

export function parseFactKey(key) {
  const m = typeof key === 'string' ? FACT.exec(key) : null;
  if (!m || OPERATOR[m[1]] !== m[3]) return null;
  const [op, x, y] = [m[1], Number(m[2]), Number(m[4])];
  switch (op) {
    case 'add':
    case 'mul':
      return { op, a: x, b: y };
    case 'sub':
      return x >= y ? { op, a: y, b: x - y } : null;
    case 'div':
      return y !== 0 && x % y === 0 ? { op, a: y, b: x / y } : null;
    default:
      return null;
  }
}

export function countCarries(a, b) {
  let carries = 0;
  let carry = 0;
  while (a > 0 || b > 0) {
    carry = (a % 10) + (b % 10) + carry >= 10 ? 1 : 0;
    carries += carry;
    a = Math.floor(a / 10);
    b = Math.floor(b / 10);
  }
  return carries;
}

export function rankWeakFacts(rows, limit = DRILL_POOL_SIZE) {
  const byType = new Map();
  for (const r of rows) byType.set(r.qtype, [...(byType.get(r.qtype) || []), r.medianMs]);
  const moments = new Map([...byType].map(([qtype, ms]) => [qtype, { m: mean(ms), sd: stdDev(ms) }]));

  return rows
    .map((r) => {
      const { m, sd } = moments.get(r.qtype);
      const z = sd ? (r.medianMs - m) / sd : 0;
      return { ...r, weakness: z + 1.5 * r.correctionsRate };
    })
    .sort((x, y) => y.weakness - x.weakness)
    .slice(0, limit);
}

// Display form of a fact key, matching the Zetamac prompt format (en dash for subtraction).
export function factPrompt(key) {
  const f = parseFactKey(key);
  if (!f) return key;
  const { a, b } = f;
  switch (f.op) {
    case 'add': return `${a} + ${b}`;
    case 'sub': return `${a + b} – ${a}`;
    case 'mul': return `${a} × ${b}`;
    default: return `${a * b} ÷ ${a}`;
  }
}
