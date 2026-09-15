# Phase 2b: Optiver Logic (Tasks 6–7)

Read `00-overview.md` first. Depends on Task 1 (`core/rational.js`) and Task 2 (`core/rng.js`).

---

### Task 6: Difficulty profile v1 and test generator

**Files:**
- Create: `src/private/trainers/optiver/profile-v1.js`
- Create: `src/private/trainers/optiver/generator.js`
- Test: `src/private/trainers/optiver/generator.test.js`

**Interfaces:**
- Consumes:
  - `rat`, `add`, `sub`, `mul`, `div`, `eq`, `decimalPlaces`, `isInteger`, `toCanonical` from `core/rational.js`
  - `randInt`, `pick`, `weightedPick` from `core/rng.js`
- Produces:
  - `PROFILE_V1 = { version: 1, templates: Template[] }`, where `Template = { qtype: string, weight: number, gen: (rng) => { prompt: string, answer: Rational } }`
  - `drawQuestion(profile, rng): { qtype, prompt, answer: Rational }`, a single weighted draw with no de-duplication
  - `generateOptiverTest(profile, rng, count = 80): OQuestion[]`, with `OQuestion = { idx, qtype, prompt, answer: Rational, answerText: string }` and `answerText = toCanonical(answer)`. Prompts are unique within one test.

Profile rules (spec §5.3). The weights sum to 100. All prompt fractions are in lowest terms, a readability refinement of the spec's "numerators < denominators". Decimal operands never display as whole numbers. Minus is `−` (U+2212), times is `×`, divide is `÷`.

| qtype | weight | generation |
|---|---|---|
| `o.int.add` | 12.5 | a, b ∈ [100, 999] |
| `o.int.sub` | 12.5 | a, b ∈ [100, 999], swapped so a ≥ b |
| `o.int.mul` | 12.5 | 50%: a ∈ [12, 99], b ∈ [3, 9]; else a ∈ [11, 39], b ∈ [11, 29] |
| `o.int.div` | 12.5 | d ∈ [3, 12] (70%) or [13, 25]; q ∈ [11, 99]; prompt `d·q ÷ d`, answer q |
| `o.dec.addsub` | 10 | x, y each with 1 or 2 dp in [0.1, 99.99], not whole; add or sub (50/50); sub puts the larger first |
| `o.dec.mul` | 10 | 60%: x = k·0.05 (k ∈ [1, 199], x not whole) × n ∈ [2, 20]; 30%: x ∈ {0.1..0.9} × y ∈ {1.1..9.9, not whole}; 10%: x ∈ {0.01..0.09} × y ∈ {0.1..0.9} |
| `o.dec.div` | 10 | d ∈ {0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.8, 1.5, 2.5, 4, 5, 6, 8, 12}; q = k/10, k ∈ [10, 990]; dividend = d·q must have ≤ 2 dp (else re-roll); answer q |
| `o.frac.of` | 7 | q ∈ {2, 3, 4, 5, 8, 10, 12, 20, 25}; p ∈ [1, q−1], gcd(p,q) = 1; N ∈ [10, 200]; result must terminate within ≤ 2 dp |
| `o.frac.addsub` | 7 | proper lowest-terms fractions with denominators ∈ [2, 12]; add or sub; sub puts the larger first; re-roll on a zero result |
| `o.frac.muldiv` | 6 | proper lowest-terms fractions with denominators ∈ [2, 12]; mul or div (50/50) |

- [ ] **Step 1: Write the failing test**

`src/private/trainers/optiver/generator.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import { decimalPlaces, isInteger, fromString, toCanonical } from '../core/rational.js';
import { PROFILE_V1 } from './profile-v1.js';
import { drawQuestion, generateOptiverTest } from './generator.js';

const N = 20000;
const rng = mulberry32(2026);
const draws = Array.from({ length: N }, () => drawQuestion(PROFILE_V1, rng));
const byType = (t) => draws.filter((q) => q.qtype === t);
const nums = (prompt) => prompt.match(/\d+(\.\d+)?(\/\d+)?/g);

describe('PROFILE_V1', () => {
  it('has version 1 and weights summing to 100', () => {
    expect(PROFILE_V1.version).toBe(1);
    expect(PROFILE_V1.templates.reduce((s, t) => s + t.weight, 0)).toBe(100);
  });

  it('draws each template at its weight (±1.5 points)', () => {
    for (const t of PROFILE_V1.templates) {
      const share = (byType(t.qtype).length / N) * 100;
      expect(Math.abs(share - t.weight)).toBeLessThan(1.5);
    }
  });

  it('integer questions respect their ranges', () => {
    for (const q of byType('o.int.add')) {
      const [a, b] = nums(q.prompt).map(Number);
      expect(a).toBeGreaterThanOrEqual(100); expect(b).toBeLessThanOrEqual(999);
      expect(q.prompt).toBe(`${a} + ${b}`);
      expect(q.answer).toEqual(fromString(String(a + b)));
    }
    for (const q of byType('o.int.sub')) {
      const [a, b] = nums(q.prompt).map(Number);
      expect(a).toBeGreaterThanOrEqual(b);
      expect(q.prompt).toBe(`${a} − ${b}`);
    }
    for (const q of byType('o.int.div')) {
      const [dividend, d] = nums(q.prompt).map(Number);
      expect(dividend % d).toBe(0);
      const quotient = dividend / d;
      expect(quotient).toBeGreaterThanOrEqual(11); expect(quotient).toBeLessThanOrEqual(99);
      expect(d).toBeGreaterThanOrEqual(3); expect(d).toBeLessThanOrEqual(25);
    }
  });

  it('decimal questions have decimal operands and terminating answers', () => {
    for (const t of ['o.dec.addsub', 'o.dec.mul', 'o.dec.div']) {
      for (const q of byType(t)) {
        const places = decimalPlaces(q.answer);
        expect(places).not.toBeNull();
        expect(places).toBeLessThanOrEqual(4);
        expect(q.prompt).toMatch(/\d\.\d/);
      }
    }
    for (const q of byType('o.dec.div')) {
      const [dividend] = nums(q.prompt);
      expect(decimalPlaces(fromString(dividend))).toBeLessThanOrEqual(2);
    }
  });

  it('fraction-of results terminate within 2 dp; fraction prompts are lowest terms', () => {
    for (const q of byType('o.frac.of')) {
      expect(q.prompt).toMatch(/^\d+\/\d+ of \d+$/);
      expect(decimalPlaces(q.answer)).toBeLessThanOrEqual(2);
    }
    const gcd = (a, b) => (b ? gcd(b, a % b) : a);
    for (const t of ['o.frac.of', 'o.frac.addsub', 'o.frac.muldiv']) {
      for (const q of byType(t)) {
        for (const f of q.prompt.match(/\d+\/\d+/g)) {
          const [n, d] = f.split('/').map(Number);
          expect(n).toBeLessThan(d);
          expect(gcd(n, d)).toBe(1);
        }
      }
    }
    for (const q of byType('o.frac.addsub')) expect(q.answer.n > 0n).toBe(true);
  });

  it('answers are never negative', () => {
    for (const q of draws) expect(q.answer.n >= 0n).toBe(true);
  });
});

describe('generateOptiverTest', () => {
  it('returns 80 unique, indexed questions with canonical answer text', () => {
    const test = generateOptiverTest(PROFILE_V1, mulberry32(1));
    expect(test).toHaveLength(80);
    expect(new Set(test.map((q) => q.prompt)).size).toBe(80);
    test.forEach((q, i) => {
      expect(q.idx).toBe(i);
      expect(q.answerText).toBe(toCanonical(q.answer));
    });
  });
  it('is deterministic for a seed', () => {
    const a = generateOptiverTest(PROFILE_V1, mulberry32(5)).map((q) => q.prompt);
    const b = generateOptiverTest(PROFILE_V1, mulberry32(5)).map((q) => q.prompt);
    expect(a).toEqual(b);
  });
  it('integer answers are integers for integer templates', () => {
    for (const q of generateOptiverTest(PROFILE_V1, mulberry32(9), 400)) {
      if (q.qtype.startsWith('o.int.')) expect(isInteger(q.answer)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/optiver/generator.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement the profile**

`src/private/trainers/optiver/profile-v1.js`:

```js
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
```

- [ ] **Step 4: Implement the generator**

`src/private/trainers/optiver/generator.js`:

```js
import { weightedPick } from '../core/rng.js';
import { toCanonical } from '../core/rational.js';

export function drawQuestion(profile, rng) {
  const template = weightedPick(rng, profile.templates);
  const { prompt, answer } = template.gen(rng);
  return { qtype: template.qtype, prompt, answer };
}

export function generateOptiverTest(profile, rng, count = 80) {
  const seen = new Set();
  const questions = [];
  while (questions.length < count) {
    const q = drawQuestion(profile, rng);
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt);
    questions.push({ idx: questions.length, ...q, answerText: toCanonical(q.answer) });
  }
  return questions;
}
```

- [ ] **Step 5: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/optiver/generator.test.js`
Expected: all tests PASS. If the `o.dec.div` "decimal operand" assertion fails for a prompt like `12 ÷ 4`, confirm the `isInteger(dividend) && isInteger(divisor)` re-roll is in place.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/optiver/profile-v1.js src/private/trainers/optiver/generator.js src/private/trainers/optiver/generator.test.js
git commit -m "Add Optiver 80-in-8 difficulty profile v1 and test generator" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Optiver rules, grading and scoring

**Files:**
- Create: `src/private/trainers/optiver/grade.js`
- Test: `src/private/trainers/optiver/grade.test.js`

**Interfaces:**
- Consumes: `parseRational`, `eq` from `core/rational.js`; `OQuestion` from Task 6.
- Produces:
  - `OPTIVER_RULES`, frozen: `{ questions: 80, timeLimitMs: 480000, pointsCorrect: 1, pointsWrong: -1, pointsUnreached: 0, skipping: false, goBack: false, timerVisible: false, answerFormat: 'typed' }`
  - `sanitizeInput(value: string): string`, which keeps only `[0-9./-]` and at most 32 characters
  - `gradeResponse(question: OQuestion, input: string): { valid: false } | { valid: true, response: string, isCorrect: boolean }`. `valid: false` means Enter does nothing (empty or unparsable input).
  - `buildOptiverAttempts(questions: OQuestion[], answers: {response: string, isCorrect: boolean, timeMs: number}[]): Attempt[]`, with one Attempt per question (all 80). Question i is answered when `answers[i]` exists; otherwise `response: null, isCorrect: false, timeMs: null`. `factKey: null`, `corrections: 0`.
  - `scoreOptiver(attempts: Attempt[], rules = OPTIVER_RULES): { correct, wrong, unanswered, score }`

- [ ] **Step 1: Write the failing test**

`src/private/trainers/optiver/grade.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { rat, fromString } from '../core/rational.js';
import { OPTIVER_RULES, sanitizeInput, gradeResponse, buildOptiverAttempts, scoreOptiver } from './grade.js';

const q = (answer, extra = {}) => ({ idx: 0, qtype: 'o.frac.addsub', prompt: 'p', answer, answerText: 'x', ...extra });

describe('OPTIVER_RULES', () => {
  it('matches the decided rules', () => {
    expect(OPTIVER_RULES).toEqual({
      questions: 80, timeLimitMs: 480000, pointsCorrect: 1, pointsWrong: -1, pointsUnreached: 0,
      skipping: false, goBack: false, timerVisible: false, answerFormat: 'typed',
    });
  });
});

describe('sanitizeInput', () => {
  it('keeps digits . / - only, max 32 chars', () => {
    expect(sanitizeInput('1a3/2 0')).toBe('13/20');
    expect(sanitizeInput('-0.5x')).toBe('-0.5');
    expect(sanitizeInput('9'.repeat(40))).toHaveLength(32);
  });
});

describe('gradeResponse', () => {
  it.each([
    [rat(1n, 2n), '.5', true], [rat(1n, 2n), '0.50', true], [rat(1n, 2n), '1/2', true], [rat(1n, 2n), '2/4', true],
    [rat(13n, 20n), '13/20', true], [rat(13n, 20n), '26/40', true], [rat(13n, 20n), '0.65', true],
    [rat(1n, 3n), '0.33', false], [rat(1n, 3n), '1/3', true], [rat(1n, 3n), '2/6', true],
    [fromString('7.5'), '15/2', true], [rat(581n), '581', true], [rat(581n), '582', false], [rat(0n), '-0', true],
  ])('answer %o, input %s → correct %s', (answer, input, expected) => {
    expect(gradeResponse(q(answer), input)).toEqual({ valid: true, response: input.trim(), isCorrect: expected });
  });
  it.each(['', '   ', '-', '.', '3/', '1/0', '1.2.3', '/'])('invalid input %j does nothing', (input) => {
    expect(gradeResponse(q(rat(1n)), input)).toEqual({ valid: false });
  });
});

describe('buildOptiverAttempts + scoreOptiver', () => {
  const questions = Array.from({ length: 80 }, (_, i) => ({
    idx: i, qtype: 'o.int.add', prompt: `${i} + 1`, answer: rat(BigInt(i + 1)), answerText: String(i + 1),
  }));

  it('fills unreached questions and scores +1/−1/0', () => {
    const answers = [
      { response: '1', isCorrect: true, timeMs: 5000 },
      { response: '3', isCorrect: false, timeMs: 7000 },
      { response: '3', isCorrect: true, timeMs: 4000 },
    ];
    const attempts = buildOptiverAttempts(questions, answers);
    expect(attempts).toHaveLength(80);
    expect(attempts[1]).toEqual({
      idx: 1, qtype: 'o.int.add', factKey: null, prompt: '1 + 1', answer: '2',
      response: '3', isCorrect: false, timeMs: 7000, corrections: 0,
    });
    expect(attempts[3]).toMatchObject({ response: null, isCorrect: false, timeMs: null });
    expect(scoreOptiver(attempts)).toEqual({ correct: 2, wrong: 1, unanswered: 77, score: 1 });
  });

  it('a perfect test scores 80', () => {
    const answers = questions.map((x) => ({ response: x.answerText, isCorrect: true, timeMs: 6000 }));
    expect(scoreOptiver(buildOptiverAttempts(questions, answers))).toEqual({ correct: 80, wrong: 0, unanswered: 0, score: 80 });
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/optiver/grade.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement**

`src/private/trainers/optiver/grade.js`:

```js
import { parseRational, eq } from '../core/rational.js';

// Rules decided in the spec (§2). Stored in each session's config.
export const OPTIVER_RULES = Object.freeze({
  questions: 80,
  timeLimitMs: 480000,
  pointsCorrect: 1,
  pointsWrong: -1,
  pointsUnreached: 0,
  skipping: false,
  goBack: false,
  timerVisible: false,
  answerFormat: 'typed',
});

export function sanitizeInput(value) {
  return value.replace(/[^0-9./-]/g, '').slice(0, 32);
}

export function gradeResponse(question, input) {
  const response = input.trim();
  const value = parseRational(response);
  if (!value) return { valid: false };
  return { valid: true, response, isCorrect: eq(value, question.answer) };
}

export function buildOptiverAttempts(questions, answers) {
  return questions.map((question, i) => {
    const answered = answers[i];
    return {
      idx: question.idx,
      qtype: question.qtype,
      factKey: null,
      prompt: question.prompt,
      answer: question.answerText,
      response: answered ? answered.response : null,
      isCorrect: answered ? answered.isCorrect : false,
      timeMs: answered ? answered.timeMs : null,
      corrections: 0,
    };
  });
}

export function scoreOptiver(attempts, rules = OPTIVER_RULES) {
  const correct = attempts.filter((a) => a.response !== null && a.isCorrect).length;
  const wrong = attempts.filter((a) => a.response !== null && !a.isCorrect).length;
  const unanswered = rules.questions - correct - wrong;
  const score = correct * rules.pointsCorrect + wrong * rules.pointsWrong + unanswered * rules.pointsUnreached;
  return { correct, wrong, unanswered, score };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/optiver/grade.test.js`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/optiver/grade.js src/private/trainers/optiver/grade.test.js
git commit -m "Add Optiver rules, exact grading and +1/-1 scoring" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
