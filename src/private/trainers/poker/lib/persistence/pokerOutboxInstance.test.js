import { describe, it, expect } from 'vitest';
import { POKER_OUTBOX_KEY } from './pokerOutbox.js';
import { pokerOutbox, pokerPersistence, ensurePokerWorker } from './pokerOutboxInstance.js';

describe('pokerOutboxInstance', () => {
  it('exposes one poker outbox and the table handlers without starting a worker on import', () => {
    expect(pokerOutbox.key).toBe(POKER_OUTBOX_KEY);
    expect(Object.keys(pokerPersistence).sort()).toEqual(['onHandComplete', 'onSessionEnd', 'onSessionStart']);
    expect(typeof ensurePokerWorker).toBe('function');
    expect(pokerOutbox.snapshot()).toEqual({ pendingIds: [], failed: [], discardedIds: [] });
  });
});
