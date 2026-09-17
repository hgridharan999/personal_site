import { describe, it, expect, vi } from 'vitest';
import {
  createPokerStatsHandler, TENDENCY_MAX_HANDS, LEAK_WINDOW_HANDS, LEAK_LIMIT, TREND_SESSIONS, SPOT_HANDS_LIMIT,
} from './stats.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { pokerHandRecord } from '../../_lib/pokerTesting.js';
import { LEAK_EXAMPLES, LEAK_MIN_DECISIONS, shapeLeaks, pickFocus } from '../../_lib/pokerStatsShape.js';
import { SEVERITY_GRADES } from '../../_lib/pokerReview.js';
import { emptyTendencies, accumulateTendencies, shapeTendencies } from '../../../src/private/trainers/poker/leaks/tendencies.js';

const make = (sql, extra = {}) => createPokerStatsHandler({ getSql: () => sql, auth: () => TEST_AUTH, ...extra });

async function call(handler, options = {}) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

const summaryRow = (overrides = {}) => ({ hands: 0, sessions: 0, gradedHands: 0, decisions: 0, confidentDecisions: 0, ...overrides });

describe('api/trainers/poker/stats', () => {
  it('405 for POST, 401 without a session, 500 without a database, never cached', async () => {
    let res = await call(make(mockSql()), { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    res = await call(make(mockSql()), { authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
    res = mockRes();
    await createPokerStatsHandler({ getSql: () => null, auth: () => TEST_AUTH })(authedReq(), res);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  it('keeps the documented limits', () => {
    expect([TENDENCY_MAX_HANDS, LEAK_WINDOW_HANDS, LEAK_LIMIT, TREND_SESSIONS, SPOT_HANDS_LIMIT]).toEqual([2000, 10000, 20, 50, 50]);
  });

  it('returns empty panels when nothing is stored', async () => {
    const res = await call(make(mockSql([[summaryRow()], [], [], []])));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      summary: { ...summaryRow(), unlockHands: 200, minSpotDecisions: 15 },
      tendencies: shapeTendencies(emptyTendencies()),
      leaks: [],
      trend: [],
      focus: null,
    });
  });

  it('treats a missing summary row as zeros', async () => {
    const res = await call(make(mockSql([[], [], [], []])));
    expect(res.body.summary).toEqual({ ...summaryRow(), unlockHands: 200, minSpotDecisions: 15 });
  });

  it('runs the four queries with their limits', async () => {
    const sql = mockSql([[summaryRow()], [], [], []]);
    await call(make(sql));
    const [summary, leaks, trend, hands] = sql.queries;
    expect(sql.queries).toHaveLength(4);
    for (const fragment of [
      'FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT', 'min(played_at) FROM decided',
      'r.hero_actions = 0 OR EXISTS', 'FROM graded', 'WHERE hands > 0',
    ]) {
      expect(summary.text).toContain(fragment);
    }
    expect(summary.values).toEqual([LEAK_WINDOW_HANDS]);
    for (const fragment of [
      'WHERE d.confident', 'GROUP BY spot, hand_id', 'DISTINCT ON (spot)',
      'array_agg(p.hand_id::text ORDER BY p.loss DESC, p.hand_id) FILTER (WHERE p.loss > 0)', 'HAVING sum(p.n) >=',
      // ev_loss is real (float4); the exposed sum must go through numeric to avoid float4 noise
      // (e.g. 1.100000023841858) leaking into the response.
      'sum(ev_loss::numeric) AS loss', 'round(COALESCE(sum(p.loss), 0), 2)::float8 AS "evLoss"',
    ]) {
      expect(leaks.text).toContain(fragment);
    }
    expect(leaks.values).toEqual([LEAK_WINDOW_HANDS, LEAK_EXAMPLES, LEAK_MIN_DECISIONS, LEAK_LIMIT]);
    for (const fragment of [
      'WHERE hands > 0', 'CROSS JOIN LATERAL', 'ORDER BY s.started_at, s.id',
      'round(COALESCE(sum(pd.ev_loss::numeric), 0), 2)::float8 AS ev_loss',
    ]) {
      expect(trend.text).toContain(fragment);
    }
    expect(trend.values).toEqual([TREND_SESSIONS]);
    expect(hands.text).toContain('ORDER BY played_at DESC, id DESC');
    expect(hands.values).toEqual([TENDENCY_MAX_HANDS]);
  });

  it('gradedHands only counts hands with a decision or no hero actions, from the first decided hand on', async () => {
    // Documents the "graded" CTE contract in stats.js: a hand only counts toward gradedHands
    // once it is at/after the earliest decided hand, AND either it needed no decision
    // (hero_actions = 0) or it has one. A hand with hero actions but no decision yet (grading
    // timed out, not yet re-graded) is excluded, so it can't unlock leaks early or dilute BB/100.
    const sql = mockSql([[summaryRow()], [], [], []]);
    await call(make(sql));
    const [summary] = sql.queries;
    expect(summary.text).toMatch(/WITH recent AS[\s\S]*hero_actions/);
    expect(summary.text).toContain('WHERE r.played_at >= (SELECT min(played_at) FROM decided)');
    expect(summary.text).toContain('r.hero_actions = 0 OR EXISTS (SELECT 1 FROM decided d WHERE d.hand_id = r.id)');
    expect(summary.text).toContain('(SELECT count(*) FROM graded)::int AS "gradedHands"');
  });

  it('excludes a spot with zero confident EV lost from leaks and focus', async () => {
    const zeroLoss = { spot: 'pf.open', decisions: 40, hands: 40, mistakes: 0, evLoss: 0, costliestAction: 'raise', examples: [] };
    const realLeak = { spot: 'river.facing_bet.oop', decisions: 20, hands: 18, mistakes: 4, evLoss: 60, costliestAction: 'call', examples: ['h1'] };
    const sql = mockSql([[summaryRow({ gradedHands: 300 })], [zeroLoss, realLeak], [], []]);
    const res = await call(make(sql));
    expect(res.body.leaks.map((l) => l.spot)).toEqual(['river.facing_bet.oop']);
    expect(res.body.focus.spot).toBe('river.facing_bet.oop');
  });

  it('folds stored hands oldest first and shapes leaks, focus and trend', async () => {
    const older = pokerHandRecord({ seed: 1, handNo: 1, button: 0 });
    const newer = pokerHandRecord({ seed: 2, handNo: 2, button: 1 });
    const leakRows = [
      { spot: 'pf.open', decisions: 40, hands: 40, mistakes: 2, evLoss: 30, costliestAction: 'raise', examples: [] },
      { spot: 'river.facing_bet.oop', decisions: 20, hands: 18, mistakes: 4, evLoss: 60, costliestAction: 'call', examples: ['h1'] },
    ];
    const trendRows = [{ id: 's1', startedAt: '2026-09-16T18:00:00.000Z', hands: 100, net: 50, allinAdjNet: 20.5, decisions: 10, evLoss: 8 }];
    const handRows = [newer, older].map((r) => ({ heroSeat: r.heroSeat, events: r.events }));
    const sql = mockSql([[summaryRow({ hands: 400, sessions: 3, gradedHands: 300, decisions: 90, confidentDecisions: 80 })], leakRows, trendRows, handRows]);
    const res = await call(make(sql));

    expect(res.statusCode).toBe(200);
    const expectedTendencies = shapeTendencies(
      accumulateTendencies(accumulateTendencies(emptyTendencies(), older.heroSeat, older.events), newer.heroSeat, newer.events),
    );
    expect(res.body.tendencies).toEqual(expectedTendencies);
    const leaks = shapeLeaks(leakRows, 300);
    expect(res.body.leaks).toEqual(leaks);
    expect(res.body.leaks[0].spot).toBe('river.facing_bet.oop');
    expect(res.body.focus).toEqual(pickFocus(leaks));
    expect(res.body.trend).toEqual([
      { sessionId: 's1', startedAt: '2026-09-16T18:00:00.000Z', hands: 100, netBbPer100: 25, allinAdjBbPer100: 10.25, decisions: 10, evLostPer100Decisions: 40 },
    ]);
  });

  it('passes hand rows to the accumulator oldest first', async () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const rows = [{ heroSeat: 0, events: ['newest'] }, { heroSeat: 0, events: ['oldest'] }];
    await call(make(mockSql([[summaryRow()], [], [], rows]), { accumulate }));
    expect(accumulate.mock.calls[0][2]).toEqual(['oldest']);
    expect(accumulate.mock.calls.at(-1)[2]).toEqual(['newest']);
  });

  describe('?spot=', () => {
    it('400 for a spot outside the pattern', async () => {
      const sql = mockSql();
      const res = await call(make(sql), { query: { spot: 'Bad Spot!' } });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(sql.queries).toHaveLength(0);
    });

    it('lists the latest hands with a decision in that spot', async () => {
      const row = { handId: 'h1', sessionId: 's1', handNo: 7, playedAt: '2026-09-16T18:07:00.000Z', heroNet: -13, decisions: 1, evLoss: 5, severity: 3, confident: true };
      const sql = mockSql([[row]]);
      const res = await call(make(sql), { query: { spot: 'river.facing_bet.oop' } });
      expect(res.statusCode).toBe(200);
      const { severity, ...rest } = row;
      expect(severity).toBe(3);
      expect(res.body).toEqual({
        spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', hands: [{ ...rest, worstGrade: 'blunder' }],
      });
      expect(sql.queries).toHaveLength(1);
      const [query] = sql.queries;
      for (const fragment of [
        'WHERE d.spot =', 'GROUP BY d.hand_id', 'bool_and(d.confident)', 'ORDER BY h.played_at DESC, h.id DESC',
        'round(COALESCE(sum(d.ev_loss::numeric), 0), 2)::float8 AS "evLoss"',
      ]) {
        expect(query.text).toContain(fragment);
      }
      expect(query.values).toEqual(['river.facing_bet.oop', SPOT_HANDS_LIMIT]);
    });

    it("ties the severity CASE's grade order to SEVERITY_GRADES", async () => {
      const sql = mockSql([[]]);
      await call(make(sql), { query: { spot: 'pf.open' } });
      const [query] = sql.queries;
      SEVERITY_GRADES.forEach((grade, severity) => {
        if (severity === 0) return; // the lowest grade ('good') is the CASE's ELSE 0 branch
        expect(query.text).toContain(`WHEN '${grade}' THEN ${severity}`);
      });
    });
  });

  it('500 INTERNAL when a query fails', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const sql = mockSql(() => Promise.reject(new Error('boom')));
      const res = await call(make(sql));
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
    } finally {
      console.error = original;
    }
  });
});
