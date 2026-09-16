import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../../../lib/api.js';
import { memoryStorage, OUTBOX_KEY } from '../../../lib/outbox.js';
import {
  POKER_OUTBOX_KEY, SESSION_NOT_FOUND_RETRIES, SERVER_ERROR_RETRIES, openEntry, handEntry, closeEntry, staleCloseEntry, sendPokerPayload,
  isPokerPermanentError, createPokerOutbox,
} from './pokerOutbox.js';

const SESSION = {
  id: 's1', startedAt: '2026-09-16T18:00:00.000Z', botVersion: 'placeholder', tableMode: 'random',
  lineup: [{ seat: 1, personaId: 'moss' }], heroSeat: 0,
};
const handItemFor = (n) => ({ hand: { v: 1, id: `h${n}`, sessionId: 's1', handNo: n }, decisions: [], heroAllinEv: null });

function fakeApi() {
  return {
    openPokerSession: vi.fn(async () => ({})),
    savePokerHands: vi.fn(async () => ({})),
    closePokerSession: vi.fn(async () => ({})),
  };
}

describe('entries', () => {
  it('builds one entry per save, grouped by session', () => {
    expect(openEntry(SESSION)).toEqual({ kind: 'open', id: 'open:s1', sessionId: 's1', body: SESSION });
    const item = handItemFor(1);
    expect(handEntry(item)).toEqual({ kind: 'hand', id: 'hand:h1', sessionId: 's1', body: { hands: [item] } });
    const summary = { id: 's1', endedAt: '2026-09-16T19:00:00.000Z', hands: 3, net: 10, rebuys: 0 };
    expect(closeEntry(summary)).toEqual({ kind: 'close', id: 'close:s1', sessionId: 's1', body: { endedAt: summary.endedAt } });
  });
});

describe('sendPokerPayload', () => {
  it('dispatches each kind to its endpoint', async () => {
    const api = fakeApi();
    await sendPokerPayload(openEntry(SESSION), api);
    await sendPokerPayload(handEntry(handItemFor(1)), api);
    await sendPokerPayload(closeEntry({ id: 's1', endedAt: null }), api);
    expect(api.openPokerSession).toHaveBeenCalledWith(SESSION);
    expect(api.savePokerHands).toHaveBeenCalledWith({ hands: [handItemFor(1)] });
    expect(api.closePokerSession).toHaveBeenCalledWith('s1', { endedAt: null });
  });

  it('rejects an unknown kind with a permanent error', async () => {
    const err = await sendPokerPayload({ kind: 'mystery' }, fakeApi()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'UNKNOWN_ENTRY_KIND' });
  });
});

describe('isPokerPermanentError', () => {
  const notFound = new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet');

  it('retries SESSION_NOT_FOUND until the retry limit', () => {
    expect(SESSION_NOT_FOUND_RETRIES).toBe(10);
    expect(isPokerPermanentError(notFound, { attempts: 0 })).toBe(false);
    expect(isPokerPermanentError(notFound, { attempts: 8 })).toBe(false);
    expect(isPokerPermanentError(notFound, { attempts: 9 })).toBe(true);
  });

  it('otherwise follows the shared rule', () => {
    expect(isPokerPermanentError(new ApiError(400, 'VALIDATION_ERROR', 'x'), { attempts: 0 })).toBe(true);
    expect(isPokerPermanentError(new ApiError(500, 'INTERNAL', 'x'), { attempts: 0 })).toBe(false);
    expect(isPokerPermanentError(new TypeError('Failed to fetch'), { attempts: 0 })).toBe(false);
  });
});

describe('createPokerOutbox', () => {
  it('saves open, hand and close in order under its own storage key', async () => {
    let t = 1000;
    let offline = true;
    const calls = [];
    const api = {
      openPokerSession: vi.fn(async () => {
        calls.push('open');
        if (offline) throw new TypeError('offline');
        return {};
      }),
      savePokerHands: vi.fn(async (body) => { calls.push(`hand:${body.hands[0].hand.id}`); return {}; }),
      closePokerSession: vi.fn(async (id) => { calls.push(`close:${id}`); return {}; }),
    };
    const storage = memoryStorage();
    const outbox = createPokerOutbox({ storage, api, now: () => t });
    outbox.enqueue(openEntry(SESSION));
    outbox.enqueue(handEntry(handItemFor(1)));
    outbox.enqueue(closeEntry({ id: 's1', endedAt: null }));

    await outbox.flush();
    expect(calls).toEqual(['open']);
    expect(outbox.snapshot().pendingIds).toEqual(['open:s1', 'hand:h1', 'close:s1']);
    expect(outbox.key).toBe(POKER_OUTBOX_KEY);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(POKER_OUTBOX_KEY))).toHaveLength(3);

    offline = false;
    t += 1000;
    await outbox.flush();
    expect(calls).toEqual(['open', 'open', 'hand:h1', 'close:s1']);
    expect(outbox.snapshot().pendingIds).toEqual([]);
  });

  it('retries a hand whose session is not found, then marks it failed', async () => {
    let t = 1000;
    const api = fakeApi();
    api.savePokerHands.mockImplementation(async () => { throw new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet'); });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => t });
    outbox.enqueue(handEntry(handItemFor(1)));
    for (let i = 0; i < SESSION_NOT_FOUND_RETRIES - 1; i += 1) {
      await outbox.flush();
      t += 60000;
    }
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
    await outbox.flush();
    expect(api.savePokerHands).toHaveBeenCalledTimes(SESSION_NOT_FOUND_RETRIES);
    expect(outbox.snapshot().failed).toEqual([{ id: 'hand:h1', lastError: 'Session not saved yet' }]);
  });
});

describe('server errors', () => {
  const serverError = new ApiError(500, 'INTERNAL', 'Internal server error');

  it('retries a 5xx until SERVER_ERROR_RETRIES attempts, then treats it as permanent', () => {
    expect(SERVER_ERROR_RETRIES).toBe(20);
    expect(isPokerPermanentError(serverError, { attempts: 0 })).toBe(false);
    expect(isPokerPermanentError(serverError, { attempts: 18 })).toBe(false);
    expect(isPokerPermanentError(serverError, { attempts: 19 })).toBe(true);
    expect(isPokerPermanentError(new ApiError(503, 'HTTP_ERROR', 'x'), { attempts: 19 })).toBe(true);
  });

  it('never treats a network error as permanent', () => {
    expect(isPokerPermanentError(new TypeError('Failed to fetch'), { attempts: 1000 })).toBe(false);
  });

  it('marks a hand failed after its 20th 500, so the session group is not wedged', async () => {
    let t = 1000;
    const api = fakeApi();
    api.savePokerHands.mockImplementation(async () => { throw serverError; });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => t });
    outbox.enqueue(handEntry(handItemFor(1)));
    for (let i = 0; i < SERVER_ERROR_RETRIES - 1; i += 1) {
      await outbox.flush();
      t += 60000;
    }
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
    await outbox.flush();
    expect(api.savePokerHands).toHaveBeenCalledTimes(SERVER_ERROR_RETRIES);
    expect(outbox.snapshot().failed).toEqual([{ id: 'hand:h1', lastError: 'Internal server error' }]);
  });

  it('keeps retrying a network error past the server error limit', async () => {
    let t = 1000;
    const api = fakeApi();
    api.savePokerHands.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => t });
    outbox.enqueue(handEntry(handItemFor(1)));
    for (let i = 0; i < SERVER_ERROR_RETRIES + 5; i += 1) {
      await outbox.flush();
      t += 60000;
    }
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
    expect(outbox.snapshot().failed).toEqual([]);
  });
});

describe('a session whose open has failed', () => {
  const notFound = () => new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet');

  function setup() {
    const api = fakeApi();
    api.openPokerSession.mockImplementation(async () => { throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid session payload'); });
    api.savePokerHands.mockImplementation(async () => { throw notFound(); });
    api.closePokerSession.mockImplementation(async () => { throw notFound(); });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => 1000 });
    return { api, outbox };
  }

  it('fails its hands and close on the first SESSION_NOT_FOUND instead of retrying', async () => {
    const { api, outbox } = setup();
    outbox.enqueue(openEntry(SESSION));
    outbox.enqueue(handEntry(handItemFor(1)));
    outbox.enqueue(closeEntry({ id: 's1', endedAt: null }));
    await outbox.flush();
    expect(api.savePokerHands).toHaveBeenCalledTimes(1);
    expect(api.closePokerSession).toHaveBeenCalledTimes(1);
    expect(outbox.snapshot().pendingIds).toEqual([]);
    expect(outbox.snapshot().failed.map((f) => f.id)).toEqual(['open:s1', 'hand:h1', 'close:s1']);
  });

  it('still fails a later hand immediately after the failed open was discarded', async () => {
    const { api, outbox } = setup();
    outbox.enqueue(openEntry(SESSION));
    await outbox.flush();
    outbox.discard('open:s1');
    outbox.enqueue(handEntry(handItemFor(2)));
    await outbox.flush();
    expect(api.savePokerHands).toHaveBeenCalledTimes(1);
    expect(outbox.snapshot().failed.map((f) => f.id)).toEqual(['hand:h2']);
  });

  it('keeps retrying SESSION_NOT_FOUND while the open is only pending elsewhere', async () => {
    const api = fakeApi();
    api.savePokerHands.mockImplementation(async () => { throw notFound(); });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => 1000 });
    outbox.enqueue(handEntry(handItemFor(1)));
    await outbox.flush();
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
  });
});

describe('closes', () => {
  it('sends a null endedAt when the summary has none', () => {
    expect(closeEntry({ id: 's1' }).body).toEqual({ endedAt: null });
    expect(closeEntry({ id: 's1', endedAt: undefined }).body).toEqual({ endedAt: null });
  });

  it('gives a stale close its own id in the same group, so an explicit close is not swallowed', () => {
    expect(staleCloseEntry('s1')).toEqual({ kind: 'close', id: 'stale-close:s1', sessionId: 's1', body: { endedAt: null } });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api: fakeApi(), now: () => 1000 });
    outbox.enqueue(staleCloseEntry('s1'));
    outbox.enqueue(closeEntry({ id: 's1', endedAt: '2026-09-16T19:00:00.000Z' }));
    expect(outbox.snapshot().pendingIds).toEqual(['stale-close:s1', 'close:s1']);
  });
});
