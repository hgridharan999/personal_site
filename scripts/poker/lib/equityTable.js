// Offline: heads-up all-in equity of every hand class against every hand class (169 x 169).
import { evaluate } from '../../../src/private/trainers/poker/engine/evaluator.js';
import { CLASS_COUNT, CLASS_COMBOS, COMBO_CARDS } from '../../../src/private/trainers/poker/bots/handClass.js';

/** Monte Carlo equity of class `a` against class `b` over `samples` random suit choices and boards. */
export function classVsClassEquity(a, b, samples, rng) {
  const used = new Uint8Array(52);
  const hero = [0, 0, 0, 0, 0, 0, 0];
  const villain = [0, 0, 0, 0, 0, 0, 0];
  let share = 0;
  let n = 0;
  while (n < samples) {
    const ca = CLASS_COMBOS[a][Math.floor(rng() * CLASS_COMBOS[a].length)];
    const cb = CLASS_COMBOS[b][Math.floor(rng() * CLASS_COMBOS[b].length)];
    const a1 = COMBO_CARDS[2 * ca];
    const a2 = COMBO_CARDS[2 * ca + 1];
    const b1 = COMBO_CARDS[2 * cb];
    const b2 = COMBO_CARDS[2 * cb + 1];
    if (a1 === b1 || a1 === b2 || a2 === b1 || a2 === b2) continue; // card conflict: resample
    used.fill(0);
    used[a1] = 1;
    used[a2] = 1;
    used[b1] = 1;
    used[b2] = 1;
    hero[0] = a1;
    hero[1] = a2;
    villain[0] = b1;
    villain[1] = b2;
    for (let k = 2; k < 7; k += 1) {
      let card;
      do card = Math.floor(rng() * 52); while (used[card]);
      used[card] = 1;
      hero[k] = card;
      villain[k] = card;
    }
    const x = evaluate(hero);
    const y = evaluate(villain);
    share += x > y ? 1 : x === y ? 0.5 : 0;
    n += 1;
  }
  return share / samples;
}

/** @returns {Float32Array} 169*169, entry [a*169+b] = equity of a vs b; diagonal = 0.5. */
export function computeEquityTable({ samples, rng, onProgress = () => {} }) {
  const table = new Float32Array(CLASS_COUNT * CLASS_COUNT);
  for (let a = 0; a < CLASS_COUNT; a += 1) {
    table[a * CLASS_COUNT + a] = 0.5;
    for (let b = a + 1; b < CLASS_COUNT; b += 1) {
      const e = classVsClassEquity(a, b, samples, rng);
      table[a * CLASS_COUNT + b] = e;
      table[b * CLASS_COUNT + a] = 1 - e;
    }
    onProgress(a + 1);
  }
  return table;
}

/** Packs the table as base64 little-endian Uint16 (equity * 65535). */
export function encodeEquityTable(table) {
  const bytes = Buffer.alloc(table.length * 2);
  for (let i = 0; i < table.length; i += 1) bytes.writeUInt16LE(Math.round(table[i] * 65535), 2 * i);
  return bytes.toString('base64');
}
