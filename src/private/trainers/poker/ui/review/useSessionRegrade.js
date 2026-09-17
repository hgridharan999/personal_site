import { useEffect, useRef, useState } from 'react';
import * as pokerApi from '../../lib/persistence/api.js';
import { sharedAnalysisClient, REGRADE_TIMEOUT_MS } from '../../analysis/worker/analysisClient.js';
import { regradeSession } from '../../analysis/regrade.js';

const analyze = (record) => sharedAnalysisClient().analyze(record, { timeoutMs: REGRADE_TIMEOUT_MS });
const IDLE = { status: 'idle', graded: 0, failed: 0, total: 0, error: null };

/**
 * Grades this session's stored hands that have no current grades, in the analysis worker, and calls `onSaved`
 * after each saved batch so the review reloads. Runs once per session while ungraded hands exist; leaving the
 * page cancels it after the hand in progress.
 */
export function useSessionRegrade(sessionId, ungradedHands, onSaved) {
  const [state, setState] = useState(IDLE);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const needed = ungradedHands > 0;
  const totalRef = useRef(ungradedHands);
  totalRef.current = ungradedHands;

  useEffect(() => {
    if (!needed) return undefined;
    let cancelled = false;
    let lastGraded = 0;
    setState({ status: 'grading', graded: 0, failed: 0, total: totalRef.current, error: null });
    regradeSession({
      sessionId,
      api: pokerApi,
      analyze,
      isCancelled: () => cancelled,
      onProgress: ({ graded, failed }) => {
        if (cancelled) return;
        setState((s) => ({ ...s, graded, failed }));
        if (graded > lastGraded) {
          lastGraded = graded;
          savedRef.current();
        }
      },
    }).then(
      ({ graded, failed }) => {
        if (!cancelled) setState((s) => ({ ...s, status: 'done', graded, failed }));
      },
      (err) => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : 'Grading failed' }));
      },
    );
    return () => { cancelled = true; };
  }, [sessionId, needed]);

  return state;
}
