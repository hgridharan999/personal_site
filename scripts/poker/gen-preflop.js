// Regenerates src/private/trainers/poker/data/preflop/equity169.json and charts-v1.json.
// Usage: node scripts/poker/gen-preflop.js [--samples 10000] [--seed 20260916] [--charts-only]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { computeEquityTable, encodeEquityTable } from './lib/equityTable.js';
import { buildCharts } from './lib/chartGen.js';

const DIR = 'src/private/trainers/poker/data/preflop';
const { values } = parseArgs({
  options: {
    samples: { type: 'string', default: '10000' },
    seed: { type: 'string', default: '20260916' },
    'charts-only': { type: 'boolean', default: false },
  },
});

mkdirSync(DIR, { recursive: true });
const equityPath = `${DIR}/equity169.json`;
let table;
if (values['charts-only']) {
  const { decodeEquityTable } = await import('../../src/private/trainers/poker/bots/preflopEquity.js');
  table = decodeEquityTable(JSON.parse(readFileSync(equityPath, 'utf8')).table);
} else {
  const samples = Number(values.samples);
  const started = Date.now();
  table = computeEquityTable({
    samples,
    rng: mulberry32(Number(values.seed)),
    onProgress: (row) => {
      if (row % 13 === 0) console.log(`equity rows ${row}/169 (${Math.round((Date.now() - started) / 1000)} s)`);
    },
  });
  const json = { version: 1, samples, seed: Number(values.seed), table: encodeEquityTable(table) };
  writeFileSync(equityPath, `${JSON.stringify(json)}\n`);
  console.log(`wrote ${equityPath}`);
}
const charts = buildCharts(table);
writeFileSync(`${DIR}/charts-v1.json`, `${JSON.stringify(charts, null, 1)}\n`);
console.log(`wrote ${DIR}/charts-v1.json (${Object.keys(charts.charts).length} charts)`);
