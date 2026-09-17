import { useEffect, useState } from 'react';
import * as pokerApi from '../../lib/persistence/api.js';
import { sharedAnalysisClient, REGRADE_TIMEOUT_MS } from '../../analysis/worker/analysisClient.js';
import { regradeHand } from '../../analysis/regrade.js';
import { ANALYSIS_VERSION } from '../../analysis/version.js';

const analyze = (record) => sharedAnalysisClient().analyze(record, { timeoutMs: REGRADE_TIMEOUT_MS });

const needsGrading = (data) => Boolean(data) && data.hand.heroActions > 0
  && (data.decisions.length === 0 || data.decisions.some((d) => d.analysisVersion < ANALYSIS_VERSION));

/** Grades a stored hand that has no current grades, once per hand, then reloads it. */
export function useHandRegrade(data, reload) {
  const [status, setStatus] = useState('idle');
  const handId = data?.hand.id ?? null;
  const needed = needsGrading(data);
  useEffect(() => {
    if (!needed) return undefined;
    let cancelled = false;
    setStatus('grading');
    regradeHand(data.hand, { api: pokerApi, analyze })
      .then((graded) => {
        if (cancelled) return;
        setStatus(graded ? 'idle' : 'failed');
        if (graded) reload();
      })
      .catch(() => {
        if (!cancelled) setStatus('failed');
      });
    return () => { cancelled = true; };
    // Once per hand: `data` changes on every reload, `handId` and `needed` do not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handId, needed]);
  return status;
}
