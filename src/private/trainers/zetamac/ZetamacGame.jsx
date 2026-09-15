import { useEffect, useRef, useState } from 'react';
import { makeZetamacGenerator } from './generator';
import { startProblem, handleInput, handleDeleteKey, unfinishedAttempt } from './tracker';

const defaultSource = (options) => makeZetamacGenerator(options, Math.random);

// Mirrors arithmetic.zetamac.com: auto-advance on an exact match, 1 s whole-second
// countdown, "Seconds left" / "Score" readouts, input locked at 0.
export default function ZetamacGame({ options, onFinish, makeNextProblem = defaultSource }) {
  const inputRef = useRef(null);
  const game = useRef(null);
  const [problem, setProblem] = useState(null);
  const [score, setScore] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(options.duration);
  const [over, setOver] = useState(false);

  useEffect(() => {
    const next = makeNextProblem(options);
    const start = performance.now();
    const first = next();
    game.current = { next, tracker: startProblem(first, 0, start), attempts: [], startedAt: new Date().toISOString(), done: false };
    setProblem(first);
    setScore(0);
    setSecondsLeft(options.duration);
    setOver(false);
    inputRef.current?.focus();

    const timer = setInterval(() => {
      const left = options.duration - Math.floor((performance.now() - start) / 1000);
      setSecondsLeft(left);
      if (left > 0) return;
      clearInterval(timer);
      const g = game.current;
      g.done = true;
      setOver(true);
      onFinish({ attempts: [...g.attempts, unfinishedAttempt(g.tracker, inputRef.current?.value ?? '')], startedAt: g.startedAt });
    }, 1000);
    return () => clearInterval(timer);
    // A game is created once per mount; the parent remounts (key) for a new game.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (e) => {
    const g = game.current;
    if (!g || g.done) return;
    const now = performance.now();
    const { state, attempt } = handleInput(g.tracker, e.currentTarget.value, now);
    if (!attempt) {
      g.tracker = state;
      return;
    }
    g.attempts.push(attempt);
    const nextProblem = g.next();
    g.tracker = startProblem(nextProblem, g.attempts.length, now);
    e.currentTarget.value = '';
    setProblem(nextProblem);
    setScore((s) => s + 1);
  };

  const onKeyDown = (e) => {
    const g = game.current;
    if (g && !g.done && (e.key === 'Backspace' || e.key === 'Delete')) g.tracker = handleDeleteKey(g.tracker);
  };

  const refocus = () => {
    if (!game.current?.done) setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="trn-game" onClick={refocus}>
      <div className="trn-game-bar asc-mono">
        <span>Seconds left: {Math.max(0, secondsLeft)}</span>
        <span>Score: {score}</span>
      </div>
      <div className="trn-problem">{problem?.prompt}</div>
      <input
        ref={inputRef}
        className="trn-answer"
        aria-label="Answer"
        inputMode="numeric"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={over}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onBlur={refocus}
      />
    </div>
  );
}
