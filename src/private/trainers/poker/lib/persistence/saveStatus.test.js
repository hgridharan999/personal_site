import { describe, it, expect } from 'vitest';
import { pokerSaveStatus, saveStatusText } from './saveStatus.js';

describe('pokerSaveStatus', () => {
  it('is saved when nothing is queued', () => {
    const status = pokerSaveStatus({ pendingIds: [], failed: [], discardedIds: ['x'] });
    expect(status).toEqual({ status: 'saved', pending: 0, failed: 0, failedId: null, lastError: null });
    expect(saveStatusText(status)).toBe('All hands saved');
  });

  it('is saving while entries are pending', () => {
    const status = pokerSaveStatus({ pendingIds: ['open:s1', 'hand:h1'], failed: [], discardedIds: [] });
    expect(status).toEqual({ status: 'saving', pending: 2, failed: 0, failedId: null, lastError: null });
    expect(saveStatusText(status)).toBe('Saving… 2 waiting to sync (kept on this device and retried)');
  });

  it('is failed when the server rejected an entry, even with others pending', () => {
    const status = pokerSaveStatus({
      pendingIds: ['hand:h2'],
      failed: [{ id: 'hand:h1', lastError: 'Invalid hands payload' }, { id: 'hand:h3', lastError: 'x' }],
      discardedIds: [],
    });
    expect(status).toEqual({ status: 'failed', pending: 1, failed: 2, failedId: 'hand:h1', lastError: 'Invalid hands payload' });
    // The alert states the count only; per-entry lastError is left to the failed-entries list (PokerSaveStatus.jsx).
    expect(saveStatusText(status)).toBe('2 saves rejected by the server');
    expect(saveStatusText({ ...status, failed: 1 })).toBe('1 save rejected by the server');
  });
});
