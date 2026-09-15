import { useCallback, useEffect, useState } from 'react';
import { getDrill } from '../lib/api';
import { DRILL_UNLOCK_GAMES, DRILL_RECENT_GAMES } from '../core/facts';
import { makeDrillSource, problemFromFact } from './drill';

export default function DrillPanel({ onStart }) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });

  const load = useCallback(async () => {
    setState({ status: 'loading', data: null, error: null });
    try {
      setState({ status: 'ready', data: await getDrill(), error: null });
    } catch (err) {
      setState({ status: 'error', data: null, error: err instanceof Error ? err.message : 'Request failed' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (state.status === 'loading') {
    return <p className="trn-muted asc-mono" role="status">Checking your weak spots…</p>;
  }
  if (state.status === 'error') {
    return (
      <p className="trn-drill trn-bad" role="alert">
        Couldn&apos;t load drill data ({state.error}).{' '}
        <button type="button" className="trn-link" data-hot onClick={load}>Retry</button>
      </p>
    );
  }

  const { standardGames, unlocked, facts } = state.data;
  if (!unlocked) {
    return (
      <p className="trn-drill trn-muted">
        Targeted drills unlock after {DRILL_UNLOCK_GAMES} standard games ({Math.min(standardGames, DRILL_UNLOCK_GAMES)}/{DRILL_UNLOCK_GAMES}).
      </p>
    );
  }
  if (facts.length === 0) {
    return <p className="trn-drill trn-muted">No repeated facts yet. Play a few more standard games to build a drill.</p>;
  }

  return (
    <div className="trn-drill">
      <button
        type="button"
        className="trn-btn"
        data-hot
        onClick={() => onStart(makeDrillSource(facts, Math.random))}
      >
        Start targeted drill
      </button>
      <p className="trn-muted">
        70% of problems come from your {facts.length} weakest facts in the last {DRILL_RECENT_GAMES} standard games.
      </p>
      <ul className="trn-chips" aria-label="Weakest facts">
        {facts.slice(0, 6).map((f) => {
          const p = problemFromFact(f.factKey);
          return p ? <li key={f.factKey} className="trn-chip">{p.prompt}</li> : null;
        })}
      </ul>
    </div>
  );
}
