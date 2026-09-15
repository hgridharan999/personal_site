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
