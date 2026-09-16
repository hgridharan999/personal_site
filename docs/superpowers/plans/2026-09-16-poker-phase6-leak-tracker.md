# Poker Trainer Phase 6: Leak Tracker (Stats Tab) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the lobby's Stats tab placeholder with the long-term leak tracker from spec §7.4: tendencies against target ranges (overall and by position), leaks by spot, a per-session trend and a focus card, each with loading, empty/locked and error states, served by `GET /api/trainers/poker/stats`.

**Architecture:** One new Vercel function, `api/trainers/poker/stats.js`, runs four read queries in parallel (summary, leaks, trend, recent hand logs) and one optional query (hands for a single spot). Tendencies are computed in the function by folding stored hand logs through Phase 3's `accumulateProfile`, once overall and once into the hero's position that hand, so they work before Phase 5 stores any decisions. Leaks, trend and focus aggregate `poker_decisions` in SQL and are shaped by pure modules. The client renders pure view models (`ui/stats/statsView.js`) with the existing `BarList`, `LineChart` and `Kpi` components, restyled under `.pk`.

**Tech Stack:** JavaScript ES modules with JSDoc, React 18, react-router-dom 7, Vite 6, Vercel Node functions (ESM), `@neondatabase/serverless` 1.x, Zod 4, Vitest 5 (node environment), Node 22. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-trainer-design.md` §7.4, §6.3 (`GET stats`), §8.1 (routes), §8.3 (tokens).
**Contracts:** `docs/superpowers/specs/2026-09-16-poker-contracts.md` §1 (units), §3.2 (profile), §4.1 (DecisionRecord, spot, grade, `confident`). See "Contract changes" at the end.

## Global Constraints

- **Worktree:** after Phases 2, 3 and 4 (including Phase 4 Tasks 10 and 11) are merged into `feat/poker`, the controller runs `git worktree add ../jp-poker-stats -b feat/poker-stats feat/poker` from `C:\Users\hgrid\journal_portfolio`, then `npm ci` once in `C:\Users\hgrid\jp-poker-stats` (Git Bash: `/c/Users/hgrid/jp-poker-stats`). Every command runs from that root.
- **Execution:** one fresh implementer subagent per task, in order, each followed by a review. Every task ends with `npm test` green.
- Plain JavaScript ES modules and JSX with JSDoc. No TypeScript, no new npm dependencies.
- **Money is integer units, 1 unit = 0.5 BB.** Database rows and raw `evLoss` fields stay in units. Rates are converted to BB exactly once, in `api/_lib/pokerStatsShape.js`, and their field names say so (`bbPer100`, `netBbPer100`, `evLostPer100Decisions` is BB).
- **Leak rules (spec §7.4):** only `confident = true` decisions; grouped by `spot`; ranked by BB lost per 100 graded hands; a spot needs **at least 15 decisions**; **up to 5 example hand ids** per spot (costliest hands first, loss > 0 only); at most **20** spots returned. Leaks and focus are shown only once **200 graded hands** exist ("play about 200 hands to unlock leaks").
- **Graded hands** = stored hands in the leak window whose `played_at` is at or after the earliest hand that has any decision. Hands before Phase 5 grading existed do not dilute BB/100.
- **Trend (spec §7.4):** per session with `hands > 0`, the latest **50** sessions, oldest first: net BB/100 (`net`), all-in adjusted BB/100 (`allin_adj_net`), EV lost per 100 decisions over **all** graded decisions of that session (confident or not, matching the §7.2 session review), `null` when the session has none.
- **Tendencies:** the latest **2,000** hands, folded oldest first with `accumulateProfile`, overall and by hero position. A flag (`below | in | above`) needs at least **30** opportunities (spec §5.5 uses 30 for adaptation); otherwise `null`.
- **Query limits (Vercel time budget):** leak and summary window **10,000** most recent hands; tendency window **2,000** hands (measured: replaying 2,000 engine hands takes about 65 ms in Node 22, and the event JSON is about 2.3 MB); spot hand list **50** hands. All four stats queries run in one `Promise.all`.
- **Before Phase 5:** `poker_decisions` is empty. Tendencies still render from hand logs. Leaks, trend and focus render the locked message "Play and review sessions to unlock …".
- **Handlers** follow the Phase 4 pattern: `createPokerStatsHandler({ getSql, auth, accumulate })` plus `export default createPokerStatsHandler()`, `guard(req, res, { methods: ['GET'], auth, getSql })`, Zod `safeParse` → 400 `VALIDATION_ERROR` with `z.flattenError(...)`, `try/catch` logging `console.error('trainers/poker/stats failed:', err)` → 500 `INTERNAL`. SQL only through `sql` tagged templates.
- **Function count:** Vercel Hobby allows **12** functions. After this phase `api/` has **10** (`auth`, `chat`, `data/profile`, `trainers/drill`, `trainers/sessions`, `trainers/stats`, `trainers/poker/sessions`, `trainers/poker/hands`, `trainers/poker/profile`, `trainers/poker/stats`). Task 5 adds a test that fails above 12. The spot hand list is a query mode of the same function, not a new file.
- **CSS:** every new selector is scoped under `.pk`. Charts reuse `trn-*` classes from `src/private/trainers/trainers.css`, overridden with `--pk-*` tokens. Identity is never color alone: flags carry an icon and text, the trend legend names both lines and the net line is dashed with dots.
- **Tests:** Vitest runs `src/**/*.test.js`, `api/**/*.test.js`, `scripts/**/*.test.js` in the node environment. There is no jsdom. `.jsx` files are checked with the bundle check below plus `npm run build`, and in the browser in Task 9.
- **Bundle check for `.jsx` tasks:** `npx esbuild <entry> --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning` must exit 0 with no output.
- **Build:** `npm run build` must succeed. Its existing "Some chunks are larger than 500 kB" warning for the main `index` chunk is not a failure.
- **Commits:** stage explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. Never stage `wa.geo.json`. Every commit message ends with exactly this trailer line:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Single test file: `npx vitest run <path>`. Full suite: `npm test`.

## Cross-phase dependencies (what this plan assumes exists on `feat/poker`)

Phases 2, 3 and 4 are not finished while this plan is written. Where their code did not exist yet, this plan relies only on their plans' Interfaces blocks.

| Phase | File | Exports / facts used | Used by task |
|---|---|---|---|
| 0 | `src/private/trainers/poker/bots/contract.js` | `PROFILE_STATS` (14 keys), `emptyProfile()` | 1, 3, 6 |
| 1 | `src/private/trainers/poker/engine/handState.js` | `applyEvent(null, startEvent)` returns a state with `players` and `button` | 3 |
| 3 | `src/private/trainers/poker/bots/profileStats.js` (Phase 3 Task 5) | `accumulateProfile(profile, heroSeat, events) → PlayerProfile`; returns the same object for incomplete logs | 3, 5 |
| 3 | `src/private/trainers/poker/bots/situation.js` (Phase 3 Task 6) | `positionsOf(stateOrView) → Record<seat, 'UTG'\|'HJ'\|'CO'\|'BTN'\|'SB'\|'BB'>` | 3 |
| 3 | `src/private/trainers/poker/bots/testHands.js` (Phase 3 Task 5, test helper) | `buildLog(steps, { holes, stack, button }) → events` | 3 |
| 2 | `src/private/trainers/poker/ui/lobby/StatsTab.jsx` (Phase 2 Task 11) | default export rendered by `PokerLobbyPage` for `?tab=stats`; **replaced** here | 7 |
| 2 | `src/private/trainers/poker/ui/PokerShell.jsx`, `ui/poker.css` (Phase 2 Task 11) | `.pk` scope, `--pk-*` tokens, `--pk-font`, classes `pk-box`, `pk-h2`, `pk-h3`, `pk-muted`, `pk-error`, `pk-btn`, `pk-btn--raise`, `pk-tab`, `pk-sr-only` | 7, 8 |
| 2 | `src/private/trainers/poker/lib/format.js` (Phase 2 Task 1) | `formatNetBb(units) → "+12.5" \| "−3.0" \| "0.0"` | 6 |
| 4 | `db/migrations/002_poker.sql` | tables `poker_sessions(hands, net, allin_adj_net, started_at)`, `poker_hands(id, session_id, hand_no, played_at, hero_seat, events, hero_net)`, `poker_decisions(hand_id, spot, action, ev_loss, grade, confident)`; indexes `poker_hands_recent (played_at DESC, id DESC)`, `poker_decisions_spot (spot)` | 5 |
| 4 | `api/_lib/http.js`, `api/_lib/db.js`, `api/_lib/session.js`, `api/_lib/testing.js` | `guard`, `sendError`, `getSql`, `authConfig`, `mockRes`, `authedReq`, `mockSql`, `TEST_AUTH` | 5 |
| 4 | `api/_lib/pokerTesting.js` | `pokerHandRecord({ seed, handNo, button })` | 5 |
| 4 | `api/_lib/pokerSchemas.js` | decision `spot: z.string().regex(/^[a-z0-9_.]{1,64}$/)` | 5 |
| 4 | `api/_lib/pokerBundle.test.js` (after Phase 4 Task 10) | `POKER_FUNCTIONS` lists `sessions.js`, `hands.js`, `profile.js` | 5 |
| 4 | `api/trainers/poker/profile.js` (Phase 4 Task 10) | exists (counts toward the function limit) | 5 |
| 4 | `src/private/trainers/poker/lib/persistence/api.js`, `api.test.js` | `request`-based wrappers with base `/api/trainers/poker` | 6 |
| — | `src/private/trainers/stats/charts/BarList.jsx`, `LineChart.jsx`, `src/private/trainers/lib/Kpi.jsx`, `src/private/trainers/lib/api.js` (`ApiError`), `src/private/trainers/core/format.js` (`formatDay`), `src/private/trainers/trainers.css` | existing trainer stats pieces | 6, 7 |
| 5 | none required | Links point at the spec §8.1 replayer route `/me/poker/hand/:id`. They only render once decisions exist, which requires Phase 5. | 6 |

## Decisions (already made)

- **Targets** live in `data/targets.js` as our own approximate ranges for a winning 6-max regular at 100 BB, matched to the `profileStats.js` definitions. Positional ranges exist for `vpip`, `pfr` and `threeBet`, where position changes the answer most; every other stat uses its overall range at every position.
- **Tendencies by position** fold each hand into the profile of the hero's position that hand (from the `start` event via `positionsOf`). No change to `accumulateProfile` or `PROFILE_STATS` is needed.
- **Focus link:** "the hand list filtered to that spot" is `/me/poker?tab=stats&spot=<spot>`, which shows the latest 50 hands with a decision in that spot (`GET stats?spot=`), each linking to the replayer. The Phase 5 session review lists hands per session only, so the cross-session list belongs here.
- **Spot copy** (labels and plain-language focus text) is keyed by spot family, parsed from the grammar in "Contract changes". Unknown spots fall back to street-level copy and never throw.
- **Costliest action:** each leak reports the chosen action with the largest summed EV loss in that spot, and the focus text names it ("Most of the EV lost came from calling.").
- **Indexes:** migration `003_poker_stats.sql` adds covering indexes so leak and trend aggregates are index-only per hand, and the spot list is index-only per spot. It drops `poker_decisions_spot`, which the new `(spot, hand_id)` index covers.
- **Charts (dataviz):** leaks are a single-hue bar list (magnitude). Trend is two single-axis line charts: net vs all-in adjusted (same unit, one chart, legend plus dashed/solid encoding), and EV lost per 100 decisions (different unit, its own chart). Tendencies are a table with a meter per row (value marker on a target band), with the flag as icon plus text. Every chart has a table view. The spec's accent tokens fail the validator's lightness band on the dark rail, so identity also uses dash pattern and legend text.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/private/trainers/poker/data/targets.js` | `TARGETS`, `POSITIONS`, `TENDENCY_MIN_N`, `targetFor`, `flagFor` | 1 |
| `src/private/trainers/poker/leaks/spotCopy.js` | `parseSpot`, `spotLabel`, `focusCopy`, `SPOT_SITUATIONS` | 2 |
| `src/private/trainers/poker/leaks/tendencies.js` | `heroPosition`, `emptyTendencies`, `accumulateTendencies`, `shapeTendencies` | 3 |
| `api/_lib/pokerStatsShape.js` | `shapeLeaks`, `shapeTrend`, `pickFocus`, `shapeSpotHands`, leak constants | 4 |
| `db/migrations/003_poker_stats.sql` | Leak tracker indexes | 5 |
| `api/_lib/pokerSchemas.js` | Modified: `SPOT_PATTERN`, `pokerStatsQuery` | 5 |
| `api/trainers/poker/stats.js` | `GET stats` and `GET stats?spot=` | 5 |
| `api/_lib/functionCount.test.js` | Fails if `api/` exceeds 12 Vercel functions | 5 |
| `src/private/trainers/poker/lib/persistence/api.js` | Modified: `getPokerStats`, `getPokerSpotHands` | 6 |
| `src/private/trainers/poker/ui/stats/statsView.js` | Pure view models and formatting for every panel | 6 |
| `src/private/trainers/poker/ui/stats/usePokerResource.js` | Fetch hook with reload and 401 redirect | 7 |
| `src/private/trainers/poker/ui/stats/StatsPanel.jsx` | Panel frame: loading, error, locked/empty, ready | 7 |
| `src/private/trainers/poker/ui/stats/FocusCard.jsx`, `LeaksPanel.jsx`, `TrendPanel.jsx` | Focus, leaks and trend panels | 7 |
| `src/private/trainers/poker/ui/stats/PokerStats.jsx`, `stats.css` | Stats tab composition and `.pk` chart styles | 7, 8 |
| `src/private/trainers/poker/ui/lobby/StatsTab.jsx` | Modified: renders `PokerStats` | 7 |
| `src/private/trainers/poker/ui/stats/TargetMeter.jsx`, `TendenciesPanel.jsx`, `SpotHands.jsx` | Tendencies table and meter, spot hand list | 8 |

---

### Task 1: Target ranges

**Files:**
- Create: `src/private/trainers/poker/data/targets.js`
- Test: `src/private/trainers/poker/data/targets.test.js`

**Interfaces:**
- Consumes: `PROFILE_STATS` (`bots/contract.js`).
- Produces:
  - `POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']`
  - `TENDENCY_MIN_N = 30`
  - `TARGETS: Record<stat, { overall: [lo, hi], byPosition?: Partial<Record<position, [lo, hi]>> }>` (fractions in [0, 1], inclusive)
  - `targetFor(stat, position?) → [lo, hi] | null` (positional range, else overall, `null` for an unknown stat)
  - `flagFor(value, n, target, minN = TENDENCY_MIN_N) → 'below' | 'in' | 'above' | null`

- [ ] **Step 1: Confirm the merged phases**

Run:
```bash
git log --oneline -1
grep -n "export const PROFILE_STATS\|export function emptyProfile" src/private/trainers/poker/bots/contract.js
grep -n "export function accumulateProfile" src/private/trainers/poker/bots/profileStats.js
grep -n "export function positionsOf" src/private/trainers/poker/bots/situation.js
grep -n "export function buildLog" src/private/trainers/poker/bots/testHands.js
grep -n "export default function StatsTab" src/private/trainers/poker/ui/lobby/StatsTab.jsx
grep -n "export const getPokerProfile" src/private/trainers/poker/lib/persistence/api.js
ls api/trainers/poker/profile.js db/migrations/002_poker.sql
```
Expected: every grep prints exactly one line and `ls` lists both files. If anything is missing, stop and report the missing item to the controller.

- [ ] **Step 2: Write the failing test**

```js
// src/private/trainers/poker/data/targets.test.js
import { describe, it, expect } from 'vitest';
import { PROFILE_STATS } from '../bots/contract.js';
import { TARGETS, POSITIONS, TENDENCY_MIN_N, targetFor, flagFor } from './targets.js';

const isRange = (r) => Array.isArray(r) && r.length === 2 && r[0] >= 0 && r[1] <= 1 && r[0] < r[1];

describe('TARGETS', () => {
  it('has an overall range for exactly the profile stats', () => {
    expect(Object.keys(TARGETS).sort()).toEqual([...PROFILE_STATS].sort());
    for (const key of PROFILE_STATS) expect(isRange(TARGETS[key].overall), key).toBe(true);
  });

  it('uses only the six positions, with valid ranges', () => {
    expect(POSITIONS).toEqual(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
    for (const [key, t] of Object.entries(TARGETS)) {
      for (const [position, range] of Object.entries(t.byPosition ?? {})) {
        expect(POSITIONS, `${key}.${position}`).toContain(position);
        expect(isRange(range), `${key}.${position}`).toBe(true);
      }
    }
  });

  it('never targets more preflop raising than voluntary play', () => {
    for (const position of POSITIONS) {
      const pfr = targetFor('pfr', position);
      const vpip = targetFor('vpip', position);
      expect(pfr[0], position).toBeLessThanOrEqual(vpip[0]);
      expect(pfr[1], position).toBeLessThanOrEqual(vpip[1]);
    }
  });
});

describe('targetFor', () => {
  it('prefers the positional range and falls back to overall', () => {
    expect(targetFor('vpip', 'BTN')).toEqual([0.38, 0.5]);
    expect(targetFor('vpip')).toEqual([0.22, 0.28]);
    expect(targetFor('threeBet', 'UTG')).toEqual(TARGETS.threeBet.overall);
    expect(targetFor('foldTo3Bet', 'BB')).toEqual([0.45, 0.6]);
    expect(targetFor('nope', 'BTN')).toBeNull();
  });
});

describe('flagFor', () => {
  const target = [0.22, 0.28];
  it('flags below, in (inclusive) and above', () => {
    expect(flagFor(0.2, 30, target)).toBe('below');
    expect(flagFor(0.22, 30, target)).toBe('in');
    expect(flagFor(0.28, 30, target)).toBe('in');
    expect(flagFor(0.3, 30, target)).toBe('above');
  });

  it('needs a value, a target and at least TENDENCY_MIN_N opportunities', () => {
    expect(TENDENCY_MIN_N).toBe(30);
    expect(flagFor(0.5, 29, target)).toBeNull();
    expect(flagFor(null, 0, target)).toBeNull();
    expect(flagFor(0.5, 40, null)).toBeNull();
    expect(flagFor(0.5, 5, target, 5)).toBe('above');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/data/targets.test.js`
Expected: FAIL, cannot find module `./targets.js`.

- [ ] **Step 4: Write the implementation**

```js
// src/private/trainers/poker/data/targets.js
// Target ranges for a winning 6-max No-Limit Hold'em cash player at 100 BB stacks, per profile stat
// (definitions: bots/profileStats.js) and, where position changes the answer most, per hero position.
//
// These are OUR OWN APPROXIMATE ranges, drawn from widely shared 6-max regular benchmarks and adjusted
// to our exact stat definitions. They are coaching guides, not solver output: being slightly outside a
// range is not automatically a leak. Values are fractions in [0, 1]; both ends are inclusive.

export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];

/** Opportunities a stat needs before it gets a below/in/above flag (spec §5.5 uses 30 as well). */
export const TENDENCY_MIN_N = 30;

export const TARGETS = {
  vpip: {
    overall: [0.22, 0.28],
    byPosition: { UTG: [0.14, 0.19], HJ: [0.17, 0.23], CO: [0.24, 0.31], BTN: [0.38, 0.5], SB: [0.26, 0.36], BB: [0.3, 0.42] },
  },
  pfr: {
    overall: [0.17, 0.23],
    byPosition: { UTG: [0.13, 0.18], HJ: [0.16, 0.22], CO: [0.22, 0.29], BTN: [0.32, 0.44], SB: [0.2, 0.3], BB: [0.07, 0.13] },
  },
  threeBet: {
    overall: [0.06, 0.1],
    byPosition: { HJ: [0.04, 0.08], CO: [0.05, 0.09], BTN: [0.07, 0.12], SB: [0.08, 0.14], BB: [0.08, 0.14] },
  },
  foldTo3Bet: { overall: [0.45, 0.6] },
  cbetFlop: { overall: [0.5, 0.7] },
  cbetTurn: { overall: [0.45, 0.6] },
  foldToCbetFlop: { overall: [0.35, 0.5] },
  foldToCbetTurn: { overall: [0.35, 0.5] },
  checkRaise: { overall: [0.06, 0.14] },
  wtsd: { overall: [0.25, 0.32] },
  wsd: { overall: [0.49, 0.56] },
  aggFreq: { overall: [0.38, 0.52] },
  foldToRiverBet: { overall: [0.35, 0.5] },
  riverBetFreq: { overall: [0.3, 0.45] },
};

/** @returns {[number, number] | null} the positional range when defined, else the overall range */
export function targetFor(stat, position = null) {
  const target = TARGETS[stat];
  if (!target) return null;
  return (position && target.byPosition?.[position]) || target.overall;
}

/** @returns {'below'|'in'|'above'|null} null until the stat has a value and minN opportunities */
export function flagFor(value, n, target, minN = TENDENCY_MIN_N) {
  if (!target || value === null || value === undefined || n < minN) return null;
  if (value < target[0]) return 'below';
  if (value > target[1]) return 'above';
  return 'in';
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/data/targets.test.js`
Expected: PASS (6 tests). Then run `npm test`. Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/data/targets.js src/private/trainers/poker/data/targets.test.js
git commit -m "Add approximate 6-max target ranges for poker tendencies

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Spot labels and focus copy

**Files:**
- Create: `src/private/trainers/poker/leaks/spotCopy.js`
- Test: `src/private/trainers/poker/leaks/spotCopy.test.js`

**Interfaces:**
- Consumes: nothing (pure). The spot grammar is the contract addition at the end of this plan.
- Produces:
  - `SPOT_SITUATIONS = { preflop: ['open','vs_limp','vs_open','squeeze','vs_3bet','vs_4bet'], postflop: ['cbet','no_bet','facing_bet','facing_raise'] }`
  - `parseSpot(spot) → { street:'preflop'|'flop'|'turn'|'river', situation:string, position:'ip'|'oop'|null } | null`
  - `spotLabel(spot) → string` (e.g. `"River · facing a bet · out of position"`; the raw string when unparseable)
  - `focusCopy(spot, { costliestAction? }) → { title:string, body:string }`

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/leaks/spotCopy.test.js
import { describe, it, expect } from 'vitest';
import { SPOT_SITUATIONS, parseSpot, spotLabel, focusCopy } from './spotCopy.js';

describe('parseSpot', () => {
  it('reads street, situation and position', () => {
    expect(parseSpot('pf.vs_3bet')).toEqual({ street: 'preflop', situation: 'vs_3bet', position: null });
    expect(parseSpot('river.facing_bet.oop')).toEqual({ street: 'river', situation: 'facing_bet', position: 'oop' });
    expect(parseSpot('flop.cbet.ip')).toEqual({ street: 'flop', situation: 'cbet', position: 'ip' });
    expect(parseSpot('turn.no_bet.multiway.oop')).toEqual({ street: 'turn', situation: 'no_bet', position: 'oop' });
  });

  it('returns null for anything outside the grammar', () => {
    for (const bad of ['', 'pf', 'preflop.open', 'river.', null, undefined, 42]) {
      expect(parseSpot(bad), String(bad)).toBeNull();
    }
  });
});

describe('spotLabel', () => {
  it('labels known, unknown and unparseable spots', () => {
    expect(spotLabel('pf.open')).toBe('Preflop · first in');
    expect(spotLabel('river.facing_bet.oop')).toBe('River · facing a bet · out of position');
    expect(spotLabel('flop.cbet.ip')).toBe('Flop · c-bet chance · in position');
    expect(spotLabel('turn.overbet_probe')).toBe('Turn · overbet probe');
    expect(spotLabel('weird')).toBe('weird');
  });
});

describe('focusCopy', () => {
  it('has specific copy for every preflop and postflop situation', () => {
    for (const situation of SPOT_SITUATIONS.preflop) {
      expect(focusCopy(`pf.${situation}`).title, situation).not.toBe('Preflop decisions');
    }
    for (const street of ['flop', 'turn', 'river']) {
      for (const situation of SPOT_SITUATIONS.postflop) {
        const { title, body } = focusCopy(`${street}.${situation}`);
        expect(title, `${street}.${situation}`).not.toMatch(/decisions$/);
        expect(body.length).toBeGreaterThan(40);
      }
    }
  });

  it('falls back to street copy, then to generic copy', () => {
    const turn = focusCopy('turn.overbet_probe');
    expect(turn.title).toBe('Turn decisions');
    expect(turn.body).toContain('turn spot');
    expect(focusCopy('pf.cbet').title).toBe('Preflop decisions');
    expect(focusCopy('weird').title).toBe('Your costliest spot');
  });

  it('adds the position and the costliest action', () => {
    expect(focusCopy('river.facing_bet.oop').body).toContain('out of position');
    expect(focusCopy('flop.cbet.ip').body).toContain('in position');
    expect(focusCopy('pf.open', { costliestAction: 'call' }).body.endsWith('Most of the EV lost came from calling.')).toBe(true);
    expect(focusCopy('pf.open', { costliestAction: 'dance' }).body).not.toContain('Most of the EV lost');
    expect(focusCopy('pf.open', { costliestAction: null }).body).not.toContain('Most of the EV lost');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/leaks/spotCopy.test.js`
Expected: FAIL, cannot find module `./spotCopy.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/leaks/spotCopy.js
// Labels and plain-language coaching copy for decision spots (spec §7.4 focus card).
// Spot grammar (contracts, Phase 6 addition): `pf.<situation>` or `<flop|turn|river>.<situation>[.<modifier>…]`,
// where a modifier `ip` or `oop` gives the hero's position. Unknown situations fall back to street copy,
// so spots added by a later analysis version still render. Nothing here throws.

const STREET_BY_PREFIX = { pf: 'preflop', flop: 'flop', turn: 'turn', river: 'river' };
const STREET_LABEL = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const POSITION_LABEL = { ip: 'in position', oop: 'out of position' };

export const SPOT_SITUATIONS = {
  preflop: ['open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet'],
  postflop: ['cbet', 'no_bet', 'facing_bet', 'facing_raise'],
};

const SITUATION_LABEL = {
  open: 'first in',
  vs_limp: 'facing limpers',
  vs_open: 'facing an open',
  squeeze: 'raise and callers',
  vs_3bet: 'facing a 3-bet',
  vs_4bet: 'facing a 4-bet',
  cbet: 'c-bet chance',
  no_bet: 'no bet yet',
  facing_bet: 'facing a bet',
  facing_raise: 'facing a raise',
};

const COPY = {
  'preflop.open': {
    title: 'Opening the pot',
    body: 'You lose the most when the action folds to you preflop. The usual causes are opening weak hands from early seats, limping instead of raising, or folding hands that are profitable opens from the cutoff and button.',
  },
  'preflop.vs_limp': {
    title: 'Pots with limpers',
    body: 'You lose the most when someone has limped in front of you. Raising strong and playable hands to isolate usually beats limping behind, and weak offsuit hands are a fold.',
  },
  'preflop.vs_open': {
    title: 'Facing an open',
    body: 'You lose the most when someone has already raised. The usual causes are calling too wide out of position, not 3-betting your best hands, or defending the blinds with hands that rarely win after the flop.',
  },
  'preflop.squeeze': {
    title: 'A raise and callers',
    body: 'You lose the most when there is a raise and a call in front of you. These pots grow fast: re-raise your strong hands and fold marginal ones rather than calling into a multiway pot.',
  },
  'preflop.vs_3bet': {
    title: 'Facing a 3-bet',
    body: 'You lose the most after your open gets 3-bet. The usual causes are folding too often, which is easy to exploit, or calling out of position with hands that play badly in big pots.',
  },
  'preflop.vs_4bet': {
    title: 'Facing a 4-bet',
    body: 'You lose the most after a 4-bet. Ranges are narrow by now: continue with the top of your range and let the rest go.',
  },
  'postflop.cbet': {
    title: 'Continuation bets',
    body: 'You lose the most when you were the last to raise and it is your turn to bet or check. The usual causes are betting boards that favor the caller, or checking strong hands and draws that should build the pot.',
  },
  'postflop.no_bet': {
    title: 'No bet yet',
    body: 'You lose the most when nobody has bet yet on the street. The usual causes are betting hands that cannot make better hands fold, or checking back hands that should bet for value.',
  },
  'postflop.facing_bet': {
    title: 'Facing a bet',
    body: 'You lose the most when you face a bet. Compare the price to your chance of winning: calling without enough equity and folding too often to small bets both show up here.',
  },
  'postflop.facing_raise': {
    title: 'Facing a raise',
    body: 'You lose the most when your bet gets raised. Raises are usually strong: continue with hands that beat a value range or have a good draw, and fold the rest.',
  },
};

const POSITION_SENTENCE = {
  ip: ' You are in position here, so you act last and see what they do first.',
  oop: ' You are out of position here, which makes marginal calls harder to play well.',
};

const ACTION_WORD = { fold: 'folding', check: 'checking', call: 'calling', bet: 'betting', raise: 'raising' };

/** @returns {{ street:'preflop'|'flop'|'turn'|'river', situation:string, position:'ip'|'oop'|null } | null} */
export function parseSpot(spot) {
  if (typeof spot !== 'string') return null;
  const [prefix, situation, ...modifiers] = spot.split('.');
  const street = Object.hasOwn(STREET_BY_PREFIX, prefix) ? STREET_BY_PREFIX[prefix] : null;
  if (!street || !situation) return null;
  const position = modifiers.find((m) => m === 'ip' || m === 'oop') ?? null;
  return { street, situation, position };
}

/** "River · facing a bet · out of position"; the raw value when the spot is outside the grammar. */
export function spotLabel(spot) {
  const parsed = parseSpot(spot);
  if (!parsed) return String(spot);
  const situation = Object.hasOwn(SITUATION_LABEL, parsed.situation)
    ? SITUATION_LABEL[parsed.situation]
    : parsed.situation.replaceAll('_', ' ');
  const parts = [STREET_LABEL[parsed.street], situation];
  if (parsed.position) parts.push(POSITION_LABEL[parsed.position]);
  return parts.join(' · ');
}

function baseCopy(parsed) {
  if (!parsed) {
    return { title: 'Your costliest spot', body: 'This spot costs you the most. Review the example hands to see what the decisions have in common.' };
  }
  const group = parsed.street === 'preflop' ? 'preflop' : 'postflop';
  const key = `${group}.${parsed.situation}`;
  if (Object.hasOwn(COPY, key)) return COPY[key];
  return {
    title: `${STREET_LABEL[parsed.street]} decisions`,
    body: `This ${parsed.street} spot costs you the most. Review the example hands to see what the decisions have in common.`,
  };
}

/** Focus card copy for a spot, naming its position and, when known, the action that lost the most. */
export function focusCopy(spot, { costliestAction = null } = {}) {
  const parsed = parseSpot(spot);
  const { title, body } = baseCopy(parsed);
  let text = body;
  if (parsed?.position) text += POSITION_SENTENCE[parsed.position];
  if (typeof costliestAction === 'string' && Object.hasOwn(ACTION_WORD, costliestAction)) {
    text += ` Most of the EV lost came from ${ACTION_WORD[costliestAction]}.`;
  }
  return { title, body: text };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/leaks/spotCopy.test.js`
Expected: PASS (6 tests). Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/leaks/spotCopy.js src/private/trainers/poker/leaks/spotCopy.test.js
git commit -m "Add poker spot labels and plain-language focus copy

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Tendencies overall and by position

**Files:**
- Create: `src/private/trainers/poker/leaks/tendencies.js`
- Test: `src/private/trainers/poker/leaks/tendencies.test.js`

**Interfaces:**
- Consumes: `applyEvent` (`engine/handState.js`); `emptyProfile`, `PROFILE_STATS` (`bots/contract.js`); `accumulateProfile` (`bots/profileStats.js`); `positionsOf` (`bots/situation.js`); `POSITIONS`, `TENDENCY_MIN_N`, `targetFor`, `flagFor` (Task 1); test helper `buildLog` (`bots/testHands.js`).
- Produces:
  - `heroPosition(events, heroSeat) → 'UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB'|null`
  - `emptyTendencies() → { overall: PlayerProfile, byPosition: {} }`
  - `accumulateTendencies(acc, heroSeat, events, accumulate = accumulateProfile) → acc` (pure; returns `acc` itself when the hand does not count)
  - `shapeTendencies(acc) → Tendencies`, where
    `Tendencies = { hands:number, minSample:number, handsByPosition: Partial<Record<position, number>>, stats: { key, overall: Cell, byPosition: Partial<Record<position, Cell>> }[] }` and
    `Cell = { value:number|null, n:number, target:[number,number], flag:'below'|'in'|'above'|null }`. `stats` follows `PROFILE_STATS` order. Positions follow `POSITIONS` order and include only positions with at least one counted hand.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/leaks/tendencies.test.js
import { describe, it, expect, vi } from 'vitest';
import { PROFILE_STATS } from '../bots/contract.js';
import { buildLog } from '../bots/testHands.js';
import { heroPosition, emptyTendencies, accumulateTendencies, shapeTendencies } from './tendencies.js';

// Default table: button 5, so SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5. Seat 2 opens and wins the blinds.
const utgOpen = () => buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
// Button 0, so SB 1, BB 2, UTG 3, HJ 4, CO 5, BTN 0. Seat 2 (the big blind) folds to a small-blind raise.
const bbFold = () => buildLog(['f 3', 'f 4', 'f 5', 'f 0', 'r 1 6', 'f 2'], { button: 0 });

describe('heroPosition', () => {
  it('reads the hero position from the start event', () => {
    expect(heroPosition(utgOpen(), 2)).toBe('UTG');
    expect(heroPosition(utgOpen(), 5)).toBe('BTN');
    expect(heroPosition(bbFold(), 2)).toBe('BB');
  });

  it('is null for a seat not dealt in or a log without a start event', () => {
    expect(heroPosition(utgOpen(), 7)).toBeNull();
    expect(heroPosition([], 0)).toBeNull();
    expect(heroPosition([{ type: 'act', seat: 0, action: 'fold' }], 0)).toBeNull();
  });
});

describe('accumulateTendencies', () => {
  it('folds each hand overall and into the hero position', () => {
    let acc = emptyTendencies();
    acc = accumulateTendencies(acc, 2, utgOpen());
    acc = accumulateTendencies(acc, 2, bbFold());
    expect(acc.overall.hands).toBe(2);
    expect(acc.overall.stats.vpip).toEqual({ value: 0.5, n: 2 });
    expect(Object.keys(acc.byPosition).sort()).toEqual(['BB', 'UTG']);
    expect(acc.byPosition.UTG.stats.vpip).toEqual({ value: 1, n: 1 });
    expect(acc.byPosition.BB.stats.vpip).toEqual({ value: 0, n: 1 });
  });

  it('returns the same object for a hand that does not count, and never mutates', () => {
    const acc = accumulateTendencies(emptyTendencies(), 2, utgOpen());
    const before = JSON.stringify(acc);
    expect(accumulateTendencies(acc, 2, buildLog(['r 2 5', 'f 3']))).toBe(acc);
    accumulateTendencies(acc, 2, bbFold());
    expect(JSON.stringify(acc)).toBe(before);
  });

  it('uses the injected accumulator overall and for the position', () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const events = utgOpen();
    const acc = accumulateTendencies(emptyTendencies(), 2, events, accumulate);
    expect(accumulate).toHaveBeenCalledTimes(2);
    expect(accumulate.mock.calls[1][1]).toBe(2);
    expect(accumulate.mock.calls[1][2]).toBe(events);
    expect(acc.byPosition.UTG.hands).toBe(1);
  });
});

describe('shapeTendencies', () => {
  it('shapes an empty profile', () => {
    const t = shapeTendencies(emptyTendencies());
    expect(t.hands).toBe(0);
    expect(t.minSample).toBe(30);
    expect(t.handsByPosition).toEqual({});
    expect(t.stats.map((s) => s.key)).toEqual(PROFILE_STATS);
    expect(t.stats[0]).toEqual({ key: 'vpip', overall: { value: null, n: 0, target: [0.22, 0.28], flag: null }, byPosition: {} });
  });

  it('attaches positional targets and flags only with enough samples', () => {
    let acc = emptyTendencies();
    acc = accumulateTendencies(acc, 2, bbFold());
    for (let i = 0; i < 30; i += 1) acc = accumulateTendencies(acc, 2, utgOpen());
    const t = shapeTendencies(acc);
    expect(t.hands).toBe(31);
    expect(t.handsByPosition).toEqual({ UTG: 30, BB: 1 });
    const vpip = t.stats.find((s) => s.key === 'vpip');
    expect(vpip.overall.flag).toBe('above');
    expect(Object.keys(vpip.byPosition)).toEqual(['UTG', 'BB']);
    expect(vpip.byPosition.UTG).toEqual({ value: 1, n: 30, target: [0.14, 0.19], flag: 'above' });
    expect(vpip.byPosition.BB).toEqual({ value: 0, n: 1, target: [0.3, 0.42], flag: null });
    const foldTo3Bet = t.stats.find((s) => s.key === 'foldTo3Bet');
    expect(foldTo3Bet.byPosition.UTG).toEqual({ value: null, n: 0, target: [0.45, 0.6], flag: null });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/leaks/tendencies.test.js`
Expected: FAIL, cannot find module `./tendencies.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/leaks/tendencies.js
// Hero tendencies for the leak tracker (spec §7.4): Phase 3's accumulateProfile (the one stat definition,
// contracts §3.2) folded overall and into the hero's position for each hand, then paired with target
// ranges. Pure and plain-Node ESM, because api/trainers/poker/stats.js imports it.
import { applyEvent } from '../engine/handState.js';
import { emptyProfile, PROFILE_STATS } from '../bots/contract.js';
import { accumulateProfile } from '../bots/profileStats.js';
import { positionsOf } from '../bots/situation.js';
import { POSITIONS, TENDENCY_MIN_N, targetFor, flagFor } from '../data/targets.js';

/** The hero's position label in this hand, or null when the log has no start event or no such seat. */
export function heroPosition(events, heroSeat) {
  const start = Array.isArray(events) ? events[0] : null;
  if (!start || start.type !== 'start') return null;
  try {
    return positionsOf(applyEvent(null, start))[heroSeat] ?? null;
  } catch (err) {
    // Stored hands were replayed by POST hands, so a bad start event means a corrupt row.
    // Skip its position split rather than failing the whole stats request.
    console.warn('heroPosition: unreadable start event', err);
    return null;
  }
}

export function emptyTendencies() {
  return { overall: emptyProfile(), byPosition: {} };
}

/** Folds one completed hand in. Returns `acc` itself when accumulateProfile does not count the hand. */
export function accumulateTendencies(acc, heroSeat, events, accumulate = accumulateProfile) {
  const overall = accumulate(acc.overall, heroSeat, events);
  if (overall === acc.overall) return acc;
  const position = heroPosition(events, heroSeat);
  if (!position) return { overall, byPosition: acc.byPosition };
  const current = acc.byPosition[position] ?? emptyProfile();
  return { overall, byPosition: { ...acc.byPosition, [position]: accumulate(current, heroSeat, events) } };
}

const cell = ({ value, n }, target) => ({ value, n, target, flag: flagFor(value, n, target) });

/** The `tendencies` block of GET /api/trainers/poker/stats. */
export function shapeTendencies(acc) {
  const positions = POSITIONS.filter((position) => acc.byPosition[position]);
  return {
    hands: acc.overall.hands,
    minSample: TENDENCY_MIN_N,
    handsByPosition: Object.fromEntries(positions.map((p) => [p, acc.byPosition[p].hands])),
    stats: PROFILE_STATS.map((key) => ({
      key,
      overall: cell(acc.overall.stats[key], targetFor(key)),
      byPosition: Object.fromEntries(positions.map((p) => [p, cell(acc.byPosition[p].stats[key], targetFor(key, p))])),
    })),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/leaks/tendencies.test.js`
Expected: PASS (7 tests). If building the `bbFold` log throws, the engine rejected the step list: report the exact error to the controller rather than changing the expected positions. Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/leaks/tendencies.js src/private/trainers/poker/leaks/tendencies.test.js
git commit -m "Fold poker tendencies overall and by hero position with target flags

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Stats response shaping

**Files:**
- Create: `api/_lib/pokerStatsShape.js`
- Test: `api/_lib/pokerStatsShape.test.js`

**Interfaces:**
- Consumes: `spotLabel`, `focusCopy` (Task 2).
- Produces:
  - Constants `LEAK_MIN_DECISIONS = 15`, `LEAK_EXAMPLES = 5`, `LEAK_UNLOCK_HANDS = 200`.
  - `shapeLeaks(rows, gradedHands) → Leak[]`. Input rows: `{ spot, decisions, hands, mistakes, evLoss (units), costliestAction, examples: string[] }`. Output: `Leak = { spot, label, decisions, hands, mistakes, evLoss (units), bbPer100, bbPerDecision, costliestAction:string|null, examples:string[] }`, sorted by `evLoss` descending then `spot`. Rows under 15 decisions are dropped.
  - `shapeTrend(rows) → TrendPoint[]`. Input rows: `{ id, startedAt, hands, net (units), allinAdjNet (units), decisions, evLoss (units) }`. Output: `TrendPoint = { sessionId, startedAt, hands, netBbPer100, allinAdjBbPer100, decisions, evLostPer100Decisions:number|null }` (BB).
  - `pickFocus(leaks) → Focus|null`, `Focus = { spot, label, title, body, bbPer100, decisions, examples }`.
  - `shapeSpotHands(rows) → SpotHand[]`. Input rows: `{ handId, sessionId, handNo, playedAt, heroNet, decisions, evLoss, severity:0..3, confident }`. Output: `SpotHand = { handId, sessionId, handNo, playedAt, heroNet (units), decisions, evLoss (units), worstGrade:'good'|'inaccuracy'|'mistake'|'blunder', confident }`.

- [ ] **Step 1: Write the failing test**

```js
// api/_lib/pokerStatsShape.test.js
import { describe, it, expect } from 'vitest';
import {
  LEAK_MIN_DECISIONS, LEAK_EXAMPLES, LEAK_UNLOCK_HANDS, shapeLeaks, shapeTrend, pickFocus, shapeSpotHands,
} from './pokerStatsShape.js';
import { focusCopy } from '../../src/private/trainers/poker/leaks/spotCopy.js';

const leakRow = (overrides) => ({
  spot: 'pf.open', decisions: 40, hands: 40, mistakes: 2, evLoss: 30, costliestAction: 'raise', examples: [], ...overrides,
});

describe('constants', () => {
  it('match spec §7.4', () => {
    expect(LEAK_MIN_DECISIONS).toBe(15);
    expect(LEAK_EXAMPLES).toBe(5);
    expect(LEAK_UNLOCK_HANDS).toBe(200);
  });
});

describe('shapeLeaks', () => {
  it('converts units to BB per 100 graded hands and ranks by EV lost', () => {
    const rows = [
      leakRow(),
      leakRow({ spot: 'river.facing_bet.oop', decisions: 20, hands: 18, mistakes: 4, evLoss: 60, costliestAction: 'call', examples: ['h1', 'h2'] }),
      leakRow({ spot: 'turn.no_bet', decisions: 14, evLoss: 500 }),
    ];
    expect(shapeLeaks(rows, 300)).toEqual([
      {
        spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', decisions: 20, hands: 18, mistakes: 4,
        evLoss: 60, bbPer100: 10, bbPerDecision: 1.5, costliestAction: 'call', examples: ['h1', 'h2'],
      },
      {
        spot: 'pf.open', label: 'Preflop · first in', decisions: 40, hands: 40, mistakes: 2,
        evLoss: 30, bbPer100: 5, bbPerDecision: 0.375, costliestAction: 'raise', examples: [],
      },
    ]);
  });

  it('breaks ties by spot, caps examples and tolerates missing fields', () => {
    const rows = [
      leakRow({ spot: 'turn.cbet', costliestAction: undefined, examples: null }),
      leakRow({ spot: 'flop.cbet', examples: ['a', 'b', 'c', 'd', 'e', 'f'] }),
    ];
    const leaks = shapeLeaks(rows, 100);
    expect(leaks.map((l) => l.spot)).toEqual(['flop.cbet', 'turn.cbet']);
    expect(leaks[0].examples).toHaveLength(5);
    expect(leaks[1]).toMatchObject({ costliestAction: null, examples: [] });
    expect(shapeLeaks(rows, 0)[0].bbPer100).toBeNull();
  });
});

describe('shapeTrend', () => {
  it('gives BB/100 per session and EV lost per 100 decisions', () => {
    const rows = [
      { id: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 100, net: 50, allinAdjNet: 20.5, decisions: 0, evLoss: 0 },
      { id: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, net: -80, allinAdjNet: -10, decisions: 400, evLoss: 332 },
    ];
    expect(shapeTrend(rows)).toEqual([
      { sessionId: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 100, netBbPer100: 25, allinAdjBbPer100: 10.25, decisions: 0, evLostPer100Decisions: null },
      { sessionId: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, netBbPer100: -16, allinAdjBbPer100: -2, decisions: 400, evLostPer100Decisions: 41.5 },
    ]);
  });
});

describe('pickFocus', () => {
  it('is null without leaks and describes the top leak otherwise', () => {
    expect(pickFocus([])).toBeNull();
    const leaks = shapeLeaks([leakRow({ spot: 'river.facing_bet.oop', decisions: 20, evLoss: 60, costliestAction: 'call', examples: ['h1'] })], 300);
    const { title, body } = focusCopy('river.facing_bet.oop', { costliestAction: 'call' });
    expect(pickFocus(leaks)).toEqual({
      spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', title, body, bbPer100: 10, decisions: 20, examples: ['h1'],
    });
  });
});

describe('shapeSpotHands', () => {
  it('maps severity to the worst grade', () => {
    const row = { handId: 'h1', sessionId: 's1', handNo: 3, playedAt: '2026-09-12T18:03:00.000Z', heroNet: -13, decisions: 2, evLoss: 7.5, confident: false };
    expect(shapeSpotHands([0, 1, 2, 3].map((severity) => ({ ...row, severity }))).map((h) => h.worstGrade))
      .toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
    expect(shapeSpotHands([{ ...row, severity: 2 }])[0]).toEqual({ ...row, worstGrade: 'mistake' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_lib/pokerStatsShape.test.js`
Expected: FAIL, cannot find module `./pokerStatsShape.js`.

- [ ] **Step 3: Write the implementation**

```js
// api/_lib/pokerStatsShape.js
// Shapes GET /api/trainers/poker/stats rows into the leak tracker payload (spec §7.4).
// Rows arrive in integer units (1 unit = 0.5 BB). Rates leave as BB; raw evLoss/heroNet stay in units.
import { spotLabel, focusCopy } from '../../src/private/trainers/poker/leaks/spotCopy.js';

export const LEAK_MIN_DECISIONS = 15;
export const LEAK_EXAMPLES = 5;
export const LEAK_UNLOCK_HANDS = 200;

const GRADES_BY_SEVERITY = ['good', 'inaccuracy', 'mistake', 'blunder'];

const toBb = (units) => units / 2;
/** BB per 100 of `count`, or null when there is nothing to divide by. */
const per100 = (units, count) => (count > 0 ? (toBb(units) / count) * 100 : null);

export function shapeLeaks(rows, gradedHands) {
  return rows
    .filter((r) => r.decisions >= LEAK_MIN_DECISIONS)
    .map((r) => ({
      spot: r.spot,
      label: spotLabel(r.spot),
      decisions: r.decisions,
      hands: r.hands,
      mistakes: r.mistakes,
      evLoss: r.evLoss,
      bbPer100: per100(r.evLoss, gradedHands),
      bbPerDecision: toBb(r.evLoss) / r.decisions,
      costliestAction: r.costliestAction ?? null,
      examples: (r.examples ?? []).slice(0, LEAK_EXAMPLES),
    }))
    .sort((a, b) => b.evLoss - a.evLoss || a.spot.localeCompare(b.spot));
}

export function shapeTrend(rows) {
  return rows.map((r) => ({
    sessionId: r.id,
    startedAt: r.startedAt,
    hands: r.hands,
    netBbPer100: per100(r.net, r.hands),
    allinAdjBbPer100: per100(r.allinAdjNet, r.hands),
    decisions: r.decisions,
    evLostPer100Decisions: per100(r.evLoss, r.decisions),
  }));
}

/** The top leak with plain-language copy, or null. `leaks` must already be ranked by shapeLeaks. */
export function pickFocus(leaks) {
  const top = leaks[0];
  if (!top) return null;
  const { title, body } = focusCopy(top.spot, { costliestAction: top.costliestAction });
  return { spot: top.spot, label: top.label, title, body, bbPer100: top.bbPer100, decisions: top.decisions, examples: top.examples };
}

export function shapeSpotHands(rows) {
  return rows.map(({ severity, ...hand }) => ({ ...hand, worstGrade: GRADES_BY_SEVERITY[severity] ?? 'good' }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/_lib/pokerStatsShape.test.js`
Expected: PASS (6 tests). Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/pokerStatsShape.js api/_lib/pokerStatsShape.test.js
git commit -m "Shape poker leaks, trend, focus and spot hands for the stats API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Indexes and the stats endpoint

**Files:**
- Create: `db/migrations/003_poker_stats.sql`
- Create: `api/_lib/pokerStatsMigration.test.js`
- Modify: `api/_lib/pokerSchemas.js` (add `SPOT_PATTERN` and `pokerStatsQuery`; the decision `spot` field uses `SPOT_PATTERN`)
- Create: `api/trainers/poker/stats.js`
- Test: `api/trainers/poker/stats.test.js`
- Modify: `api/_lib/pokerBundle.test.js` (add `stats.js`)
- Create: `api/_lib/functionCount.test.js`

**Interfaces:**
- Consumes: `guard`, `sendError` (`api/_lib/http.js`); `getSql` (`api/_lib/db.js`); `authConfig` (`api/_lib/session.js`); `mockRes`, `authedReq`, `mockSql`, `TEST_AUTH` (`api/_lib/testing.js`); `pokerHandRecord` (`api/_lib/pokerTesting.js`); Task 3 `emptyTendencies`, `accumulateTendencies`, `shapeTendencies`; Task 4 shapers and constants; Task 2 `spotLabel`; `pendingMigrations`, `MIGRATION_NAME` (`scripts/migrate.js`).
- Produces:
  - `SPOT_PATTERN = /^[a-z0-9_.]{1,64}$/` and `pokerStatsQuery = z.object({ spot: z.string().regex(SPOT_PATTERN).optional() })` in `api/_lib/pokerSchemas.js`.
  - `createPokerStatsHandler({ getSql?, auth?, accumulate? })`, default export. Method `GET`.
  - `GET /api/trainers/poker/stats` → 200
    `{ summary: { hands, sessions, gradedHands, decisions, confidentDecisions, unlockHands:200, minSpotDecisions:15 }, tendencies: Tendencies, leaks: Leak[], trend: TrendPoint[], focus: Focus|null }`
  - `GET /api/trainers/poker/stats?spot=<spot>` → 200 `{ spot, label, hands: SpotHand[] }` (latest 50, newest first); 400 `VALIDATION_ERROR` for a spot outside `SPOT_PATTERN`.
  - Exported limits: `TENDENCY_MAX_HANDS = 2000`, `LEAK_WINDOW_HANDS = 10000`, `LEAK_LIMIT = 20`, `TREND_SESSIONS = 50`, `SPOT_HANDS_LIMIT = 50`.

- [ ] **Step 1: Write the migration test and the migration**

```js
// api/_lib/pokerStatsMigration.test.js
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/003_poker_stats.sql', import.meta.url), 'utf8');

describe('db/migrations/003_poker_stats.sql', () => {
  it('runs after 002_poker', () => {
    expect(MIGRATION_NAME.test('003_poker_stats.sql')).toBe(true);
    expect(pendingMigrations(['003_poker_stats.sql', '001_trainers.sql', '002_poker.sql'], ['001_trainers.sql']))
      .toEqual(['002_poker.sql', '003_poker_stats.sql']);
  });

  it('adds covering indexes for per-hand and per-spot aggregates', () => {
    expect(sqlText).toContain('ON poker_decisions (hand_id) INCLUDE (spot, action, ev_loss, grade, confident)');
    expect(sqlText).toContain('ON poker_decisions (spot, hand_id) INCLUDE (ev_loss, grade, confident)');
    expect(sqlText).toContain('DROP INDEX IF EXISTS poker_decisions_spot;');
    expect(sqlText).not.toMatch(/CREATE TABLE/);
  });
});
```

```sql
-- db/migrations/003_poker_stats.sql
-- Leak tracker indexes (spec §7.4, Phase 6).
-- poker_decisions_hand_cover: leaks and trend join decisions per hand and read only these columns,
--   so the aggregates are index-only scans.
-- poker_decisions_spot_hand: GET stats?spot= groups one spot's decisions by hand, index-only.
--   It covers every use of the old single-column spot index, which is dropped.
CREATE INDEX poker_decisions_hand_cover ON poker_decisions (hand_id) INCLUDE (spot, action, ev_loss, grade, confident);
CREATE INDEX poker_decisions_spot_hand ON poker_decisions (spot, hand_id) INCLUDE (ev_loss, grade, confident);
DROP INDEX IF EXISTS poker_decisions_spot;
```

- [ ] **Step 2: Write the failing handler, bundle and function-count tests**

```js
// api/trainers/poker/stats.test.js
import { describe, it, expect, vi } from 'vitest';
import {
  createPokerStatsHandler, TENDENCY_MAX_HANDS, LEAK_WINDOW_HANDS, LEAK_LIMIT, TREND_SESSIONS, SPOT_HANDS_LIMIT,
} from './stats.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { pokerHandRecord } from '../../_lib/pokerTesting.js';
import { LEAK_EXAMPLES, LEAK_MIN_DECISIONS, shapeLeaks, pickFocus } from '../../_lib/pokerStatsShape.js';
import { emptyTendencies, accumulateTendencies, shapeTendencies } from '../../../src/private/trainers/poker/leaks/tendencies.js';

const make = (sql, extra = {}) => createPokerStatsHandler({ getSql: () => sql, auth: () => TEST_AUTH, ...extra });

async function call(handler, options = {}) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

const summaryRow = (overrides = {}) => ({ hands: 0, sessions: 0, gradedHands: 0, decisions: 0, confidentDecisions: 0, ...overrides });

describe('api/trainers/poker/stats', () => {
  it('405 for POST, 401 without a session, 500 without a database, never cached', async () => {
    let res = await call(make(mockSql()), { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    res = await call(make(mockSql()), { authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
    res = mockRes();
    await createPokerStatsHandler({ getSql: () => null, auth: () => TEST_AUTH })(authedReq(), res);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  it('keeps the documented limits', () => {
    expect([TENDENCY_MAX_HANDS, LEAK_WINDOW_HANDS, LEAK_LIMIT, TREND_SESSIONS, SPOT_HANDS_LIMIT]).toEqual([2000, 10000, 20, 50, 50]);
  });

  it('returns empty panels when nothing is stored', async () => {
    const res = await call(make(mockSql([[summaryRow()], [], [], []])));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      summary: { ...summaryRow(), unlockHands: 200, minSpotDecisions: 15 },
      tendencies: shapeTendencies(emptyTendencies()),
      leaks: [],
      trend: [],
      focus: null,
    });
  });

  it('treats a missing summary row as zeros', async () => {
    const res = await call(make(mockSql([[], [], [], []])));
    expect(res.body.summary).toEqual({ ...summaryRow(), unlockHands: 200, minSpotDecisions: 15 });
  });

  it('runs the four queries with their limits', async () => {
    const sql = mockSql([[summaryRow()], [], [], []]);
    await call(make(sql));
    const [summary, leaks, trend, hands] = sql.queries;
    expect(sql.queries).toHaveLength(4);
    for (const fragment of ['FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT', 'min(played_at) FROM decided', 'WHERE hands > 0']) {
      expect(summary.text).toContain(fragment);
    }
    expect(summary.values).toEqual([LEAK_WINDOW_HANDS]);
    for (const fragment of [
      'WHERE d.confident', 'GROUP BY spot, hand_id', 'DISTINCT ON (spot)',
      'array_agg(p.hand_id::text ORDER BY p.loss DESC, p.hand_id) FILTER (WHERE p.loss > 0)', 'HAVING sum(p.n) >=',
    ]) {
      expect(leaks.text).toContain(fragment);
    }
    expect(leaks.values).toEqual([LEAK_WINDOW_HANDS, LEAK_EXAMPLES, LEAK_MIN_DECISIONS, LEAK_LIMIT]);
    for (const fragment of ['WHERE hands > 0', 'CROSS JOIN LATERAL', 'ORDER BY s.started_at, s.id']) {
      expect(trend.text).toContain(fragment);
    }
    expect(trend.values).toEqual([TREND_SESSIONS]);
    expect(hands.text).toContain('ORDER BY played_at DESC, id DESC');
    expect(hands.values).toEqual([TENDENCY_MAX_HANDS]);
  });

  it('folds stored hands oldest first and shapes leaks, focus and trend', async () => {
    const older = pokerHandRecord({ seed: 1, handNo: 1, button: 0 });
    const newer = pokerHandRecord({ seed: 2, handNo: 2, button: 1 });
    const leakRows = [
      { spot: 'pf.open', decisions: 40, hands: 40, mistakes: 2, evLoss: 30, costliestAction: 'raise', examples: [] },
      { spot: 'river.facing_bet.oop', decisions: 20, hands: 18, mistakes: 4, evLoss: 60, costliestAction: 'call', examples: ['h1'] },
    ];
    const trendRows = [{ id: 's1', startedAt: '2026-09-16T18:00:00.000Z', hands: 100, net: 50, allinAdjNet: 20.5, decisions: 10, evLoss: 8 }];
    const handRows = [newer, older].map((r) => ({ heroSeat: r.heroSeat, events: r.events }));
    const sql = mockSql([[summaryRow({ hands: 400, sessions: 3, gradedHands: 300, decisions: 90, confidentDecisions: 80 })], leakRows, trendRows, handRows]);
    const res = await call(make(sql));

    expect(res.statusCode).toBe(200);
    const expectedTendencies = shapeTendencies(
      accumulateTendencies(accumulateTendencies(emptyTendencies(), older.heroSeat, older.events), newer.heroSeat, newer.events),
    );
    expect(res.body.tendencies).toEqual(expectedTendencies);
    const leaks = shapeLeaks(leakRows, 300);
    expect(res.body.leaks).toEqual(leaks);
    expect(res.body.leaks[0].spot).toBe('river.facing_bet.oop');
    expect(res.body.focus).toEqual(pickFocus(leaks));
    expect(res.body.trend).toEqual([
      { sessionId: 's1', startedAt: '2026-09-16T18:00:00.000Z', hands: 100, netBbPer100: 25, allinAdjBbPer100: 10.25, decisions: 10, evLostPer100Decisions: 40 },
    ]);
  });

  it('passes hand rows to the accumulator oldest first', async () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const rows = [{ heroSeat: 0, events: ['newest'] }, { heroSeat: 0, events: ['oldest'] }];
    await call(make(mockSql([[summaryRow()], [], [], rows]), { accumulate }));
    expect(accumulate.mock.calls[0][2]).toEqual(['oldest']);
    expect(accumulate.mock.calls.at(-1)[2]).toEqual(['newest']);
  });

  describe('?spot=', () => {
    it('400 for a spot outside the pattern', async () => {
      const sql = mockSql();
      const res = await call(make(sql), { query: { spot: 'Bad Spot!' } });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(sql.queries).toHaveLength(0);
    });

    it('lists the latest hands with a decision in that spot', async () => {
      const row = { handId: 'h1', sessionId: 's1', handNo: 7, playedAt: '2026-09-16T18:07:00.000Z', heroNet: -13, decisions: 1, evLoss: 5, severity: 3, confident: true };
      const sql = mockSql([[row]]);
      const res = await call(make(sql), { query: { spot: 'river.facing_bet.oop' } });
      expect(res.statusCode).toBe(200);
      const { severity, ...rest } = row;
      expect(severity).toBe(3);
      expect(res.body).toEqual({
        spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', hands: [{ ...rest, worstGrade: 'blunder' }],
      });
      expect(sql.queries).toHaveLength(1);
      const [query] = sql.queries;
      for (const fragment of ['WHERE d.spot =', 'GROUP BY d.hand_id', 'bool_and(d.confident)', 'ORDER BY h.played_at DESC, h.id DESC']) {
        expect(query.text).toContain(fragment);
      }
      expect(query.values).toEqual(['river.facing_bet.oop', SPOT_HANDS_LIMIT]);
    });
  });

  it('500 INTERNAL when a query fails', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const sql = mockSql(() => Promise.reject(new Error('boom')));
      const res = await call(make(sql));
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
    } finally {
      console.error = original;
    }
  });
});
```

In `api/_lib/pokerBundle.test.js`, change the list to:

```js
const POKER_FUNCTIONS = [
  'api/trainers/poker/sessions.js',
  'api/trainers/poker/hands.js',
  'api/trainers/poker/profile.js',
  'api/trainers/poker/stats.js',
];
```

```js
// api/_lib/functionCount.test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';

// Vercel Hobby deploys at most 12 functions. Every .js file under api/ is one, except files or folders
// whose name starts with "_" and tests (.vercelignore drops **/*.test.js).
const API_DIR = fileURLToPath(new URL('../', import.meta.url));
const HOBBY_FUNCTION_LIMIT = 12;

function functionFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith('_')) return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return functionFiles(full);
    const isFunction = entry.name.endsWith('.js') && !entry.name.endsWith('.test.js');
    return isFunction ? [path.relative(API_DIR, full).split(path.sep).join('/')] : [];
  });
}

describe('Vercel function count', () => {
  it(`stays within the Hobby limit of ${HOBBY_FUNCTION_LIMIT}`, () => {
    const files = functionFiles(API_DIR).sort();
    expect(files).toContain('trainers/poker/stats.js');
    expect(files.length, files.join(', ')).toBeLessThanOrEqual(HOBBY_FUNCTION_LIMIT);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run api/_lib/pokerStatsMigration.test.js api/trainers/poker/stats.test.js api/_lib/pokerBundle.test.js api/_lib/functionCount.test.js`
Expected: `pokerStatsMigration.test.js` passes (the migration exists). `stats.test.js` fails to load `./stats.js`. The bundle case for `stats.js` fails with `ERR_MODULE_NOT_FOUND`. `functionCount.test.js` fails on `toContain('trainers/poker/stats.js')`.

- [ ] **Step 4: Add the query schema**

In `api/_lib/pokerSchemas.js`, add directly below `export const MAX_RECOMMENDED_CHARS = 2000;`:

```js
export const SPOT_PATTERN = /^[a-z0-9_.]{1,64}$/;
```

In the `decision` schema, replace `spot: z.string().regex(/^[a-z0-9_.]{1,64}$/),` with:

```js
  spot: z.string().regex(SPOT_PATTERN),
```

At the end of the file, append:

```js
// GET /api/trainers/poker/stats[?spot=]. A repeated ?spot= arrives as an array and is rejected.
export const pokerStatsQuery = z.object({ spot: z.string().regex(SPOT_PATTERN).optional() });
```

- [ ] **Step 5: Write the handler**

```js
// api/trainers/poker/stats.js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { pokerStatsQuery } from '../../_lib/pokerSchemas.js';
import {
  LEAK_EXAMPLES, LEAK_MIN_DECISIONS, LEAK_UNLOCK_HANDS, shapeLeaks, shapeTrend, pickFocus, shapeSpotHands,
} from '../../_lib/pokerStatsShape.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';
import { emptyTendencies, accumulateTendencies, shapeTendencies } from '../../../src/private/trainers/poker/leaks/tendencies.js';
import { spotLabel } from '../../../src/private/trainers/poker/leaks/spotCopy.js';

// GET /api/trainers/poker/stats          leak tracker: summary, tendencies, leaks, trend, focus (spec §7.4)
// GET /api/trainers/poker/stats?spot=    the latest hands with a decision in one spot (the focus link)
// Amounts in rows are integer units (1 unit = 0.5 BB); rates in the response are BB.
// Every query is bounded, and the four stats queries run in parallel, to stay well inside the
// function time limit with thousands of hands. api/_lib/pokerBundle.test.js proves the ../../../src
// imports load in plain Node.

export const TENDENCY_MAX_HANDS = 2000;
export const LEAK_WINDOW_HANDS = 10000;
export const LEAK_LIMIT = 20;
export const TREND_SESSIONS = 50;
export const SPOT_HANDS_LIMIT = 50;

const EMPTY_SUMMARY = Object.freeze({ hands: 0, sessions: 0, gradedHands: 0, decisions: 0, confidentDecisions: 0 });

// Graded hands: hands in the window from the earliest hand with any decision onward.
const summaryQuery = (sql) => sql`
  WITH recent AS (
    SELECT id, played_at FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${LEAK_WINDOW_HANDS}
  ), decided AS (
    SELECT d.confident, r.played_at FROM poker_decisions d JOIN recent r ON r.id = d.hand_id
  )
  SELECT (SELECT count(*) FROM poker_hands)::int AS hands,
         (SELECT count(*) FROM poker_sessions WHERE hands > 0)::int AS sessions,
         (SELECT count(*) FROM recent WHERE played_at >= (SELECT min(played_at) FROM decided))::int AS "gradedHands",
         (SELECT count(*) FROM decided)::int AS decisions,
         (SELECT count(*) FROM decided WHERE confident)::int AS "confidentDecisions"`;

// Confident decisions only, per spot. Examples are the costliest hands (loss > 0) in that spot.
const leaksQuery = (sql) => sql`
  WITH recent AS (
    SELECT id FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${LEAK_WINDOW_HANDS}
  ), confident AS (
    SELECT d.spot, d.hand_id, d.action, d.ev_loss, d.grade
    FROM poker_decisions d JOIN recent r ON r.id = d.hand_id
    WHERE d.confident
  ), per_hand AS (
    SELECT spot, hand_id, count(*)::int AS n, sum(ev_loss)::float8 AS loss,
           count(*) FILTER (WHERE grade IN ('mistake', 'blunder'))::int AS mistakes
    FROM confident GROUP BY spot, hand_id
  ), by_action AS (
    SELECT DISTINCT ON (spot) spot, action
    FROM (SELECT spot, action, sum(ev_loss) AS loss FROM confident GROUP BY spot, action) a
    ORDER BY spot, loss DESC, action
  )
  SELECT p.spot, sum(p.n)::int AS decisions, count(*)::int AS hands, sum(p.mistakes)::int AS mistakes,
         sum(p.loss)::float8 AS "evLoss", b.action AS "costliestAction",
         COALESCE(
           array_to_json((array_agg(p.hand_id::text ORDER BY p.loss DESC, p.hand_id) FILTER (WHERE p.loss > 0))[1:${LEAK_EXAMPLES}::int]),
           '[]'::json
         ) AS examples
  FROM per_hand p JOIN by_action b ON b.spot = p.spot
  GROUP BY p.spot, b.action
  HAVING sum(p.n) >= ${LEAK_MIN_DECISIONS}::int
  ORDER BY "evLoss" DESC, p.spot
  LIMIT ${LEAK_LIMIT}`;

// All graded decisions (confident or not), matching the session review's EV lost per 100 decisions.
const trendQuery = (sql) => sql`
  WITH s AS (
    SELECT id, started_at, hands, net, allin_adj_net FROM poker_sessions
    WHERE hands > 0 ORDER BY started_at DESC, id DESC LIMIT ${TREND_SESSIONS}
  )
  SELECT s.id, s.started_at AS "startedAt", s.hands, s.net, s.allin_adj_net::float8 AS "allinAdjNet",
         d.decisions, d.ev_loss AS "evLoss"
  FROM s CROSS JOIN LATERAL (
    SELECT count(pd.hand_id)::int AS decisions, COALESCE(sum(pd.ev_loss), 0)::float8 AS ev_loss
    FROM poker_hands h JOIN poker_decisions pd ON pd.hand_id = h.id
    WHERE h.session_id = s.id
  ) d
  ORDER BY s.started_at, s.id`;

const handsQuery = (sql) => sql`
  SELECT hero_seat AS "heroSeat", events FROM poker_hands ORDER BY played_at DESC, id DESC LIMIT ${TENDENCY_MAX_HANDS}`;

async function loadStats(sql, accumulate) {
  const [summaryRows, leakRows, trendRows, handRows] = await Promise.all([
    summaryQuery(sql), leaksQuery(sql), trendQuery(sql), handsQuery(sql),
  ]);
  const summary = { ...(summaryRows[0] ?? EMPTY_SUMMARY), unlockHands: LEAK_UNLOCK_HANDS, minSpotDecisions: LEAK_MIN_DECISIONS };
  let acc = emptyTendencies();
  for (let i = handRows.length - 1; i >= 0; i -= 1) {
    acc = accumulateTendencies(acc, handRows[i].heroSeat, handRows[i].events, accumulate);
  }
  const leaks = shapeLeaks(leakRows, summary.gradedHands);
  return { summary, tendencies: shapeTendencies(acc), leaks, trend: shapeTrend(trendRows), focus: pickFocus(leaks) };
}

async function loadSpotHands(sql, spot) {
  const rows = await sql`
    SELECT h.id AS "handId", h.session_id AS "sessionId", h.hand_no AS "handNo", h.played_at AS "playedAt",
           h.hero_net AS "heroNet", x.decisions, x."evLoss", x.severity, x.confident
    FROM (
      SELECT d.hand_id, count(*)::int AS decisions, sum(d.ev_loss)::float8 AS "evLoss",
             max(CASE d.grade WHEN 'blunder' THEN 3 WHEN 'mistake' THEN 2 WHEN 'inaccuracy' THEN 1 ELSE 0 END)::int AS severity,
             bool_and(d.confident) AS confident
      FROM poker_decisions d WHERE d.spot = ${spot} GROUP BY d.hand_id
    ) x JOIN poker_hands h ON h.id = x.hand_id
    ORDER BY h.played_at DESC, h.id DESC
    LIMIT ${SPOT_HANDS_LIMIT}`;
  return { spot, label: spotLabel(spot), hands: shapeSpotHands(rows) };
}

export function createPokerStatsHandler({ getSql = defaultGetSql, auth = authConfig, accumulate = accumulateProfile } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    const parsed = pokerStatsQuery.safeParse(req.query ?? {});
    if (!parsed.success) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid stats query', z.flattenError(parsed.error));
    }
    try {
      const { spot } = parsed.data;
      const body = spot === undefined ? await loadStats(sql, accumulate) : await loadSpotHands(sql, spot);
      return res.status(200).json(body);
    } catch (err) {
      console.error('trainers/poker/stats failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerStatsHandler();
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/pokerStatsMigration.test.js api/trainers/poker/stats.test.js api/_lib/pokerBundle.test.js api/_lib/functionCount.test.js api/_lib/pokerSchemas.test.js`
Expected: PASS. If the `stats.js` bundle case fails, a Phase 3 module imported by `leaks/tendencies.js` (for example `bots/situation.js`) is not plain-Node ESM (an extensionless import, a Vite alias, `import.meta.glob`, or a JSON import without `with { type: 'json' }`). Report the exact error to the controller: the fix belongs in that module, not a copy of `positionsOf` here. If `functionCount.test.js` reports more than 12, stop and report the listed files.

- [ ] **Step 7: (Optional, with the controller's go-ahead) Real-database check**

Only if the Phase 4 opt-in real-DB test is set up (`POKER_DB_IT=1` plus `DATABASE_URL` for a migrated disposable branch; run `npm run db:migrate` first so `003_poker_stats.sql` is applied). Add `import { createPokerStatsHandler } from './stats.js';` to `api/trainers/poker/realDb.test.js` and append inside its `describe.skipIf` block:

```js
  it('serves leak tracker stats and a spot list from stored rows', async () => {
    let res = await call(createPokerStatsHandler({ auth }), {});
    expect(res.statusCode).toBe(200);
    expect(res.body.summary.hands).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.body.leaks)).toBe(true);
    res = await call(createPokerStatsHandler({ auth }), { query: { spot: 'pf.open' } });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body.hands)).toBe(true);
  });
```

Run: `POKER_DB_IT=1 npx vitest run api/trainers/poker/realDb.test.js`
Expected: all cases pass. A Postgres syntax error here is a real bug in the Step 5 SQL: fix the query and keep the Step 2 fragments matching.

- [ ] **Step 8: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add db/migrations/003_poker_stats.sql api/_lib/pokerStatsMigration.test.js api/_lib/pokerSchemas.js api/trainers/poker/stats.js api/trainers/poker/stats.test.js api/_lib/pokerBundle.test.js api/_lib/functionCount.test.js
git commit -m "Add poker leak tracker stats endpoint, covering indexes and function-count guard

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If Step 7 was done, also stage `api/trainers/poker/realDb.test.js` in the same commit.

---

### Task 6: Client API and panel view models

**Files:**
- Modify: `src/private/trainers/poker/lib/persistence/api.js` (append two wrappers)
- Modify: `src/private/trainers/poker/lib/persistence/api.test.js` (import list plus one appended case)
- Create: `src/private/trainers/poker/ui/stats/statsView.js`
- Test: `src/private/trainers/poker/ui/stats/statsView.test.js`

**Interfaces:**
- Consumes: `request` (`src/private/trainers/lib/api.js`, already imported by `persistence/api.js`); `POSITIONS` (Task 1); `formatNetBb` (Phase 2 `lib/format.js`); `formatDay` (`src/private/trainers/core/format.js`); the Task 5 response shapes.
- Produces:
  - `getPokerStats(opts?) → Promise<StatsResponse>`, `getPokerSpotHands(spot, opts?) → Promise<SpotHandsResponse>`
  - `statsView.js`:
    - constants `UNLOCK_MESSAGE = 'Play and review sessions to unlock'`, `OVERALL = 'overall'`, `STAT_LABELS`, `FLAG_TEXT`, `FLAG_ICON`, `GRADE_TEXT`
    - `formatPct(v) → string`, `formatRange(target) → string`, `formatRate(bb) → string`, `formatLossBb(units) → string`
    - `spotHref(spot) → '/me/poker?tab=stats&spot=…'`, `handHref(id) → '/me/poker/hand/…'`
    - `tendenciesView(data, position?) → { state:'empty', message } | { state:'ready', positions:string[], position, hands, minSample, rows:TendencyRow[] }`, `TendencyRow = { key, label, value, n, target, flag, valueText, rangeText, statusText, lowSample }`
    - `leaksLock(summary) → string|null`
    - `leaksView(data) → { state:'locked'|'empty', message } | { state:'ready', items:LeakItem[] }`, `LeakItem = { key, label, value, display, hint, href, decisions, mistakes, perDecisionText, examples:{ id, label, href }[] }` (also a valid `BarList` item)
    - `trendView(data) → { state:'locked', message } | { state:'ready', sessions, net:{x,y,title}[], allinAdj:{x,y}[], evLost:{x,y,title}[], hasEvLost, rows:{ key, index, day, hands, netText, allinAdjText, evLostText }[] }`
    - `focusView(data) → { state:'locked'|'empty', message } | { state:'ready', spot, label, title, body, rateText, decisions, href, examples:{ id, label, href }[] }`
    - `spotHandsView(data) → { state:'empty', spot, label, message } | { state:'ready', spot, label, rows:{ key, href, day, handNo, decisions, evLossText, gradeText, netText }[] }`
    - `meterGeometry(value, target, width, mark = 4) → { band:{ x, width }|null, marker:{ x }|null }`

- [ ] **Step 1: Write the failing tests**

In `src/private/trainers/poker/lib/persistence/api.test.js`, change the import to:

```js
import {
  openPokerSession, closePokerSession, savePokerHands, getPokerSession, listOpenPokerSessions, getPokerProfile,
  getPokerStats, getPokerSpotHands,
} from './api.js';
```

and append this case inside the existing `describe('poker persistence api', …)` block, after the existing `it`:

```js
  it('calls the stats endpoints', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await getPokerStats({ fetchImpl });
    await getPokerSpotHands('river.facing_bet.oop', { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      ['/api/trainers/poker/stats', 'GET'],
      ['/api/trainers/poker/stats?spot=river.facing_bet.oop', 'GET'],
    ]);
  });
```

```js
// src/private/trainers/poker/ui/stats/statsView.test.js
import { describe, it, expect } from 'vitest';
import { formatDay } from '../../../core/format.js';
import {
  UNLOCK_MESSAGE, formatPct, formatRange, formatRate, formatLossBb, spotHref, handHref,
  tendenciesView, leaksLock, leaksView, trendView, focusView, spotHandsView, meterGeometry,
} from './statsView.js';

const summary = (o = {}) => ({
  hands: 400, sessions: 2, gradedHands: 300, decisions: 900, confidentDecisions: 800, unlockHands: 200, minSpotDecisions: 15, ...o,
});
const cell = (value, n, target, flag) => ({ value, n, target, flag });
const TREND = [
  { sessionId: 's1', startedAt: '2026-09-10T18:00:00.000Z', hands: 150, netBbPer100: -12.5, allinAdjBbPer100: -4, decisions: 0, evLostPer100Decisions: null },
  { sessionId: 's2', startedAt: '2026-09-12T18:00:00.000Z', hands: 250, netBbPer100: 8, allinAdjBbPer100: 3.5, decisions: 600, evLostPer100Decisions: 41.5 },
];
const LEAK = {
  spot: 'river.facing_bet.oop', label: 'River · facing a bet · out of position', decisions: 20, hands: 18, mistakes: 4,
  evLoss: 60, bbPer100: 10, bbPerDecision: 1.5, costliestAction: 'call', examples: ['h1', 'h2'],
};

function payload(o = {}) {
  return {
    summary: summary(o.summary),
    tendencies: o.tendencies ?? {
      hands: 400,
      minSample: 30,
      handsByPosition: { BTN: 70, BB: 66 },
      stats: [
        { key: 'vpip', overall: cell(0.31, 380, [0.22, 0.28], 'above'), byPosition: { BTN: cell(0.45, 70, [0.38, 0.5], 'in'), BB: cell(0.5, 12, [0.3, 0.42], null) } },
        { key: 'foldTo3Bet', overall: cell(null, 0, [0.45, 0.6], null), byPosition: { BTN: cell(null, 0, [0.45, 0.6], null), BB: cell(null, 0, [0.45, 0.6], null) } },
      ],
    },
    leaks: o.leaks ?? [LEAK],
    trend: o.trend ?? TREND,
    focus: o.focus === undefined
      ? { spot: LEAK.spot, label: LEAK.label, title: 'Facing a bet', body: 'Body.', bbPer100: 10, decisions: 20, examples: ['h1', 'h2'] }
      : o.focus,
  };
}

describe('formatting', () => {
  it('formats percentages, ranges, signed rates and losses', () => {
    expect(formatPct(0.314)).toBe('31%');
    expect(formatPct(null)).toBe('—');
    expect(formatRange([0.22, 0.28])).toBe('22–28%');
    expect(formatRange(null)).toBe('—');
    expect(formatRate(8)).toBe('+8.0');
    expect(formatRate(-12.5)).toBe('−12.5');
    expect(formatRate(-0.04)).toBe('0.0');
    expect(formatRate(null)).toBe('—');
    expect(formatLossBb(5)).toBe('2.5 BB');
    expect(spotHref('river.facing_bet.oop')).toBe('/me/poker?tab=stats&spot=river.facing_bet.oop');
    expect(handHref('h 1')).toBe('/me/poker/hand/h%201');
  });
});

describe('tendenciesView', () => {
  it('is empty until a hand is saved', () => {
    const view = tendenciesView(payload({ tendencies: { hands: 0, minSample: 30, handsByPosition: {}, stats: [] } }));
    expect(view).toEqual({ state: 'empty', message: 'No saved hands yet. Play a session to see your tendencies.' });
  });

  it('shows overall rows with flags and sample hints', () => {
    const view = tendenciesView(payload());
    expect(view).toMatchObject({ state: 'ready', positions: ['overall', 'BTN', 'BB'], position: 'overall', hands: 400, minSample: 30 });
    expect(view.rows[0]).toEqual({
      key: 'vpip', label: 'VPIP', value: 0.31, n: 380, target: [0.22, 0.28], flag: 'above',
      valueText: '31%', rangeText: '22–28%', statusText: '▲ Above range', lowSample: false,
    });
    expect(view.rows[1]).toMatchObject({ label: 'Fold to 3-bet', valueText: '—', statusText: 'No spots yet', lowSample: true });
  });

  it('switches to a position and falls back to overall for an unknown one', () => {
    const bb = tendenciesView(payload(), 'BB');
    expect(bb.hands).toBe(66);
    expect(bb.rows[0]).toMatchObject({ valueText: '50%', rangeText: '30–42%', statusText: 'Need 30 spots', lowSample: true });
    expect(tendenciesView(payload(), 'BTN').rows[0].statusText).toBe('● In range');
    expect(tendenciesView(payload(), 'UTG').position).toBe('overall');
  });
});

describe('leaksView and leaksLock', () => {
  it('locks before any review, then until enough graded hands', () => {
    expect(leaksLock(summary({ decisions: 0, gradedHands: 0 }))).toBe(`${UNLOCK_MESSAGE} leaks.`);
    expect(leaksView(payload({ summary: { gradedHands: 120 } }))).toEqual({
      state: 'locked', message: 'Play about 200 hands to unlock leaks (120 reviewed so far).',
    });
    expect(leaksLock(summary())).toBeNull();
  });

  it('is empty when no spot has enough confident decisions', () => {
    expect(leaksView(payload({ leaks: [] }))).toEqual({
      state: 'empty', message: 'No spot has 15 confident decisions yet. Keep playing and reviewing.',
    });
  });

  it('builds bar list items with links', () => {
    expect(leaksView(payload())).toEqual({
      state: 'ready',
      items: [{
        key: 'river.facing_bet.oop', label: LEAK.label, value: 10, display: '10.0 BB/100',
        hint: '20 decisions · 4 mistakes or blunders', href: '/me/poker?tab=stats&spot=river.facing_bet.oop',
        decisions: 20, mistakes: 4, perDecisionText: '1.50 BB',
        examples: [
          { id: 'h1', label: 'Hand 1', href: '/me/poker/hand/h1' },
          { id: 'h2', label: 'Hand 2', href: '/me/poker/hand/h2' },
        ],
      }],
    });
  });
});

describe('trendView', () => {
  it('locks before any review or without sessions', () => {
    const locked = { state: 'locked', message: `${UNLOCK_MESSAGE} your trend.` };
    expect(trendView(payload({ summary: { decisions: 0 } }))).toEqual(locked);
    expect(trendView(payload({ trend: [] }))).toEqual(locked);
  });

  it('builds both charts and a table', () => {
    const view = trendView(payload());
    expect(view.state).toBe('ready');
    expect(view.sessions).toBe(2);
    expect(view.net).toEqual([
      { x: 1, y: -12.5, title: `Session 1 · ${formatDay(TREND[0].startedAt)}: −12.5 BB/100` },
      { x: 2, y: 8, title: `Session 2 · ${formatDay(TREND[1].startedAt)}: +8.0 BB/100` },
    ]);
    expect(view.allinAdj).toEqual([{ x: 1, y: -4 }, { x: 2, y: 3.5 }]);
    expect(view.evLost).toEqual([
      { x: 1, y: null, title: `Session 1 · ${formatDay(TREND[0].startedAt)}: not reviewed` },
      { x: 2, y: 41.5, title: `Session 2 · ${formatDay(TREND[1].startedAt)}: 41.5 BB per 100 decisions` },
    ]);
    expect(view.hasEvLost).toBe(true);
    expect(view.rows[1]).toEqual({
      key: 's2', index: 2, day: formatDay(TREND[1].startedAt), hands: 250, netText: '+8.0', allinAdjText: '+3.5', evLostText: '41.5',
    });
    expect(view.rows[0].evLostText).toBe('—');
  });
});

describe('focusView', () => {
  it('follows the leak lock, then shows the top leak', () => {
    expect(focusView(payload({ summary: { decisions: 0 } }))).toEqual({ state: 'locked', message: `${UNLOCK_MESSAGE} leaks.` });
    expect(focusView(payload({ focus: null }))).toEqual({ state: 'empty', message: 'No leak stands out yet. Keep playing and reviewing.' });
    expect(focusView(payload())).toEqual({
      state: 'ready', spot: LEAK.spot, label: LEAK.label, title: 'Facing a bet', body: 'Body.', rateText: '10.0 BB/100', decisions: 20,
      href: '/me/poker?tab=stats&spot=river.facing_bet.oop',
      examples: [
        { id: 'h1', label: 'Hand 1', href: '/me/poker/hand/h1' },
        { id: 'h2', label: 'Hand 2', href: '/me/poker/hand/h2' },
      ],
    });
  });
});

describe('spotHandsView', () => {
  it('lists hands with grades, marking debatable ones', () => {
    const hand = { handId: 'h9', sessionId: 's2', handNo: 14, playedAt: '2026-09-12T18:30:00.000Z', heroNet: -13, decisions: 1, evLoss: 5, worstGrade: 'mistake', confident: false };
    expect(spotHandsView({ spot: 'pf.open', label: 'Preflop · first in', hands: [] })).toEqual({
      state: 'empty', spot: 'pf.open', label: 'Preflop · first in', message: 'No hands in this spot yet.',
    });
    expect(spotHandsView({ spot: 'pf.open', label: 'Preflop · first in', hands: [hand, { ...hand, handId: 'h8', confident: true, worstGrade: 'good', heroNet: 4 }] })).toEqual({
      state: 'ready', spot: 'pf.open', label: 'Preflop · first in',
      rows: [
        { key: 'h9', href: '/me/poker/hand/h9', day: formatDay(hand.playedAt), handNo: 14, decisions: 1, evLossText: '2.5 BB', gradeText: 'Mistake (debatable)', netText: '−6.5 BB' },
        { key: 'h8', href: '/me/poker/hand/h8', day: formatDay(hand.playedAt), handNo: 14, decisions: 1, evLossText: '2.5 BB', gradeText: 'Good', netText: '+2.0 BB' },
      ],
    });
  });
});

describe('meterGeometry', () => {
  it('places the band and a clamped marker', () => {
    const g = meterGeometry(0.31, [0.22, 0.28], 120);
    expect(g.band.x).toBeCloseTo(26.4, 6);
    expect(g.band.width).toBeCloseTo(7.2, 6);
    expect(g.marker.x).toBeCloseTo(35.2, 6);
    expect(meterGeometry(1, [0.2, 0.3], 120).marker.x).toBe(116);
    expect(meterGeometry(0, [0.2, 0.3], 120).marker.x).toBe(0);
    expect(meterGeometry(null, null, 120)).toEqual({ band: null, marker: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/ui/stats/statsView.test.js`
Expected: FAIL. `api.test.js` fails with `getPokerStats is not a function`, and `statsView.test.js` cannot find `./statsView.js`.

- [ ] **Step 3: Write the implementation**

Append to `src/private/trainers/poker/lib/persistence/api.js`:

```js
export const getPokerStats = (opts) => request(`${BASE}/stats`, opts);

export const getPokerSpotHands = (spot, opts) =>
  request(`${BASE}/stats?spot=${encodeURIComponent(spot)}`, opts);
```

```js
// src/private/trainers/poker/ui/stats/statsView.js
// Pure view models for the Stats tab (spec §7.4). Each panel is 'locked' (needs reviewed sessions),
// 'empty' (not enough data yet) or 'ready', with every display string computed here so the
// components only render. Input is the GET /api/trainers/poker/stats body.
import { POSITIONS } from '../../data/targets.js';
import { formatNetBb } from '../../lib/format.js';
import { formatDay } from '../../../core/format.js';

export const UNLOCK_MESSAGE = 'Play and review sessions to unlock';
export const OVERALL = 'overall';

export const STAT_LABELS = {
  vpip: 'VPIP',
  pfr: 'PFR',
  threeBet: '3-bet',
  foldTo3Bet: 'Fold to 3-bet',
  cbetFlop: 'C-bet flop',
  cbetTurn: 'C-bet turn',
  foldToCbetFlop: 'Fold to flop c-bet',
  foldToCbetTurn: 'Fold to turn c-bet',
  checkRaise: 'Check-raise',
  wtsd: 'Went to showdown',
  wsd: 'Won at showdown',
  aggFreq: 'Aggression',
  foldToRiverBet: 'Fold to river bet',
  riverBetFreq: 'River bet',
};

export const FLAG_TEXT = { below: 'Below range', in: 'In range', above: 'Above range' };
export const FLAG_ICON = { below: '▼', in: '●', above: '▲' };
export const GRADE_TEXT = { good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' };

const MINUS = '−';
const pct = (v) => `${Math.round(v * 100)}%`;

export const formatPct = (v) => (v === null || v === undefined ? '—' : pct(v));
export const formatRange = (target) => (target ? `${Math.round(target[0] * 100)}–${pct(target[1])}` : '—');
export const formatLossBb = (units) => `${(units / 2).toFixed(1)} BB`;

/** Signed BB with one decimal: "+8.0", "−12.5", "0.0", or "—" for null. */
export function formatRate(bb) {
  if (bb === null || bb === undefined) return '—';
  const text = Math.abs(bb).toFixed(1);
  if (text === '0.0') return text;
  return bb > 0 ? `+${text}` : `${MINUS}${text}`;
}

export const spotHref = (spot) => `/me/poker?tab=stats&spot=${encodeURIComponent(spot)}`;
export const handHref = (id) => `/me/poker/hand/${encodeURIComponent(id)}`;

const exampleLinks = (ids) => ids.map((id, i) => ({ id, label: `Hand ${i + 1}`, href: handHref(id) }));

function statusText(c, minSample) {
  if (c.flag) return `${FLAG_ICON[c.flag]} ${FLAG_TEXT[c.flag]}`;
  if (c.n === 0) return 'No spots yet';
  return `Need ${minSample} spots`;
}

export function tendenciesView(data, position = OVERALL) {
  const t = data.tendencies;
  if (t.hands === 0) return { state: 'empty', message: 'No saved hands yet. Play a session to see your tendencies.' };
  const positions = [OVERALL, ...POSITIONS.filter((p) => (t.handsByPosition[p] ?? 0) > 0)];
  const selected = positions.includes(position) ? position : OVERALL;
  const rows = t.stats.map((s) => {
    const c = selected === OVERALL ? s.overall : s.byPosition[selected];
    return {
      key: s.key,
      label: STAT_LABELS[s.key] ?? s.key,
      value: c.value,
      n: c.n,
      target: c.target,
      flag: c.flag,
      valueText: formatPct(c.value),
      rangeText: formatRange(c.target),
      statusText: statusText(c, t.minSample),
      lowSample: c.n < t.minSample,
    };
  });
  const hands = selected === OVERALL ? t.hands : t.handsByPosition[selected];
  return { state: 'ready', positions, position: selected, hands, minSample: t.minSample, rows };
}

/** The locked message for leaks and focus, or null once they can show. */
export function leaksLock(summary) {
  if (summary.decisions === 0) return `${UNLOCK_MESSAGE} leaks.`;
  if (summary.gradedHands < summary.unlockHands) {
    return `Play about ${summary.unlockHands} hands to unlock leaks (${summary.gradedHands} reviewed so far).`;
  }
  return null;
}

export function leaksView(data) {
  const locked = leaksLock(data.summary);
  if (locked) return { state: 'locked', message: locked };
  if (data.leaks.length === 0) {
    return { state: 'empty', message: `No spot has ${data.summary.minSpotDecisions} confident decisions yet. Keep playing and reviewing.` };
  }
  return {
    state: 'ready',
    items: data.leaks.map((l) => ({
      key: l.spot,
      label: l.label,
      value: l.bbPer100,
      display: `${l.bbPer100.toFixed(1)} BB/100`,
      hint: `${l.decisions} decisions · ${l.mistakes} mistakes or blunders`,
      href: spotHref(l.spot),
      decisions: l.decisions,
      mistakes: l.mistakes,
      perDecisionText: `${l.bbPerDecision.toFixed(2)} BB`,
      examples: exampleLinks(l.examples),
    })),
  };
}

const sessionTitle = (s, i, text) => `Session ${i + 1} · ${formatDay(s.startedAt)}: ${text}`;
const evLostText = (v) => (v === null ? '—' : v.toFixed(1));

export function trendView(data) {
  if (data.summary.decisions === 0 || data.trend.length === 0) {
    return { state: 'locked', message: `${UNLOCK_MESSAGE} your trend.` };
  }
  const { trend } = data;
  return {
    state: 'ready',
    sessions: trend.length,
    net: trend.map((s, i) => ({ x: i + 1, y: s.netBbPer100, title: sessionTitle(s, i, `${formatRate(s.netBbPer100)} BB/100`) })),
    allinAdj: trend.map((s, i) => ({ x: i + 1, y: s.allinAdjBbPer100 })),
    evLost: trend.map((s, i) => {
      const v = s.evLostPer100Decisions;
      const text = v === null ? 'not reviewed' : `${v.toFixed(1)} BB per 100 decisions`;
      return { x: i + 1, y: v, title: sessionTitle(s, i, text) };
    }),
    hasEvLost: trend.some((s) => s.evLostPer100Decisions !== null),
    rows: trend.map((s, i) => ({
      key: s.sessionId,
      index: i + 1,
      day: formatDay(s.startedAt),
      hands: s.hands,
      netText: formatRate(s.netBbPer100),
      allinAdjText: formatRate(s.allinAdjBbPer100),
      evLostText: evLostText(s.evLostPer100Decisions),
    })),
  };
}

export function focusView(data) {
  const locked = leaksLock(data.summary);
  if (locked) return { state: 'locked', message: locked };
  const f = data.focus;
  if (!f) return { state: 'empty', message: 'No leak stands out yet. Keep playing and reviewing.' };
  return {
    state: 'ready',
    spot: f.spot,
    label: f.label,
    title: f.title,
    body: f.body,
    rateText: `${f.bbPer100.toFixed(1)} BB/100`,
    decisions: f.decisions,
    href: spotHref(f.spot),
    examples: exampleLinks(f.examples),
  };
}

export function spotHandsView(data) {
  const base = { spot: data.spot, label: data.label };
  if (data.hands.length === 0) return { state: 'empty', ...base, message: 'No hands in this spot yet.' };
  return {
    state: 'ready',
    ...base,
    rows: data.hands.map((h) => {
      const grade = GRADE_TEXT[h.worstGrade] ?? h.worstGrade;
      return {
        key: h.handId,
        href: handHref(h.handId),
        day: formatDay(h.playedAt),
        handNo: h.handNo,
        decisions: h.decisions,
        evLossText: formatLossBb(h.evLoss),
        gradeText: h.confident ? grade : `${grade} (debatable)`,
        netText: `${formatNetBb(h.heroNet)} BB`,
      };
    }),
  };
}

/** SVG geometry for a tendency meter: the target band and a marker `mark` wide, clamped inside `width`. */
export function meterGeometry(value, target, width, mark = 4) {
  const x = (v) => Math.min(width, Math.max(0, v * width));
  const band = target ? { x: x(target[0]), width: x(target[1]) - x(target[0]) } : null;
  const marker = value === null || value === undefined
    ? null
    : { x: Math.min(width - mark, Math.max(0, x(value) - mark / 2)) };
  return { band, marker };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/ui/stats/statsView.test.js`
Expected: PASS. Then `npm test`: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/persistence/api.js src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/ui/stats/statsView.js src/private/trainers/poker/ui/stats/statsView.test.js
git commit -m "Add poker stats client calls and leak tracker view models

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Stats tab with focus, leaks and trend panels

**Files:**
- Create: `src/private/trainers/poker/ui/stats/usePokerResource.js`
- Create: `src/private/trainers/poker/ui/stats/StatsPanel.jsx`
- Create: `src/private/trainers/poker/ui/stats/FocusCard.jsx`
- Create: `src/private/trainers/poker/ui/stats/LeaksPanel.jsx`
- Create: `src/private/trainers/poker/ui/stats/TrendPanel.jsx`
- Create: `src/private/trainers/poker/ui/stats/PokerStats.jsx`
- Create: `src/private/trainers/poker/ui/stats/stats.css` (all Stats tab styles, including those Task 8's components use)
- Modify: `src/private/trainers/poker/ui/lobby/StatsTab.jsx` (replace the placeholder)

**Interfaces:**
- Consumes: Task 6 view models and `getPokerStats`; `ApiError` (`src/private/trainers/lib/api.js`); `BarList`, `LineChart` (`src/private/trainers/stats/charts/`); `Kpi` (`src/private/trainers/lib/Kpi.jsx`); `src/private/trainers/trainers.css`; Phase 2 `.pk` classes and tokens (see the dependency table).
- Produces:
  - `usePokerResource(load, key) → { status:'loading'|'ready'|'error', data, error:string|null, reload() }`. `load(key) → Promise` must be defined at module scope.
  - `<StatsPanel id title wide? status error onRetry view>{(view) => node}</StatsPanel>`
  - `<FocusCard view />`, `<LeaksPanel view />`, `<TrendPanel view />` (ready views from Task 6)
  - `PokerStats` (default export), rendered by `StatsTab`

This task has no unit test: it adds `.jsx` and CSS over the Task 6 view models, which are tested. The checks are the bundle check, the full suite and the build.

- [ ] **Step 1: Write the hook and the panel frame**

```js
// src/private/trainers/poker/ui/stats/usePokerResource.js
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../lib/api.js';

const LOGIN_FROM = '/me/poker?tab=stats';

/**
 * Loads `load(key)`. While reloading the same key it keeps the last data, so panels do not blank;
 * a new key starts empty. A 401 sends the user to /login and back here afterwards.
 * `load` must be stable (defined at module scope).
 */
export function usePokerResource(load, key) {
  const navigate = useNavigate();
  const [state, setState] = useState({ key, status: 'loading', data: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ key, status: 'loading', data: s.key === key ? s.data : null, error: null }));
    load(key)
      .then((data) => {
        if (live) setState({ key, status: 'ready', data, error: null });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true, state: { from: LOGIN_FROM } });
          return;
        }
        const message = err instanceof Error ? err.message : 'Request failed';
        setState((s) => ({ key, status: 'error', data: s.key === key ? s.data : null, error: message }));
      });
    return () => { live = false; };
  }, [load, key, nonce, navigate]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  if (state.key !== key) return { status: 'loading', data: null, error: null, reload };
  return { status: state.status, data: state.data, error: state.error, reload };
}
```

```jsx
// src/private/trainers/poker/ui/stats/StatsPanel.jsx
/** One Stats tab panel: loading, error (with retry), locked/empty message, or the ready content. */
function PanelBody({ status, error, onRetry, view, children }) {
  if (!view && status === 'error') {
    return (
      <div className="pk-panel-msg">
        <p className="pk-error" role="alert">Couldn&apos;t load this panel: {error}</p>
        <button type="button" className="pk-btn" data-hot onClick={onRetry}>Retry</button>
      </div>
    );
  }
  if (!view) return <p className="pk-muted" role="status">Loading…</p>;
  if (view.state !== 'ready') {
    return <p className={`pk-muted pk-panel-msg pk-panel-msg--${view.state}`}>{view.message}</p>;
  }
  return children(view);
}

export default function StatsPanel({ id, title, wide = false, status, error, onRetry, view, children }) {
  const className = wide ? 'pk-box pk-stats-panel pk-stats__wide' : 'pk-box pk-stats-panel';
  return (
    <section className={className} aria-labelledby={`${id}-title`} aria-busy={status === 'loading'}>
      <h2 id={`${id}-title`} className="pk-h2">{title}</h2>
      <PanelBody status={status} error={error} onRetry={onRetry} view={view}>{children}</PanelBody>
    </section>
  );
}
```

- [ ] **Step 2: Write the focus, leaks and trend panels**

```jsx
// src/private/trainers/poker/ui/stats/FocusCard.jsx
import { Link } from 'react-router-dom';
import Kpi from '../../../lib/Kpi';

/** The top leak in plain language, linking to every hand in that spot (spec §7.4 focus). */
export default function FocusCard({ view }) {
  return (
    <div className="pk-focus">
      <p className="pk-focus__label">{view.label}</p>
      <h3 className="pk-focus__title">{view.title}</h3>
      <p className="pk-focus__body">{view.body}</p>
      <dl className="trn-kpis">
        <Kpi label="Lost" value={view.rateText} hint="per 100 reviewed hands" />
        <Kpi label="Decisions" value={view.decisions} hint="confident grades" />
      </dl>
      <div className="pk-focus__actions">
        <Link to={view.href} className="pk-btn pk-btn--raise" data-hot>See hands in this spot</Link>
        {view.examples.map((ex) => (
          <Link key={ex.id} to={ex.href} className="pk-example" data-hot>{ex.label}</Link>
        ))}
      </div>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/stats/LeaksPanel.jsx
import { Link } from 'react-router-dom';
import BarList from '../../../stats/charts/BarList';

/** Spots ranked by BB lost per 100 hands (single-hue bars), with a table view and example hands. */
export default function LeaksPanel({ view }) {
  return (
    <div className="pk-leaks">
      <p className="pk-muted">BB lost per 100 reviewed hands, from confident grades only.</p>
      <BarList label="BB lost per 100 hands by spot" items={view.items} />
      <details className="pk-details">
        <summary>Table and example hands</summary>
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Spot</th>
                <th scope="col">Lost</th>
                <th scope="col">Decisions</th>
                <th scope="col">Mistakes</th>
                <th scope="col">Per decision</th>
                <th scope="col">Examples</th>
              </tr>
            </thead>
            <tbody>
              {view.items.map((item) => (
                <tr key={item.key}>
                  <th scope="row"><Link to={item.href} data-hot>{item.label}</Link></th>
                  <td>{item.display}</td>
                  <td>{item.decisions}</td>
                  <td>{item.mistakes}</td>
                  <td>{item.perDecisionText}</td>
                  <td>
                    {item.examples.map((ex) => (
                      <Link key={ex.id} to={ex.href} className="pk-example" data-hot>{ex.label}</Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/stats/TrendPanel.jsx
import LineChart from '../../../stats/charts/LineChart';

const BREAK_EVEN = [{ y: 0, label: 'break-even' }];
const formatX = (x) => `#${x}`;

/** Per-session results and EV lost. Different units, so two single-axis charts, plus a table view. */
export default function TrendPanel({ view }) {
  return (
    <div className="pk-trend">
      <figure className="pk-trend__chart">
        <figcaption className="pk-h3">Results, BB per 100 hands</figcaption>
        <ul className="pk-legend">
          <li><span className="pk-swatch pk-swatch--net" aria-hidden="true" />Net (dashed, with dots)</li>
          <li><span className="pk-swatch pk-swatch--adj" aria-hidden="true" />All-in adjusted (solid)</li>
        </ul>
        <LineChart
          points={view.net}
          overlay={view.allinAdj}
          refLines={BREAK_EVEN}
          formatX={formatX}
          label={`Net and all-in adjusted BB per 100 hands for the last ${view.sessions} sessions`}
        />
      </figure>
      <figure className="pk-trend__chart">
        <figcaption className="pk-h3">EV lost, BB per 100 decisions</figcaption>
        {view.hasEvLost ? (
          <LineChart
            points={view.evLost}
            formatX={formatX}
            yFromZero
            label={`EV lost in BB per 100 decisions for the last ${view.sessions} sessions`}
          />
        ) : (
          <p className="pk-muted">Reviewed sessions will show here.</p>
        )}
      </figure>
      <details className="pk-details pk-stats__wide">
        <summary>Table</summary>
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col">Day</th>
                <th scope="col">Hands</th>
                <th scope="col">Net BB/100</th>
                <th scope="col">All-in adj. BB/100</th>
                <th scope="col">EV lost / 100 decisions</th>
              </tr>
            </thead>
            <tbody>
              {view.rows.map((r) => (
                <tr key={r.key}>
                  <th scope="row">#{r.index}</th>
                  <td>{r.day}</td>
                  <td>{r.hands}</td>
                  <td>{r.netText}</td>
                  <td>{r.allinAdjText}</td>
                  <td>{r.evLostText}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
```

- [ ] **Step 3: Write the tab, its styles and the lobby hookup**

```jsx
// src/private/trainers/poker/ui/stats/PokerStats.jsx
import { useMemo } from 'react';
import { getPokerStats } from '../../lib/persistence/api.js';
import { usePokerResource } from './usePokerResource';
import { focusView, leaksView, trendView } from './statsView';
import StatsPanel from './StatsPanel';
import FocusCard from './FocusCard';
import LeaksPanel from './LeaksPanel';
import TrendPanel from './TrendPanel';
import '../../../trainers.css';
import './stats.css';

const loadStats = () => getPokerStats();

/** The Stats tab: long-term leak tracker (spec §7.4). */
export default function PokerStats() {
  const { status, data, error, reload } = usePokerResource(loadStats, 'stats');
  const views = useMemo(
    () => (data ? { focus: focusView(data), leaks: leaksView(data), trend: trendView(data) } : null),
    [data],
  );
  const panel = { status, error, onRetry: reload };

  return (
    <div className="pk-stats">
      {status === 'error' && data && (
        <div className="pk-panel-msg pk-stats__wide">
          <p className="pk-error" role="alert">Couldn&apos;t refresh stats: {error}</p>
          <button type="button" className="pk-btn" data-hot onClick={reload}>Retry</button>
        </div>
      )}
      <StatsPanel id="pk-focus" title="Focus" wide {...panel} view={views?.focus}>
        {(view) => <FocusCard view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-leaks" title="Leaks" {...panel} view={views?.leaks}>
        {(view) => <LeaksPanel view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-trend" title="Trend" wide {...panel} view={views?.trend}>
        {(view) => <TrendPanel view={view} />}
      </StatsPanel>
    </div>
  );
}
```

```css
/* src/private/trainers/poker/ui/stats/stats.css */
/* Stats tab (spec §7.4). Every rule is scoped under .pk. The shared trainer charts keep their
   trn-* markup; these rules repaint them with the Midnight Indigo tokens. */
.pk .pk-stats { display: grid; gap: 24px; }
@media (min-width: 1024px) {
  .pk .pk-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pk .pk-stats__wide { grid-column: 1 / -1; }
}
.pk .pk-box.pk-stats-panel { align-items: stretch; min-width: 0; } /* beats .pk .pk-box in poker.css */
.pk .pk-panel-msg { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.pk .pk-panel-msg--locked { color: var(--pk-accent-2); }

/* focus */
.pk .pk-focus { display: flex; flex-direction: column; gap: 12px; max-width: 72ch; }
.pk .pk-focus__label { margin: 0; font-size: 11px; color: var(--pk-muted); text-transform: uppercase; }
.pk .pk-focus__title { margin: 0; font-family: var(--pk-font); font-weight: 400; font-size: 22px; color: var(--pk-accent); }
.pk .pk-focus__body { margin: 0; font-size: 13px; line-height: 1.7; }
.pk .pk-focus__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.pk .pk-example { color: var(--pk-accent-2); font-size: 11px; margin-right: 8px; }

/* tables and details */
.pk .pk-details summary { cursor: pointer; font-size: 11px; color: var(--pk-muted); text-transform: uppercase; }
.pk .pk-details[open] summary { margin-bottom: 8px; }
.pk .pk-table-wrap { overflow-x: auto; }
.pk .pk-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.pk .pk-table th, .pk .pk-table td { text-align: left; padding: 6px 8px; border-bottom: 2px solid var(--pk-rail-hi); white-space: nowrap; }
.pk .pk-table thead th { color: var(--pk-muted); font-weight: 400; }
.pk .pk-table tbody th { font-weight: 400; }
.pk .pk-table a { color: var(--pk-text); }
.pk .pk-row--low { color: var(--pk-muted); }

/* tendencies */
.pk .pk-seg { display: flex; flex-wrap: wrap; gap: 6px; }
.pk .pk-tab[aria-pressed="true"] { color: var(--pk-accent); border-color: var(--pk-accent); }
.pk .pk-meter { display: block; }
.pk .pk-meter__track { fill: var(--pk-bg); }
.pk .pk-meter__band { fill: var(--pk-accent-2); opacity: 0.45; }
.pk .pk-meter__mark--in { fill: var(--pk-text); }
.pk .pk-meter__mark--below, .pk .pk-meter__mark--above { fill: var(--pk-accent); }
.pk .pk-meter__mark--low { fill: var(--pk-muted); }
.pk .pk-flag--below, .pk .pk-flag--above { color: var(--pk-accent); }

/* trend legend */
.pk .pk-trend { display: grid; gap: 20px; }
@media (min-width: 1024px) { .pk .pk-trend { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.pk .pk-trend__chart { margin: 0; min-width: 0; }
.pk .pk-legend { list-style: none; display: flex; flex-wrap: wrap; gap: 16px; margin: 0 0 8px; padding: 0; font-size: 11px; }
.pk .pk-legend li { display: inline-flex; align-items: center; gap: 6px; }
.pk .pk-swatch { display: inline-block; width: 18px; height: 0; border-top: 2px solid; }
.pk .pk-swatch--net { border-top-style: dashed; border-color: var(--pk-accent-2); }
.pk .pk-swatch--adj { border-color: var(--pk-accent); }

/* shared trainer charts, KPI tiles and bars in the poker palette */
.pk .trn-muted { color: var(--pk-muted); }
.pk .trn-grid { stroke: var(--pk-rail-hi); }
.pk .trn-axis { fill: var(--pk-muted); font-family: var(--pk-font); font-size: 9px; }
.pk .trn-ref { stroke: var(--pk-muted); }
.pk .trn-ref-label { fill: var(--pk-muted); }
.pk .trn-line { stroke: var(--pk-accent-2); stroke-width: 2; stroke-dasharray: 5 3; opacity: 1; }
.pk .trn-dot { fill: var(--pk-accent-2); }
.pk .trn-overlay { stroke: var(--pk-accent); stroke-width: 2; }
.pk .trn-kpi { border-top-color: var(--pk-rail-hi); }
.pk .trn-kpi dt { color: var(--pk-muted); font-family: var(--pk-font); font-size: 10px; }
.pk .trn-kpi dd { font-family: var(--pk-font); font-weight: 400; color: var(--pk-accent); }
.pk .trn-kpi dd.trn-kpi-hint { font-family: var(--pk-font); color: var(--pk-muted); }
.pk .trn-barlist-label { font-family: var(--pk-font); font-size: 11px; color: var(--pk-text); }
.pk .trn-barlist-track { background: var(--pk-bg); }
.pk .trn-barlist-fill { background: var(--pk-accent); }
.pk .trn-barlist-value { font-size: 12px; }
```

Replace the whole of `src/private/trainers/poker/ui/lobby/StatsTab.jsx` with:

```jsx
// src/private/trainers/poker/ui/lobby/StatsTab.jsx
import PokerStats from '../stats/PokerStats';

/** Stats tab on /me/poker?tab=stats: the long-term leak tracker (spec §7.4, Phase 6). */
export default function StatsTab() {
  return <PokerStats />;
}
```

- [ ] **Step 4: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/lobby/StatsTab.jsx --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: `✓ built`; the only warning is the existing 500 kB chunk-size warning.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/ui/stats/usePokerResource.js src/private/trainers/poker/ui/stats/StatsPanel.jsx src/private/trainers/poker/ui/stats/FocusCard.jsx src/private/trainers/poker/ui/stats/LeaksPanel.jsx src/private/trainers/poker/ui/stats/TrendPanel.jsx src/private/trainers/poker/ui/stats/PokerStats.jsx src/private/trainers/poker/ui/stats/stats.css src/private/trainers/poker/ui/lobby/StatsTab.jsx
git commit -m "Replace poker Stats tab placeholder with focus, leaks and trend panels

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Tendencies panel and spot hand list

**Files:**
- Create: `src/private/trainers/poker/ui/stats/TargetMeter.jsx`
- Create: `src/private/trainers/poker/ui/stats/TendenciesPanel.jsx`
- Create: `src/private/trainers/poker/ui/stats/SpotHands.jsx`
- Modify: `src/private/trainers/poker/ui/stats/PokerStats.jsx` (full replacement below)

**Interfaces:**
- Consumes: `meterGeometry`, `tendenciesView`, `spotHandsView`, `OVERALL` (Task 6); `getPokerSpotHands` (Task 6); `usePokerResource`, `StatsPanel`, `stats.css` classes (Task 7); `useSearchParams`, `Link` (react-router-dom).
- Produces:
  - `<TargetMeter value target flag label />` (inline SVG, `role="img"`)
  - `<TendenciesPanel view onPosition />`
  - `<SpotHands spot />` (fetches `GET stats?spot=`)
  - `PokerStats` now renders Tendencies, and the spot hand list when `?spot=` is present.

This task has no unit test: the geometry and rows are tested in Task 6. The checks are the bundle check, the full suite and the build.

- [ ] **Step 1: Write the meter, tendencies panel and spot list**

```jsx
// src/private/trainers/poker/ui/stats/TargetMeter.jsx
import { meterGeometry } from './statsView';

const W = 120;
const H = 14;
const MARK = 4;

/** Value marker on a 0–100% track with the target band. The status text beside it carries the flag. */
export default function TargetMeter({ value, target, flag, label }) {
  const { band, marker } = meterGeometry(value, target, W, MARK);
  const markClass = `pk-meter__mark pk-meter__mark--${flag ?? 'low'}`;
  return (
    <svg className="pk-meter" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <rect className="pk-meter__track" x={0} y={5} width={W} height={4} />
      {band && <rect className="pk-meter__band" x={band.x} y={3} width={band.width} height={8} />}
      {marker && <rect className={markClass} x={marker.x} y={0} width={MARK} height={H} />}
    </svg>
  );
}
```

```jsx
// src/private/trainers/poker/ui/stats/TendenciesPanel.jsx
import TargetMeter from './TargetMeter';
import { OVERALL } from './statsView';

/** Profile stats against winning 6-max ranges, overall or for one position. */
export default function TendenciesPanel({ view, onPosition }) {
  return (
    <div className="pk-tendencies">
      <div className="pk-seg" role="group" aria-label="Position">
        {view.positions.map((p) => (
          <button
            key={p}
            type="button"
            className="pk-tab"
            aria-pressed={view.position === p}
            data-hot
            onClick={() => onPosition(p)}
          >
            {p === OVERALL ? 'All' : p}
          </button>
        ))}
      </div>
      <p className="pk-muted">
        {view.hands} hands · flags need {view.minSample} spots · ranges are approximate
      </p>
      <div className="pk-table-wrap">
        <table className="pk-table">
          <caption className="pk-sr-only">Your tendencies against target ranges for winning 6-max play</caption>
          <thead>
            <tr>
              <th scope="col">Stat</th>
              <th scope="col">You</th>
              <th scope="col">Target</th>
              <th scope="col"><span className="pk-sr-only">Range chart</span></th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {view.rows.map((r) => (
              <tr key={r.key} className={r.lowSample ? 'pk-row--low' : undefined}>
                <th scope="row">{r.label}</th>
                <td>{r.valueText} <span className="pk-muted">({r.n})</span></td>
                <td>{r.rangeText}</td>
                <td>
                  <TargetMeter value={r.value} target={r.target} flag={r.flag} label={`${r.label}: ${r.valueText}, target ${r.rangeText}`} />
                </td>
                <td className={r.flag ? `pk-flag pk-flag--${r.flag}` : 'pk-flag'}>{r.statusText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/stats/SpotHands.jsx
import { Link } from 'react-router-dom';
import { getPokerSpotHands } from '../../lib/persistence/api.js';
import { usePokerResource } from './usePokerResource';
import { spotHandsView } from './statsView';
import StatsPanel from './StatsPanel';

const loadSpotHands = (spot) => getPokerSpotHands(spot);

/** The hand list filtered to one spot (the focus card's link), newest first. */
export default function SpotHands({ spot }) {
  const { status, data, error, reload } = usePokerResource(loadSpotHands, spot);
  const view = data ? spotHandsView(data) : null;
  const title = view ? `Hands · ${view.label}` : 'Hands in this spot';

  return (
    <StatsPanel id="pk-spot" title={title} wide status={status} error={error} onRetry={reload} view={view}>
      {(v) => (
        <div className="pk-table-wrap">
          <table className="pk-table">
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Hand</th>
                <th scope="col">Decisions</th>
                <th scope="col">EV lost</th>
                <th scope="col">Worst grade</th>
                <th scope="col">Net</th>
                <th scope="col"><span className="pk-sr-only">Replay</span></th>
              </tr>
            </thead>
            <tbody>
              {v.rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.day}</td>
                  <th scope="row">#{r.handNo}</th>
                  <td>{r.decisions}</td>
                  <td>{r.evLossText}</td>
                  <td>{r.gradeText}</td>
                  <td>{r.netText}</td>
                  <td><Link to={r.href} data-hot>Replay</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StatsPanel>
  );
}
```

- [ ] **Step 2: Replace `PokerStats.jsx`**

```jsx
// src/private/trainers/poker/ui/stats/PokerStats.jsx
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getPokerStats } from '../../lib/persistence/api.js';
import { usePokerResource } from './usePokerResource';
import { OVERALL, focusView, leaksView, tendenciesView, trendView } from './statsView';
import StatsPanel from './StatsPanel';
import FocusCard from './FocusCard';
import TendenciesPanel from './TendenciesPanel';
import LeaksPanel from './LeaksPanel';
import TrendPanel from './TrendPanel';
import SpotHands from './SpotHands';
import '../../../trainers.css';
import './stats.css';

const loadStats = () => getPokerStats();

/** The Stats tab: long-term leak tracker (spec §7.4). `?spot=` adds that spot's hand list on top. */
export default function PokerStats() {
  const [params] = useSearchParams();
  const spot = params.get('spot');
  const [position, setPosition] = useState(OVERALL);
  const { status, data, error, reload } = usePokerResource(loadStats, 'stats');
  const views = useMemo(
    () => (data
      ? { focus: focusView(data), tendencies: tendenciesView(data, position), leaks: leaksView(data), trend: trendView(data) }
      : null),
    [data, position],
  );
  const panel = { status, error, onRetry: reload };

  return (
    <div className="pk-stats">
      {status === 'error' && data && (
        <div className="pk-panel-msg pk-stats__wide">
          <p className="pk-error" role="alert">Couldn&apos;t refresh stats: {error}</p>
          <button type="button" className="pk-btn" data-hot onClick={reload}>Retry</button>
        </div>
      )}
      {spot && (
        <>
          <p className="pk-stats__wide">
            <Link to="/me/poker?tab=stats" className="pk-btn" data-hot>All stats</Link>
          </p>
          <SpotHands spot={spot} />
        </>
      )}
      <StatsPanel id="pk-focus" title="Focus" wide {...panel} view={views?.focus}>
        {(view) => <FocusCard view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-tendencies" title="Tendencies" {...panel} view={views?.tendencies}>
        {(view) => <TendenciesPanel view={view} onPosition={setPosition} />}
      </StatsPanel>
      <StatsPanel id="pk-leaks" title="Leaks" {...panel} view={views?.leaks}>
        {(view) => <LeaksPanel view={view} />}
      </StatsPanel>
      <StatsPanel id="pk-trend" title="Trend" wide {...panel} view={views?.trend}>
        {(view) => <TrendPanel view={view} />}
      </StatsPanel>
    </div>
  );
}
```

- [ ] **Step 3: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/lobby/StatsTab.jsx --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: all tests pass.

Run: `npm run build`
Expected: `✓ built`; the only warning is the existing 500 kB chunk-size warning.

- [ ] **Step 4: Commit**

```bash
git add src/private/trainers/poker/ui/stats/TargetMeter.jsx src/private/trainers/poker/ui/stats/TendenciesPanel.jsx src/private/trainers/poker/ui/stats/SpotHands.jsx src/private/trainers/poker/ui/stats/PokerStats.jsx
git commit -m "Add poker tendencies table with target meters and the per-spot hand list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9 (controller): Final verification in the browser

No code changes, no commit. It needs a disposable Neon branch database (never production) in `.env.local` as `DATABASE_URL`, plus a login. If either is unavailable, run only Step 1 and say so.

- [ ] **Step 1: Suite, build and function count**

Run: `npm test` then `npm run build`
Expected: all tests pass (including `api/_lib/functionCount.test.js` and the `stats.js` bundle case), and the build succeeds with only the existing chunk-size warning.

- [ ] **Step 2: Migrate and check the empty states**

Run: `npm run db:migrate`
Expected: `Applied 003_poker_stats.sql` (plus earlier migrations if the branch is new).

Run `npm run dev`, sign in and open `/me/poker?tab=stats` with no saved hands:
1. Each panel shows "Loading…" briefly, then Tendencies shows "No saved hands yet. Play a session to see your tendencies.", Leaks and Focus show "Play and review sessions to unlock leaks." and Trend shows "Play and review sessions to unlock your trend."
2. DevTools → Network: one `GET /api/trainers/poker/stats` returns 200.

- [ ] **Step 3: Tendencies from hand events (the pre-Phase 5 state)**

Sit down, play at least 10 hands, get up and reopen `/me/poker?tab=stats`. Tendencies lists 14 rows with values and "Need 30 spots" or "No spots yet"; the position buttons show only positions you played; switching to one changes the hand count and targets (for example VPIP on BTN shows 38–50%). Leaks, Focus and Trend stay locked.

- [ ] **Step 4: Ready states with synthetic decisions (disposable branch only)**

In the Neon SQL editor for the **disposable branch**, copy the stored hands 20 times so there are at least 200, fix session totals, and add fake decisions:

```sql
INSERT INTO poker_hands (id, session_id, hand_no, played_at, button_seat, hero_seat, hero_start_stack, hero_actions,
                         lineup, hole_cards, board, events, pot, hero_net, hero_allin_ev, showdown)
SELECT gen_random_uuid(), session_id, hand_no + k * 1000, played_at + k * interval '1 minute', button_seat, hero_seat,
       hero_start_stack, hero_actions, lineup, hole_cards, board, events, pot, hero_net, hero_allin_ev, showdown
FROM poker_hands CROSS JOIN generate_series(1, 20) k;

UPDATE poker_sessions s SET hands = x.n, net = x.net, allin_adj_net = x.net
FROM (SELECT session_id, count(*)::int AS n, sum(hero_net)::int AS net FROM poker_hands GROUP BY session_id) x
WHERE s.id = x.session_id;

INSERT INTO poker_decisions (hand_id, idx, street, position, spot, action, size, pot, to_call, equity, needed_equity,
                             recommended, ev_loss, grade, confident, analysis_version)
SELECT h.id, 1000 + g, 'river', 'BB',
       (ARRAY['river.facing_bet.oop', 'pf.open', 'flop.cbet.ip', 'turn.no_bet'])[1 + ((abs(hashtext(h.id::text)) + g) % 4)],
       (ARRAY['call', 'fold', 'bet', 'check'])[1 + (g % 4)], NULL, 20, 10, 0.2, 0.33,
       '{"action":"fold","size":null,"evByOption":{}}'::jsonb,
       (random() * 6)::real, (ARRAY['good', 'inaccuracy', 'mistake', 'blunder'])[1 + (g % 4)], random() > 0.15, 1
FROM poker_hands h CROSS JOIN generate_series(0, 2) g;
```

Reload `/me/poker?tab=stats` and check:
1. **Focus** names the top spot with a title, a plain-language body ending in "Most of the EV lost came from …", two KPI tiles in the poker font and up to 5 "Hand N" links.
2. **Leaks** shows up to 4 bars in accent yellow, labels such as "River · facing a bet · out of position", and the table view lists the same spots with links.
3. **Trend** shows the results chart (dashed accent-2 net line with dots, solid accent all-in adjusted line, dashed break-even line, a legend naming both) and the EV lost chart. Hovering a dot shows a "Session N · day: …" tooltip. The table view matches.
4. "See hands in this spot" goes to `/me/poker?tab=stats&spot=…`, which adds "Hands · <label>" at the top with up to 50 rows and an "All stats" link back. Replay links point at `/me/poker/hand/<id>` (the Phase 5 route).
5. Keyboard: Tab reaches the position buttons, the details summaries, every link and Retry; focus rings are visible.
6. Error state: in DevTools → Network, block `/api/trainers/poker/stats` and reload. Every panel shows "Couldn't load this panel: …" with Retry; unblock and press Retry, and the panels fill.
7. Looks: no label collisions in the charts or meters at 1024 px and 1440 px widths; tables scroll horizontally instead of overflowing.

Report what you observed for each item, then delete the branch or its rows.

---

## Execution order

Tasks 1 → 8 run in order, one fresh implementer per task, each followed by a review. Tasks 1–3 are pure `src/` modules, Tasks 4–5 the API, Tasks 6–8 the client. Task 9 is the controller's check before merging `feat/poker-stats` into `feat/poker`. Deploying needs `npm run db:migrate` against production first (a controller or user step, not a task).

## Spec coverage

| Requirement | Task |
|---|---|
| §7.4 tendencies: each profile stat overall and by position | 3 (fold), 5 (endpoint), 6, 8 (UI) |
| §7.4 target range per stat in `data/targets.js`, below/in/above flag | 1, 3 |
| §7.4 leaks: confident only, grouped by spot, ranked by BB lost per 100 hands | 4, 5 |
| §7.4 leaks: at least 15 decisions, up to 5 example hand ids | 4, 5 |
| §7.4 trend: per session net BB/100, all-in adjusted BB/100, EV lost per 100 decisions | 4, 5, 6, 7 |
| §7.4 focus: top leak, plain-language description, link to the hand list for that spot | 2, 4, 5 (`?spot=`), 6, 7, 8 |
| §7.4 loading, empty ("play about 200 hands to unlock leaks") and error states per panel | 6, 7 |
| §7.4 reuse the existing SVG charts and `Kpi` tiles | 7 |
| §6.3 `GET stats`: `verifySession`, Zod, `no-store`, `{ error, code, details? }` | 5 |
| §8.1 Stats tab at `/me/poker?tab=stats` | 7 |
| §8.3 Midnight Indigo tokens, Silkscreen | 7 |
| Hobby limit of 12 functions | 5 |
| Works before Phase 5 (tendencies from hand events, locked leaks and trend) | 3, 5, 6, 9 |

## Contract changes

These need the controller's sign-off and an update to `docs/superpowers/specs/2026-09-16-poker-contracts.md` before Phase 5 relies on them.

1. **Spot grammar (new §4.1 item, binding on Phase 5).** `DecisionRecord.spot` is `pf.<situation>` or `<flop|turn|river>.<situation>[.<modifier>…]`, still matching `/^[a-z0-9_.]{1,64}$/`. Preflop situations: `open`, `vs_limp`, `vs_open`, `squeeze`, `vs_3bet`, `vs_4bet`. Postflop situations: `cbet` (hero made the last aggressive action on the previous street and no bet yet), `no_bet`, `facing_bet`, `facing_raise`. A modifier `ip` or `oop` gives the hero's position relative to the remaining opponents. Other situations and modifiers are allowed and render with generic street copy.
2. **EV lost per 100 decisions** counts all graded decisions (confident or not), in BB. The Phase 5 session review summary should compute it the same way so the review and the trend agree. Leak aggregation alone excludes non-confident grades.
3. **`GET /api/trainers/poker/stats`** (additive) returns `{ summary, tendencies, leaks, trend, focus }` as defined in Task 5, and `GET …/stats?spot=` returns `{ spot, label, hands }`. Rates are BB; `evLoss` and `heroNet` stay in units.
4. **Schema (Phase 4 area):** migration `003_poker_stats.sql` adds `poker_decisions_hand_cover` and `poker_decisions_spot_hand`, and drops `poker_decisions_spot`. `api/_lib/pokerSchemas.js` gains `SPOT_PATTERN` and `pokerStatsQuery`.
5. **Ownership:** this phase adds `data/targets.js` (a Phase 3 path, per spec §9), the new `src/private/trainers/poker/leaks/**` and `ui/stats/**`, and replaces Phase 2's `ui/lobby/StatsTab.jsx`.
6. **Hand links** assume the spec §8.1 replayer route `/me/poker/hand/:id` (Phase 5).
