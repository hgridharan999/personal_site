# Phase 4b: Game UIs (Tasks 13–14)

Read `00-overview.md` first. Depends on Tasks 3–7 (logic) and Tasks 11–12 (outbox, shell and Play contract).

---

### Task 13: Zetamac UI, with shared submission and formatting helpers

**Files:**
- Create: `src/private/trainers/core/format.js`
- Create: `src/private/trainers/zetamac/payload.js`
- Create: `src/private/trainers/lib/useGameSubmission.js`
- Create: `src/private/trainers/lib/SaveStatus.jsx`
- Create: `src/private/trainers/lib/Kpi.jsx`
- Create: `src/private/trainers/zetamac/ZetamacSetup.jsx`
- Create: `src/private/trainers/zetamac/ZetamacGame.jsx`
- Create: `src/private/trainers/zetamac/ZetamacResults.jsx`
- Modify (replace the stub): `src/private/trainers/zetamac/ZetamacPlay.jsx`
- Modify (append): `src/private/trainers/trainers.css`
- Test: `src/private/trainers/core/format.test.js`, `src/private/trainers/zetamac/payload.test.js`

**Interfaces:**
- Consumes:
  - `ZETAMAC_DEFAULTS`, `ZETAMAC_DURATIONS`, `isDefaultConfig`, `validateZetamacOptions`, `makeZetamacGenerator` (Task 4)
  - `startProblem`, `handleInput`, `handleDeleteKey`, `unfinishedAttempt`, `zetamacTotals` (Task 5)
  - `configKey` (Task 3), `median` (Task 2)
  - `submitGame`, `useOutboxStatus` (Task 11)
  - The Play contract `{ onBusyChange }` (Task 12)
- Produces:
  - `core/format.js`:
    - `formatSeconds(ms, digits = 2): string`, e.g. `'2.14 s'`, or `'—'` for null
    - `formatClock(ms): string`, e.g. `'7:32'`
    - `formatPercent(x): string`, e.g. `'88%'`, or `'—'`
    - `formatDay(iso): string`, e.g. `'Sep 14'`
  - `zetamac/payload.js`: `buildZetamacPayload({ id, options, mode, startedAt, attempts }): Promise<SessionPayload>`
  - `lib/useGameSubmission.js`: `useGameSubmission(): { status: 'idle'|'saving'|'saved'|'failed'|'error', error: string|null, submit(buildPayload: () => Promise<SessionPayload>): Promise<void>, reset(): void }`
  - `lib/SaveStatus.jsx`: `<SaveStatus status error />`
  - `lib/Kpi.jsx`: `<Kpi label value hint? />`, which renders a `div` holding `dt`/`dd` and must sit inside a `<dl className="trn-kpis">`
  - `zetamac/ZetamacSetup.jsx`: `<ZetamacSetup initialOptions onStart={(options, mode) => void} extra? />`, where `extra` is a node rendered under the standard button (Task 17 passes the drill button)
  - `zetamac/ZetamacGame.jsx`: `<ZetamacGame options onFinish={({ attempts, startedAt }) => void} makeNextProblem? />`, where `makeNextProblem(options) => () => ZProblem` defaults to `makeZetamacGenerator(options, Math.random)` (Task 17 passes a drill source)
  - `zetamac/ZetamacResults.jsx`: `<ZetamacResults result options mode saveStatus saveError onPlayAgain onSettings />`
  - `zetamac/ZetamacPlay.jsx`: `<ZetamacPlay onBusyChange />`, holding the phases `setup → playing → results`

- [ ] **Step 1: Write the failing tests**

`src/private/trainers/core/format.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { formatSeconds, formatClock, formatPercent, formatDay } from './format.js';

describe('format', () => {
  it('formatSeconds', () => {
    expect(formatSeconds(2140)).toBe('2.14 s');
    expect(formatSeconds(2140, 1)).toBe('2.1 s');
    expect(formatSeconds(null)).toBe('—');
  });
  it('formatClock', () => {
    expect(formatClock(452000)).toBe('7:32');
    expect(formatClock(480000)).toBe('8:00');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });
  it('formatPercent', () => {
    expect(formatPercent(0.876)).toBe('88%');
    expect(formatPercent(null)).toBe('—');
  });
  it('formatDay', () => {
    expect(formatDay('2026-09-14T12:00:00.000Z')).toMatch(/Sep/);
  });
});
```

`src/private/trainers/zetamac/payload.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildZetamacPayload } from './payload.js';
import { ZETAMAC_DEFAULTS } from './generator.js';
import { configKey } from '../core/configKey.js';

const attempts = [
  { idx: 0, qtype: 'z.add', factKey: 'add:2+3', prompt: '2 + 3', answer: '5', response: '5', isCorrect: true, timeMs: 900, corrections: 0 },
  { idx: 1, qtype: 'z.mul', factKey: 'mul:7x8', prompt: '7 × 8', answer: '56', response: '5', isCorrect: false, timeMs: null, corrections: 0 },
];

describe('buildZetamacPayload', () => {
  it('builds a valid session payload', async () => {
    const options = { ...ZETAMAC_DEFAULTS };
    const payload = await buildZetamacPayload({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c', options, mode: 'standard', startedAt: '2026-09-14T18:00:00.000Z', attempts,
    });
    expect(payload.session).toEqual({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c',
      trainer: 'zetamac',
      mode: 'standard',
      config: options,
      configKey: await configKey({ trainer: 'zetamac', config: options }),
      profileVersion: null,
      startedAt: '2026-09-14T18:00:00.000Z',
      durationMs: 120000,
      correct: 1, wrong: 0, unanswered: 0, score: 1,
    });
    expect(payload.attempts).toBe(attempts);
  });

  it('drill and standard games with the same options share a config key', async () => {
    const base = { id: 'x', options: { ...ZETAMAC_DEFAULTS }, startedAt: 'now', attempts: [] };
    const standard = await buildZetamacPayload({ ...base, mode: 'standard' });
    const drill = await buildZetamacPayload({ ...base, mode: 'drill' });
    expect(drill.session.configKey).toBe(standard.session.configKey);
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npx vitest run src/private/trainers/core/format.test.js src/private/trainers/zetamac/payload.test.js`
Expected: FAIL with unresolved imports.

- [ ] **Step 3: Implement `format.js` and `payload.js`**

`src/private/trainers/core/format.js`:

```js
export const formatSeconds = (ms, digits = 2) => (ms == null ? '—' : `${(ms / 1000).toFixed(digits)} s`);

export function formatClock(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const formatPercent = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`);

export const formatDay = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
```

`src/private/trainers/zetamac/payload.js`:

```js
import { configKey } from '../core/configKey.js';
import { zetamacTotals } from './tracker.js';

export async function buildZetamacPayload({ id, options, mode, startedAt, attempts }) {
  const config = { ...options };
  return {
    session: {
      id,
      trainer: 'zetamac',
      mode,
      config,
      configKey: await configKey({ trainer: 'zetamac', config }),
      profileVersion: null,
      startedAt,
      durationMs: options.duration * 1000,
      ...zetamacTotals(attempts),
    },
    attempts,
  };
}
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/private/trainers/core/format.test.js src/private/trainers/zetamac/payload.test.js`
Expected: PASS.

- [ ] **Step 5: Implement the shared UI helpers**

`src/private/trainers/lib/useGameSubmission.js`:

```js
import { useCallback, useState } from 'react';
import { submitGame } from './outboxInstance.js';
import { useOutboxStatus } from './useOutboxStatus.js';

// Save status of the most recently finished game, derived from the outbox.
export function useGameSubmission() {
  const [id, setId] = useState(null);
  const [error, setError] = useState(null);
  const { pendingIds, failed } = useOutboxStatus();

  const submit = useCallback(async (buildPayload) => {
    setError(null);
    try {
      const payload = await buildPayload();
      const sending = submitGame(payload); // enqueues synchronously before its first await
      setId(payload.session.id);
      await sending;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not prepare this game for saving');
    }
  }, []);

  const reset = useCallback(() => {
    setId(null);
    setError(null);
  }, []);

  let status = 'idle';
  if (error) status = 'error';
  else if (id && failed.some((f) => f.id === id)) status = 'failed';
  else if (id && pendingIds.includes(id)) status = 'saving';
  else if (id) status = 'saved';

  return { status, error, submit, reset };
}
```

`src/private/trainers/lib/SaveStatus.jsx`:

```jsx
const TEXT = {
  saving: 'Saving… (kept on this device and retried until it goes through)',
  saved: 'Saved',
  failed: 'Not saved: the server rejected this game (details at the top of the page)',
  error: 'Not saved',
};

export default function SaveStatus({ status, error }) {
  if (status === 'idle') return null;
  return (
    <p className={`trn-save trn-save--${status}`} role="status">
      {TEXT[status]}
      {status === 'error' && error ? `: ${error}` : ''}
    </p>
  );
}
```

`src/private/trainers/lib/Kpi.jsx`:

```jsx
// One KPI cell. Render inside <dl className="trn-kpis">.
export default function Kpi({ label, value, hint }) {
  return (
    <div className="trn-kpi">
      <dt className="asc-mono">{label}</dt>
      <dd>{value}</dd>
      {hint && <dd className="trn-kpi-hint">{hint}</dd>}
    </div>
  );
}
```

- [ ] **Step 6: Implement `ZetamacSetup`**

`src/private/trainers/zetamac/ZetamacSetup.jsx`:

```jsx
import { useState } from 'react';
import { ZETAMAC_DEFAULTS, ZETAMAC_DURATIONS, isDefaultConfig, validateZetamacOptions } from './generator';

const OPERATIONS = [
  { key: 'add', label: 'Addition', range: 'add' },
  { key: 'sub', label: 'Subtraction', note: 'Addition problems in reverse.' },
  { key: 'mul', label: 'Multiplication', range: 'mul' },
  { key: 'div', label: 'Division', note: 'Multiplication problems in reverse.' },
];

function fromForm(form) {
  const options = {};
  for (const [k, v] of Object.entries(form)) {
    options[k] = typeof v === 'boolean' ? v : Number(v === '' ? NaN : v);
  }
  return options;
}

function RangeRow({ prefix, form, set }) {
  const name = prefix === 'add' ? 'Addition' : 'Multiplication';
  const field = (side, end) => {
    const key = `${prefix}_${side}_${end}`;
    return (
      <input
        type="number"
        inputMode="numeric"
        className="trn-num"
        aria-label={`${name} ${side} ${end}`}
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
      />
    );
  };
  return (
    <span className="trn-range">
      Range: ({field('left', 'min')} to {field('left', 'max')}) {prefix === 'add' ? '+' : '×'} ({field('right', 'min')} to {field('right', 'max')})
    </span>
  );
}

export default function ZetamacSetup({ initialOptions = ZETAMAC_DEFAULTS, onStart, extra = null }) {
  const [form, setForm] = useState(() => ({ ...initialOptions }));
  const [errors, setErrors] = useState([]);
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const startCustom = (e) => {
    e.preventDefault();
    const options = fromForm(form);
    const problems = validateZetamacOptions(options);
    setErrors(problems);
    if (problems.length === 0) onStart(options, isDefaultConfig(options) ? 'standard' : 'custom');
  };

  return (
    <div className="trn-setup">
      <div className="trn-setup-primary">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={() => onStart({ ...ZETAMAC_DEFAULTS }, 'standard')}>
          Start standard game
        </button>
        <p className="trn-muted">120 seconds · + − × ÷ · the exact arithmetic.zetamac.com defaults</p>
        {extra}
      </div>

      <form className="trn-form" onSubmit={startCustom} noValidate aria-labelledby="trn-custom-title">
        <h2 id="trn-custom-title" className="asc-mono trn-subhead">Custom game</h2>
        {OPERATIONS.map((op) => (
          <div key={op.key} className="trn-op">
            <label className="trn-check">
              <input type="checkbox" checked={form[op.key]} onChange={(e) => set(op.key, e.target.checked)} /> {op.label}
            </label>
            {op.range ? <RangeRow prefix={op.range} form={form} set={set} /> : <span className="trn-muted">{op.note}</span>}
          </div>
        ))}
        <label className="trn-field">
          Duration{' '}
          <select value={form.duration} onChange={(e) => set('duration', e.target.value)}>
            {ZETAMAC_DURATIONS.map((d) => <option key={d} value={d}>{d} seconds</option>)}
          </select>
        </label>
        {errors.length > 0 && (
          <ul className="trn-errors" role="alert">
            {errors.map((msg) => <li key={msg}>{msg}</li>)}
          </ul>
        )}
        <button type="submit" className="trn-btn" data-hot>Start custom game</button>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: Implement `ZetamacGame`**

`src/private/trainers/zetamac/ZetamacGame.jsx`:

```jsx
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
```

- [ ] **Step 8: Implement `ZetamacResults` and `ZetamacPlay`**

`src/private/trainers/zetamac/ZetamacResults.jsx`:

```jsx
import { median } from '../core/stats';
import { formatSeconds } from '../core/format';
import Kpi from '../lib/Kpi';
import SaveStatus from '../lib/SaveStatus';

const MODE_LABEL = { standard: 'Standard game', custom: 'Custom game', drill: 'Targeted drill' };

export default function ZetamacResults({ result, options, mode, saveStatus, saveError, onPlayAgain, onSettings }) {
  const solved = result.attempts.filter((a) => a.isCorrect);
  const corrections = result.attempts.reduce((sum, a) => sum + a.corrections, 0);
  const slowest = [...solved].sort((a, b) => b.timeMs - a.timeMs).slice(0, 5);

  return (
    <div className="trn-results">
      <p className="asc-mono trn-muted">{MODE_LABEL[mode]} · {options.duration} s</p>
      <p className="trn-score" aria-label={`Score ${solved.length}`}>{solved.length}</p>

      <dl className="trn-kpis">
        <Kpi label="Per minute" value={(solved.length / (options.duration / 60)).toFixed(1)} />
        <Kpi label="Median time" value={formatSeconds(median(solved.map((a) => a.timeMs)))} />
        <Kpi label="Corrections" value={corrections} />
      </dl>

      {slowest.length > 0 && (
        <>
          <h2 className="asc-mono trn-subhead">Slowest this game</h2>
          <div className="trn-table-wrap">
            <table className="trn-table">
              <thead>
                <tr><th scope="col">Problem</th><th scope="col">Time</th><th scope="col">Corrections</th></tr>
              </thead>
              <tbody>
                {slowest.map((a) => (
                  <tr key={a.idx}>
                    <td>{a.prompt} = {a.answer}</td>
                    <td>{formatSeconds(a.timeMs)}</td>
                    <td>{a.corrections}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <SaveStatus status={saveStatus} error={saveError} />

      <div className="trn-actions">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={onPlayAgain}>Play again</button>
        <button type="button" className="trn-btn" data-hot onClick={onSettings}>Change settings</button>
      </div>
    </div>
  );
}
```

Replace the stub `src/private/trainers/zetamac/ZetamacPlay.jsx` with:

```jsx
import { useCallback, useEffect, useState } from 'react';
import ZetamacSetup from './ZetamacSetup';
import ZetamacGame from './ZetamacGame';
import ZetamacResults from './ZetamacResults';
import { ZETAMAC_DEFAULTS } from './generator';
import { buildZetamacPayload } from './payload';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function ZetamacPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('setup');
  const [game, setGame] = useState(null); // { options, mode, gameNo }
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = (options, mode) => {
    reset();
    setResult(null);
    setGame((g) => ({ options, mode, gameNo: (g?.gameNo ?? 0) + 1 }));
    setPhase('playing');
    onBusyChange(true);
  };

  const finish = useCallback(({ attempts, startedAt }) => {
    onBusyChange(false);
    setResult({ attempts, startedAt });
    setPhase('results');
    submit(() => buildZetamacPayload({ id: crypto.randomUUID(), options: game.options, mode: game.mode, startedAt, attempts }));
  }, [game, onBusyChange, submit]);

  if (phase === 'playing') {
    return <ZetamacGame key={game.gameNo} options={game.options} onFinish={finish} />;
  }
  if (phase === 'results') {
    return (
      <ZetamacResults
        result={result}
        options={game.options}
        mode={game.mode}
        saveStatus={status}
        saveError={error}
        onPlayAgain={() => start(game.options, game.mode)}
        onSettings={() => { reset(); setPhase('setup'); }}
      />
    );
  }
  return <ZetamacSetup initialOptions={game?.options ?? ZETAMAC_DEFAULTS} onStart={start} />;
}
```

- [ ] **Step 9: Append the game styles**

Append to `src/private/trainers/trainers.css`:

```css
/* ---- setup ------------------------------------------------ */
.trn-setup { display: grid; gap: clamp(28px, 5vw, 64px); }
@media (min-width: 1024px) { .trn-setup { grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); } }
.trn-setup-primary { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.trn-subhead { color: var(--muted); margin: 0 0 12px; font-weight: 400; }
.trn-form { display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--line); padding-top: 16px; }
.trn-op { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
.trn-check { display: inline-flex; align-items: center; gap: 8px; min-width: 150px; }
.trn-range { color: var(--muted); }
.trn-num { width: 4.5em; background: none; border: 0; border-bottom: 1px solid var(--line); color: var(--bone);
  font-family: var(--mono); padding: 2px 4px; text-align: center; }
.trn-num:focus, .trn-field select:focus { outline: none; border-color: var(--amber); }
.trn-field select { background: var(--bg-2); color: var(--bone); border: 1px solid var(--line); padding: 6px 8px; font-family: var(--mono); }
.trn-errors { margin: 0; padding-left: 18px; color: #F0A38B; font-size: 14px; }

/* ---- game ------------------------------------------------- */
.trn-game { min-height: 50vh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 28px; }
.trn-game-bar { width: min(100%, 560px); display: flex; justify-content: space-between; color: var(--muted); }
.trn-problem { font-family: var(--display); font-weight: 700; font-size: clamp(44px, 7vw, 96px); letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; min-height: 1.1em; text-align: center; }
.trn-answer { width: min(100%, 320px); background: none; border: 0; border-bottom: 2px solid var(--line); color: var(--bone);
  font-family: var(--mono); font-size: clamp(28px, 3.5vw, 40px); text-align: center; padding: 8px 0; }
.trn-answer:focus { outline: none; border-color: var(--amber); }
.trn-answer:disabled { opacity: 0.5; }
.trn-shake { animation: trnShake 0.28s var(--ease); }
@keyframes trnShake { 25% { transform: translateX(-6px); } 75% { transform: translateX(6px); } }
@media (prefers-reduced-motion: reduce) { .trn-shake { animation: none; border-color: #F0A38B; } }

/* ---- results ---------------------------------------------- */
.trn-results { display: flex; flex-direction: column; gap: 18px; }
.trn-score { font-family: var(--display); font-weight: 900; font-size: clamp(72px, 12vw, 160px); line-height: 0.9; margin: 0; color: var(--amber); }
.trn-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin: 0; }
.trn-kpi { border-top: 1px solid var(--line); padding-top: 10px; }
.trn-kpi dt { color: var(--faint); }
.trn-kpi dd { margin: 6px 0 0; font-family: var(--display); font-weight: 700; font-size: clamp(20px, 2.2vw, 30px); }
.trn-kpi dd.trn-kpi-hint { font-family: var(--mono); font-weight: 400; font-size: 11px; color: var(--faint); }
.trn-table-wrap { overflow-x: auto; }
.trn-table { width: 100%; border-collapse: collapse; font-size: 14px; }
.trn-table th { font-family: var(--mono); font-weight: 400; font-size: 10.5px; letter-spacing: 0.12em; text-transform: uppercase;
  color: var(--faint); text-align: left; padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line); }
.trn-table td { padding: 8px 10px 8px 0; border-bottom: 1px solid var(--line-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
.trn-ok { color: #9BD3A1; }
.trn-bad { color: #F0A38B; }
.trn-save { font-family: var(--mono); font-size: 12px; letter-spacing: 0.08em; color: var(--muted); margin: 0; }
.trn-save--saved { color: #9BD3A1; }
.trn-save--failed, .trn-save--error { color: #F0A38B; }
.trn-actions { display: flex; gap: 10px; flex-wrap: wrap; }
```

- [ ] **Step 10: Build, run the tests, and verify in the browser**

Run: `npm test` (expected: all tests pass). Then run `npm run build` (expected: success).

Start the `vite-dev` preview, sign in, open `/me/zetamac`, and check:
1. **Standard game.** Click "Start standard game".
   - The input is focused, "Seconds left: 120" counts down once per second, and "Score: 0" is shown.
   - Typing the correct answer advances immediately with no Enter, and Score increments.
   - Typing a wrong full-length answer leaves it in the box with no feedback.
2. **Subtraction and division** prompts look like `137 – 58` (en dash) and `581 ÷ 7`, with whole-number answers.
3. **Refocus.** Clicking elsewhere on the page puts focus back in the input.
4. **Short custom game.** Enable only multiplication, set the duration to 30, and start.
   - Only `×` problems appear.
   - At 0 the input disables, and the results show the score, per-minute rate, median time, corrections and slowest problems.
5. **Save status.** Without `DATABASE_URL`, the results say "Saving… (kept on this device…)" and the header shows "1 game waiting to sync". With the database connected they say "Saved".
6. **Validation.** In the custom form, set Addition left min to 50 and max to 10, then start. The error "Addition left range: min must be ≤ max." is shown.
7. **Leaving mid-game.** Switch to the Stats tab during a game. A confirmation prompt appears, and cancelling keeps the game running.
8. **Console.** No errors.

- [ ] **Step 11: Commit**

```bash
git add src/private/trainers/core/format.js src/private/trainers/core/format.test.js src/private/trainers/zetamac/payload.js src/private/trainers/zetamac/payload.test.js src/private/trainers/lib/useGameSubmission.js src/private/trainers/lib/SaveStatus.jsx src/private/trainers/lib/Kpi.jsx src/private/trainers/zetamac/ZetamacSetup.jsx src/private/trainers/zetamac/ZetamacGame.jsx src/private/trainers/zetamac/ZetamacResults.jsx src/private/trainers/zetamac/ZetamacPlay.jsx src/private/trainers/trainers.css
git commit -m "Add Zetamac setup, faithful game screen and results" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Optiver 80-in-8 UI

**Files:**
- Create: `src/private/trainers/core/benchmarks.js`
- Create: `src/private/trainers/optiver/payload.js`
- Create: `src/private/trainers/optiver/OptiverGame.jsx`
- Create: `src/private/trainers/optiver/OptiverResults.jsx`
- Modify (replace the stub): `src/private/trainers/optiver/OptiverPlay.jsx`
- Modify (append): `src/private/trainers/trainers.css`
- Test: `src/private/trainers/optiver/payload.test.js`

**Interfaces:**
- Consumes:
  - `PROFILE_V1`, `generateOptiverTest` (Task 6)
  - `OPTIVER_RULES`, `sanitizeInput`, `gradeResponse`, `buildOptiverAttempts`, `scoreOptiver` (Task 7)
  - `configKey` (Task 3), `mean` (Task 2)
  - `formatSeconds`, `formatClock`, `useGameSubmission`, `SaveStatus`, `Kpi` (Task 13)
- Produces:
  - `core/benchmarks.js`: `OPTIVER_PASS_LINE = 55`; `ZETAMAC_BENCHMARKS = [30, 40, 50, 70]` (both unofficial, and labeled as such wherever they're shown)
  - `optiver/payload.js`: `buildOptiverPayload({ id, startedAt, durationMs, attempts, rules = OPTIVER_RULES, profile = PROFILE_V1 }): Promise<SessionPayload>`
  - `optiver/OptiverGame.jsx`: `<OptiverGame onFinish={({ attempts, startedAt, durationMs }) => void} rules? profile? rng? />`
  - `optiver/OptiverResults.jsx`: `<OptiverResults result={{ attempts, durationMs }} saveStatus saveError onRetake />`
  - `optiver/OptiverPlay.jsx`: `<OptiverPlay onBusyChange />`, holding the phases `intro → testing → results`

Behavior (spec §5.1):
- **During the test:** only the prompt and the answer box are shown. No timer, no counter, no correct/wrong feedback.
- **Enter:** on empty or unparsable input, it does nothing except add the `.trn-shake` class. On valid input, it records `{ response, isCorrect, timeMs }` and shows the next question.
- **Ending:** the test ends after the 80th answer, or at 480 000 ms. The time limit is checked every animation frame, plus a `setTimeout` fallback because background tabs pause `requestAnimationFrame`. Ending is idempotent.

- [ ] **Step 1: Write the failing test**

`src/private/trainers/optiver/payload.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildOptiverPayload } from './payload.js';
import { OPTIVER_RULES } from './grade.js';
import { configKey } from '../core/configKey.js';
import { OPTIVER_PASS_LINE, ZETAMAC_BENCHMARKS } from '../core/benchmarks.js';

const attempt = (idx, response, isCorrect) => ({
  idx, qtype: 'o.int.add', factKey: null, prompt: `${idx} + 1`, answer: String(idx + 1),
  response, isCorrect, timeMs: response === null ? null : 5000, corrections: 0,
});

describe('buildOptiverPayload', () => {
  it('scores +1/−1/0 and stamps rules + profile version', async () => {
    const attempts = [attempt(0, '1', true), attempt(1, '9', false), ...Array.from({ length: 78 }, (_, i) => attempt(i + 2, null, false))];
    const payload = await buildOptiverPayload({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c', startedAt: '2026-09-14T18:00:00.000Z', durationMs: 480000, attempts,
    });
    expect(payload.session).toEqual({
      id: '3f1c2b1e-8d4a-4c7e-9a8b-2d5e6f7a8b9c',
      trainer: 'optiver',
      mode: 'standard',
      config: { ...OPTIVER_RULES },
      configKey: await configKey({ trainer: 'optiver', config: { ...OPTIVER_RULES }, profileVersion: 1 }),
      profileVersion: 1,
      startedAt: '2026-09-14T18:00:00.000Z',
      durationMs: 480000,
      correct: 1, wrong: 1, unanswered: 78, score: 0,
    });
    expect(payload.attempts).toBe(attempts);
  });
  it('benchmarks', () => {
    expect(OPTIVER_PASS_LINE).toBe(55);
    expect(ZETAMAC_BENCHMARKS).toEqual([30, 40, 50, 70]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/optiver/payload.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `benchmarks.js` and `payload.js`**

`src/private/trainers/core/benchmarks.js`:

```js
// Unofficial reference points (spec §2, §6). Always labelled as estimates in the UI.
export const OPTIVER_PASS_LINE = 55;
export const ZETAMAC_BENCHMARKS = [30, 40, 50, 70];
```

`src/private/trainers/optiver/payload.js`:

```js
import { configKey } from '../core/configKey.js';
import { OPTIVER_RULES, scoreOptiver } from './grade.js';
import { PROFILE_V1 } from './profile-v1.js';

export async function buildOptiverPayload({ id, startedAt, durationMs, attempts, rules = OPTIVER_RULES, profile = PROFILE_V1 }) {
  const config = { ...rules };
  return {
    session: {
      id,
      trainer: 'optiver',
      mode: 'standard',
      config,
      configKey: await configKey({ trainer: 'optiver', config, profileVersion: profile.version }),
      profileVersion: profile.version,
      startedAt,
      durationMs,
      ...scoreOptiver(attempts, rules),
    },
    attempts,
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/optiver/payload.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `OptiverGame`**

`src/private/trainers/optiver/OptiverGame.jsx`:

```jsx
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
```

- [ ] **Step 6: Implement `OptiverResults` and `OptiverPlay`**

`src/private/trainers/optiver/OptiverResults.jsx`:

```jsx
import { useState } from 'react';
import { mean } from '../core/stats';
import { formatSeconds, formatClock } from '../core/format';
import { OPTIVER_PASS_LINE } from '../core/benchmarks';
import { OPTIVER_RULES, scoreOptiver } from './grade';
import Kpi from '../lib/Kpi';
import SaveStatus from '../lib/SaveStatus';

function outcome(attempt) {
  if (attempt.response === null) return { mark: '—', className: 'trn-muted', label: 'Not reached' };
  return attempt.isCorrect
    ? { mark: '✓', className: 'trn-ok', label: 'Correct' }
    : { mark: '✗', className: 'trn-bad', label: 'Wrong' };
}

export default function OptiverResults({ result, saveStatus, saveError, onRetake }) {
  const [wrongOnly, setWrongOnly] = useState(false);
  const totals = scoreOptiver(result.attempts);
  const reached = totals.correct + totals.wrong;
  const delta = totals.score - OPTIVER_PASS_LINE;
  const answeredTimes = result.attempts.filter((a) => a.timeMs !== null).map((a) => a.timeMs);
  const rows = wrongOnly ? result.attempts.filter((a) => a.response !== null && !a.isCorrect) : result.attempts;

  return (
    <div className="trn-results">
      <p className="asc-mono trn-muted">Net score (+1 correct, −1 wrong)</p>
      <p className="trn-score" aria-label={`Net score ${totals.score}`}>{totals.score}</p>
      <p className={delta >= 0 ? 'trn-ok' : 'trn-bad'}>
        {delta >= 0 ? `${delta} above` : `${-delta} below`} the estimated {OPTIVER_PASS_LINE} pass line
        <span className="trn-muted"> (an unofficial estimate from public reports)</span>
      </p>

      <dl className="trn-kpis">
        <Kpi label="Correct" value={totals.correct} />
        <Kpi label="Wrong" value={totals.wrong} />
        <Kpi label="Reached" value={`${reached} / ${OPTIVER_RULES.questions}`} />
        <Kpi label="Time used" value={formatClock(result.durationMs)} />
        <Kpi label="Avg per answer" value={formatSeconds(mean(answeredTimes))} />
      </dl>

      <SaveStatus status={saveStatus} error={saveError} />

      <div className="trn-actions">
        <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={onRetake}>Take another test</button>
        <button type="button" className="trn-btn" data-hot aria-pressed={wrongOnly} onClick={() => setWrongOnly((w) => !w)}>
          {wrongOnly ? 'Show all questions' : 'Show wrong only'}
        </button>
      </div>

      <div className="trn-table-wrap">
        <table className="trn-table">
          <thead>
            <tr>
              <th scope="col">#</th><th scope="col">Question</th><th scope="col">Your answer</th>
              <th scope="col">Correct answer</th><th scope="col">Result</th><th scope="col">Time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const o = outcome(a);
              return (
                <tr key={a.idx}>
                  <td>{a.idx + 1}</td>
                  <td>{a.prompt}</td>
                  <td>{a.response ?? '—'}</td>
                  <td>{a.answer}</td>
                  <td className={o.className} aria-label={o.label}>{o.mark}</td>
                  <td>{formatSeconds(a.timeMs, 1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

Replace the stub `src/private/trainers/optiver/OptiverPlay.jsx` with:

```jsx
import { useCallback, useEffect, useState } from 'react';
import OptiverGame from './OptiverGame';
import OptiverResults from './OptiverResults';
import { buildOptiverPayload } from './payload';
import { PROFILE_V1 } from './profile-v1';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function OptiverPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('intro');
  const [testNo, setTestNo] = useState(0);
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = () => {
    reset();
    setResult(null);
    setTestNo((n) => n + 1);
    setPhase('testing');
    onBusyChange(true);
  };

  const finish = useCallback(({ attempts, startedAt, durationMs }) => {
    onBusyChange(false);
    setResult({ attempts, durationMs });
    setPhase('results');
    submit(() => buildOptiverPayload({ id: crypto.randomUUID(), startedAt, durationMs, attempts }));
  }, [onBusyChange, submit]);

  if (phase === 'testing') return <OptiverGame key={testNo} onFinish={finish} />;
  if (phase === 'results') {
    return <OptiverResults result={result} saveStatus={status} saveError={error} onRetake={start} />;
  }

  return (
    <div className="trn-intro">
      <ul className="trn-rules">
        <li>80 questions, 8 minutes. One at a time: no skipping, no going back.</li>
        <li>Type the answer and press Enter. Any equal value counts: 13/20, 26/40 and 0.65 are all correct.</li>
        <li>+1 for correct, −1 for wrong, 0 for questions you don&apos;t reach.</li>
        <li>The timer and question counter stay hidden until the end.</li>
        <li>No calculator, no paper.</li>
      </ul>
      <p className="trn-muted asc-mono">
        Difficulty profile v{PROFILE_V1.version}: estimated from public reports of the real test
      </p>
      <button type="button" className="trn-btn trn-btn--primary" data-hot onClick={start}>Start the test</button>
    </div>
  );
}
```

- [ ] **Step 7: Append the intro styles**

Append to `src/private/trainers/trainers.css`:

```css
/* ---- optiver intro ---------------------------------------- */
.trn-intro { display: flex; flex-direction: column; align-items: flex-start; gap: 18px; max-width: 64ch; }
.trn-rules { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 8px; color: var(--muted); line-height: 1.55; }
```

- [ ] **Step 8: Build, run the tests, and verify in the browser**

Run: `npm test` (all tests pass), then `npm run build` (the build succeeds).

In the `vite-dev` preview, open `/me/optiver` and check:
1. The intro lists the rules and the profile note. Click "Start the test".
2. Only a prompt and the input are visible: no timer, no counter. Prompts include integers, decimals like `12.6 ÷ 0.3`, and fractions like `3/8 of 20`.
3. Letters can't be typed. Enter on an empty input shakes and does not advance. Enter on `3/` also does nothing.
4. For a fraction question, a correct answer typed as an unreduced fraction is marked correct in the results.
5. **Completion.** Finish all 80 quickly using the browser tool: type `1` and press Enter 80 times. The results show net score, correct, wrong, "Reached 80 / 80", time used, the pass-line comparison, and the full question table. "Show wrong only" filters the table.
6. **Save status.** It behaves as in Task 13.
7. **Leaving mid-test.** Switching tabs asks for confirmation.
8. **Console.** No errors.

The 8:00 time-out path is verified in Task 18.

- [ ] **Step 9: Commit**

```bash
git add src/private/trainers/core/benchmarks.js src/private/trainers/optiver/payload.js src/private/trainers/optiver/payload.test.js src/private/trainers/optiver/OptiverGame.jsx src/private/trainers/optiver/OptiverResults.jsx src/private/trainers/optiver/OptiverPlay.jsx src/private/trainers/trainers.css
git commit -m "Add Optiver 80-in-8 test screen, results review and intro" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```
