// Prints 7-card evaluator throughput. Informational; no pass/fail.
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { newDeck, shuffle } from '../../src/private/trainers/poker/engine/cards.js';
import { evaluate } from '../../src/private/trainers/poker/engine/evaluator.js';

const rng = mulberry32(1);
const hands = Array.from({ length: 100000 }, () => shuffle(newDeck(), rng).slice(0, 7));
const iterations = 5_000_000;
let checksum = 0;
for (let i = 0; i < 200000; i += 1) checksum ^= evaluate(hands[i % hands.length]); // warm-up
const started = performance.now();
for (let i = 0; i < iterations; i += 1) checksum ^= evaluate(hands[i % hands.length]);
const seconds = (performance.now() - started) / 1000;
console.log(`${Math.round(iterations / seconds).toLocaleString('en-US')} evaluations/sec (checksum ${checksum})`);
