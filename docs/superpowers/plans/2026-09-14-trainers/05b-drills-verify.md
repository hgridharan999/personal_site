# Phase 5b: Targeted Drills and Verification (Tasks 17–18)

Read `00-overview.md` first. Task 17 depends on Tasks 4, 10, 11 and 13. Task 18 depends on everything.

---

### Task 17: Targeted drills

**Files:**
- Create: `src/private/trainers/zetamac/drill.js`
- Create: `src/private/trainers/zetamac/DrillPanel.jsx`
- Modify (full replacement below): `src/private/trainers/zetamac/ZetamacPlay.jsx`
- Modify (append): `src/private/trainers/trainers.css`
- Test: `src/private/trainers/zetamac/drill.test.js`

**Interfaces:**
- Consumes:
  - `parseFactKey`, `DRILL_UNLOCK_GAMES`, `DRILL_RECENT_GAMES` (Task 10)
  - `makeZetamacGenerator`, `ZETAMAC_DEFAULTS` (Task 4)
  - `weightedPick` (Task 2)
  - `getDrill` (Task 11)
  - `ZetamacSetup` `extra` prop and `ZetamacGame` `makeNextProblem` prop (Task 13)
- Produces:
  - `zetamac/drill.js`:
    - `DRILL_WEAK_SHARE = 0.7`
    - `problemFromFact(factKey): ZProblem | null`, which renders the same prompt, answer and factKey the generator would
    - `makeDrillSource(facts: { factKey, weakness }[], rng, weakShare = DRILL_WEAK_SHARE): (options) => () => ZProblem`
  - `zetamac/DrillPanel.jsx`: `<DrillPanel onStart={(makeNextProblem) => void} />`, which fetches `/api/trainers/drill` on mount and handles the loading, locked, error-with-retry, empty and ready states

Drill sampling (spec §4.4):
- With probability 0.7, draw a weak fact, weighted by `weakness − minWeakness + 0.1` so every weight is positive. Otherwise, draw a normal standard problem.
- Never show the same prompt twice in a row: on a repeat, fall back to a normal problem.

- [ ] **Step 1: Write the failing test**

`src/private/trainers/zetamac/drill.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../core/rng.js';
import { ZETAMAC_DEFAULTS } from './generator.js';
import { DRILL_WEAK_SHARE, problemFromFact, makeDrillSource } from './drill.js';

describe('problemFromFact', () => {
  it.each([
    ['add:37+58', { qtype: 'z.add', prompt: '37 + 58', answer: 95, factKey: 'add:37+58', a: 37, b: 58 }],
    ['sub:95-37', { qtype: 'z.sub', prompt: '95 – 37', answer: 58, factKey: 'sub:95-37', a: 37, b: 58 }],
    ['mul:7x83', { qtype: 'z.mul', prompt: '7 × 83', answer: 581, factKey: 'mul:7x83', a: 7, b: 83 }],
    ['div:581/7', { qtype: 'z.div', prompt: '581 ÷ 7', answer: 83, factKey: 'div:581/7', a: 7, b: 83 }],
  ])('%s', (key, expected) => {
    expect(problemFromFact(key)).toEqual(expected);
  });
  it('returns null for invalid keys', () => {
    expect(problemFromFact('div:10/3')).toBeNull();
  });
});

describe('makeDrillSource', () => {
  const facts = [
    { factKey: 'mul:7x83', weakness: 2.5 },
    { factKey: 'mul:12x97', weakness: 0.2 },
    { factKey: 'sub:150-68', weakness: -0.4 },
  ];
  const weakPrompts = new Set(facts.map((f) => problemFromFact(f.factKey).prompt));

  it('draws ~70% weak facts, weighted toward the weakest', () => {
    const next = makeDrillSource(facts, mulberry32(11))({ ...ZETAMAC_DEFAULTS });
    const counts = new Map();
    let weak = 0;
    const N = 10000;
    for (let i = 0; i < N; i += 1) {
      const p = next();
      if (weakPrompts.has(p.prompt)) {
        weak += 1;
        counts.set(p.prompt, (counts.get(p.prompt) || 0) + 1);
      }
    }
    expect(DRILL_WEAK_SHARE).toBe(0.7);
    expect(weak / N).toBeGreaterThan(0.55);
    expect(weak / N).toBeLessThan(0.72);
    expect(counts.get('7 × 83')).toBeGreaterThan(counts.get('12 × 97'));
    expect(counts.get('12 × 97')).toBeGreaterThan(counts.get('150 – 68'));
  });

  it('never repeats a prompt back-to-back from the weak pool', () => {
    const next = makeDrillSource([{ factKey: 'mul:7x83', weakness: 1 }], mulberry32(3))({ ...ZETAMAC_DEFAULTS });
    let prev = null;
    for (let i = 0; i < 2000; i += 1) {
      const p = next();
      if (prev === '7 × 83') expect(p.prompt).not.toBe('7 × 83');
      prev = p.prompt;
    }
  });

  it('falls back to normal problems with an empty pool', () => {
    const next = makeDrillSource([], mulberry32(1))({ ...ZETAMAC_DEFAULTS });
    for (let i = 0; i < 100; i += 1) expect(next().qtype).toMatch(/^z\./);
  });
});
```

Note on the tolerance: repeats fall back to normal problems, so the observed weak share sits slightly below 0.7. That's why the upper bound is 0.72 and the lower bound 0.55.

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx vitest run src/private/trainers/zetamac/drill.test.js`
Expected: FAIL with an unresolved import.

- [ ] **Step 3: Implement `drill.js`**

`src/private/trainers/zetamac/drill.js`:

```js
import { parseFactKey } from '../core/facts.js';
import { weightedPick } from '../core/rng.js';
import { makeZetamacGenerator } from './generator.js';

export const DRILL_WEAK_SHARE = 0.7;

export function problemFromFact(factKey) {
  const f = parseFactKey(factKey);
  if (!f) return null;
  const { a, b } = f;
  switch (f.op) {
    case 'add':
      return { qtype: 'z.add', prompt: `${a} + ${b}`, answer: a + b, factKey: `add:${Math.min(a, b)}+${Math.max(a, b)}`, a, b };
    case 'sub':
      return { qtype: 'z.sub', prompt: `${a + b} – ${a}`, answer: b, factKey: `sub:${a + b}-${a}`, a, b };
    case 'mul':
      return { qtype: 'z.mul', prompt: `${a} × ${b}`, answer: a * b, factKey: `mul:${a}x${b}`, a, b };
    case 'div':
      return { qtype: 'z.div', prompt: `${a * b} ÷ ${a}`, answer: b, factKey: `div:${a * b}/${a}`, a, b };
    default:
      return null;
  }
}

export function makeDrillSource(facts, rng, weakShare = DRILL_WEAK_SHARE) {
  const minWeakness = Math.min(0, ...facts.map((f) => f.weakness));
  const pool = facts
    .map((f) => ({ problem: problemFromFact(f.factKey), weight: f.weakness - minWeakness + 0.1 }))
    .filter((entry) => entry.problem);

  return (options) => {
    const normal = makeZetamacGenerator(options, rng);
    let previous = null;
    return function next() {
      let problem = pool.length > 0 && rng() < weakShare ? weightedPick(rng, pool).problem : normal();
      if (problem.prompt === previous) problem = normal();
      previous = problem.prompt;
      return problem;
    };
  };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `npx vitest run src/private/trainers/zetamac/drill.test.js`
Expected: PASS.

- [ ] **Step 5: Implement `DrillPanel`**

`src/private/trainers/zetamac/DrillPanel.jsx`:

```jsx
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
```

- [ ] **Step 6: Wire drills into `ZetamacPlay`**

Replace the whole of `src/private/trainers/zetamac/ZetamacPlay.jsx` with:

```jsx
import { useCallback, useEffect, useState } from 'react';
import ZetamacSetup from './ZetamacSetup';
import ZetamacGame from './ZetamacGame';
import ZetamacResults from './ZetamacResults';
import DrillPanel from './DrillPanel';
import { ZETAMAC_DEFAULTS } from './generator';
import { buildZetamacPayload } from './payload';
import { useGameSubmission } from '../lib/useGameSubmission';

export default function ZetamacPlay({ onBusyChange }) {
  const [phase, setPhase] = useState('setup');
  const [game, setGame] = useState(null); // { options, mode, source, gameNo }
  const [result, setResult] = useState(null);
  const { status, error, submit, reset } = useGameSubmission();

  useEffect(() => () => onBusyChange(false), [onBusyChange]);

  const start = (options, mode, source = undefined) => {
    reset();
    setResult(null);
    setGame((g) => ({ options, mode, source, gameNo: (g?.gameNo ?? 0) + 1 }));
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
    return (
      <ZetamacGame
        key={game.gameNo}
        options={game.options}
        onFinish={finish}
        {...(game.source ? { makeNextProblem: game.source } : {})}
      />
    );
  }
  if (phase === 'results') {
    return (
      <ZetamacResults
        result={result}
        options={game.options}
        mode={game.mode}
        saveStatus={status}
        saveError={error}
        onPlayAgain={() => start(game.options, game.mode, game.source)}
        onSettings={() => { reset(); setPhase('setup'); }}
      />
    );
  }
  return (
    <ZetamacSetup
      initialOptions={game?.mode === 'custom' ? game.options : ZETAMAC_DEFAULTS}
      onStart={start}
      extra={<DrillPanel onStart={(source) => start({ ...ZETAMAC_DEFAULTS }, 'drill', source)} />}
    />
  );
}
```

- [ ] **Step 7: Append the drill styles**

Append to `src/private/trainers/trainers.css`:

```css
/* ---- drills ----------------------------------------------- */
.trn-drill { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; margin-top: 18px;
  padding-top: 16px; border-top: 1px solid var(--line-2); }
.trn-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.trn-chip { font-family: var(--mono); font-size: 12px; color: var(--amber); border: 1px solid var(--line); padding: 4px 8px; }
.trn-link { background: none; border: 0; padding: 0; color: var(--amber); text-decoration: underline; font: inherit; }
```

- [ ] **Step 8: Build, test, and verify**

Run: `npm test` (all tests pass) and `npm run build` (succeeds).

In the browser, with `DATABASE_URL` configured:
1. With fewer than 3 standard games saved, the setup shows "Targeted drills unlock after 3 standard games (n/3)."
2. Play 3 full **standard** (120 s) games and wait until each shows "Saved". Custom games don't count toward unlocking. Return to setup: the "Start targeted drill" button appears with up to 6 fact chips.
3. Start and finish a drill. The results header reads "Targeted drill · 120 s". Open the browser's network log (the `read_network_requests` tool, filtered to `/api/trainers/sessions`) and confirm the POST body has `"mode":"drill"`.
4. With the API unreachable (stop the dev server's DB by blanking `DATABASE_URL` and restarting), the panel shows the error with Retry.

- [ ] **Step 9: Commit**

```bash
git add src/private/trainers/zetamac/drill.js src/private/trainers/zetamac/drill.test.js src/private/trainers/zetamac/DrillPanel.jsx src/private/trainers/zetamac/ZetamacPlay.jsx src/private/trainers/trainers.css
git commit -m "Add Zetamac targeted drills from weakest recent facts" -m "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: End-to-end verification and review

**Files:** none, unless fixes are needed. Each fix gets its own commit, with its tests.

- [ ] **Step 1: Quality gate**

Run: `npm test`
Expected: all test files pass, with 0 failures.

Run: `npm run build`
Expected: success. The only acceptable warnings are the chunk-size and gray-matter `eval` warnings that already existed.

- [ ] **Step 2: Trainer code stays out of the public bundle**

Run:

```bash
grep -l "Seconds left" dist/assets/*.js
```

```bash
grep -c "Seconds left" dist/assets/index-*.js
```

Expected: the first command lists only lazy chunk files (not `index-*.js`), and the second prints `0`.

- [ ] **Step 3: Deploy hygiene**

Run:

```bash
grep -rn "DATABASE_URL" src/
```

Expected: no matches. The DB URL is server-only.

Confirm that `.vercelignore` contains `**/*.test.js` and `api/_lib/testing.js`.

- [ ] **Step 4: Database setup (requires the user)**

If `DATABASE_URL` is not in `.env.local`, stop and ask the user to:
1. Add **Neon** from Vercel → Storage / Marketplace and connect it to this project.
2. Copy `DATABASE_URL` into `.env.local`.

Then run `npm run db:migrate`. Expected: `Applied 001_trainers.sql`.

- [ ] **Step 5: Full manual pass in the `vite-dev` preview (signed in)**

Record a pass or failure for each check:

1. **Zetamac standard game (×3).** Play three full standard games. Each shows "Saved". `/me/zetamac?tab=stats` shows 3 points in the series.
2. **Zetamac custom game.** Stats' settings picker lists "Custom" separately. Selecting it shows only that game, and the standard series is unchanged.
3. **Drill.** It unlocks after the 3 standard games. Play one. It appears under the Drill mode in stats and not in the standard series. Its facts contribute to the standard "slowest facts" and times-table grid.
4. **Optiver time-out run.** Start a test, answer about 10 questions, then leave the tab idle for the full 8 minutes. The test ends on its own. The results show "Reached ~10 / 80", "Time used 8:00", and unreached rows marked `—`. It saves.
5. **Optiver completion run.** Answer all 80. "Reached 80 / 80" is shown, and the net score equals correct − wrong.
6. **Game detail.** From stats, open a game. Every question shows its prompt, your answer, the correct answer, the result and the time.
7. **Offline save.** In DevTools set the network to Offline, then finish a 30 s custom game. The results show "Saving… (kept on this device…)" and the header shows "1 game waiting to sync". Reload the page: it's still pending. Go back online: within about 60 s it syncs and the header message disappears.
8. **Signed out mid-game.** Sign out in another tab, then finish a game. It stays pending. Sign back in, open `/me/zetamac`, and it syncs.
9. **Empty states.** Sign in with a fresh database (or before any Optiver games). The Optiver stats tab shows "No games yet — play one to see stats" with a Play button.
10. **Keyboard only.** Tab through the tabs, setup, start, game, results and stats without a mouse. Focus is always visible.
11. **Layout.** At 1024 px and 768 px widths, no horizontal page scroll. Wide tables scroll inside their own container.
12. **Console.** No errors or warnings from trainer code throughout.

- [ ] **Step 6: Independent review**

Dispatch in parallel:
- a `code-reviewer` agent over the full trainer diff (`git diff <first-trainer-commit>^..HEAD`)
- a `security-auditor` agent over `api/trainers/*`, `api/_lib/{http,db,trainerSchemas,statsShape}.js` and `vite.api-dev.js`, focused on auth on every route, SQL parameterization, input limits, and anything reaching the client bundle

Fix every confirmed issue with a test, re-run Steps 1–3, and commit each fix separately.

- [ ] **Step 7: Report**

Summarize for the user:
- test and build results
- manual checks passed or failed, with specifics for any failure
- review findings and fixes
- the setup still required from them (the Neon connection if not done, and a redeploy)

Do not push unless the user asks.
