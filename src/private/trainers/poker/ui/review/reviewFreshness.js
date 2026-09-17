// Pure decision for SessionReviewPage (spec §7.2): the table's unmount flushes its last hands (and the
// close) to the outbox while the review page fetches immediately, so a review opened right after "Review
// this session" can be missing them. Reload once, but only after having seen this session queued, so a
// review opened on an already-saved session is never reloaded needlessly.

export const INITIAL_REVIEW_FRESHNESS = Object.freeze({ sawQueued: false, reloaded: false, shouldReload: false });

/** Next freshness state given whether this session still has queued (pending or failed) outbox entries. */
export function nextReviewFreshness(state, queued) {
  const sawQueued = state.sawQueued || queued;
  const shouldReload = sawQueued && !queued && !state.reloaded;
  return { sawQueued, reloaded: state.reloaded || shouldReload, shouldReload };
}
