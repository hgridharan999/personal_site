import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import { usePokerResource } from '../shared/usePokerResource.js';
import { getPokerSessionPage } from '../../lib/persistence/api.js';
import { formatDay } from '../../../core/format.js';
import { useSessionRegrade } from './useSessionRegrade.js';
import { useReviewFreshness } from './useReviewFreshness.js';
import { mergePages } from './reviewView.js';
import ReviewSummary from './ReviewSummary';
import CostliestDecisions from './CostliestDecisions';
import OpponentsPanel from './OpponentsPanel';
import HandList from './HandList';
import './review.css';

const LOBBY = { to: '/me/poker', label: 'Lobby' };
const loadReview = (id) => getPokerSessionPage(id);

/** Later pages of hands, appended locally; reset whenever the first page reloads. */
function useMorePages(id, data) {
  const [more, setMore] = useState({ pages: [], loading: false, error: null });
  // Bumped whenever the base page resets, so a "Load more" reply that lands after the base data has
  // already moved on (e.g. the freshness reload above) is ignored instead of appending onto stale pages.
  const generationRef = useRef(0);
  useEffect(() => {
    generationRef.current += 1;
    setMore({ pages: [], loading: false, error: null });
  }, [data]);
  const merged = useMemo(() => (data ? more.pages.reduce(mergePages, data) : null), [data, more.pages]);
  const loadMore = useCallback(() => {
    if (!merged || merged.nextAfterHandNo === null) return;
    const generation = generationRef.current;
    setMore((m) => ({ ...m, loading: true, error: null }));
    getPokerSessionPage(id, merged.nextAfterHandNo)
      .then((page) => {
        if (generationRef.current !== generation) return;
        setMore((m) => ({ pages: [...m.pages, page], loading: false, error: null }));
      })
      .catch((err) => {
        if (generationRef.current !== generation) return;
        setMore((m) => ({ ...m, loading: false, error: err instanceof Error ? err.message : 'Request failed' }));
      });
  }, [id, merged]);
  return { merged, loadMore, loadingMore: more.loading, moreError: more.error };
}

function GradingStatus({ grading }) {
  if (grading.status === 'grading') {
    const failed = grading.failed > 0 ? `, ${grading.failed} could not be graded` : '';
    return <p className="pk-muted pk-review__grading" role="status">Grading older hands: {grading.graded} of {grading.total} saved{failed}…</p>;
  }
  if (grading.status === 'error') {
    return <p className="pk-error" role="alert">Couldn&apos;t save grades for older hands: {grading.error}. Reload the page to try again.</p>;
  }
  if (grading.status === 'done' && grading.failed > 0) {
    return <p className="pk-muted" role="status">{grading.failed} older hands could not be graded.</p>;
  }
  return null;
}

function ReviewBody({ review, data, grading, more }) {
  if (!data && review.status === 'error') {
    const message = review.errorStatus === 404
      ? 'This session is not saved yet, or it does not exist.'
      : `Couldn't load this session: ${review.error}`;
    return (
      <div className="pk-review__msg">
        <p className="pk-error" role="alert">{message}</p>
        <button type="button" className="pk-btn" data-hot onClick={review.reload}>Retry</button>
      </div>
    );
  }
  if (!data) return <p className="pk-muted pk-review__msg" role="status">Loading the session…</p>;
  if (data.hands.length === 0) {
    return <p className="pk-muted pk-review__msg">No hands saved for this session yet. They appear here once they finish saving.</p>;
  }
  return (
    <div className="pk-review">
      <GradingStatus grading={grading} />
      <ReviewSummary summary={data.summary} />
      <CostliestDecisions costliest={data.costliest} />
      <OpponentsPanel opponents={data.opponents} />
      <HandList hands={data.hands} hasMore={data.nextAfterHandNo !== null} onLoadMore={more.loadMore} loadingMore={more.loadingMore} moreError={more.moreError} />
    </div>
  );
}

/** Route: /me/poker/session/:id (spec §7.2). */
export default function SessionReviewPage() {
  const { id } = useParams();
  const review = usePokerResource(loadReview, id, `/me/poker/session/${id}`);
  useReviewFreshness(id, review.reload);
  const more = useMorePages(id, review.data);
  const grading = useSessionRegrade(id, review.data?.summary.ungradedHands ?? 0, review.reload);
  const session = more.merged?.session;
  return (
    <PokerShell back={LOBBY}>
      <header className="pk-head">
        <h1 className="pk-title">Session review</h1>
        {session && (
          <p className="pk-muted">{formatDay(session.startedAt)} · {session.tableMode === 'custom' ? 'Custom table' : 'Random table'}</p>
        )}
      </header>
      <ReviewBody review={review} data={more.merged} grading={grading} more={more} />
    </PokerShell>
  );
}
