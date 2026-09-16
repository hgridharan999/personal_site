import { describe, it, expect, vi } from 'vitest';
import { closeStaleSessions, STALE_AFTER_MS } from './staleSessions.js';
import { closeEntry } from './pokerOutbox.js';

const NOW = Date.parse('2026-09-16T20:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

function fakes(response) {
  return {
    api: { listOpenPokerSessions: vi.fn(async () => response) },
    outbox: { refresh: vi.fn(), hasQueued: vi.fn((id) => id === 'queued'), enqueue: vi.fn() },
    kick: vi.fn(),
  };
}

describe('closeStaleSessions', () => {
  it('waits 15 minutes of inactivity before a session counts as stale', () => {
    expect(STALE_AFTER_MS).toBe(15 * 60 * 1000);
  });

  it('queues a stale close for idle sessions with nothing queued on this device', async () => {
    const { api, outbox, kick } = fakes({
      sessions: [
        { id: 'idle', startedAt: ago(3600000), hands: 4, lastActivityAt: ago(STALE_AFTER_MS) },
        { id: 'recent', startedAt: ago(3600000), hands: 9, lastActivityAt: ago(STALE_AFTER_MS - 1) },
        { id: 'queued', startedAt: ago(3600000), hands: 1, lastActivityAt: ago(2 * STALE_AFTER_MS) },
      ],
    });
    await expect(closeStaleSessions({ api, outbox, kick, now: () => NOW })).resolves.toEqual(['idle']);
    expect(outbox.refresh).toHaveBeenCalled();
    expect(outbox.enqueue.mock.calls).toEqual([[closeEntry({ id: 'idle', endedAt: null })]]);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('does not kick the worker when nothing is stale', async () => {
    const { api, outbox, kick } = fakes({ sessions: [] });
    await expect(closeStaleSessions({ api, outbox, kick, now: () => NOW })).resolves.toEqual([]);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  it('returns [] when the server cannot be reached or answers oddly', async () => {
    const offline = fakes(null);
    offline.api.listOpenPokerSessions.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    await expect(closeStaleSessions({ ...offline, now: () => NOW })).resolves.toEqual([]);
    expect(offline.outbox.enqueue).not.toHaveBeenCalled();

    const odd = fakes({ sessions: 'nope' });
    await expect(closeStaleSessions({ ...odd, now: () => NOW })).resolves.toEqual([]);
  });
});
