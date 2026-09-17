// scripts/poker/train.js
// Offline evolutionary training of persona dials. Writes src/private/trainers/poker/data/bots-vN.json (what the
// client ships: personas and a training summary) and bots-vN.training.json next to it (archive candidates,
// per-generation signals and the persona re-evaluation, for analysis only). While training, a checkpoint of the
// archive and history is written to bots-vN.checkpoint.json every --checkpoint-every generations; it is removed
// once both final files are written.
// Exits 0 when the files are written, 2 on bad arguments, an unwritable output path, a persona selection that is not
// exactly 8 personas with unique ids (nothing is written) or any runtime crash.
// Usage: npm run poker:train -- [--smoke] [--population 50] [--generations 150] [--patience 20] [--min-delta 0.1]
//   [--rounds 6] [--deals 600] [--probe-hands 1800] [--probe-weight 0.3] [--elite-count 10]
//   [--archive-min-self-hands 40000] [--checkpoint-every 10] [--reeval-hands 20000] [--reeval-top-k 4]
//   [--equity-iterations 150] [--threads N] [--seed 20260916] [--minutes 0] [--gate-hands 12000]
//   [--version bots-v1] [--out path]
// Budget: --population (a multiple of 5), --generations and --minutes bound the training loop. --minutes does not
// include persona selection (re-evaluation plus quick gate, about 5 minutes at the defaults on 15 threads).
// --deals (per mixed table per round) and --probe-hands (per individual per probe per generation) set the hands
// per evaluation; at the defaults a generation is about 486,000 hands, about 50 s at 9,000-10,000 hands/s.
// --min-delta is in units of the generation-one fitness SDs (see lib/trainLoop.js).
// --archive-min-self-hands: an individual enters the archive after 2 generations or this many self-play hands.
// 40,000 puts self-play noise near 10 BB/100 (measured about 26 BB/100 SD at 6,000 hands with random anchors).
// --smoke starts from tiny budgets (SMOKE_OPTIONS) that finish in under a minute; explicit flags still win.
import { accessSync, constants, existsSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPool, defaultThreads } from './lib/pool.js';
import { train, selectPersonas, validateOptions, validatePersonaSelection, TRAIN_DEFAULTS, SMOKE_OPTIONS } from './lib/trainLoop.js';

const { values } = parseArgs({
  options: {
    smoke: { type: 'boolean', default: false },
    population: { type: 'string' }, generations: { type: 'string' }, patience: { type: 'string' },
    'min-delta': { type: 'string' }, rounds: { type: 'string' }, deals: { type: 'string' },
    'probe-hands': { type: 'string' }, 'probe-weight': { type: 'string' }, 'elite-count': { type: 'string' },
    'archive-min-self-hands': { type: 'string' }, 'checkpoint-every': { type: 'string' },
    'reeval-hands': { type: 'string' }, 'reeval-top-k': { type: 'string' },
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
  archiveMinSelfHands: num('archive-min-self-hands', base.archiveMinSelfHands),
  checkpointEvery: num('checkpoint-every', base.checkpointEvery),
  reevalHands: num('reeval-hands', base.reevalHands),
  reevalTopK: num('reeval-top-k', base.reevalTopK),
};
const threads = num('threads', defaultThreads());
const positive = ['population', 'generations', 'patience', 'rounds', 'deals', 'probeHands', 'equityIterations', 'gateHands', 'eliteCount',
  'archiveMinSelfHands', 'reevalHands', 'reevalTopK'];
const valid = positive.every((k) => Number.isInteger(options[k]) && options[k] >= 1)
  && Number.isInteger(options.seed) && Number.isInteger(threads) && threads >= 0
  && Number.isInteger(options.checkpointEvery) && options.checkpointEvery >= 0
  && Number.isFinite(options.minDelta) && Number.isFinite(options.minutes) && options.minutes >= 0
  && options.probeWeight >= 0 && options.probeWeight <= 1;
if (!valid) {
  console.error('Budget flags must be positive integers, --seed an integer, --threads and --checkpoint-every non-negative integers, --minutes >= 0 and --probe-weight in [0, 1].');
  process.exit(2);
}
const invalid = validateOptions(options);
if (invalid) {
  console.error(invalid);
  process.exit(2);
}

const out = values.out ?? `src/private/trainers/poker/data/${values.version}.json`;
const stem = out.replace(/\.json$/i, '');
const sidecarPath = `${stem}.training.json`;
const checkpointPath = `${stem}.checkpoint.json`;

/** Fails fast (before hours of training) when the output, sidecar or checkpoint cannot be written. */
function checkWritable() {
  const probe = `${stem}.write-check-${process.pid}`;
  try {
    writeFileSync(probe, '');
    rmSync(probe);
    for (const path of [out, sidecarPath, checkpointPath]) if (existsSync(path)) accessSync(path, constants.W_OK);
  } catch (err) {
    console.error(`Output path is not writable: ${out} (${err.message})`);
    process.exit(2);
  }
}

const writeJson = (path, data) => writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
const round3 = (xs) => xs.map((x) => Number(x.toFixed(3)));

async function main() {
  checkWritable();
  const started = Date.now();
  const pool = createPool({ size: threads });
  try {
    console.log(`training ${values.version} with ${threads} threads: ${JSON.stringify(options)}`);
    const checkpoint = (state) => {
      writeJson(checkpointPath, {
        version: values.version, createdAt: new Date().toISOString(), options, ...state,
        history: round3(state.history), bestByGeneration: round3(state.bestByGeneration),
      });
      console.log(`checkpoint after generation ${state.generation}: ${checkpointPath}`);
    };
    const result = await train({ options, runAll: pool.runAll, log: console.log, checkpoint });
    console.log(`stopped after ${result.generations} generations (${result.stoppedBecause}); selecting personas`);
    let selection = [];
    const personas = await selectPersonas({
      archive: result.archive, runAll: pool.runAll, gateHands: options.gateHands, seed: options.seed,
      equityIterations: options.equityIterations, probeWeight: options.probeWeight, reevalHands: options.reevalHands,
      topK: options.reevalTopK, log: console.log, onEvaluated: (rows) => { selection = rows; },
    });
    const badSelection = validatePersonaSelection(personas);
    if (badSelection) {
      console.error(`Not writing ${out}: ${badSelection}.`);
      process.exitCode = 2;
      return;
    }
    const training = {
      ...options, threads, generations: result.generations, hands: result.hands, stoppedBecause: result.stoppedBecause,
      minutesBudget: options.minutes, minutes: Number(((Date.now() - started) / 60_000).toFixed(1)),
    };
    const createdAt = new Date().toISOString();
    writeJson(out, { version: values.version, createdAt, training, personas, benchmark: null });
    console.log(`wrote ${out}`);
    writeJson(sidecarPath, {
      version: values.version, createdAt, training, scales: result.scales,
      eliteMeanByGeneration: round3(result.history), bestByGeneration: round3(result.bestByGeneration),
      candidates: result.archive, selection,
    });
    console.log(`wrote ${sidecarPath}`);
    rmSync(checkpointPath, { force: true });
    for (const p of personas) console.log(`${p.tag} ${p.name.padEnd(8)} ${p.style.padEnd(17)} fitness ${p.fitness} quick-gate worst ${p.quickGateWorst}`);
  } finally {
    await pool.close();
  }
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(2);
  },
);
