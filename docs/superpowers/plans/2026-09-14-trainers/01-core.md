# Phase 1: Core (Tasks 1–3)

Read `00-overview.md` first, especially Global Constraints and Shared data shapes.

---

### Task 1: Test runner and exact rationals

**Files:**
- Modify: `package.json` (add a `test` script and the `vitest` dev dependency)
- Create: `vitest.config.js`
- Create: `src/private/trainers/core/rational.js`
- Test: `src/private/trainers/core/rational.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (`core/rational.js`), where a Rational is a frozen `{ n: bigint, d: bigint }` with `d > 0n` and `gcd(|n|, d) === 1n`:
  - `rat(n: bigint|number|string, d?: bigint|number|string = 1n): Rational` (throws `RangeError` on d = 0)
  - `add(a, b)`, `sub(a, b)`, `mul(a, b)`, `div(a, b)` each return a Rational (`div` throws `RangeError` when b = 0)
  - `eq(a, b): boolean`
  - `isInteger(r): boolean`
  - `parseRational(input: string): Rational | null` accepts `12`, `-3`, `.5`, `0.50`, `5.`, `3/4`, `-3/4`. Rejects `''`, `-`, `.`, `3/`, `1/0`, `1.2.3`, `3/-4`, and input longer than 32 characters.
  - `fromString(s: string): Rational` behaves like `parseRational` but throws on invalid input (for generator code)
  - `decimalPlaces(r): number | null` returns the number of decimal places, or null if the decimal doesn't terminate
  - `toCanonical(r): string` gives an integer, a terminating decimal with ≤ 4 dp and no trailing zeros, or `n/d`

- [ ] **Step 1: Install Vitest and add the script**

Run: `npm i -D vitest@5.0.0`

Edit `package.json` `"scripts"` to:

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview",
  "test": "vitest run"
}
```

Create `vitest.config.js`. It is separate from `vite.config.js` so the dev API plugin never loads in tests:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'api/**/*.test.js', 'scripts/**/*.test.js'],
  },
});
```

- [ ] **Step 2: Write the failing test**

`src/private/trainers/core/rational.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rat, add, sub, mul, div, eq, isInteger, parseRational, fromString, decimalPlaces, toCanonical } from './rational.js';

describe('rat', () => {
  it('normalizes sign and gcd', () => {
    expect(rat(2n, 4n)).toEqual({ n: 1n, d: 2n });
    expect(rat(3n, -6n)).toEqual({ n: -1n, d: 2n });
    expect(rat(0n, 5n)).toEqual({ n: 0n, d: 1n });
  });
  it('throws on zero denominator', () => {
    expect(() => rat(1n, 0n)).toThrow(RangeError);
  });
});

describe('arithmetic', () => {
  it('adds, subtracts, multiplies, divides exactly', () => {
    expect(add(rat(1n, 4n), rat(2n, 5n))).toEqual({ n: 13n, d: 20n });
    expect(sub(rat(1n, 2n), rat(3n, 4n))).toEqual({ n: -1n, d: 4n });
    expect(mul(rat(3n, 4n), rat(2n, 3n))).toEqual({ n: 1n, d: 2n });
    expect(div(fromString('12.6'), fromString('0.3'))).toEqual({ n: 42n, d: 1n });
    expect(() => div(rat(1n), rat(0n))).toThrow(RangeError);
  });
  it('eq and isInteger', () => {
    expect(eq(rat(2n, 4n), rat(1n, 2n))).toBe(true);
    expect(isInteger(rat(4n, 2n))).toBe(true);
    expect(isInteger(rat(1n, 2n))).toBe(false);
  });
});

describe('parseRational', () => {
  it.each([
    ['12', 12n, 1n], ['-3', -3n, 1n], ['.5', 1n, 2n], ['0.50', 1n, 2n], ['5.', 5n, 1n],
    ['3/4', 3n, 4n], ['-3/4', -3n, 4n], ['2/4', 1n, 2n], [' 7 ', 7n, 1n], ['-0', 0n, 1n], ['0.0140', 7n, 500n],
  ])('parses %s', (input, n, d) => {
    expect(parseRational(input)).toEqual({ n, d });
  });
  it.each(['', '-', '.', '3/', '/4', '1/0', '1.2.3', '3/-4', 'abc', '1e3', '9'.repeat(33)])('rejects %j', (input) => {
    expect(parseRational(input)).toBeNull();
  });
  it('fromString throws on invalid input', () => {
    expect(() => fromString('x')).toThrow();
  });
});

describe('decimalPlaces / toCanonical', () => {
  it('decimalPlaces', () => {
    expect(decimalPlaces(rat(7n))).toBe(0);
    expect(decimalPlaces(fromString('0.05'))).toBe(2);
    expect(decimalPlaces(rat(1n, 3n))).toBeNull();
  });
  it('toCanonical', () => {
    expect(toCanonical(rat(581n))).toBe('581');
    expect(toCanonical(rat(-15n, 2n))).toBe('-7.5');
    expect(toCanonical(fromString('0.0056'))).toBe('0.0056');
    expect(toCanonical(fromString('0.05'))).toBe('0.05');
    expect(toCanonical(rat(13n, 20n))).toBe('0.65');
    expect(toCanonical(rat(1n, 3n))).toBe('1/3');
    expect(toCanonical(fromString('0.00001'))).toBe('1/100000');
  });
});
```

- [ ] **Step 3: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/core/rational.test.js`
Expected: FAIL with `Failed to resolve import "./rational.js"`.

- [ ] **Step 4: Implement**

`src/private/trainers/core/rational.js`:

```js
// Exact rational numbers on BigInt. Correctness of answers is always decided
// here, never with floating point. Values are normalized: d > 0, gcd(|n|, d) = 1.

const abs = (x) => (x < 0n ? -x : x);

function gcd(a, b) {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(n, d = 1n) {
  n = BigInt(n);
  d = BigInt(d);
  if (d === 0n) throw new RangeError('zero denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcd(n, d) || 1n;
  return Object.freeze({ n: n / g, d: d / g });
}

export const add = (a, b) => rat(a.n * b.d + b.n * a.d, a.d * b.d);
export const sub = (a, b) => rat(a.n * b.d - b.n * a.d, a.d * b.d);
export const mul = (a, b) => rat(a.n * b.n, a.d * b.d);
export function div(a, b) {
  if (b.n === 0n) throw new RangeError('division by zero');
  return rat(a.n * b.d, a.d * b.n);
}
export const eq = (a, b) => a.n === b.n && a.d === b.d;
export const isInteger = (r) => r.d === 1n;

const FRACTION = /^(-?\d+)\/(\d+)$/;
const DECIMAL = /^-?(\d+\.?\d*|\.\d+)$/;

export function parseRational(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (s.length === 0 || s.length > 32) return null;

  const f = FRACTION.exec(s);
  if (f) {
    const d = BigInt(f[2]);
    return d === 0n ? null : rat(BigInt(f[1]), d);
  }
  if (!DECIMAL.test(s)) return null;

  const negative = s.startsWith('-');
  const [intPart = '', fracPart = ''] = (negative ? s.slice(1) : s).split('.');
  const value = rat(BigInt((intPart || '0') + fracPart), 10n ** BigInt(fracPart.length));
  return negative ? rat(-value.n, value.d) : value;
}

export function fromString(s) {
  const r = parseRational(s);
  if (!r) throw new Error(`invalid rational: ${s}`);
  return r;
}

export function decimalPlaces(r) {
  let d = r.d;
  let twos = 0;
  let fives = 0;
  while (d % 2n === 0n) { d /= 2n; twos += 1; }
  while (d % 5n === 0n) { d /= 5n; fives += 1; }
  return d === 1n ? Math.max(twos, fives) : null;
}

function toDecimalString(r, dp) {
  const scaled = (r.n * 10n ** BigInt(dp)) / r.d; // exact: r terminates within dp places
  const digits = abs(scaled).toString().padStart(dp + 1, '0');
  const intPart = digits.slice(0, digits.length - dp);
  const fracPart = digits.slice(digits.length - dp).replace(/0+$/, '');
  return `${scaled < 0n ? '-' : ''}${intPart}${fracPart ? `.${fracPart}` : ''}`;
}

export function toCanonical(r) {
  if (r.d === 1n) return r.n.toString();
  const dp = decimalPlaces(r);
  if (dp !== null && dp <= 4) return toDecimalString(r, dp);
  return `${r.n}/${r.d}`;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/core/rational.test.js`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json vitest.config.js src/private/trainers/core/rational.js src/private/trainers/core/rational.test.js
git commit -m "Add Vitest and exact rational arithmetic for trainers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Seeded RNG and statistics math

**Files:**
- Create: `src/private/trainers/core/rng.js`
- Create: `src/private/trainers/core/stats.js`
- Test: `src/private/trainers/core/rng.test.js`, `src/private/trainers/core/stats.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `rng.js`:
    - `mulberry32(seed: number): () => number`, deterministic, values in [0,1)
    - `randInt(rng, min, max): number`, inclusive, computed exactly like Zetamac as `min + Math.floor(rng() * (max - min + 1))`
    - `pick(rng, items)`
    - `weightedPick(rng, items, weightOf = (x) => x.weight)`
  - `stats.js`:
    - `mean(values): number|null`
    - `percentile(values, p /* 0..100 */): number|null`, using linear interpolation
    - `median(values): number|null`
    - `stdDev(values): number|null`, the sample standard deviation (n−1); null when n < 2
    - `rollingAverage(values, window): number[]`, the same length as `values`, where entry i is the mean of up to the last `window` values ending at i
    - `trendPerWeek(points: {t: number /* epoch ms */, y: number}[]): number|null`, the least-squares slope × 604 800 000; null unless there are ≥ 5 points spanning ≥ 3 days
    - `bestPerDay(points, dayKey = localDayKey): {day: string, y: number}[]`, sorted by day
    - `localDayKey(t): string`, returning `YYYY-MM-DD` in local time

- [ ] **Step 1: Write the failing tests**

`src/private/trainers/core/rng.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mulberry32, randInt, pick, weightedPick } from './rng.js';

describe('rng', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 1000; i += 1) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
  it('randInt covers the inclusive range uniformly', () => {
    const rng = mulberry32(7);
    const counts = new Map();
    for (let i = 0; i < 20000; i += 1) {
      const v = randInt(rng, 2, 5);
      counts.set(v, (counts.get(v) || 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([2, 3, 4, 5]);
    for (const c of counts.values()) expect(c).toBeGreaterThan(4500);
  });
  it('randInt uses Zetamac arithmetic', () => {
    expect(randInt(() => 0, 2, 100)).toBe(2);
    expect(randInt(() => 0.999999, 2, 100)).toBe(100);
  });
  it('pick and weightedPick', () => {
    expect(pick(() => 0.5, ['a', 'b', 'c'])).toBe('b');
    const items = [{ id: 'x', weight: 1 }, { id: 'y', weight: 3 }];
    expect(weightedPick(() => 0.2, items).id).toBe('x');
    expect(weightedPick(() => 0.3, items).id).toBe('y');
  });
});
```

`src/private/trainers/core/stats.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mean, percentile, median, stdDev, rollingAverage, trendPerWeek, bestPerDay } from './stats.js';

const DAY = 86400000;
const utcDay = (t) => new Date(t).toISOString().slice(0, 10);

describe('stats', () => {
  it('mean / median / percentile', () => {
    expect(mean([])).toBeNull();
    expect(mean([1, 2, 3, 6])).toBe(3);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(percentile([10, 20, 30, 40, 50], 90)).toBe(46);
    expect(percentile([], 50)).toBeNull();
  });
  it('stdDev is the sample standard deviation', () => {
    expect(stdDev([4])).toBeNull();
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
  it('rollingAverage', () => {
    expect(rollingAverage([1, 2, 3, 4, 5], 3)).toEqual([1, 1.5, 2, 3, 4]);
    expect(rollingAverage([], 10)).toEqual([]);
  });
  it('trendPerWeek needs ≥5 points over ≥3 days', () => {
    const pts = [0, 1, 2, 3, 4].map((i) => ({ t: i * DAY, y: 40 + i }));
    expect(trendPerWeek(pts)).toBeCloseTo(7, 6);
    expect(trendPerWeek(pts.slice(0, 4))).toBeNull();
    const sameDay = [0, 1, 2, 3, 4].map((i) => ({ t: i * 1000, y: i }));
    expect(trendPerWeek(sameDay)).toBeNull();
  });
  it('bestPerDay', () => {
    const pts = [
      { t: 0, y: 30 }, { t: 1000, y: 35 }, { t: DAY, y: 20 },
    ];
    expect(bestPerDay(pts, utcDay)).toEqual([
      { day: '1970-01-01', y: 35 }, { day: '1970-01-02', y: 20 },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/private/trainers/core/rng.test.js src/private/trainers/core/stats.test.js`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement**

`src/private/trainers/core/rng.js`:

```js
// Injectable randomness: production passes Math.random, tests pass mulberry32(seed).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Same arithmetic as Zetamac's randGen: min + floor(random * (max - min + 1)).
export const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

export const pick = (rng, items) => items[Math.floor(rng() * items.length)];

export function weightedPick(rng, items, weightOf = (x) => x.weight) {
  const total = items.reduce((sum, x) => sum + weightOf(x), 0);
  let r = rng() * total;
  for (const item of items) {
    r -= weightOf(item);
    if (r < 0) return item;
  }
  return items[items.length - 1];
}
```

`src/private/trainers/core/stats.js`:

```js
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
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/private/trainers/core/rng.test.js src/private/trainers/core/stats.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/core/rng.js src/private/trainers/core/rng.test.js src/private/trainers/core/stats.js src/private/trainers/core/stats.test.js
git commit -m "Add seeded RNG and statistics helpers for trainers" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Settings fingerprint (config key)

**Files:**
- Create: `src/private/trainers/core/configKey.js`
- Test: `src/private/trainers/core/configKey.test.js`

**Interfaces:**
- Consumes: nothing. It uses the Web Crypto `crypto.subtle`, which is global in browsers and Node 22.
- Produces:
  - `canonicalJson(value): string`, with keys sorted recursively and `undefined` values dropped
  - `configKey({ trainer, config, profileVersion = null }): Promise<string>`, the 64-char lowercase hex SHA-256 of `canonicalJson({ trainer, config, profileVersion })`. `mode` is intentionally excluded (spec §3.2).

- [ ] **Step 1: Write the failing test**

`src/private/trainers/core/configKey.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalJson, configKey } from './configKey.js';

describe('canonicalJson', () => {
  it('sorts keys recursively and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: undefined } }))
      .toBe('{"a":{"d":[3,{"y":2,"z":1}]},"b":1}');
  });
});

describe('configKey', () => {
  it('is a sha-256 hex of the canonical json', async () => {
    const input = { trainer: 'zetamac', config: { duration: 120, add: true } };
    const expected = createHash('sha256')
      .update('{"config":{"add":true,"duration":120},"profileVersion":null,"trainer":"zetamac"}')
      .digest('hex');
    expect(await configKey(input)).toBe(expected);
  });
  it('ignores key order and distinguishes different settings', async () => {
    const a = await configKey({ trainer: 'zetamac', config: { add: true, duration: 120 } });
    const b = await configKey({ trainer: 'zetamac', config: { duration: 120, add: true } });
    const c = await configKey({ trainer: 'zetamac', config: { duration: 60, add: true } });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('includes profile version', async () => {
    const v1 = await configKey({ trainer: 'optiver', config: {}, profileVersion: 1 });
    const v2 = await configKey({ trainer: 'optiver', config: {}, profileVersion: 2 });
    expect(v1).not.toBe(v2);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/core/configKey.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement**

`src/private/trainers/core/configKey.js`:

```js
// Stable fingerprint of a game's settings. Stats only compare games with equal
// (mode, configKey), so custom settings never mix into the standard series.

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
}

export async function configKey({ trainer, config, profileVersion = null }) {
  const bytes = new TextEncoder().encode(canonicalJson({ trainer, config, profileVersion }));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/core/configKey.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/core/configKey.js src/private/trainers/core/configKey.test.js
git commit -m "Add settings fingerprint for trainer stats grouping" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
