import { describe, it, expect } from 'vitest';
import { pokerHandRecord, pokerHandId } from '../../../../../api/_lib/pokerTesting.js';
import { HAND_BUDGET_MS, gradeHand } from './gradeHand.js';

// Opt-in: POKER_SLOW=1 npx vitest run src/private/trainers/poker/analysis/gradeHand.slow.test.js
describe.skipIf(process.env.POKER_SLOW !== '1')('gradeHand timing with the production budget', () => {
  it('grades each hand within about the 2 s budget', () => {
    const times = [];
    let decisions = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const hand = pokerHandRecord({ seed, handNo: seed, id: pokerHandId(seed) });
      const started = performance.now();
      decisions += gradeHand(hand).decisions.length;
      times.push(performance.now() - started);
    }
    const worst = Math.max(...times);
    console.log(`gradeHand: ${decisions} decisions, mean ${Math.round(times.reduce((a, b) => a + b) / times.length)} ms, worst ${Math.round(worst)} ms per hand`);
    expect(worst).toBeLessThan(HAND_BUDGET_MS + 1500);
  }, 120_000);
});
