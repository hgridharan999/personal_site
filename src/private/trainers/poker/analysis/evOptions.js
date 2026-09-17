// EV of every option at one decision by round-robin rollouts on shared seeds (common random numbers),
// so the differences between options, which decide the grade, carry far less noise than the EVs.
import { mixSeed } from './grade.js';
import { rolloutOnce } from './rollout.js';

export const MIN_ROLLOUTS = 12;
export const MAX_ROLLOUTS = 400;
const defaultNow = () => performance.now();

/**
 * @param {object} world createRolloutWorld output (passed through to `rollout`)
 * @param {{ key:string, action:string, size:number|null }[]} options
 * @param {{ seed:number, minRollouts?:number, maxRollouts?:number, budgetMs?:number, now?:() => number,
 *   rollout?:(world:object, option:object, seed:number) => number }} settings
 */
export function estimateOptionEvs(world, options, {
  seed, minRollouts = MIN_ROLLOUTS, maxRollouts = MAX_ROLLOUTS, budgetMs = Infinity, now = defaultNow, rollout = rolloutOnce,
}) {
  const rolled = options.map((option, i) => [option, i]).filter(([option]) => option.action !== 'fold');
  const buffers = options.map(() => new Float64Array(maxRollouts));
  const timed = budgetMs !== Infinity;
  const started = timed ? now() : 0;
  let n = 0;
  while (n < maxRollouts) {
    if (timed && n >= minRollouts && now() - started >= budgetMs) break;
    const sampleSeed = mixSeed(seed, n);
    for (const [option, i] of rolled) buffers[i][n] = rollout(world, option, sampleSeed);
    n += 1;
  }
  return options.map((option, i) => {
    const samples = buffers[i].slice(0, n);
    let sum = 0;
    for (const x of samples) sum += x;
    return { ...option, mean: n > 0 ? sum / n : 0, n, samples };
  });
}

/** Standard error of the mean of a[i] - b[i]. */
export function pairedStderr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return Infinity;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i += 1) {
    const d = a[i] - b[i];
    sum += d;
    sumSq += d * d;
  }
  const mean = sum / n;
  const variance = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  return Math.sqrt(variance / n);
}

/** Best first; ties keep the input order (fold, check/call, then sizes), so the cheaper option wins a tie. */
export function rankOptions(evs) {
  return evs
    .map((option, i) => [option, i])
    .sort(([a, i], [b, j]) => b.mean - a.mean || i - j)
    .map(([option]) => option);
}
