import { describe, it, expect, vi } from 'vitest';
import {
  openPokerSession, closePokerSession, savePokerHands, getPokerSession, listOpenPokerSessions, getPokerProfile,
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
});
