import { parseFactKey } from '../core/facts.js';
import { weightedPick } from '../core/rng.js';
import { makeZetamacGenerator } from './generator.js';

export const DRILL_WEAK_SHARE = 0.7;
// A repeated prompt is re-drawn from the same mixed source (weak pool or
// normal, per weakShare) so a collision can land on a different weak fact
// instead of dropping out of the pool. If it keeps colliding, fall back to
// normal-only re-draws. Each stage is capped so a custom range with only one
// possible problem can't loop forever.
const MAX_REROLLS = 8;

export function problemFromFact(factKey) {
  const f = parseFactKey(factKey);
  if (!f) return null;
  const { a, b } = f;
  switch (f.op) {
    case 'add':
      return { qtype: 'z.add', prompt: `${a} + ${b}`, answer: a + b, factKey: `add:${Math.min(a, b)}+${Math.max(a, b)}`, a, b };
    case 'sub':
      return { qtype: 'z.sub', prompt: `${a + b} – ${a}`, answer: b, factKey: `sub:${a + b}-${a}`, a, b };
    case 'mul':
      return { qtype: 'z.mul', prompt: `${a} × ${b}`, answer: a * b, factKey: `mul:${a}x${b}`, a, b };
    case 'div':
      return { qtype: 'z.div', prompt: `${a * b} ÷ ${a}`, answer: b, factKey: `div:${a * b}/${a}`, a, b };
    default:
      return null;
  }
}

export function makeDrillSource(facts, rng, weakShare = DRILL_WEAK_SHARE) {
  const minWeakness = Math.min(0, ...facts.map((f) => f.weakness));
  const pool = facts
    .map((f) => ({ problem: problemFromFact(f.factKey), weight: f.weakness - minWeakness + 0.1 }))
    .filter((entry) => entry.problem);

  return (options) => {
    const normal = makeZetamacGenerator(options, rng);
    const draw = () => (pool.length > 0 && rng() < weakShare ? weightedPick(rng, pool).problem : normal());
    let previous = null;
    return function next() {
      let problem = draw();
      for (let i = 0; i < MAX_REROLLS && problem.prompt === previous; i += 1) problem = draw();
      // A tiny pool can keep colliding; finish with normal problems.
      for (let i = 0; i < MAX_REROLLS && problem.prompt === previous; i += 1) problem = normal();
      previous = problem.prompt;
      return problem;
    };
  };
}
