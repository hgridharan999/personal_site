import { describe, it, expect, vi } from 'vitest';
import {
  openPokerSession, closePokerSession, savePokerHands, getPokerSession, listOpenPokerSessions, getPokerProfile,
  getPokerSessionPage, listRecentPokerSessions, getPokerHand, listUngradedPokerHands, savePokerHandGrades,
  getPokerStats, getPokerSpotHands,
} from './api.js';

describe('poker persistence api', () => {
  it('calls each poker endpoint with the right method and body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await openPokerSession({ id: 's1' }, { fetchImpl });
    await closePokerSession('s 1', { endedAt: null }, { fetchImpl });
    await savePokerHands({ hands: [] }, { fetchImpl });
    await getPokerSession('s1', { fetchImpl });
    await listOpenPokerSessions({ fetchImpl });
    await getPokerProfile({ fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/trainers/poker/sessions', 'POST', '{"id":"s1"}'],
      ['/api/trainers/poker/sessions?id=s%201', 'PATCH', '{"endedAt":null}'],
      ['/api/trainers/poker/hands', 'POST', '{"hands":[]}'],
      ['/api/trainers/poker/sessions?id=s1', 'GET', undefined],
      ['/api/trainers/poker/sessions?status=open', 'GET', undefined],
      ['/api/trainers/poker/profile', 'GET', undefined],
    ]);
  });

  it('calls the review, hand and re-grade endpoints', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await getPokerSessionPage('s 1', 0, { fetchImpl });
    await getPokerSessionPage('s1', 300, { fetchImpl });
    await listRecentPokerSessions({ fetchImpl });
    await getPokerHand('h 1', { fetchImpl });
    await listUngradedPokerHands({ sessionId: 's1', belowVersion: 1, afterHandNo: 9 }, { fetchImpl });
    await savePokerHandGrades({ grades: [] }, { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/trainers/poker/sessions?id=s%201', 'GET', undefined],
      ['/api/trainers/poker/sessions?id=s1&afterHandNo=300', 'GET', undefined],
      ['/api/trainers/poker/sessions?status=recent', 'GET', undefined],
      ['/api/trainers/poker/hands?id=h%201', 'GET', undefined],
      ['/api/trainers/poker/hands?ungraded=1&sessionId=s1&belowVersion=1&afterHandNo=9&limit=10', 'GET', undefined],
      ['/api/trainers/poker/hands', 'PATCH', '{"grades":[]}'],
    ]);
  });

  it('calls the stats endpoints', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await getPokerStats({ fetchImpl });
    await getPokerSpotHands('river.facing_bet.oop', { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/trainers/poker/stats', 'GET'],
      ['/api/trainers/poker/stats?spot=river.facing_bet.oop', 'GET'],
    ]);
  });
});
