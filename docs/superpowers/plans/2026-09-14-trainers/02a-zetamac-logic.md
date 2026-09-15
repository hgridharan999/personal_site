# Phase 2a: Zetamac Logic (Tasks 4–5)

Read `00-overview.md` first. Depends on Task 2 (`core/rng.js`).

---

### Task 4: Zetamac problem generator (port of the original)

**Files:**
- Create: `src/private/trainers/zetamac/generator.js`
- Test: `src/private/trainers/zetamac/generator.test.js`

**Interfaces:**
- Consumes: `randInt(rng, min, max)` from `core/rng.js`.
- Produces:
  - `ZETAMAC_DURATIONS: number[]` = `[30, 60, 120, 300, 600]`
  - `ZETAMAC_DEFAULTS`, frozen: `{ add, sub, mul, div: true, add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100, mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100, duration: 120 }`
  - `isDefaultConfig(options): boolean`
  - `validateZetamacOptions(options): string[]`, where an empty array means valid
  - `makeZetamacGenerator(options, rng): () => ZProblem`, with `ZProblem = { qtype: 'z.add'|'z.sub'|'z.mul'|'z.div', prompt: string, answer: number, factKey: string, a: number, b: number }`

Behavior, from Zetamac's `/dist/app.js`:
- Operands are drawn left first, then right, each with `min + floor(rng() * (max-min+1))`.
- sub: draw `a` (add_left) and `b` (add_right). The prompt is `` `${a+b} – ${a}` `` with an en dash U+2013, and the answer is `b`.
- div: draw `a` (mul_left) and `b` (mul_right). If `a === 0`, re-roll the whole problem. Otherwise the prompt is `` `${a*b} ÷ ${a}` `` and the answer is `b`.
- The operation for each problem is `gens[floor(rng() * gens.length)]`, drawn from the enabled operations in the order add, sub, mul, div.
- Fact keys: `add:${min}+${max}`, `sub:${a+b}-${a}`, `mul:${a}x${b}`, `div:${a*b}/${a}`.

- [ ] **Step 1: Write the failing test**

`src/private/trainers/zetamac/generator.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import {
  ZETAMAC_DEFAULTS, ZETAMAC_DURATIONS, isDefaultConfig, validateZetamacOptions, makeZetamacGenerator,
} from './generator.js';

const N = 20000;
const draw = (options, seed = 1, n = N) => {
  const next = makeZetamacGenerator(options, mulberry32(seed));
  return Array.from({ length: n }, () => next());
};

describe('defaults', () => {
  it('match arithmetic.zetamac.com', () => {
    expect(ZETAMAC_DEFAULTS).toEqual({
      add: true, sub: true, mul: true, div: true,
      add_left_min: 2, add_left_max: 100, add_right_min: 2, add_right_max: 100,
      mul_left_min: 2, mul_left_max: 12, mul_right_min: 2, mul_right_max: 100,
      duration: 120,
    });
    expect(ZETAMAC_DURATIONS).toEqual([30, 60, 120, 300, 600]);
    expect(Object.isFrozen(ZETAMAC_DEFAULTS)).toBe(true);
  });
  it('isDefaultConfig', () => {
    expect(isDefaultConfig({ ...ZETAMAC_DEFAULTS })).toBe(true);
    expect(isDefaultConfig({ ...ZETAMAC_DEFAULTS, duration: 60 })).toBe(false);
  });
});

describe('generator', () => {
  const problems = draw(ZETAMAC_DEFAULTS);

  it('picks each enabled operation uniformly', () => {
    const counts = {};
    for (const p of problems) counts[p.qtype] = (counts[p.qtype] || 0) + 1;
    expect(Object.keys(counts).sort()).toEqual(['z.add', 'z.div', 'z.mul', 'z.sub']);
    for (const c of Object.values(counts)) expect(c / N).toBeGreaterThan(0.23), expect(c / N).toBeLessThan(0.27);
  });

  it('addition respects both ranges', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.add')) {
      expect(p.a).toBeGreaterThanOrEqual(2); expect(p.a).toBeLessThanOrEqual(100);
      expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(100);
      expect(p.answer).toBe(p.a + p.b);
      expect(p.prompt).toBe(`${p.a} + ${p.b}`);
      expect(p.factKey).toBe(`add:${Math.min(p.a, p.b)}+${Math.max(p.a, p.b)}`);
    }
  });

  it('subtraction is addition in reverse with an en dash', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.sub')) {
      expect(p.prompt).toBe(`${p.a + p.b} – ${p.a}`);
      expect(p.answer).toBe(p.b);
      expect(p.answer).toBeGreaterThanOrEqual(2);
      expect(p.factKey).toBe(`sub:${p.a + p.b}-${p.a}`);
    }
  });

  it('multiplication uses 2–12 × 2–100', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.mul')) {
      expect(p.a).toBeGreaterThanOrEqual(2); expect(p.a).toBeLessThanOrEqual(12);
      expect(p.b).toBeGreaterThanOrEqual(2); expect(p.b).toBeLessThanOrEqual(100);
      expect(p.prompt).toBe(`${p.a} × ${p.b}`);
      expect(p.answer).toBe(p.a * p.b);
      expect(p.factKey).toBe(`mul:${p.a}x${p.b}`);
    }
  });

  it('division is multiplication in reverse with integer answers', () => {
    for (const p of problems.filter((x) => x.qtype === 'z.div')) {
      expect(p.prompt).toBe(`${p.a * p.b} ÷ ${p.a}`);
      expect(p.answer).toBe(p.b);
      expect(Number.isInteger(p.answer)).toBe(true);
      expect(p.factKey).toBe(`div:${p.a * p.b}/${p.a}`);
    }
  });

  it('only generates enabled operations', () => {
    const onlyMul = draw({ ...ZETAMAC_DEFAULTS, add: false, sub: false, div: false }, 3, 500);
    expect(new Set(onlyMul.map((p) => p.qtype))).toEqual(new Set(['z.mul']));
  });

  it('re-rolls division when the left operand is 0', () => {
    const opts = { ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, mul_left_min: 0, mul_left_max: 1 };
    for (const p of draw(opts, 5, 2000)) expect(p.a).toBe(1);
  });

  it('is deterministic for a seed', () => {
    expect(draw(ZETAMAC_DEFAULTS, 9, 50)).toEqual(draw(ZETAMAC_DEFAULTS, 9, 50));
  });
});

describe('validateZetamacOptions', () => {
  it('accepts defaults', () => {
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS })).toEqual([]);
  });
  it('rejects bad settings', () => {
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, div: false }))
      .toContain('Enable at least one operation.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add_left_min: 50, add_left_max: 10 }))
      .toContain('Addition left range: min must be ≤ max.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, mul_right_max: 2.5 }))
      .toContain('Multiplication right max must be a whole number from 0 to 10000.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, duration: 90 }))
      .toContain('Duration must be one of 30, 60, 120, 300, 600 seconds.');
    expect(validateZetamacOptions({ ...ZETAMAC_DEFAULTS, add: false, sub: false, mul: false, mul_left_min: 0, mul_left_max: 0 }))
      .toContain('Division needs a multiplication left range that includes a non-zero number.');
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/zetamac/generator.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement**

`src/private/trainers/zetamac/generator.js`:

```js
import { randInt } from '../core/rng.js';

// Line-for-line port of arithmetic.zetamac.com /dist/app.js problem generation.

export const ZETAMAC_DURATIONS = [30, 60, 120, 300, 600];

export const ZETAMAC_DEFAULTS = Object.freeze({
  add: true,
  sub: true,
  mul: true,
  div: true,
  add_left_min: 2,
  add_left_max: 100,
  add_right_min: 2,
  add_right_max: 100,
  mul_left_min: 2,
  mul_left_max: 12,
  mul_right_min: 2,
  mul_right_max: 100,
  duration: 120,
});

const RANGES = [
  ['add_left', 'Addition left'],
  ['add_right', 'Addition right'],
  ['mul_left', 'Multiplication left'],
  ['mul_right', 'Multiplication right'],
];

export function isDefaultConfig(options) {
  return Object.keys(ZETAMAC_DEFAULTS).every((k) => options[k] === ZETAMAC_DEFAULTS[k]);
}

export function validateZetamacOptions(o) {
  const errors = [];
  if (!o.add && !o.sub && !o.mul && !o.div) errors.push('Enable at least one operation.');
  for (const [key, label] of RANGES) {
    for (const end of ['min', 'max']) {
      const v = o[`${key}_${end}`];
      if (!Number.isInteger(v) || v < 0 || v > 10000) {
        errors.push(`${label} ${end} must be a whole number from 0 to 10000.`);
      }
    }
    if (o[`${key}_min`] > o[`${key}_max`]) errors.push(`${label} range: min must be ≤ max.`);
  }
  if (!ZETAMAC_DURATIONS.includes(o.duration)) {
    errors.push(`Duration must be one of ${ZETAMAC_DURATIONS.join(', ')} seconds.`);
  }
  if (o.div && o.mul_left_max === 0) {
    errors.push('Division needs a multiplication left range that includes a non-zero number.');
  }
  return errors;
}

export function makeZetamacGenerator(options, rng) {
  const operand = (key) => () => randInt(rng, options[`${key}_min`], options[`${key}_max`]);
  const addLeft = operand('add_left');
  const addRight = operand('add_right');
  const mulLeft = operand('mul_left');
  const mulRight = operand('mul_right');

  const gens = [];
  if (options.add) {
    gens.push(() => {
      const a = addLeft();
      const b = addRight();
      return { qtype: 'z.add', prompt: `${a} + ${b}`, answer: a + b, factKey: `add:${Math.min(a, b)}+${Math.max(a, b)}`, a, b };
    });
  }
  if (options.sub) {
    gens.push(() => {
      const a = addLeft();
      const b = addRight();
      return { qtype: 'z.sub', prompt: `${a + b} – ${a}`, answer: b, factKey: `sub:${a + b}-${a}`, a, b };
    });
  }
  if (options.mul) {
    gens.push(() => {
      const a = mulLeft();
      const b = mulRight();
      return { qtype: 'z.mul', prompt: `${a} × ${b}`, answer: a * b, factKey: `mul:${a}x${b}`, a, b };
    });
  }
  if (options.div) {
    gens.push(() => {
      const a = mulLeft();
      const b = mulRight();
      if (a === 0) return null; // original re-rolls
      return { qtype: 'z.div', prompt: `${a * b} ÷ ${a}`, answer: b, factKey: `div:${a * b}/${a}`, a, b };
    });
  }

  return function next() {
    let problem = null;
    while (problem == null) problem = gens[Math.floor(rng() * gens.length)]();
    return problem;
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/zetamac/generator.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/zetamac/generator.js src/private/trainers/zetamac/generator.test.js
git commit -m "Port Zetamac problem generator with defaults and validation" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Zetamac per-problem tracker

**Files:**
- Create: `src/private/trainers/zetamac/tracker.js`
- Test: `src/private/trainers/zetamac/tracker.test.js`

**Interfaces:**
- Consumes: `ZProblem` from Task 4.
- Produces:
  - `startProblem(problem: ZProblem, idx: number, now: number): TrackerState`, with `TrackerState = { problem, idx, shownAt, corrections, wasFullWrong }`
  - `handleInput(state, value: string, now: number): { state: TrackerState, attempt: Attempt | null }`. `attempt` is non-null exactly when `value.trim() === String(problem.answer)`, which is Zetamac's match rule.
  - `handleDeleteKey(state): TrackerState`, which adds 1 correction
  - `unfinishedAttempt(state, value: string): Attempt`, for the problem showing at time-out: `isCorrect: false`, `timeMs: null`, `response` = trimmed value or `null`
  - `zetamacTotals(attempts: Attempt[]): { correct, wrong: 0, unanswered: 0, score }`, where score = correct

Correction rule (spec §4.3): +1 per Backspace/Delete keypress, and +1 each time the trimmed input *enters* the state "length ≥ answer length and not matching". Staying in that state doesn't add more.

- [ ] **Step 1: Write the failing test**

`src/private/trainers/zetamac/tracker.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { startProblem, handleInput, handleDeleteKey, unfinishedAttempt, zetamacTotals } from './tracker.js';

const problem = { qtype: 'z.mul', prompt: '7 × 83', answer: 581, factKey: 'mul:7x83', a: 7, b: 83 };

describe('tracker', () => {
  it('accepts an exact trimmed match and records time', () => {
    let s = startProblem(problem, 3, 1000);
    ({ state: s } = handleInput(s, '5', 1500));
    ({ state: s } = handleInput(s, '58', 1800));
    const { attempt } = handleInput(s, ' 581 ', 3140.4);
    expect(attempt).toEqual({
      idx: 3, qtype: 'z.mul', factKey: 'mul:7x83', prompt: '7 × 83',
      answer: '581', response: '581', isCorrect: true, timeMs: 2140, corrections: 0,
    });
  });

  it('counts entering a full-length wrong state once, plus deletes', () => {
    let s = startProblem(problem, 0, 0);
    let r = handleInput(s, '582', 10); s = r.state;
    expect(r.attempt).toBeNull();
    expect(s.corrections).toBe(1);
    r = handleInput(s, '5822', 20); s = r.state;
    expect(s.corrections).toBe(1);
    s = handleDeleteKey(s);
    r = handleInput(s, '582', 30); s = r.state;
    s = handleDeleteKey(s);
    r = handleInput(s, '58', 40); s = r.state;
    expect(s.corrections).toBe(3);
    r = handleInput(s, '581', 50);
    expect(r.attempt.corrections).toBe(3);
  });

  it('does not accept a prefix or a numerically equal but different string', () => {
    const s = startProblem({ ...problem, answer: 5, prompt: '10 ÷ 2' }, 0, 0);
    expect(handleInput(s, '05', 1).attempt).toBeNull();
    expect(handleInput(s, '5.0', 1).attempt).toBeNull();
  });

  it('unfinishedAttempt', () => {
    const s = startProblem(problem, 7, 0);
    expect(unfinishedAttempt(s, ' 58')).toMatchObject({ idx: 7, response: '58', isCorrect: false, timeMs: null });
    expect(unfinishedAttempt(s, '')).toMatchObject({ response: null });
  });

  it('zetamacTotals counts correct answers only', () => {
    const attempts = [{ isCorrect: true }, { isCorrect: true }, { isCorrect: false }];
    expect(zetamacTotals(attempts)).toEqual({ correct: 2, wrong: 0, unanswered: 0, score: 2 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/zetamac/tracker.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement**

`src/private/trainers/zetamac/tracker.js`:

```js
// Per-problem input tracking for a Zetamac game. Pure: the UI owns the clock
// (performance.now()) and passes it in.

export function startProblem(problem, idx, now) {
  return { problem, idx, shownAt: now, corrections: 0, wasFullWrong: false };
}

function toAttempt(state, response, isCorrect, timeMs) {
  const { problem } = state;
  return {
    idx: state.idx,
    qtype: problem.qtype,
    factKey: problem.factKey,
    prompt: problem.prompt,
    answer: String(problem.answer),
    response,
    isCorrect,
    timeMs,
    corrections: state.corrections,
  };
}

export function handleInput(state, value, now) {
  const answer = String(state.problem.answer);
  const trimmed = value.trim();
  if (trimmed === answer) {
    return { state, attempt: toAttempt(state, trimmed, true, Math.round(now - state.shownAt)) };
  }
  const fullWrong = trimmed.length >= answer.length;
  const corrections = state.corrections + (fullWrong && !state.wasFullWrong ? 1 : 0);
  return { state: { ...state, corrections, wasFullWrong: fullWrong }, attempt: null };
}

export function handleDeleteKey(state) {
  return { ...state, corrections: state.corrections + 1 };
}

export function unfinishedAttempt(state, value) {
  return toAttempt(state, value.trim() || null, false, null);
}

export function zetamacTotals(attempts) {
  const correct = attempts.filter((a) => a.isCorrect).length;
  return { correct, wrong: 0, unanswered: 0, score: correct };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/zetamac/tracker.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/zetamac/tracker.js src/private/trainers/zetamac/tracker.test.js
git commit -m "Add Zetamac per-problem timing and correction tracker" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
