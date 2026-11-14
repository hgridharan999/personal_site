/** Mulberry32 seeded by a 32-bit FNV-1a hash of the string. */
export function seededRand(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SPRINT_KINDS = ['percentOf', 'percentChange', 'product', 'perUnit', 'breakEven'];

const pick = (rand, items) => items[Math.floor(rand() * items.length)];
const int = (rand, lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
const n = (x) => x.toLocaleString('en-US');
/** Round to one decimal so answers never carry floating-point noise. */
const r1 = (x) => Math.round(x * 10) / 10;

// Every generator keeps its operands integral so the answer is exact.
const GENERATORS = {
  percentOf(rand) {
    const pct = 5 * int(rand, 1, 19);
    const base = 20 * int(rand, 10, 250);
    return { prompt: `What is ${pct}% of ${n(base)}?`, answer: (pct * base) / 100 };
  },
  percentChange(rand) {
    const from = 20 * int(rand, 2, 25);
    const pct = pick(rand, [-30, -25, -20, -15, -10, -5, 5, 10, 15, 20, 25, 30, 40, 50]);
    const to = from + (from * pct) / 100;
    return { prompt: `Revenue went from ${n(from)} to ${n(to)}. Percent change?`, answer: pct };
  },
  product(rand) {
    const tenths = int(rand, 2, 40);
    const price = pick(rand, [5, 10, 15, 20, 25, 40, 45, 50, 60, 75]);
    return {
      prompt: `${(tenths / 10).toFixed(1)}M units at $${n(price)} each. Revenue in $M?`,
      answer: r1((tenths * price) / 10),
    };
  },
  perUnit(rand) {
    const tenths = int(rand, 5, 90);
    const customers = pick(rand, [2000, 2500, 4000, 5000, 8000, 10000, 12500, 20000]);
    return {
      prompt: `$${(tenths / 10).toFixed(1)}M revenue over ${n(customers)} customers. Revenue per customer in $?`,
      answer: r1((tenths * 100000) / customers),
    };
  },
  breakEven(rand) {
    const fixed = 10000 * int(rand, 3, 30);
    const margin = pick(rand, [10, 20, 25, 40, 50]);
    const variable = pick(rand, [10, 15, 20, 30]);
    return {
      prompt: `Fixed costs $${n(fixed)}, price $${n(variable + margin)}, variable cost $${n(variable)}. Break-even units?`,
      answer: fixed / margin,
    };
  },
};

/** The night's five problems, one per kind, in SPRINT_KINDS order. */
export function sprintProblems(night) {
  const rand = seededRand('sprint:' + night);
  return SPRINT_KINDS.map((kind) => ({ kind, ...GENERATORS[kind](rand) }));
}

/** Right when within 1% of the answer. */
export function isCorrect(given, answer) {
  return Number.isFinite(given) && Math.abs(given - answer) <= 0.01 * Math.abs(answer);
}

export function scoreSprint(night, answers) {
  const correct = sprintProblems(night).map((p, i) => isCorrect(answers?.[i] ?? null, p.answer));
  return { score: correct.filter(Boolean).length, correct };
}
