// scripts/poker/train.js
// Offline evolutionary training of persona dials. Writes src/private/trainers/poker/data/bots-vN.json.
// Exits 0 when the file is written, 2 on bad arguments or any runtime crash.
// Usage: npm run poker:train -- [--smoke] [--population 50] [--generations 150] [--patience 20] [--min-delta 1]
//   [--rounds 4] [--deals 250] [--probe-hands 3000] [--probe-weight 0.3] [--elite-count 10]
//   [--equity-iterations 150] [--threads N] [--seed 20260916] [--minutes 0] [--gate-hands 12000]
//   [--version bots-v1] [--out path]
// Budget: --population, --generations and --minutes bound the run; --deals (per mixed table per round) and
// --probe-hands (per individual per probe per generation) set the hands per evaluation.
// --smoke starts from tiny budgets (SMOKE_OPTIONS) that finish in under a minute; explicit flags still win.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPool, defaultThreads } from './lib/pool.js';
import { train, selectPersonas, TRAIN_DEFAULTS, SMOKE_OPTIONS } from './lib/trainLoop.js';

const { values } = parseArgs({
  options: {
    smoke: { type: 'boolean', default: false },
    population: { type: 'string' }, generations: { type: 'string' }, patience: { type: 'string' },
    'min-delta': { type: 'string' }, rounds: { type: 'string' }, deals: { type: 'string' },
    'probe-hands': { type: 'string' }, 'probe-weight': { type: 'string' }, 'elite-count': { type: 'string' },
    'equity-iterations': { type: 'string' }, threads: { type: 'string' }, seed: { type: 'string' },
    minutes: { type: 'string' }, 'gate-hands': { type: 'string' }, version: { type: 'string', default: 'bots-v1' },
    out: { type: 'string' },
  },
});
const base = values.smoke ? { ...TRAIN_DEFAULTS, ...SMOKE_OPTIONS } : TRAIN_DEFAULTS;
const num = (key, fallback) => (values[key] === undefined ? fallback : Number(values[key]));
const options = {
  population: num('population', base.population),
  generations: num('generations', base.generations),
  patience: num('patience', base.patience),
  minDelta: num('min-delta', base.minDelta),
  rounds: num('rounds', base.rounds),
  deals: num('deals', base.deals),
  probeHands: num('probe-hands', base.probeHands),
  probeWeight: num('probe-weight', base.probeWeight),
  equityIterations: num('equity-iterations', base.equityIterations),
  seed: num('seed', base.seed),
  minutes: num('minutes', base.minutes),
  gateHands: num('gate-hands', base.gateHands),
  eliteCount: num('elite-count', base.eliteCount),
};
const threads = num('threads', defaultThreads());
const positive = ['population', 'generations', 'patience', 'rounds', 'deals', 'probeHands', 'equityIterations', 'gateHands', 'eliteCount'];
const valid = positive.every((k) => Number.isInteger(options[k]) && options[k] >= 1)
  && Number.isInteger(options.seed) && Number.isInteger(threads) && threads >= 0
  && Number.isFinite(options.minDelta) && Number.isFinite(options.minutes) && options.minutes >= 0
  && options.probeWeight >= 0 && options.probeWeight <= 1;
if (!valid) {
  console.error('Budget flags must be positive integers, --seed an integer, --threads a non-negative integer, --minutes >= 0 and --probe-weight in [0, 1].');
  process.exit(2);
}
const out = values.out ?? `src/private/trainers/poker/data/${values.version}.json`;

async function main() {
  const started = Date.now();
  const pool = createPool({ size: threads });
  try {
    console.log(`training ${values.version} with ${threads} threads: ${JSON.stringify(options)}`);
    const result = await train({ options, runAll: pool.runAll, log: console.log });
    console.log(`stopped after ${result.generations} generations (${result.stoppedBecause}); selecting personas`);
    const personas = await selectPersonas({
      archive: result.archive, runAll: pool.runAll, gateHands: options.gateHands, seed: options.seed + 1,
      equityIterations: options.equityIterations, log: console.log,
    });
    const data = {
      version: values.version,
      createdAt: new Date().toISOString(),
      training: {
        ...options, threads, generations: result.generations, hands: result.hands, stoppedBecause: result.stoppedBecause,
        minutes: Number(((Date.now() - started) / 60_000).toFixed(1)), bestByGeneration: result.history.map((x) => Number(x.toFixed(2))),
      },
      personas,
      candidates: result.archive,
      benchmark: null,
    };
    writeFileSync(out, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote ${out}`);
    for (const p of personas) console.log(`${p.tag} ${p.name.padEnd(8)} ${p.style.padEnd(17)} fitness ${p.fitness} quick-gate worst ${p.quickGateWorst}`);
  } finally {
    await pool.close();
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(2);
  },
);
