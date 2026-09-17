import { useEffect } from 'react';
import { pokerOutbox } from '../../lib/persistence/pokerOutboxInstance.js';
import { INITIAL_REVIEW_FRESHNESS, nextReviewFreshness } from './reviewFreshness.js';

/**
 * Reloads the review once after this session's queued outbox entries (hands and the close the table
 * flushes on unmount) finish, so a review opened right after "Review this session" is not missing the
 * last hand or two. Subscribes to the shared poker outbox; resets and re-subscribes on a new session id,
 * and never reloads more than once per id.
 */
export function useReviewFreshness(sessionId, reload) {
  useEffect(() => {
    let state = INITIAL_REVIEW_FRESHNESS;
    const check = () => {
      const next = nextReviewFreshness(state, pokerOutbox.hasQueued(sessionId));
      state = next;
      if (next.shouldReload) reload();
    };
    check();
    return pokerOutbox.subscribe(check);
  }, [sessionId, reload]);
}
