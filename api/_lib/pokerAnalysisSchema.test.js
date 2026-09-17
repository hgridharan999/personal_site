import { describe, it, expect } from 'vitest';
import { handItem } from './pokerSchemas.js';
import { pokerHandRecord, pokerHandId } from './pokerTesting.js';
import { gradeHand } from '../../src/private/trainers/poker/analysis/gradeHand.js';

// Whatever the grader produces must always pass the server schema: a rejected hand is never saved.
describe('graded hands pass the POST hands schema', () => {
  it('accepts graded random engine hands after a JSON round trip', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const hand = pokerHandRecord({ seed, handNo: seed, id: pokerHandId(seed) });
      const analysis = gradeHand(hand, { budgetMs: Infinity, minRollouts: 2, maxRollouts: 2, allinSamples: 200 });
      const heroActs = hand.events.filter((e) => e.type === 'act' && e.seat === hand.heroSeat).length;
      expect(analysis.decisions, `seed ${seed}`).toHaveLength(heroActs);
      const result = handItem.safeParse(JSON.parse(JSON.stringify({ hand, ...analysis })));
      expect(result.error?.issues ?? [], `seed ${seed}`).toEqual([]);
    }
  }, 120_000);
});
