import { describe, it, expect, vi } from 'vitest';
import { createPokerProfileHandler, PROFILE_DECISIONS, PROFILE_MAX_HANDS } from './profile.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { pokerHandRecord, findHandRecord, heroActed } from '../../_lib/pokerTesting.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';

const make = (sql, extra = {}) => createPokerProfileHandler({ getSql: () => sql, auth: () => TEST_AUTH, ...extra });

async function call(handler, options = {}) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

const row = (record) => ({
  heroSeat: record.heroSeat,
  events: record.events,
  heroActions: record.events.filter((e) => e.type === 'act' && e.seat === record.heroSeat).length,
});

describe('api/trainers/poker/profile', () => {
  it('405 for POST, 401 without a session, never cached', async () => {
    let res = await call(make(mockSql()), { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    res = await call(make(mockSql()), { authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns the empty profile when no hands are stored', async () => {
    const res = await call(make(mockSql([[]])));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ profile: emptyProfile(), hands: 0, decisions: 0 });
  });

  it('folds the stored hands, oldest first, with the bots\' accumulateProfile', async () => {
    const a = findHandRecord(heroActed, { handNo: 1 });
    const b = pokerHandRecord({ seed: 77, handNo: 2 });
    const rows = [row(a), row(b)];
    const sql = mockSql([rows]);
    const res = await call(make(sql));
    expect(res.statusCode).toBe(200);
    const expected = accumulateProfile(accumulateProfile(emptyProfile(), a.heroSeat, a.events), b.heroSeat, b.events);
    expect(res.body).toEqual({ profile: expected, hands: 2, decisions: rows[0].heroActions + rows[1].heroActions });

    const [query] = sql.queries;
    for (const fragment of [
      'sum(hero_actions) OVER (ORDER BY played_at DESC, id DESC ROWS UNBOUNDED PRECEDING)',
      'LIMIT', 'r.running - h.hero_actions <', 'ORDER BY r.played_at, r.id',
    ]) {
      expect(query.text).toContain(fragment);
    }
    expect(query.values).toEqual([PROFILE_MAX_HANDS, PROFILE_DECISIONS]);
    expect(PROFILE_DECISIONS).toBe(2000);
    expect(PROFILE_MAX_HANDS).toBe(2000);
  });

  it('passes rows to the accumulator in query order', async () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const rows = [{ heroSeat: 2, events: ['first'], heroActions: 1 }, { heroSeat: 4, events: ['second'], heroActions: 0 }];
    const res = await call(make(mockSql([rows]), { accumulate }));
    expect(accumulate.mock.calls.map(([, seat, events]) => [seat, events])).toEqual([[2, ['first']], [4, ['second']]]);
    expect(res.body.profile.hands).toBe(2);
  });

  it('500 INTERNAL when folding fails', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const accumulate = () => { throw new Error('bad log'); };
      const res = await call(make(mockSql([[{ heroSeat: 0, events: [], heroActions: 0 }]]), { accumulate }));
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
    } finally {
      console.error = original;
    }
  });
});
