# Poker Trainer Phase 1: Engine + Evaluator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure, fully tested No-Limit Hold'em engine (cards, 5–7 card evaluator, side pots, event-sourced hand state, dealer and simulator) that later phases build the table UI, bots, storage and analysis on.

**Architecture:** Cards are integers. A hand is a list of events (`start`, `hole`, `board`, `act`) that `applyEvent` reduces into an immutable state, so the same log drives play, replay, storage and a future multiplayer server. Pot building and awarding are separate pure functions. A dealer turns a seeded shuffle into events, and a simulator plays whole hands with a policy function.

**Tech Stack:** JavaScript ES modules with JSDoc, Vitest 5, Node 22. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-trainer-design.md` (sections 4 and 10).

## Global Constraints

- Plain JavaScript ES modules (`.js`), JSDoc types, no TypeScript, no new npm dependencies.
- All code lives under `src/private/trainers/poker/engine/`, with tests next to the code as `*.test.js` (Vitest includes `src/**/*.test.js`).
- Engine modules are pure: no DOM, network, timers or `Math.random`. Randomness comes in as an `rng` function (`mulberry32` from `src/private/trainers/core/rng.js` in tests).
- Money is an integer number of **units, where 1 unit = 0.5 BB**. Blinds in tests are `sb: 1, bb: 2`.
- Cards are integers `rank * 4 + suit`, with rank 0–12 = `2..A` and suit 0–3 = `c,d,h,s`.
- Engine errors are `EngineError` instances with a string `code`.
- Commit messages end with exactly this trailer line (copy it verbatim, never substitute another model name):
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Stage files explicitly by path (`git add <paths>`), never `git add -A` or `git add .`. The repo has an unrelated untracked `wa.geo.json` that must not be committed.
- Test command for a single file: `npx vitest run <path>`. Full suite: `npm test`.

**Deliberate refinements of the spec (already decided):**
- Blinds are posted inside the `start` event rather than as separate `post_sb`/`post_bb` events.
- The evaluator uses rank bitmasks and an 8,192-entry straight table instead of perfect-hash tables. Throughput is measured by `npm run poker:bench-eval` and is informational in this phase.
- Several incomplete all-in raises do not add up to reopen the betting. Only a single full raise reopens it.

---

## File Structure

| File | Responsibility |
|---|---|
| `engine/cards.js` | Card encoding, parsing and formatting, deck, Fisher–Yates shuffle |
| `engine/evaluator.js` | `evaluate(cards) → score` for 5–7 cards, category helpers |
| `engine/pots.js` | `buildPots(contributions)` main and side pots, `awardPots(pots, scoreOf, seatOrder)` |
| `engine/handState.js` | Event reducer: blinds, legal actions, betting rounds, streets, showdown, `EngineError` |
| `engine/dealer.js` | `dealHand` turns a seeded shuffle into `start` + `hole` events and board events |
| `engine/simulate.js` | `playHand` runs a hand to completion with a policy, plus `randomPolicy` |
| `engine/table.js` | Between hands: `nextButton`, `stacksAfter` |
| `scripts/poker/bench-evaluator.js` | Prints evaluator throughput |

---

### Task 1: Cards

**Files:**
- Create: `src/private/trainers/poker/engine/cards.js`
- Test: `src/private/trainers/poker/engine/cards.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `RANKS: string`, `SUITS: string`, `rankOf(card) → 0..12`, `suitOf(card) → 0..3`, `parseCard(text) → number`, `parseCards(text) → number[]`, `cardToString(card) → string`, `cardsToString(cards) → string`, `newDeck() → number[]` (0..51), `shuffle(deck, rng) → number[]` (new array).

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/engine/cards.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import {
  RANKS, SUITS, rankOf, suitOf, parseCard, parseCards, cardToString, cardsToString, newDeck, shuffle,
} from './cards.js';

describe('cards', () => {
  it('encodes rank * 4 + suit', () => {
    expect(parseCard('2c')).toBe(0);
    expect(parseCard('Th')).toBe(34);
    expect(parseCard('As')).toBe(51);
    expect(rankOf(parseCard('Kd'))).toBe(11);
    expect(suitOf(parseCard('Kd'))).toBe(1);
  });

  it('round-trips every card', () => {
    for (const r of RANKS) {
      for (const s of SUITS) expect(cardToString(parseCard(r + s))).toBe(r + s);
    }
  });

  it('parses and formats card strings', () => {
    expect(parseCards('AhKs')).toEqual([50, 47]);
    expect(cardsToString([50, 47])).toBe('AhKs');
    expect(parseCards('')).toEqual([]);
  });

  it('rejects malformed cards', () => {
    expect(() => parseCard('1h')).toThrow();
    expect(() => parseCard('Ax')).toThrow();
    expect(() => parseCard('Ahh')).toThrow();
    expect(() => parseCards('AhK')).toThrow();
  });

  it('shuffles deterministically without mutating the input', () => {
    const deck = newDeck();
    const a = shuffle(deck, mulberry32(9));
    const b = shuffle(deck, mulberry32(9));
    expect(a).toEqual(b);
    expect(deck).toEqual(Array.from({ length: 52 }, (_, i) => i));
    expect([...a].sort((x, y) => x - y)).toEqual(deck);
    expect(a).not.toEqual(deck);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/engine/cards.test.js`
Expected: FAIL, "Failed to load url ./cards.js" (or similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/engine/cards.js
// Cards are integers 0..51: rank * 4 + suit. Rank 0..12 = 2..A, suit 0..3 = c, d, h, s.

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';

export const rankOf = (card) => card >> 2;
export const suitOf = (card) => card & 3;

export function parseCard(text) {
  const rank = RANKS.indexOf(text[0]);
  const suit = SUITS.indexOf(text[1]);
  if (text.length !== 2 || rank < 0 || suit < 0) throw new Error(`Bad card: ${text}`);
  return rank * 4 + suit;
}

export function parseCards(text) {
  if (text.length % 2 !== 0) throw new Error(`Bad cards: ${text}`);
  const cards = [];
  for (let i = 0; i < text.length; i += 2) cards.push(parseCard(text.slice(i, i + 2)));
  return cards;
}

export const cardToString = (card) => RANKS[card >> 2] + SUITS[card & 3];

export const cardsToString = (cards) => cards.map(cardToString).join('');

export const newDeck = () => Array.from({ length: 52 }, (_, i) => i);

/** Fisher–Yates on a copy. `rng` returns floats in [0, 1). */
export function shuffle(deck, rng) {
  const out = deck.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/engine/cards.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/engine/cards.js src/private/trainers/poker/engine/cards.test.js
git commit -m "Add poker card encoding, parsing and seeded shuffle

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Hand evaluator

**Files:**
- Create: `src/private/trainers/poker/engine/evaluator.js`
- Create: `scripts/poker/bench-evaluator.js`
- Modify: `package.json` (add the `poker:bench-eval` script)
- Test: `src/private/trainers/poker/engine/evaluator.test.js`

**Interfaces:**
- Consumes: `parseCards`, `newDeck`, `shuffle` from `./cards.js` (tests and bench only). The evaluator itself uses the card encoding directly (`card >> 2`, `card & 3`).
- Produces: `evaluate(cards: number[]) → number` (5–7 cards; higher wins, equal scores tie; score = `category << 20 | r1 << 16 | r2 << 12 | r3 << 8 | r4 << 4 | r5`), `categoryOf(score) → 0..8`, `CATEGORY` (frozen name→number map), `CATEGORY_NAMES: string[]`.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/engine/evaluator.test.js
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/engine/evaluator.test.js`
Expected: FAIL, module `./evaluator.js` not found.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/engine/evaluator.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/engine/evaluator.test.js`
Expected: PASS (5 passed, 1 skipped).

- [ ] **Step 5: Add the benchmark script**

```js
// scripts/poker/bench-evaluator.js
// Prints 7-card evaluator throughput. Informational; no pass/fail.
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { newDeck, shuffle } from '../../src/private/trainers/poker/engine/cards.js';
import { evaluate } from '../../src/private/trainers/poker/engine/evaluator.js';

const rng = mulberry32(1);
const hands = Array.from({ length: 100000 }, () => shuffle(newDeck(), rng).slice(0, 7));
const iterations = 5_000_000;
let checksum = 0;
for (let i = 0; i < 200000; i += 1) checksum ^= evaluate(hands[i % hands.length]); // warm-up
const started = performance.now();
for (let i = 0; i < iterations; i += 1) checksum ^= evaluate(hands[i % hands.length]);
const seconds = (performance.now() - started) / 1000;
console.log(`${Math.round(iterations / seconds).toLocaleString('en-US')} evaluations/sec (checksum ${checksum})`);
```

In `package.json` `"scripts"`, add after `"db:migrate"` (keep valid JSON, add the comma on the previous line):

```json
    "poker:bench-eval": "node scripts/poker/bench-evaluator.js"
```

Run: `npm run poker:bench-eval`
Expected: one line such as `4,812,337 evaluations/sec (checksum …)`. Record the number in the task report.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/engine/evaluator.js src/private/trainers/poker/engine/evaluator.test.js scripts/poker/bench-evaluator.js package.json
git commit -m "Add 5-7 card poker evaluator with reference tests and throughput bench

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Pots

**Files:**
- Create: `src/private/trainers/poker/engine/pots.js`
- Test: `src/private/trainers/poker/engine/pots.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `buildPots(contributions: {seat:number,total:number,folded:boolean}[]) → {amount:number, eligible:number[]}[]`. Contributions are in table order, and `eligible` keeps that order. Adjacent pots with identical eligible sets are merged. A tier nobody live can win goes into the previous pot, or is carried into the next one if there is no previous pot.
  - `awardPots(pots, scoreOf: (seat) => number, seatOrder: number[]) → { pots: {amount, eligible, winners:number[]}[], awards: Record<number, number> }`. `seatOrder` lists the seats clockwise starting left of the button. Winners are sorted in that order, and odd units go one at a time to winners in that order. `scoreOf` is not called for a pot with a single eligible seat.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/engine/pots.test.js
import { describe, it, expect } from 'vitest';
import { buildPots, awardPots } from './pots.js';

const c = (seat, total, folded = false) => ({ seat, total, folded });

describe('buildPots', () => {
  it('makes one pot when everyone matched', () => {
    expect(buildPots([c(0, 10), c(1, 10)])).toEqual([{ amount: 20, eligible: [0, 1] }]);
  });

  it('adds folded chips without making the folder eligible', () => {
    expect(buildPots([c(0, 4, true), c(1, 10), c(2, 10)])).toEqual([{ amount: 24, eligible: [1, 2] }]);
  });

  it('builds side pots for different all-in amounts', () => {
    expect(buildPots([c(0, 50), c(1, 100), c(2, 100)])).toEqual([
      { amount: 150, eligible: [0, 1, 2] },
      { amount: 100, eligible: [1, 2] },
    ]);
  });

  it('handles a folder who put in more than a short all-in', () => {
    expect(buildPots([c(0, 30), c(1, 80, true), c(2, 80)])).toEqual([
      { amount: 90, eligible: [0, 2] },
      { amount: 100, eligible: [2] },
    ]);
  });

  it('ignores zero contributions', () => {
    expect(buildPots([c(0, 0, true), c(1, 2), c(2, 2)])).toEqual([{ amount: 4, eligible: [1, 2] }]);
  });
});

describe('awardPots', () => {
  it('gives each pot to its best eligible hand', () => {
    const pots = [{ amount: 150, eligible: [0, 1, 2] }, { amount: 100, eligible: [1, 2] }];
    const scores = { 0: 300, 1: 200, 2: 100 };
    const { pots: out, awards } = awardPots(pots, (s) => scores[s], [1, 2, 0]);
    expect(awards).toEqual({ 0: 150, 1: 100 });
    expect(out.map((p) => p.winners)).toEqual([[0], [1]]);
  });

  it('splits ties and gives odd units in seat order from the button', () => {
    const { pots, awards } = awardPots([{ amount: 5, eligible: [0, 2] }], () => 7, [1, 2, 0]);
    expect(awards).toEqual({ 2: 3, 0: 2 });
    expect(pots[0].winners).toEqual([2, 0]);
  });

  it('does not score a pot with one eligible seat', () => {
    const { awards } = awardPots([{ amount: 9, eligible: [4] }], () => { throw new Error('scored'); }, [4]);
    expect(awards).toEqual({ 4: 9 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/engine/pots.test.js`
Expected: FAIL, module `./pots.js` not found.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/engine/pots.js
// Main and side pots from each player's total contribution to the hand.

const sameSeats = (a, b) => a.length === b.length && a.every((seat, i) => seat === b[i]);

/**
 * @param {{seat:number,total:number,folded:boolean}[]} contributions in table order
 * @returns {{amount:number, eligible:number[]}[]}
 */
export function buildPots(contributions) {
  const levels = [...new Set(contributions.map((x) => x.total).filter((t) => t > 0))].sort((a, b) => a - b);
  const pots = [];
  let previous = 0;
  let carry = 0;
  for (const level of levels) {
    let amount = carry;
    carry = 0;
    for (const x of contributions) amount += Math.min(x.total, level) - Math.min(x.total, previous);
    const eligible = contributions.filter((x) => !x.folded && x.total >= level).map((x) => x.seat);
    const last = pots[pots.length - 1];
    if (eligible.length === 0) {
      if (last) last.amount += amount;
      else carry = amount;
    } else if (last && sameSeats(last.eligible, eligible)) {
      last.amount += amount;
    } else {
      pots.push({ amount, eligible });
    }
    previous = level;
  }
  if (carry > 0 && pots.length > 0) pots[pots.length - 1].amount += carry;
  return pots;
}

/**
 * @param {{amount:number, eligible:number[]}[]} pots
 * @param {(seat:number) => number} scoreOf higher wins
 * @param {number[]} seatOrder seats clockwise starting left of the button
 */
export function awardPots(pots, scoreOf, seatOrder) {
  const awards = {};
  const out = pots.map((pot) => {
    let winners = pot.eligible;
    if (pot.eligible.length > 1) {
      let best = -Infinity;
      winners = [];
      for (const seat of pot.eligible) {
        const score = scoreOf(seat);
        if (score > best) {
          best = score;
          winners = [seat];
        } else if (score === best) {
          winners.push(seat);
        }
      }
    }
    winners = winners.slice().sort((a, b) => seatOrder.indexOf(a) - seatOrder.indexOf(b));
    const share = Math.floor(pot.amount / winners.length);
    let odd = pot.amount - share * winners.length;
    for (const seat of winners) {
      const extra = odd > 0 ? 1 : 0;
      odd -= extra;
      awards[seat] = (awards[seat] ?? 0) + share + extra;
    }
    return { ...pot, winners };
  });
  return { pots: out, awards };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/engine/pots.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/engine/pots.js src/private/trainers/poker/engine/pots.test.js
git commit -m "Add poker side-pot building and pot awarding

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Hand state reducer

**Files:**
- Create: `src/private/trainers/poker/engine/handState.js`
- Test: `src/private/trainers/poker/engine/handState.test.js`

**Interfaces:**
- Consumes: `evaluate` from `./evaluator.js`; `buildPots`, `awardPots` from `./pots.js`; `parseCards` from `./cards.js` (tests).
- Produces:
  - Events: `{type:'start', seats:{seat,stack}[], button, sb, bb}`, `{type:'hole', seat, cards:[c,c]}`, `{type:'board', cards}` (3 for the flop, then 1 and 1), `{type:'act', seat, action:'fold'|'check'|'call'|'bet'|'raise', amount?}` where `amount` is the total the player will have committed **this street** ("raise to").
  - `applyEvent(state|null, event) → state` (never mutates its input), `reduceHand(events) → state`.
  - `legalActions(state) → null | {seat, canCheck, toCall, canRaise, raiseKind:'bet'|'raise', minRaiseTo, maxRaiseTo}`.
  - `seatsFromButton(state) → number[]`, `MAX_SEATS = 6`, `class EngineError extends Error { code }`.
  - State fields: `sb, bb, button, sbSeat, bbSeat, street:'preflop'|'flop'|'turn'|'river'|'complete', board:number[], players:{seat, stack, committed, total, folded, allIn, acted, hole}[]` (sorted by seat), `currentBet, minRaise, toAct:number|null, needsBoard:'flop'|'turn'|'river'|null, result`.
  - `result` (set when `street === 'complete'`): `{showdown:boolean, pots:{amount, eligible, winners}[], awards:Record<seat,units>, net:Record<seat,units>, shown:number[], scores?:Record<seat,number>}`.
  - Error codes: `BAD_EVENT`, `BAD_SEAT`, `DUPLICATE_CARD`, `HAND_NOT_READY`, `NOT_YOUR_TURN`, `ILLEGAL_ACTION`, `BAD_AMOUNT`, `BELOW_MIN_RAISE`.

Rules implemented: heads-up, the button posts the small blind and acts first preflop and last postflop. Short blinds post all-in. The preflop bet level is always `bb`. A full raise (size ≥ the last full bet/raise) sets `minRaise` and reopens action for everyone else. An incomplete all-in raise raises `currentBet` but does not reopen. A player may not raise if nobody else could respond. Uncalled chips are returned when a street closes or everyone else folds. With fewer than two players able to bet, the board runs out with no action.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/engine/handState.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from './cards.js';
import { applyEvent, reduceHand, legalActions, seatsFromButton, EngineError } from './handState.js';

const HOLES6 = ['AhAd', 'KhKd', 'QhQd', 'JhJd', 'ThTd', '9h9d'];

function setup(stacks, holes, button = 0) {
  let s = applyEvent(null, { type: 'start', button, sb: 1, bb: 2, seats: stacks.map((stack, seat) => ({ seat, stack })) });
  holes.forEach((h, seat) => { s = applyEvent(s, { type: 'hole', seat, cards: parseCards(h) }); });
  return s;
}
const act = (s, seat, action, amount) => applyEvent(s, { type: 'act', seat, action, amount });
const board = (s, text) => applyEvent(s, { type: 'board', cards: parseCards(text) });
const stackSum = (s) => s.players.reduce((sum, p) => sum + p.stack, 0);
function codeOf(fn) {
  try { fn(); } catch (e) { return e instanceof EngineError ? e.code : `not EngineError: ${e.message}`; }
  return null;
}

describe('hand state', () => {
  it('posts blinds and starts action left of the big blind', () => {
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    expect([s.sbSeat, s.bbSeat, s.toAct]).toEqual([1, 2, 3]);
    expect(s.players[1]).toMatchObject({ stack: 199, committed: 1, total: 1 });
    expect(s.players[2]).toMatchObject({ stack: 198, committed: 2, total: 2 });
    expect(legalActions(s)).toEqual({ seat: 3, canCheck: false, toCall: 2, canRaise: true, raiseKind: 'raise', minRaiseTo: 4, maxRaiseTo: 200 });
    expect(seatsFromButton(s)).toEqual([1, 2, 3, 4, 5, 0]);
  });

  it('heads-up: button posts small blind, acts first preflop and last postflop', () => {
    let s = setup([200, 200], ['AhAd', 'KhKd']);
    expect([s.sbSeat, s.bbSeat, s.toAct]).toEqual([0, 1, 0]);
    s = act(s, 0, 'call');
    s = act(s, 1, 'check');
    expect([s.street, s.needsBoard, s.toAct]).toEqual(['flop', 'flop', null]);
    s = board(s, '2c7s9d');
    expect(s.toAct).toBe(1);
  });

  it('awards the blinds to the big blind when everyone folds, returning the uncalled chip', () => {
    let s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    for (const seat of [3, 4, 5, 0, 1]) s = act(s, seat, 'fold');
    expect(s.street).toBe('complete');
    expect(s.players[2].stack).toBe(201);
    expect(s.result).toMatchObject({ showdown: false, awards: { 2: 2 }, shown: [] });
    expect(s.result.net).toEqual({ 0: 0, 1: -1, 2: 1, 3: 0, 4: 0, 5: 0 });
    expect(stackSum(s)).toBe(1200);
  });

  it('enforces the minimum raise', () => {
    let s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    s = act(s, 3, 'raise', 6);
    expect(legalActions(s).minRaiseTo).toBe(10);
    expect(codeOf(() => act(s, 4, 'raise', 9))).toBe('BELOW_MIN_RAISE');
    s = act(s, 4, 'raise', 10);
    expect(legalActions(s).minRaiseTo).toBe(14);
  });

  it('gives the big blind an option after limps', () => {
    let s = setup([200, 200, 200], HOLES6.slice(0, 3));
    expect(s.toAct).toBe(0);
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 2, canCheck: true, canRaise: true });
    s = act(s, 2, 'check');
    expect([s.street, s.needsBoard]).toEqual(['flop', 'flop']);
    s = board(s, '2c7s8d');
    expect(legalActions(s)).toMatchObject({ seat: 1, raiseKind: 'bet', minRaiseTo: 2, canCheck: true });
  });

  it('does not reopen betting after an incomplete all-in raise', () => {
    let s = setup([200, 200, 16], HOLES6.slice(0, 3));
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    s = act(s, 2, 'check');
    s = board(s, '2c7s8d');
    s = act(s, 1, 'bet', 10);
    expect(legalActions(s)).toMatchObject({ seat: 2, minRaiseTo: 14, maxRaiseTo: 14, canRaise: true });
    s = act(s, 2, 'raise', 14);
    expect(legalActions(s)).toMatchObject({ seat: 0, canRaise: true, minRaiseTo: 24 });
    s = act(s, 0, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: false, toCall: 4 });
    expect(codeOf(() => act(s, 1, 'raise', 30))).toBe('ILLEGAL_ACTION');
    s = act(s, 1, 'call');
    expect([s.street, s.needsBoard]).toEqual(['turn', 'turn']);
  });

  it('reopens betting after a full raise', () => {
    let s = setup([200, 200, 100], HOLES6.slice(0, 3));
    s = act(s, 0, 'call');
    s = act(s, 1, 'call');
    s = act(s, 2, 'check');
    s = board(s, '2c7s8d');
    s = act(s, 1, 'bet', 10);
    s = act(s, 2, 'raise', 20);
    s = act(s, 0, 'call');
    expect(legalActions(s)).toMatchObject({ seat: 1, canRaise: true, minRaiseTo: 30, toCall: 10 });
  });

  it('forbids raising when nobody else can respond', () => {
    let s = setup([200, 50], ['AhAd', 'KhKd']);
    s = act(s, 0, 'call');
    s = act(s, 1, 'raise', 50);
    expect(legalActions(s)).toMatchObject({ seat: 0, canRaise: false, toCall: 48 });
  });

  it('runs out the board after all-ins and builds side pots', () => {
    let s = setup([50, 100, 200], ['AhAd', 'KhKd', 'QhQd']);
    s = act(s, 0, 'raise', 50);
    s = act(s, 1, 'raise', 100);
    s = act(s, 2, 'call');
    expect([s.street, s.needsBoard, s.toAct]).toEqual(['flop', 'flop', null]);
    s = board(s, '2c7s9d');
    expect(s.needsBoard).toBe('turn');
    s = board(s, 'Ts');
    expect(s.needsBoard).toBe('river');
    s = board(s, '3c');
    expect(s.street).toBe('complete');
    expect(s.result.pots).toEqual([
      { amount: 150, eligible: [0, 1, 2], winners: [0] },
      { amount: 100, eligible: [1, 2], winners: [1] },
    ]);
    expect(s.players.map((p) => p.stack)).toEqual([150, 100, 100]);
    expect(s.result.net).toEqual({ 0: 100, 1: 0, 2: -100 });
    expect(s.result.shown).toEqual([0, 1, 2]);
  });

  it('splits a tied pot and gives the odd unit to the first winner left of the button', () => {
    let s = setup([200, 200, 200], ['2c3d', 'KhKd', '2d3c']);
    s = act(s, 0, 'call');
    s = act(s, 1, 'fold');
    s = act(s, 2, 'check');
    s = board(s, 'AhAsKs');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    s = board(s, 'Qs');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    s = board(s, 'Jh');
    s = act(s, 2, 'check');
    s = act(s, 0, 'check');
    expect(s.result.awards).toEqual({ 2: 3, 0: 2 });
    expect(s.players.map((p) => p.stack)).toEqual([200, 199, 201]);
  });

  it('posts a short blind all-in', () => {
    const s = setup([200, 1, 200], HOLES6.slice(0, 3));
    expect(s.players[1]).toMatchObject({ stack: 0, allIn: true, committed: 1 });
    expect(s.toAct).toBe(0);
  });

  it('rejects illegal events with codes', () => {
    const fresh = applyEvent(null, { type: 'start', button: 0, sb: 1, bb: 2, seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 200 }] });
    expect(codeOf(() => act(fresh, 0, 'call'))).toBe('HAND_NOT_READY');
    const one = applyEvent(fresh, { type: 'hole', seat: 0, cards: parseCards('AhAd') });
    expect(codeOf(() => applyEvent(one, { type: 'hole', seat: 1, cards: parseCards('AhKd') }))).toBe('DUPLICATE_CARD');
    const s = setup([200, 200, 200, 200, 200, 200], HOLES6);
    expect(codeOf(() => act(s, 4, 'fold'))).toBe('NOT_YOUR_TURN');
    expect(codeOf(() => act(s, 3, 'check'))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => act(s, 3, 'bet', 6))).toBe('ILLEGAL_ACTION');
    expect(codeOf(() => act(s, 3, 'raise', 500))).toBe('BAD_AMOUNT');
    expect(codeOf(() => board(s, '2c7s8d'))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(s, { type: 'start', button: 0, sb: 1, bb: 2, seats: [] }))).toBe('BAD_EVENT');
    expect(codeOf(() => applyEvent(null, { type: 'start', button: 3, sb: 1, bb: 2, seats: [{ seat: 0, stack: 5 }, { seat: 1, stack: 5 }] }))).toBe('BAD_EVENT');
  });

  it('never mutates the previous state and replays identically', () => {
    const events = [
      { type: 'start', button: 0, sb: 1, bb: 2, seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 200 }, { seat: 2, stack: 200 }] },
      { type: 'hole', seat: 0, cards: parseCards('AhAd') },
      { type: 'hole', seat: 1, cards: parseCards('KhKd') },
      { type: 'hole', seat: 2, cards: parseCards('QhQd') },
    ];
    const s1 = reduceHand(events);
    const s2 = act(s1, 0, 'fold');
    expect(s1.players[0].folded).toBe(false);
    expect(s1.toAct).toBe(0);
    expect(s2.toAct).toBe(1);
    expect(reduceHand([...events, { type: 'act', seat: 0, action: 'fold' }])).toEqual(s2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/engine/handState.test.js`
Expected: FAIL, module `./handState.js` not found.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/engine/handState.js
// Event-sourced No-Limit Hold'em hand. Amounts are integer units (1 unit = 0.5 BB).
import { evaluate } from './evaluator.js';
import { buildPots, awardPots } from './pots.js';

/**
 * @typedef {{type:'start', seats:{seat:number, stack:number}[], button:number, sb:number, bb:number}} StartEvent
 * @typedef {{type:'hole', seat:number, cards:number[]}} HoleEvent
 * @typedef {{type:'board', cards:number[]}} BoardEvent
 * @typedef {{type:'act', seat:number, action:'fold'|'check'|'call'|'bet'|'raise', amount?:number}} ActEvent
 * @typedef {StartEvent|HoleEvent|BoardEvent|ActEvent} HandEvent
 */

export const MAX_SEATS = 6;
const NEXT_STREET = { preflop: 'flop', flop: 'turn', turn: 'river' };
const BOARD_SIZE = { flop: 3, turn: 4, river: 5 };

export class EngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new EngineError(code, message);
};

const playerAt = (s, seat) => s.players.find((p) => p.seat === seat) ?? fail('BAD_SEAT', `no player in seat ${seat}`);

/** @param {HandEvent[]} events */
export function reduceHand(events) {
  return events.reduce(applyEvent, null);
}

/** Returns a new state; never mutates `state`. */
export function applyEvent(state, event) {
  if (event.type === 'start') {
    if (state) fail('BAD_EVENT', 'start must be the first event');
    return startHand(event);
  }
  if (!state) fail('BAD_EVENT', 'hand has not started');
  if (state.street === 'complete') fail('BAD_EVENT', 'hand is complete');
  const draft = { ...state, board: state.board.slice(), players: state.players.map((p) => ({ ...p })) };
  if (event.type === 'hole') dealHole(draft, event);
  else if (event.type === 'board') dealBoard(draft, event);
  else if (event.type === 'act') act(draft, event);
  else fail('BAD_EVENT', `unknown event type ${event.type}`);
  return draft;
}

export function legalActions(s) {
  if (!s || s.toAct === null) return null;
  const p = playerAt(s, s.toAct);
  const maxRaiseTo = p.committed + p.stack;
  const othersCanRespond = s.players.some((q) => q !== p && !q.folded && !q.allIn);
  return {
    seat: p.seat,
    canCheck: s.currentBet <= p.committed,
    toCall: Math.min(Math.max(s.currentBet - p.committed, 0), p.stack),
    canRaise: !p.acted && othersCanRespond && maxRaiseTo > s.currentBet,
    raiseKind: s.currentBet === 0 ? 'bet' : 'raise',
    minRaiseTo: Math.min(s.currentBet + s.minRaise, maxRaiseTo),
    maxRaiseTo,
  };
}

/** Seats clockwise starting left of the button. */
export function seatsFromButton(s) {
  const i = s.players.findIndex((p) => p.seat === s.button);
  return s.players.map((_, k) => s.players[(i + 1 + k) % s.players.length].seat);
}

function startHand({ seats, button, sb, bb }) {
  if (!Array.isArray(seats) || seats.length < 2 || seats.length > MAX_SEATS) fail('BAD_EVENT', 'need 2-6 seats');
  const ids = seats.map((x) => x.seat);
  if (new Set(ids).size !== ids.length || ids.some((x) => !Number.isInteger(x) || x < 0 || x >= MAX_SEATS)) {
    fail('BAD_EVENT', 'seats must be distinct integers 0-5');
  }
  if (seats.some((x) => !Number.isInteger(x.stack) || x.stack <= 0)) fail('BAD_EVENT', 'stacks must be positive integers');
  if (!ids.includes(button)) fail('BAD_EVENT', 'button must be an occupied seat');
  if (!Number.isInteger(sb) || !Number.isInteger(bb) || sb <= 0 || bb < sb) fail('BAD_EVENT', 'bad blinds');

  const players = seats
    .slice()
    .sort((a, b) => a.seat - b.seat)
    .map(({ seat, stack }) => ({ seat, stack, committed: 0, total: 0, folded: false, allIn: false, acted: false, hole: null }));
  const s = {
    sb, bb, button, sbSeat: 0, bbSeat: 0,
    street: 'preflop', board: [], players,
    currentBet: bb, minRaise: bb, toAct: null, needsBoard: null, result: null,
  };
  s.sbSeat = players.length === 2 ? button : seatAfter(s, button);
  s.bbSeat = seatAfter(s, s.sbSeat);
  post(playerAt(s, s.sbSeat), sb);
  post(playerAt(s, s.bbSeat), bb);
  return s;
}

function seatAfter(s, seat) {
  const i = s.players.findIndex((p) => p.seat === seat);
  return s.players[(i + 1) % s.players.length].seat;
}

function post(p, amount) {
  const pay = Math.min(amount, p.stack);
  p.stack -= pay;
  p.committed += pay;
  p.total += pay;
  if (p.stack === 0) p.allIn = true;
}

function checkCards(s, cards, count) {
  if (!Array.isArray(cards) || cards.length !== count || cards.some((c) => !Number.isInteger(c) || c < 0 || c > 51)) {
    fail('BAD_EVENT', `expected ${count} cards`);
  }
  const used = new Set(s.board);
  for (const p of s.players) if (p.hole) p.hole.forEach((c) => used.add(c));
  for (const c of cards) {
    if (used.has(c)) fail('DUPLICATE_CARD', `card ${c} already dealt`);
    used.add(c);
  }
}

function dealHole(s, { seat, cards }) {
  if (s.players.every((p) => p.hole)) fail('BAD_EVENT', 'hole cards already dealt');
  const p = playerAt(s, seat);
  if (p.hole) fail('BAD_EVENT', `seat ${seat} already has hole cards`);
  checkCards(s, cards, 2);
  p.hole = cards.slice();
  if (s.players.every((q) => q.hole)) beginAction(s, s.bbSeat);
}

function dealBoard(s, { cards }) {
  if (!s.needsBoard) fail('BAD_EVENT', 'no board cards expected');
  checkCards(s, cards, BOARD_SIZE[s.needsBoard] - s.board.length);
  s.board.push(...cards);
  s.needsBoard = null;
  beginAction(s, s.button);
}

function needsToAct(s, p) {
  if (p.folded || p.allIn) return false;
  if (p.committed < s.currentBet) return true;
  if (p.acted) return false;
  return s.players.some((q) => q !== p && !q.folded && !q.allIn);
}

function nextToAct(s, afterSeat) {
  const n = s.players.length;
  const start = s.players.findIndex((p) => p.seat === afterSeat);
  for (let k = 1; k <= n; k += 1) {
    const p = s.players[(start + k) % n];
    if (needsToAct(s, p)) return p.seat;
  }
  return null;
}

// Hands the turn to the next player after `afterSeat`, or closes the street if nobody must act.
function beginAction(s, afterSeat) {
  s.toAct = nextToAct(s, afterSeat);
  if (s.toAct === null) closeStreet(s);
}

function act(s, { seat, action, amount }) {
  if (s.toAct === null) fail('HAND_NOT_READY', 'no action expected now');
  if (seat !== s.toAct) fail('NOT_YOUR_TURN', `seat ${s.toAct} is to act`);
  const legal = legalActions(s);
  const p = playerAt(s, seat);
  if (action === 'fold') {
    p.folded = true;
  } else if (action === 'check') {
    if (!legal.canCheck) fail('ILLEGAL_ACTION', 'cannot check facing a bet');
  } else if (action === 'call') {
    if (legal.canCheck) fail('ILLEGAL_ACTION', 'nothing to call');
    post(p, legal.toCall);
  } else if (action === 'bet' || action === 'raise') {
    raise(s, p, legal, action, amount);
  } else {
    fail('ILLEGAL_ACTION', `unknown action ${action}`);
  }
  p.acted = true;
  const live = s.players.filter((q) => !q.folded);
  if (live.length === 1) {
    finishByFold(s, live[0]);
    return;
  }
  beginAction(s, seat);
}

function raise(s, p, legal, action, amount) {
  if (action !== legal.raiseKind) fail('ILLEGAL_ACTION', `use ${legal.raiseKind}`);
  if (!legal.canRaise) fail('ILLEGAL_ACTION', 'raising is not allowed');
  if (!Number.isInteger(amount) || amount > legal.maxRaiseTo || amount <= s.currentBet) {
    fail('BAD_AMOUNT', 'invalid raise amount');
  }
  if (amount < legal.minRaiseTo) fail('BELOW_MIN_RAISE', `minimum is ${legal.minRaiseTo}`);
  const size = amount - s.currentBet;
  post(p, amount - p.committed);
  if (size >= s.minRaise) {
    s.minRaise = size;
    for (const q of s.players) if (q !== p) q.acted = false;
  }
  s.currentBet = amount;
}

function returnUncalled(s) {
  const byCommit = s.players.slice().sort((a, b) => b.committed - a.committed);
  const excess = byCommit[0].committed - byCommit[1].committed;
  if (excess <= 0) return;
  const top = byCommit[0];
  top.committed -= excess;
  top.total -= excess;
  top.stack += excess;
  top.allIn = false;
}

function closeStreet(s) {
  returnUncalled(s);
  s.toAct = null;
  for (const p of s.players) {
    p.committed = 0;
    p.acted = false;
  }
  s.currentBet = 0;
  s.minRaise = s.bb;
  if (s.street === 'river') {
    showdown(s);
    return;
  }
  s.street = NEXT_STREET[s.street];
  s.needsBoard = s.street;
}

function finish(s, result) {
  const net = {};
  for (const p of s.players) net[p.seat] = (result.awards[p.seat] ?? 0) - p.total;
  s.result = { ...result, net };
  s.street = 'complete';
  s.toAct = null;
  s.needsBoard = null;
}

function finishByFold(s, winner) {
  returnUncalled(s);
  const amount = s.players.reduce((sum, p) => sum + p.total, 0);
  winner.stack += amount;
  finish(s, {
    showdown: false,
    pots: [{ amount, eligible: [winner.seat], winners: [winner.seat] }],
    awards: { [winner.seat]: amount },
    shown: [],
  });
}

function showdown(s) {
  const live = s.players.filter((p) => !p.folded);
  const scores = {};
  for (const p of live) scores[p.seat] = evaluate([...p.hole, ...s.board]);
  const pots = buildPots(s.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  const { pots: awarded, awards } = awardPots(pots, (seat) => scores[seat], seatsFromButton(s));
  for (const p of s.players) p.stack += awards[p.seat] ?? 0;
  finish(s, { showdown: true, pots: awarded, awards, shown: live.map((p) => p.seat), scores });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/engine/handState.test.js`
Expected: PASS (13 tests). If an expectation fails, re-derive it by hand from the rules above before touching the implementation, and report any test expectation you believe is wrong instead of silently changing it.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/engine/handState.js src/private/trainers/poker/engine/handState.test.js
git commit -m "Add event-sourced NLHE hand state with blinds, raises, side pots and showdown

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Dealer, simulator, table helpers and property tests

**Files:**
- Create: `src/private/trainers/poker/engine/dealer.js`
- Create: `src/private/trainers/poker/engine/simulate.js`
- Create: `src/private/trainers/poker/engine/table.js`
- Test: `src/private/trainers/poker/engine/dealer.test.js`
- Test: `src/private/trainers/poker/engine/engine.property.test.js`

**Interfaces:**
- Consumes: `newDeck`, `shuffle` from `./cards.js`; `applyEvent`, `reduceHand`, `legalActions` from `./handState.js`; `mulberry32` from `../../core/rng.js`.
- Produces:
  - `dealHand({seats, button, sb, bb, rng}) → { deck:number[], events:[StartEvent, ...HoleEvent], boardEvent(street:'flop'|'turn'|'river') → BoardEvent }`. Hole cards are dealt one card at a time starting left of the button. The flop, turn and river each come after one burn card.
  - `playHand({seats, button, sb, bb, rng, policy}) → { events, state }`, where `policy(state, legal, rng) → {action, amount?}`. It throws if a hand exceeds 500 events.
  - `randomPolicy(state, legal, rng) → {action, amount?}`: always legal.
  - `nextButton(seatIds:number[], previous:number) → number`, `stacksAfter(state) → {seat, stack}[]`.

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/engine/dealer.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { dealHand } from './dealer.js';
import { reduceHand } from './handState.js';
import { nextButton, stacksAfter } from './table.js';

const seats = [{ seat: 1, stack: 200 }, { seat: 3, stack: 200 }, { seat: 4, stack: 200 }];

describe('dealer', () => {
  it('deals hole cards one at a time starting left of the button, then burns before each street', () => {
    const { deck, events, boardEvent } = dealHand({ seats, button: 3, sb: 1, bb: 2, rng: mulberry32(5) });
    expect(events[0]).toEqual({ type: 'start', seats, button: 3, sb: 1, bb: 2 });
    expect(events.slice(1)).toEqual([
      { type: 'hole', seat: 4, cards: [deck[0], deck[3]] },
      { type: 'hole', seat: 1, cards: [deck[1], deck[4]] },
      { type: 'hole', seat: 3, cards: [deck[2], deck[5]] },
    ]);
    expect(boardEvent('flop')).toEqual({ type: 'board', cards: [deck[7], deck[8], deck[9]] });
    expect(boardEvent('turn')).toEqual({ type: 'board', cards: [deck[11]] });
    expect(boardEvent('river')).toEqual({ type: 'board', cards: [deck[13]] });
    expect(reduceHand(events).toAct).toBe(3); // heads-up rules don't apply; UTG is left of BB (seat 1)
  });

  it('is deterministic for a seed', () => {
    const a = dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(77) });
    const b = dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(77) });
    expect(a.events).toEqual(b.events);
  });
});

describe('table helpers', () => {
  it('moves the button to the next occupied seat, wrapping', () => {
    expect(nextButton([1, 3, 4], 1)).toBe(3);
    expect(nextButton([1, 3, 4], 4)).toBe(1);
    expect(nextButton([1, 3, 4], 2)).toBe(3); // previous button seat left the table
  });

  it('reads stacks after a hand', () => {
    const state = reduceHand(dealHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(1) }).events);
    expect(stacksAfter(state)).toEqual([{ seat: 1, stack: 200 }, { seat: 3, stack: 199 }, { seat: 4, stack: 198 }]);
  });
});
```

Check the first test's `toAct`: with button 3, the small blind is seat 4 and the big blind is seat 1, so first to act is seat 3 (the button).

```js
// src/private/trainers/poker/engine/engine.property.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { shuffle } from './cards.js';
import { reduceHand } from './handState.js';
import { playHand, randomPolicy } from './simulate.js';
import { nextButton, stacksAfter } from './table.js';

const HANDS = Number(process.env.POKER_PROPERTY_HANDS ?? 100000);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

describe('engine properties', () => {
  it(`plays ${HANDS} random hands legally, conserving chips`, () => {
    const rng = mulberry32(20260916);
    for (let h = 0; h < HANDS; h += 1) {
      const n = 2 + Math.floor(rng() * 5);
      const ids = shuffle([0, 1, 2, 3, 4, 5], rng).slice(0, n);
      const seats = ids.map((seat) => ({ seat, stack: 1 + Math.floor(rng() * 400) }));
      const button = ids[Math.floor(rng() * n)];
      const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng, policy: randomPolicy });
      const before = sum(seats.map((x) => x.stack));
      const after = sum(state.players.map((p) => p.stack));
      if (after !== before) throw new Error(`hand ${h}: chips ${before} -> ${after}`);
      if (sum(Object.values(state.result.net)) !== 0) throw new Error(`hand ${h}: net does not sum to 0`);
      if (state.players.some((p) => p.stack < 0)) throw new Error(`hand ${h}: negative stack`);
      if (h % 100 === 0) expect(reduceHand(events)).toEqual(state);
    }
  }, 300_000);

  it('plays a 6-handed session to one survivor, rotating the button', () => {
    const rng = mulberry32(99);
    let seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 200 }));
    let button = 0;
    let hands = 0;
    while (seats.length > 1 && hands < 20000) {
      const { state } = playHand({ seats, button, sb: 1, bb: 2, rng, policy: randomPolicy });
      seats = stacksAfter(state).filter((x) => x.stack > 0);
      expect(sum(seats.map((x) => x.stack))).toBe(1200);
      if (seats.length > 1) button = nextButton(seats.map((x) => x.seat), button);
      hands += 1;
    }
    expect(seats.length).toBe(1);
  }, 120_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/engine/dealer.test.js src/private/trainers/poker/engine/engine.property.test.js`
Expected: FAIL, modules `./dealer.js`, `./simulate.js`, `./table.js` not found.

- [ ] **Step 3: Write the implementations**

```js
// src/private/trainers/poker/engine/dealer.js
// Turns a seeded shuffle into hand events. Pure given `rng`.
import { newDeck, shuffle } from './cards.js';

export function dealHand({ seats, button, sb, bb, rng }) {
  const deck = shuffle(newDeck(), rng);
  const sorted = seats.map((x) => x.seat).sort((a, b) => a - b);
  const b = sorted.indexOf(button);
  const order = sorted.map((_, k) => sorted[(b + 1 + k) % sorted.length]);
  const n = order.length;
  const events = [
    { type: 'start', seats, button, sb, bb },
    ...order.map((seat, i) => ({ type: 'hole', seat, cards: [deck[i], deck[i + n]] })),
  ];
  const at = 2 * n; // next undealt card; each street burns one first
  const runout = {
    flop: deck.slice(at + 1, at + 4),
    turn: [deck[at + 5]],
    river: [deck[at + 7]],
  };
  return { deck, events, boardEvent: (street) => ({ type: 'board', cards: runout[street] }) };
}
```

```js
// src/private/trainers/poker/engine/simulate.js
// Plays a whole hand with a policy. Used by property tests now and bot training later.
import { applyEvent, legalActions } from './handState.js';
import { dealHand } from './dealer.js';

const MAX_EVENTS = 500;

export function playHand({ seats, button, sb, bb, rng, policy }) {
  const deal = dealHand({ seats, button, sb, bb, rng });
  const events = [];
  let state = null;
  const push = (event) => {
    state = applyEvent(state, event);
    events.push(event);
  };
  deal.events.forEach(push);
  while (state.street !== 'complete') {
    if (events.length > MAX_EVENTS) throw new Error('hand did not terminate');
    if (state.needsBoard) push(deal.boardEvent(state.needsBoard));
    else push({ type: 'act', seat: state.toAct, ...policy(state, legalActions(state), rng) });
  }
  return { events, state };
}

/** Uniform-ish random legal action; raise sizes are uniform between min and max. */
export function randomPolicy(state, legal, rng) {
  const roll = rng();
  if (legal.canRaise && roll < 0.25) {
    const span = legal.maxRaiseTo - legal.minRaiseTo;
    return { action: legal.raiseKind, amount: legal.minRaiseTo + Math.floor(rng() * (span + 1)) };
  }
  if (roll < 0.4 && !legal.canCheck) return { action: 'fold' };
  return legal.canCheck ? { action: 'check' } : { action: 'call' };
}
```

```js
// src/private/trainers/poker/engine/table.js
// Between-hand helpers.

export function nextButton(seatIds, previous) {
  const sorted = [...seatIds].sort((a, b) => a - b);
  return sorted.find((seat) => seat > previous) ?? sorted[0];
}

export const stacksAfter = (state) => state.players.map(({ seat, stack }) => ({ seat, stack }));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/engine/`
Expected: PASS for all engine test files (evaluator's 7-card count skipped). Note the property test's wall time in the report. If it is over 60 s, report it (do not lower `HANDS`).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all existing trainer tests and the new engine tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/engine/dealer.js src/private/trainers/poker/engine/simulate.js src/private/trainers/poker/engine/table.js src/private/trainers/poker/engine/dealer.test.js src/private/trainers/poker/engine/engine.property.test.js
git commit -m "Add poker dealer, hand simulator, button rotation and engine property tests

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Execution order

- Task 1 first.
- Tasks 2 and 3 are independent and can run in parallel after Task 1.
- Task 4 needs Tasks 2 and 3.
- Task 5 needs Task 4.
