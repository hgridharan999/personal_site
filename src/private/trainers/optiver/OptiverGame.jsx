import { useEffect, useRef, useState } from 'react';
import { generateOptiverTest } from './generator';
import { PROFILE_V1 } from './profile-v1';
import { OPTIVER_RULES, sanitizeInput, gradeResponse, buildOptiverAttempts } from './grade';

const SHAKE_MS = 280;

export default function OptiverGame({ onFinish, rules = OPTIVER_RULES, profile = PROFILE_V1, rng = Math.random }) {
  const inputRef = useRef(null);
  const test = useRef(null);
  // Questions live in state (not only the ref) so the first prompt renders once generated.
  const [questions, setQuestions] = useState(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [shake, setShake] = useState(false);

  useEffect(() => {
    const generated = generateOptiverTest(profile, rng, rules.questions);
    const start = performance.now();
    const t = { questions: generated, answers: [], shownAt: start, startedAt: new Date().toISOString(), done: false };
    let raf = 0;
    let timeout = 0;

    t.end = () => {
      if (t.done) return;
      t.done = true;
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      onFinish({
        attempts: buildOptiverAttempts(generated, t.answers),
        startedAt: t.startedAt,
        durationMs: Math.min(rules.timeLimitMs, Math.round(performance.now() - start)),
      });
    };

    const tick = () => {
      if (performance.now() - start >= rules.timeLimitMs) t.end();
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    timeout = setTimeout(t.end, rules.timeLimitMs);

    test.current = t;
    setQuestions(generated);
    setIndex(0);
    setValue('');
    inputRef.current?.focus();

    return () => {
      t.done = true;
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
    };
    // One test per mount; the parent remounts (key) to retake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKeyDown = (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = test.current;
    if (!t || t.done) return;
    const graded = gradeResponse(t.questions[t.answers.length], value);
    if (!graded.valid) {
      setShake(true);
      setTimeout(() => setShake(false), SHAKE_MS);
      return;
    }
    const now = performance.now();
    t.answers.push({ response: graded.response, isCorrect: graded.isCorrect, timeMs: Math.round(now - t.shownAt) });
    t.shownAt = now;
    setValue('');
    if (t.answers.length >= t.questions.length) {
      t.end();
      return;
    }
    setIndex(t.answers.length);
  };

  const refocus = () => {
    if (!test.current?.done) setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div className="trn-game" onClick={refocus}>
      <div className="trn-problem" aria-live="polite">{questions?.[index]?.prompt}</div>
      <input
        ref={inputRef}
        className={`trn-answer${shake ? ' trn-shake' : ''}`}
        aria-label="Answer, then press Enter"
        inputMode="decimal"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(sanitizeInput(e.target.value))}
        onKeyDown={onKeyDown}
        onBlur={refocus}
      />
      <p className="trn-muted asc-mono">Enter to submit · fractions like 13/20 are fine</p>
    </div>
  );
}
