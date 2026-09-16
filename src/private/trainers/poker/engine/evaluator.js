// 5-7 card evaluator. Higher score wins; equal scores tie.
// Score = category << 20 | up to five 4-bit ranks, most significant first.

export const CATEGORY = Object.freeze({
  HIGH_CARD: 0, PAIR: 1, TWO_PAIR: 2, TRIPS: 3, STRAIGHT: 4, FLUSH: 5, FULL_HOUSE: 6, QUADS: 7, STRAIGHT_FLUSH: 8,
});

export const CATEGORY_NAMES = [
  'High card', 'Pair', 'Two pair', 'Three of a kind', 'Straight', 'Flush', 'Full house', 'Four of a kind', 'Straight flush',
];

// STRAIGHT_HIGH[rankMask] = top rank of the best straight in a 13-bit rank mask, or -1.
const STRAIGHT_HIGH = new Int8Array(1 << 13).fill(-1);
const WHEEL = 0b1000000001111; // A, 5, 4, 3, 2
for (let mask = 0; mask < 1 << 13; mask += 1) {
  for (let high = 12; high >= 4; high -= 1) {
    const run = 0b11111 << (high - 4);
    if ((mask & run) === run) {
      STRAIGHT_HIGH[mask] = high;
      break;
    }
  }
  if (STRAIGHT_HIGH[mask] < 0 && (mask & WHEEL) === WHEEL) STRAIGHT_HIGH[mask] = 3;
}

// Scratch buffers reused across calls (JS is single-threaded; evaluate is not re-entrant).
const counts = new Uint8Array(13);
const suitMasks = new Int32Array(4);
const suitCounts = new Uint8Array(4);

// Packs the `count` highest ranks in `mask` into nibbles, starting at bit `shift` and moving down.
function packTop(mask, count, shift) {
  let value = 0;
  for (let rank = 12; rank >= 0 && count > 0; rank -= 1) {
    if (mask & (1 << rank)) {
      value |= rank << shift;
      shift -= 4;
      count -= 1;
    }
  }
  return value;
}

/** @param {number[]} cards 5 to 7 distinct cards. @returns {number} */
export function evaluate(cards) {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  for (let i = 0; i < cards.length; i += 1) {
    const rank = cards[i] >> 2;
    const suit = cards[i] & 3;
    counts[rank] += 1;
    suitMasks[suit] |= 1 << rank;
    suitCounts[suit] += 1;
    rankMask |= 1 << rank;
  }

  let flushMask = 0;
  for (let suit = 0; suit < 4; suit += 1) {
    if (suitCounts[suit] >= 5) {
      flushMask = suitMasks[suit];
      const high = STRAIGHT_HIGH[flushMask];
      if (high >= 0) return (8 << 20) | (high << 16);
    }
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let rank = 12; rank >= 0; rank -= 1) {
    const n = counts[rank];
    if (n === 4) quad = rank;
    else if (n === 3) {
      if (trip1 < 0) trip1 = rank;
      else if (trip2 < 0) trip2 = rank;
    } else if (n === 2) {
      if (pair1 < 0) pair1 = rank;
      else if (pair2 < 0) pair2 = rank;
    }
  }

  if (quad >= 0) return (7 << 20) | (quad << 16) | packTop(rankMask & ~(1 << quad), 1, 12);
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) return (6 << 20) | (trip1 << 16) | (Math.max(trip2, pair1) << 12);
  if (flushMask) return (5 << 20) | packTop(flushMask, 5, 16);
  const straight = STRAIGHT_HIGH[rankMask];
  if (straight >= 0) return (4 << 20) | (straight << 16);
  if (trip1 >= 0) return (3 << 20) | (trip1 << 16) | packTop(rankMask & ~(1 << trip1), 2, 12);
  if (pair2 >= 0) {
    return (2 << 20) | (pair1 << 16) | (pair2 << 12) | packTop(rankMask & ~(1 << pair1) & ~(1 << pair2), 1, 8);
  }
  if (pair1 >= 0) return (1 << 20) | (pair1 << 16) | packTop(rankMask & ~(1 << pair1), 3, 12);
  return packTop(rankMask, 5, 16);
}

export const categoryOf = (score) => score >> 20;
