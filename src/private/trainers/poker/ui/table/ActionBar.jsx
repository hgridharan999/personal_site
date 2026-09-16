import SizingPanel from './SizingPanel';
import { callLabel, raiseLabel, resolveRaise } from '../../lib/sizing.js';

/** Fold / check-call / bet-raise buttons for the hero. Keys are handled by useHeroControls. */
export default function ActionBar({ turn, sizing, dispatch }) {
  if (!turn) {
    return (
      <div className="pk-actions pk-actions--waiting">
        <p className="pk-muted">Waiting for the other players</p>
      </div>
    );
  }

  const { legal, stack } = turn;
  const pending = resolveRaise(sizing, legal);
  const raiseText = pending ? raiseLabel(legal, pending.amount) : (legal.raiseKind === 'bet' ? 'Bet' : 'Raise');

  return (
    <div className="pk-actions" role="group" aria-label="Your action">
      {sizing.open && legal.canRaise && <SizingPanel sizing={sizing} legal={legal} dispatch={dispatch} />}
      <div className="pk-actions__buttons">
        <button
          type="button"
          className="pk-btn pk-btn--fold"
          data-hot
          disabled={legal.canCheck}
          aria-keyshortcuts="F"
          onClick={() => dispatch({ type: 'fold' })}
        >
          Fold <kbd>F</kbd>
        </button>
        <button type="button" className="pk-btn pk-btn--call" data-hot aria-keyshortcuts="C" onClick={() => dispatch({ type: 'checkCall' })}>
          {callLabel(legal, stack)} <kbd>C</kbd>
        </button>
        {legal.canRaise && (
          <button
            type="button"
            className="pk-btn pk-btn--raise"
            data-hot
            aria-keyshortcuts={sizing.open ? 'Enter' : 'R'}
            onClick={() => dispatch(sizing.open ? { type: 'confirm' } : { type: 'openSizing' })}
          >
            {raiseText} <kbd>{sizing.open ? 'Enter' : 'R'}</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
