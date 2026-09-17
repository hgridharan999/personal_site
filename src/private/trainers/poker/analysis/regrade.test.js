import { describe, it, expect, vi } from 'vitest';
import { ANALYSIS_VERSION } from './version.js';
import { REGRADE_PAGE, REGRADE_BATCH, regradeSession, regradeHand } from './regrade.js';

const hand = (n) => ({ id: `h${n}`, handNo: n, heroSeat: 0, lineup: [{ seat: 1, personaId: 'moss' }], events: [{ type: 'start', n }] });
const decision = (n) => ({ idx: 7, grade: 'good', n });

function fakeApi(pages) {
  const queue = [...pages];
  return {
    listUngradedPokerHands: vi.fn(async () => queue.shift()),
    savePokerHandGrades: vi.fn(async ({ grades }) => ({ updated: grades.map((g) => g.handId), skipped: [], missing: [] })),
  };
}

describe('regradeSession', () => {
  it('grades every page, saves in batches and counts failures', async () => {
    expect([REGRADE_PAGE, REGRADE_BATCH]).toEqual([10, 5]);
    const api = fakeApi([
      { hands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(hand), nextAfterHandNo: 10 },
      { hands: [11, 12].map(hand), nextAfterHandNo: null },
    ]);
    const analyze = vi.fn(async (record) => {
      if (record.id === 'h3') throw new Error('timed out');
      if (record.id === 'h4') return { decisions: [], heroAllinEv: null };
      return { decisions: [decision(Number(record.id.slice(1)))], heroAllinEv: record.id === 'h1' ? 4.5 : null };
    });
    const progress = [];
    const result = await regradeSession({ sessionId: 's1', api, analyze, onProgress: (p) => progress.push(p) });
    expect(result).toEqual({ graded: 10, failed: 2, cancelled: false });
    expect(api.listUngradedPokerHands.mock.calls.map(([q]) => q)).toEqual([
      { sessionId: 's1', belowVersion: ANALYSIS_VERSION, afterHandNo: 0, limit: 10 },
      { sessionId: 's1', belowVersion: ANALYSIS_VERSION, afterHandNo: 10, limit: 10 },
    ]);
    expect(analyze.mock.calls[0][0]).toEqual({ id: 'h1', heroSeat: 0, lineup: [{ seat: 1, personaId: 'moss' }], events: [{ type: 'start', n: 1 }] });
    const saved = api.savePokerHandGrades.mock.calls.map(([body]) => body.grades.map((g) => g.handId));
    expect(saved).toEqual([['h1', 'h2', 'h5', 'h6', 'h7'], ['h8', 'h9', 'h10', 'h11', 'h12']]);
    expect(api.savePokerHandGrades.mock.calls[0][0].grades[0]).toEqual({
      handId: 'h1', analysisVersion: ANALYSIS_VERSION, decisions: [decision(1)], heroAllinEv: 4.5,
    });
    expect(progress.at(-1)).toEqual({ graded: 10, failed: 2 });
  });

  it('stops when cancelled and still saves what it graded', async () => {
    const api = fakeApi([{ hands: [1, 2, 3].map(hand), nextAfterHandNo: 3 }]);
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls += 1;
      return { decisions: [decision(calls)], heroAllinEv: null };
    });
    const result = await regradeSession({ sessionId: 's1', api, analyze, isCancelled: () => calls >= 2 });
    expect(result).toEqual({ graded: 2, failed: 0, cancelled: true });
    expect(api.listUngradedPokerHands).toHaveBeenCalledTimes(1);
    expect(api.savePokerHandGrades.mock.calls[0][0].grades.map((g) => g.handId)).toEqual(['h1', 'h2']);
  });

  it('rejects when saving fails', async () => {
    const api = fakeApi([{ hands: [hand(1)], nextAfterHandNo: null }]);
    api.savePokerHandGrades.mockRejectedValueOnce(new Error('offline'));
    await expect(regradeSession({ sessionId: 's1', api, analyze: async () => ({ decisions: [decision(1)], heroAllinEv: null }) }))
      .rejects.toThrow('offline');
  });
});

describe('regradeHand', () => {
  it('saves one graded hand and reports whether it is graded now', async () => {
    const api = fakeApi([]);
    expect(await regradeHand(hand(1), { api, analyze: async () => ({ decisions: [decision(1)], heroAllinEv: null }) })).toBe(true);
    expect(await regradeHand(hand(2), { api, analyze: async () => { throw new Error('x'); } })).toBe(false);
    expect(api.savePokerHandGrades).toHaveBeenCalledTimes(1);
  });
});
