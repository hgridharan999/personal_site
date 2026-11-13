import { useState } from 'react';
import { messageFor } from '../view';
import { useGames } from './useGames';
import SprintCard from './SprintCard';
import FlawCard from './FlawCard';
import GameLog from './GameLog';
import GameHistory from './GameHistory';
import './games.css';

/** The load failed: a Failure-style panel with its own ids, since the brief's may be on screen too. */
function GamesFailure({ error, onRetry }) {
  return (
    <div className="nt-panel nt-panel--fail">
      <h3 className="nt-panel__title">Could not load tonight's games.</h3>
      <p className="sp-text" role="alert">{messageFor(error)}</p>
      <button type="button" className="btn btn-line" onClick={onRetry}>Retry</button>
    </div>
  );
}

/**
 * The Games section under the brief: two puzzles, Hari's own daily games and the last 14 nights.
 * It has its own fetch and states, so a failure here never touches the brief. One live region
 * reads out each result.
 */
export default function GamesSection() {
  const games = useGames();
  const [said, setSaid] = useState('');
  // the same words twice would not be read again, so a repeat gets a trailing no-break space
  const say = (text) => setSaid((s) => (s === text ? `${text} ` : text));
  const { payload, error, busy, notice } = games;
  const noticeFor = (action, puzzle) => (
    notice?.action === action && notice.puzzle === puzzle ? notice : null
  );

  const solveSprint = async (answer) => {
    const next = await games.solveOne('sprint', answer);
    const result = next?.puzzles.sprint.result;
    if (result) say(`Sprint: ${result.score}/5`);
  };
  const solveFlaw = async (choice) => {
    const result = (await games.solveOne('flaw', { choice }))?.puzzles.flaw?.result;
    if (result) say(`Flaw: ${result.score === 1 ? 'correct' : 'wrong'}`);
  };
  const saveLog = async (entries) => {
    const next = await games.saveLog(entries);
    if (next) say('Scores saved');
    return Boolean(next);
  };

  let body;
  if (error) body = <GamesFailure error={error} onRetry={games.load} />;
  else if (!payload) body = <p className="nt-state">Loading games…</p>;
  else {
    body = (
      <>
        <section className="nt-games-sub" aria-labelledby="nt-games-puzzles">
          <h3 id="nt-games-puzzles" className="head">Puzzles</h3>
          <div className="nt-games-cards">
            <SprintCard sprint={payload.puzzles.sprint} busy={busy.solve} notice={noticeFor('solve', 'sprint')} onSolve={solveSprint} />
            <FlawCard
              flaw={payload.puzzles.flaw}
              busy={busy}
              notice={noticeFor('make') ?? noticeFor('solve', 'flaw')}
              onMake={games.make}
              onSolve={solveFlaw}
            />
          </div>
        </section>
        <GameLog key={payload.night} payload={payload} busy={busy.log} notice={noticeFor('log')} onSave={saveLog} />
        <GameHistory payload={payload} />
      </>
    );
  }

  return (
    <section className="nt-section nt-games" aria-labelledby="nt-games-title">
      <h2 id="nt-games-title" className="head nt-section__title">Games</h2>
      <p className="sr-only" role="status">{said}</p>
      {body}
    </section>
  );
}
