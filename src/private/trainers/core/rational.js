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
