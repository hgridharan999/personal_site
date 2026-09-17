import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import { usePokerResource } from '../shared/usePokerResource.js';
import { getPokerHand } from '../../lib/persistence/api.js';
import { sessionHref, handHref, gradeText } from '../review/reviewView.js';
import {
  buildSteps, frameAt, stepLines, decisionAt, decisionMarks, initialStepIndex,
} from './replayModel.js';
import { useHandRegrade } from './useHandRegrade.js';
import { useReplayControls } from './useReplayControls.js';
import ReplayTable from './ReplayTable';
import DecisionPanel from './DecisionPanel';
import '../review/review.css';
import './replayer.css';

const loadHand = (id) => getPokerHand(id);
const CONTROLS = [
  { type: 'first', label: 'First step', text: '⏮', kbd: 'Home' },
  { type: 'prev', label: 'Previous step', text: '◀', kbd: '←' },
  { type: 'next', label: 'Next step', text: '▶', kbd: '→' },
  { type: 'last', label: 'Last step', text: '⏭', kbd: 'End' },
];

function Replayer({ data, dParam, grading }) {
  const { hand, decisions } = data;
  const steps = useMemo(() => buildSteps(hand.events), [hand]);
  const { index, playing, dispatch } = useReplayControls(steps.length, initialStepIndex(steps, decisions, dParam));
  const [revealAll, setRevealAll] = useState(false);
  const frame = useMemo(() => frameAt(hand, steps, index, { revealAll }), [hand, steps, index, revealAll]);
  const lines = useMemo(() => stepLines(hand, steps, index), [hand, steps, index]);
  const marks = decisionMarks(steps, decisions);

  return (
    <div className="pk-replay">
      <div className="pk-replay__main">
        <ReplayTable frame={frame} handNo={hand.handNo} />
        <div className="pk-replay__controls" role="group" aria-label="Replay controls">
          {CONTROLS.slice(0, 2).map((c) => (
            <button key={c.type} type="button" className="pk-btn" aria-label={c.label} data-hot onClick={() => dispatch(c.type)}>{c.text}<kbd>{c.kbd}</kbd></button>
          ))}
          <button type="button" className="pk-btn pk-btn--raise" data-hot onClick={() => dispatch('toggle')}>{playing ? 'Pause' : 'Play'}<kbd>Space</kbd></button>
          {CONTROLS.slice(2).map((c) => (
            <button key={c.type} type="button" className="pk-btn" aria-label={c.label} data-hot onClick={() => dispatch(c.type)}>{c.text}<kbd>{c.kbd}</kbd></button>
          ))}
          <button type="button" className="pk-btn pk-btn--call" aria-pressed={revealAll} data-hot onClick={() => setRevealAll((v) => !v)}>
            {revealAll ? 'Hide bot cards' : 'Reveal all cards'}
          </button>
        </div>
        <p className="pk-muted" aria-live="polite">Step {index + 1} of {steps.length}: {lines.at(-1) ?? 'Cards dealt'}</p>
        {marks.length > 0 && (
          <ul className="pk-replay__marks" aria-label="Your decisions">
            {marks.map((m) => (
              <li key={m.idx}>
                <button type="button" className={`pk-btn pk-grade--${m.grade}`} aria-current={m.step === index ? 'step' : undefined} data-hot onClick={() => dispatch('goto', { index: m.step })}>
                  {m.street} · {gradeText(m.grade, m.confident)}
                </button>
              </li>
            ))}
          </ul>
        )}
        {grading === 'grading' && <p className="pk-muted" role="status">Grading this hand…</p>}
        {grading === 'failed' && <p className="pk-error" role="alert">This hand could not be graded right now.</p>}
      </div>
      <div className="pk-replay__side">
        <DecisionPanel hand={hand} decision={decisionAt(decisions, steps, index)} />
        <section className="pk-log" aria-label="Hand log">
          <ol className="pk-log__list">{lines.map((line, i) => <li key={`${i}-${line}`}>{line}</li>)}</ol>
        </section>
      </div>
    </div>
  );
}

function HandLinks({ hand }) {
  return (
    <nav className="pk-replay__nav" aria-label="Hands">
      <Link to={sessionHref(hand.sessionId)} className="pk-review__link" data-hot>Session review</Link>
      {hand.prevHandId && <Link to={handHref(hand.prevHandId)} className="pk-review__link" data-hot>Previous hand</Link>}
      {hand.nextHandId && <Link to={handHref(hand.nextHandId)} className="pk-review__link" data-hot>Next hand</Link>}
    </nav>
  );
}

function ReplayBody({ resource, dParam, grading }) {
  const { data } = resource;
  const unknownBot = useMemo(() => {
    if (!data) return null;
    try {
      frameAt(data.hand, buildSteps(data.hand.events), 0);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'This hand cannot be replayed.';
    }
  }, [data]);
  if (!data && resource.status === 'error') {
    const message = resource.errorStatus === 404 ? 'Hand not found.' : `Couldn't load this hand: ${resource.error}`;
    return (
      <div className="pk-review__msg">
        <p className="pk-error" role="alert">{message}</p>
        <button type="button" className="pk-btn" data-hot onClick={resource.reload}>Retry</button>
      </div>
    );
  }
  if (!data) return <p className="pk-muted pk-review__msg" role="status">Loading the hand…</p>;
  if (unknownBot) return <p className="pk-error pk-review__msg" role="alert">This hand cannot be replayed: {unknownBot}</p>;
  return (
    <>
      <HandLinks hand={data.hand} />
      <Replayer key={data.hand.id} data={data} dParam={dParam} grading={grading} />
    </>
  );
}

/** Route: /me/poker/hand/:id, optional ?d=<decision idx> (spec §7.3). */
export default function HandReplayerPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const resource = usePokerResource(loadHand, id, `/me/poker/hand/${id}`);
  const grading = useHandRegrade(resource.data, resource.reload);
  const title = resource.data ? `Hand ${resource.data.hand.handNo}` : 'Hand replay';
  return (
    <PokerShell back={{ to: '/me/poker', label: 'Lobby' }}>
      <header className="pk-head">
        <h1 className="pk-title">{title}</h1>
      </header>
      <ReplayBody resource={resource} dParam={params.get('d')} grading={grading} />
    </PokerShell>
  );
}
