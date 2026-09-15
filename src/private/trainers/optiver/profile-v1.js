import { rat, add, sub, mul, div, decimalPlaces, isInteger, toCanonical } from '../core/rational.js';
import { randInt, pick } from '../core/rng.js';

// Difficulty profile v1 — estimated from public reports of Optiver's 80-in-8.
// Retuning = new file (profile-v2.js); sessions store profile.version.

const MINUS = '−';
const fmt = toCanonical;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

function retry(make) {
  for (;;) {
    const q = make();
    if (q) return q;
  }
}

// value with `dp` decimal places: k / 10^dp
const decimal = (k, dp) => rat(BigInt(k), 10n ** BigInt(dp));

function properFraction(rng) {
  for (;;) {
    const d = randInt(rng, 2, 12);
    const n = randInt(rng, 1, d - 1);
    if (gcd(n, d) === 1) return { r: rat(BigInt(n), BigInt(d)), text: `${n}/${d}` };
  }
}

const larger = (x, y) => (x.r.n * y.r.d >= y.r.n * x.r.d ? [x, y] : [y, x]);

const templates = [
  {
    qtype: 'o.int.add',
    weight: 12.5,
    gen: (rng) => {
      const a = randInt(rng, 100, 999);
      const b = randInt(rng, 100, 999);
      return { prompt: `${a} + ${b}`, answer: rat(BigInt(a + b)) };
    },
  },
  {
    qtype: 'o.int.sub',
    weight: 12.5,
    gen: (rng) => {
      let a = randInt(rng, 100, 999);
      let b = randInt(rng, 100, 999);
      if (a < b) [a, b] = [b, a];
      return { prompt: `${a} ${MINUS} ${b}`, answer: rat(BigInt(a - b)) };
    },
  },
  {
    qtype: 'o.int.mul',
    weight: 12.5,
    gen: (rng) => {
      const [a, b] = rng() < 0.5
        ? [randInt(rng, 12, 99), randInt(rng, 3, 9)]
        : [randInt(rng, 11, 39), randInt(rng, 11, 29)];
      return { prompt: `${a} × ${b}`, answer: rat(BigInt(a * b)) };
    },
  },
  {
    qtype: 'o.int.div',
    weight: 12.5,
    gen: (rng) => {
      const d = rng() < 0.7 ? randInt(rng, 3, 12) : randInt(rng, 13, 25);
      const q = randInt(rng, 11, 99);
      return { prompt: `${d * q} ÷ ${d}`, answer: rat(BigInt(q)) };
    },
  },
  {
    qtype: 'o.dec.addsub',
    weight: 10,
    gen: (rng) => retry(() => {
      const value = () => {
        const dp = randInt(rng, 1, 2);
        return dp === 1 ? decimal(randInt(rng, 1, 999), 1) : decimal(randInt(rng, 10, 9999), 2);
      };
      let x = value();
      let y = value();
      if (isInteger(x) || isInteger(y)) return null;
      if (rng() < 0.5) return { prompt: `${fmt(x)} + ${fmt(y)}`, answer: add(x, y) };
      if (x.n * y.d < y.n * x.d) [x, y] = [y, x];
      return { prompt: `${fmt(x)} ${MINUS} ${fmt(y)}`, answer: sub(x, y) };
    }),
  },
  {
    qtype: 'o.dec.mul',
    weight: 10,
    gen: (rng) => retry(() => {
      const r = rng();
      let x;
      let y;
      if (r < 0.6) {
        x = decimal(randInt(rng, 1, 199) * 5, 2);
        y = rat(BigInt(randInt(rng, 2, 20)));
      } else if (r < 0.9) {
        x = decimal(randInt(rng, 1, 9), 1);
        y = decimal(randInt(rng, 11, 99), 1);
      } else {
        x = decimal(randInt(rng, 1, 9), 2);
        y = decimal(randInt(rng, 1, 9), 1);
      }
      if (isInteger(x) || (r >= 0.6 && isInteger(y))) return null;
      return { prompt: `${fmt(x)} × ${fmt(y)}`, answer: mul(x, y) };
    }),
  },
  {
    qtype: 'o.dec.div',
    weight: 10,
    gen: (rng) => retry(() => {
      const d = pick(rng, ['0.2', '0.25', '0.3', '0.4', '0.5', '0.6', '0.8', '1.5', '2.5', '4', '5', '6', '8', '12']);
      const divisor = rat(...toParts(d));
      const q = decimal(randInt(rng, 10, 990), 1);
      const dividend = mul(divisor, q);
      const places = decimalPlaces(dividend);
      if (places === null || places > 2 || isInteger(dividend) && isInteger(divisor)) return null;
      return { prompt: `${fmt(dividend)} ÷ ${fmt(divisor)}`, answer: div(dividend, divisor) };
    }),
  },
  {
    qtype: 'o.frac.of',
    weight: 7,
    gen: (rng) => retry(() => {
      const q = pick(rng, [2, 3, 4, 5, 8, 10, 12, 20, 25]);
      const p = randInt(rng, 1, q - 1);
      if (gcd(p, q) !== 1) return null;
      const n = randInt(rng, 10, 200);
      const answer = mul(rat(BigInt(p), BigInt(q)), rat(BigInt(n)));
      const places = decimalPlaces(answer);
      if (places === null || places > 2) return null;
      return { prompt: `${p}/${q} of ${n}`, answer };
    }),
  },
  {
    qtype: 'o.frac.addsub',
    weight: 7,
    gen: (rng) => retry(() => {
      const [x, y] = [properFraction(rng), properFraction(rng)];
      if (rng() < 0.5) return { prompt: `${x.text} + ${y.text}`, answer: add(x.r, y.r) };
      const [big, small] = larger(x, y);
      const answer = sub(big.r, small.r);
      if (answer.n === 0n) return null;
      return { prompt: `${big.text} ${MINUS} ${small.text}`, answer };
    }),
  },
  {
    qtype: 'o.frac.muldiv',
    weight: 6,
    gen: (rng) => {
      const [x, y] = [properFraction(rng), properFraction(rng)];
      return rng() < 0.5
        ? { prompt: `${x.text} × ${y.text}`, answer: mul(x.r, y.r) }
        : { prompt: `${x.text} ÷ ${y.text}`, answer: div(x.r, y.r) };
    },
  },
];

// '0.25' -> [25n, 100n]
function toParts(s) {
  const [i, f = ''] = s.split('.');
  return [BigInt(i + f), 10n ** BigInt(f.length)];
}

export const PROFILE_V1 = Object.freeze({ version: 1, templates });
