// scripts/poker/benchmark.js
// Ship gate: every persona vs every baseline and exploit probe. Exits 1 when any gating matchup fails.
// Usage: npm run poker:benchmark -- [--hands 200000 | --smoke] [--threads N] [--equity-iterations 150]
//   [--seed 20260917] [--data src/private/trainers/poker/data/bots-v1.json] [--write]
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { createPool, defaultThreads } from './lib/pool.js';
import { runMatchups, gateVerdict, formatReport, RELEASE_HANDS, SMOKE_HANDS } from './lib/gate.js';

const { values } = parseArgs({
  options: {
    hands: { type: 'string' }, smoke: { type: 'boolean', default: false }, threads: { type: 'string' },
    'equity-iterations': { type: 'string', default: '150' }, seed: { type: 'string', default: '20260917' },
    data: { type: 'string', default: 'src/private/trainers/poker/data/bots-v1.json' }, write: { type: 'boolean', default: false },
  },
});
let hands = RELEASE_HANDS;
if (values.smoke) hands = SMOKE_HANDS;
if (values.hands !== undefined) hands = Number(values.hands);
const threads = values.threads === undefined ? defaultThreads() : Number(values.threads);
const equityIterations = Number(values['equity-iterations']);
const seed = Number(values.seed);
if (![hands, threads, equityIterations, seed].every(Number.isInteger) || hands < 1 || threads < 0 || equityIterations < 1) {
  console.error('--hands and --equity-iterations must be positive integers, --threads a non-negative integer, --seed an integer.');
  process.exit(2);
}

const data = JSON.parse(readFileSync(values.data, 'utf8'));
const started = Date.now();
const pool = createPool({ size: threads });
let verdict;
try {
  console.log(`benchmarking ${data.version}: ${data.personas.length} personas, ${hands} hands per matchup, ${threads} threads`);
  const matchups = await runMatchups({ personas: data.personas, hands, seed, equityIterations, runAll: pool.runAll });
  verdict = gateVerdict(matchups);
  console.log(formatReport(matchups));
  console.log('gating: baselines with adaptation off, probes with adaptation on; probes with adaptation off are informational');
  console.log('group vs previous version: skipped (no previous shipped version)');
  const minutes = Number(((Date.now() - started) / 60_000).toFixed(1));
  console.log(`${verdict.passed ? 'PASS' : 'FAIL'} in ${minutes} min`);
  for (const failure of verdict.failures) console.log(`  ${failure}`);
  if (values.write) {
    data.benchmark = { date: new Date().toISOString(), hands, equityIterations, seed, minutes, passed: verdict.passed, matchups };
    writeFileSync(values.data, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`wrote results to ${values.data}`);
  }
} finally {
  await pool.close();
}
process.exit(verdict.passed ? 0 : 1);
