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
