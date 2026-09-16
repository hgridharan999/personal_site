import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards, newDeck, shuffle } from './cards.js';
import { evaluate, categoryOf, CATEGORY, CATEGORY_NAMES } from './evaluator.js';

const ev = (text) => evaluate(parseCards(text));

// Deliberately naive reference: sort, group, compare. Same score encoding as evaluate().
function naive5(cards) {
  const ranks = cards.map((c) => c >> 2).sort((a, b) => b - a);
  const flush = cards.every((c) => (c & 3) === (cards[0] & 3));
  const uniq = [...new Set(ranks)];
  let straightHigh = -1;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq.join(',') === '12,3,2,1,0') straightHigh = 3;
  }
  const groups = uniq
    .map((r) => [ranks.filter((x) => x === r).length, r])
    .sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  const shape = groups.map((g) => g[0]).join('');
  const byGroup = groups.map((g) => g[1]);
  const pack = (cat, rs) => rs.reduce((v, r, i) => v | (r << (16 - 4 * i)), cat << 20);
  if (flush && straightHigh >= 0) return pack(8, [straightHigh]);
  if (shape === '41') return pack(7, byGroup);
  if (shape === '32') return pack(6, byGroup);
  if (flush) return pack(5, ranks);
  if (straightHigh >= 0) return pack(4, [straightHigh]);
  if (shape === '311') return pack(3, byGroup);
  if (shape === '221') return pack(2, byGroup);
  if (shape === '2111') return pack(1, byGroup);
  return pack(0, ranks);
}

function naiveBest(cards) {
  let best = -1;
  const n = cards.length;
  for (let a = 0; a < n; a += 1) for (let b = a + 1; b < n; b += 1) for (let c = b + 1; c < n; c += 1)
    for (let d = c + 1; d < n; d += 1) for (let e = d + 1; e < n; e += 1)
      best = Math.max(best, naive5([cards[a], cards[b], cards[c], cards[d], cards[e]]));
  return best;
}

describe('evaluate', () => {
  it('classifies every category', () => {
    const cases = [
      ['AhKhQhJhTh2c3d', CATEGORY.STRAIGHT_FLUSH],
      ['9s9h9d9c2c3dKh', CATEGORY.QUADS],
      ['AhAdAcKhKd2s3c', CATEGORY.FULL_HOUSE],
      ['Ah9h7h4h2h3c5d', CATEGORY.FLUSH],
      ['Ah2c3d4s5h9cKd', CATEGORY.STRAIGHT],
      ['7h7d7c2s9dJcKh', CATEGORY.TRIPS],
      ['AhAdKhKdQhQd2s', CATEGORY.TWO_PAIR],
      ['AhAd2c5s9dJcKh', CATEGORY.PAIR],
      ['Ah3d5c7s9dJcKh', CATEGORY.HIGH_CARD],
    ];
    for (const [hand, category] of cases) expect(categoryOf(ev(hand)), hand).toBe(category);
    expect(CATEGORY_NAMES[CATEGORY.FULL_HOUSE]).toBe('Full house');
  });

  it('encodes exact scores for tricky shapes', () => {
    expect(ev('AhAdAcKhKdKc2s')).toBe((6 << 20) | (12 << 16) | (11 << 12)); // two trips -> full house
    expect(ev('AhAdKhKdQhQd2s')).toBe((2 << 20) | (12 << 16) | (11 << 12) | (10 << 8)); // third pair is the kicker
    expect(ev('AhAdAcAs2c3dKh')).toBe((7 << 20) | (12 << 16) | (11 << 12));
    expect(ev('Ah2c3d4s5h9cKd')).toBe((4 << 20) | (3 << 16)); // wheel is 5-high
  });

  it('orders hands correctly', () => {
    expect(ev('Ah2c3d4s5hJcKd')).toBeLessThan(ev('2c3d4s5h6hJcKd'));
    expect(ev('AhAd9c5s3dKcQh')).toBeGreaterThan(ev('AsAc9h5d3cKdJh'));
    expect(ev('2c3dAhAsKsQsJh')).toBe(ev('2d3cAhAsKsQsJh'));
    expect(ev('AhKhQhJhTh')).toBeGreaterThan(ev('9s9h9d9cKh'));
    expect(categoryOf(ev('2c2d5h9sJd'))).toBe(CATEGORY.PAIR);
    expect(categoryOf(ev('2c2d5h9sJdJs'))).toBe(CATEGORY.TWO_PAIR);
  });

  it('matches a brute-force reference on 20,000 random 7-card hands', () => {
    const rng = mulberry32(12345);
    for (let i = 0; i < 20000; i += 1) {
      const hand = shuffle(newDeck(), rng).slice(0, 7);
      const expected = naiveBest(hand);
      const actual = evaluate(hand);
      if (actual !== expected) throw new Error(`mismatch for ${hand}: ${actual} vs ${expected}`);
    }
  });

  it('counts every 5-card hand category correctly', () => {
    const counts = new Array(9).fill(0);
    const hand = [0, 0, 0, 0, 0];
    for (let a = 0; a < 52; a += 1) { hand[0] = a;
      for (let b = a + 1; b < 52; b += 1) { hand[1] = b;
        for (let c = b + 1; c < 52; c += 1) { hand[2] = c;
          for (let d = c + 1; d < 52; d += 1) { hand[3] = d;
            for (let e = d + 1; e < 52; e += 1) { hand[4] = e; counts[evaluate(hand) >> 20] += 1; } } } } }
    expect(counts).toEqual([1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40]);
  }, 60_000);

  it.skipIf(!process.env.POKER_SLOW)('counts every 7-card hand category correctly', () => {
    const counts = new Array(9).fill(0);
    const h = [0, 0, 0, 0, 0, 0, 0];
    for (h[0] = 0; h[0] < 52; h[0] += 1) for (h[1] = h[0] + 1; h[1] < 52; h[1] += 1)
      for (h[2] = h[1] + 1; h[2] < 52; h[2] += 1) for (h[3] = h[2] + 1; h[3] < 52; h[3] += 1)
        for (h[4] = h[3] + 1; h[4] < 52; h[4] += 1) for (h[5] = h[4] + 1; h[5] < 52; h[5] += 1)
          for (h[6] = h[5] + 1; h[6] < 52; h[6] += 1) counts[evaluate(h) >> 20] += 1;
    expect(counts).toEqual([23294460, 58627800, 31433400, 6461620, 6180020, 4047644, 3473184, 224848, 41584]);
  }, 1_800_000);
});
