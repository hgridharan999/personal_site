import { describe, it, expect } from 'vitest';
import { INITIAL_REVIEW_FRESHNESS, nextReviewFreshness } from './reviewFreshness.js';

describe('nextReviewFreshness', () => {
  it('does not reload a session that was never queued', () => {
    const state = nextReviewFreshness(INITIAL_REVIEW_FRESHNESS, false);
    expect(state).toEqual({ sawQueued: false, reloaded: false, shouldReload: false });
  });

  it('reloads once, right after a queued session finishes flushing', () => {
    let state = nextReviewFreshness(INITIAL_REVIEW_FRESHNESS, true);
    expect(state).toEqual({ sawQueued: true, reloaded: false, shouldReload: false });
    state = nextReviewFreshness(state, true);
    expect(state.shouldReload).toBe(false);
    state = nextReviewFreshness(state, false);
    expect(state).toEqual({ sawQueued: true, reloaded: true, shouldReload: true });
    state = nextReviewFreshness(state, false);
    expect(state.shouldReload).toBe(false);
    state = nextReviewFreshness(state, true);
    expect(state).toEqual({ sawQueued: true, reloaded: true, shouldReload: false });
  });
});
