// Regenerates src/private/trainers/poker/data/preflop/equity169.json.
// Usage: node scripts/poker/gen-preflop.js [--samples 10000] [--seed 20260916]
import { writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { computeEquityTable, encodeEquityTable } from './lib/equityTable.js';

const DIR = 'src/private/trainers/poker/data/preflop';
const { values } = parseArgs({
  options: {
    samples: { type: 'string', default: '10000' },
    seed: { type: 'string', default: '20260916' },
  },
});

mkdirSync(DIR, { recursive: true });
const equityPath = `${DIR}/equity169.json`;
const samples = Number(values.samples);
const started = Date.now();
const table = computeEquityTable({
  samples,
  rng: mulberry32(Number(values.seed)),
  onProgress: (row) => {
    if (row % 13 === 0) console.log(`equity rows ${row}/169 (${Math.round((Date.now() - started) / 1000)} s)`);
  },
});
const json = { version: 1, samples, seed: Number(values.seed), table: encodeEquityTable(table) };
writeFileSync(equityPath, `${JSON.stringify(json)}\n`);
console.log(`wrote ${equityPath}`);
