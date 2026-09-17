import { describe, it, expect } from 'vitest';
import { pokerHandRecord, pokerHandId } from '../../../../../api/_lib/pokerTesting.js';
import { buildLog } from '../bots/testHands.js';
import { HAND_BUDGET_MS, gradeHand } from './gradeHand.js';

const SIX_LINEUP = (hero) => [0, 1, 2, 3, 4, 5].filter((s) => s !== hero)
  .map((seat, i) => ({ seat, personaId: ['moss', 'viper', 'duchess', 'rook', 'ink'][i] }));

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

  it('grades a long 6-way limped multiway hand within HAND_BUDGET_MS + 1500 ms', () => {
    // Everyone limps preflop; the hero (BB) checks it down flop, turn and river against five live
    // personas — the deep, wide multiway spot the reviewer measured at ~290 ms/decision at the floor.
    const events = buildLog([
      'c 2', 'c 3', 'c 4', 'c 5', 'c 0', 'k 1',
      'B 4d5s6c', 'k 0', 'k 1', 'k 2', 'k 3', 'k 4', 'k 5',
      'B 8d', 'k 0', 'k 1', 'k 2', 'k 3', 'k 4', 'k 5',
      'B Td', 'k 0', 'k 1', 'k 2', 'k 3', 'k 4', 'k 5',
    ]);
    const record = { id: 'six-way-limp', heroSeat: 1, lineup: SIX_LINEUP(1), events };
    const started = performance.now();
    const { decisions } = gradeHand(record);
    const elapsed = performance.now() - started;
    console.log(`gradeHand six-way limped hand: ${decisions.length} decisions, ${Math.round(elapsed)} ms`);
    expect(decisions.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(HAND_BUDGET_MS + 1500);
  }, 20_000);
});
