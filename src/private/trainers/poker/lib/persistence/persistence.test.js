import { describe, it, expect, vi } from 'vitest';
import { createPokerPersistence } from './persistence.js';
import { openEntry, handEntry, closeEntry } from './pokerOutbox.js';

describe('createPokerPersistence', () => {
  function setup() {
    const outbox = { enqueue: vi.fn() };
    const kick = vi.fn();
    return { outbox, kick, handlers: createPokerPersistence({ outbox, kick }) };
  }

  it('queues the session open and kicks the worker', () => {
    const { outbox, kick, handlers } = setup();
    const session = { id: 's1', startedAt: '2026-09-16T18:00:00.000Z', botVersion: 'placeholder', tableMode: 'random', lineup: [], heroSeat: 0 };
    handlers.onSessionStart(session);
    expect(outbox.enqueue).toHaveBeenCalledWith(openEntry(session));
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('queues each completed hand with empty analysis by default', () => {
    const { outbox, handlers } = setup();
    const record = { v: 1, id: 'h1', sessionId: 's1', handNo: 1 };
    handlers.onHandComplete(record);
    expect(outbox.enqueue).toHaveBeenCalledWith(handEntry({ hand: record, decisions: [], heroAllinEv: null }));
  });

  it('passes Phase 5 analysis through when given', () => {
    const { outbox, handlers } = setup();
    const record = { v: 1, id: 'h2', sessionId: 's1', handNo: 2 };
    const decisions = [{ idx: 9 }];
    handlers.onHandComplete(record, { decisions, heroAllinEv: 3.5 });
    expect(outbox.enqueue).toHaveBeenCalledWith(handEntry({ hand: record, decisions, heroAllinEv: 3.5 }));
  });

  it('queues the session close', () => {
    const { outbox, kick, handlers } = setup();
    const summary = { id: 's1', endedAt: '2026-09-16T19:00:00.000Z', hands: 4, net: -12, rebuys: 0 };
    handlers.onSessionEnd(summary);
    expect(outbox.enqueue).toHaveBeenCalledWith(closeEntry(summary));
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('queues a close with a null endedAt when the summary has none', () => {
    const { outbox, handlers } = setup();
    handlers.onSessionEnd({ id: 's1', hands: 0, net: 0, rebuys: 0 });
    expect(outbox.enqueue.mock.calls[0][0].body).toEqual({ endedAt: null });
  });
});
