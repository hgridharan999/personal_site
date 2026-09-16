# Poker Trainer Phase 5: Analysis, Session Review and Hand Replayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grade every hero decision after each hand (preflop chart check, postflop and off-chart preflop EV by seeded Monte Carlo rollouts against weighted ranges with persona responses, grade bands, confidence, template explanations, all-in EV), save the grades with the hand or re-grade stored hands later, and add the session review (`/me/poker/session/:id`) and the hand replayer (`/me/poker/hand/:id`).

**Architecture:** A pure, Node-tested core under `analysis/` turns a stored hand (`{ id, heroSeat, lineup, events }`) into `{ decisions: DecisionRecord[], heroAllinEv }`. It reuses Phase 3's situation helpers, charts, range tracker, equity and brains: opponents' hole cards are sampled from the hero-view weighted ranges, and every later action in a rollout comes from that seat's persona brain (the hero's later actions come from a default-dial heuristic brain). The core runs in a **new dedicated analysis Web Worker** (not Phase 3's bot worker), driven by a hand queue inside the table driver that delivers `onHandComplete(record, analysis)` in order, with a timeout that falls back to `{ decisions: [], heroAllinEv: null }` so saving never waits on grading. Hands saved without grades are found by `GET hands?ungraded=1` and re-graded from the review pages through `PATCH hands`, an idempotent, `analysis_version`-guarded upsert that also moves `poker_sessions.allin_adj_net` by the all-in EV delta. `GET sessions?id=` becomes a paginated review payload without event logs, and the replayer fetches one hand's events with `GET hands?id=`. No new Vercel function and no migration.

**Tech Stack:** JavaScript ES modules and JSX with JSDoc, React 18, react-router-dom 7, Vite 6 module workers, Vercel Node functions (ESM), `@neondatabase/serverless` 1.x (`sql.transaction`), Zod 4, Vitest 5 (node environment), Node 22. No new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-trainer-design.md` §6.1 (grading before the outbox), §6.2 (`analysis_version`), §7.1–7.3, §8.1 (routes), §8.2 (lobby recent sessions), §8.3 (tokens), §10 (analysis tests).
**Contracts:** `docs/superpowers/specs/2026-09-16-poker-contracts.md` §1 (units), §3.2, §4, §4.1 (DecisionRecord, `onHandComplete(record, analysis?)`, Phase 6 spot strings and EV lost per 100 decisions). See "Contract changes" at the end.

## Global Constraints

- **Worktree:** after Phases 2, 3 and 4 (including Phase 4 Tasks 10 and 11) are merged into `feat/poker`, the controller runs `git worktree add ../jp-poker-analysis -b feat/poker-analysis feat/poker` from `C:\Users\hgrid\journal_portfolio`, then `npm ci` once in `C:\Users\hgrid\jp-poker-analysis` (Git Bash: `/c/Users/hgrid/jp-poker-analysis`). Every command runs from that root.
- **Execution:** one fresh implementer subagent per task, in order, each followed by a review. Every task ends with `npm test` green.
- Plain JavaScript ES modules and JSX with JSDoc. No TypeScript, no new npm dependencies. Analysis code never calls `Math.random`; randomness comes from `mulberry32` seeds.
- **Money is integer units, 1 unit = 0.5 BB.** Decision fields `size`, `pot`, `toCall` are integer units; `evLoss`, `evByOption` values and `heroAllinEv` are fractional units rounded to 2 decimals; `equity` and `neededEquity` are fractions rounded to 4 decimals. BB appears only in UI text and in `evLostPer100Decisions` (BB).
- **Analysis version:** `ANALYSIS_VERSION = 1` in `src/private/trainers/poker/analysis/version.js`, imported by the API.
- **Grade bands (spec §7.1):** share = `evLoss / pot` (pot before the decision). `good` share < 0.03, `inaccuracy` 0.03 ≤ share < 0.10, `mistake` 0.10 ≤ share ≤ 0.25, `blunder` share > 0.25.
- **Preflop chart check:** unscaled chart frequency of the chosen action ≥ **0.20** → `good`, `evLoss 0`, `confident true`, `evByOption {}`. Otherwise rollouts.
- **Option menu (spec §7.1):** fold (only when checking is not free), check or call, and when raising is legal: postflop bet/raise at **⅓, ½, ¾, pot** of the pot after calling (`currentBet + round(f × (pot + toCall))`, clamped), preflop the Phase 3 standard raise size, always all-in, plus the hero's own size. Option keys: `fold`, `check`, `call`, `bet:<units>`, `raise:<units>`.
- **Budget and determinism:** `HAND_BUDGET_MS = 2000` per hand, split evenly across the hand's remaining decisions. Per decision, options are rolled out round-robin with common random numbers (`mixSeed(seedFor(hand.id, idx), n)`), at least `MIN_ROLLOUTS = 12` and at most `MAX_ROLLOUTS = 400` rounds, stopping at the decision's deadline. Rollout brains use `{ iterations: 24, budgetMs: Infinity }`. Hero equity uses 2,000 seeded iterations. All-in EV enumerates exactly when at most 2 board cards are missing, else 20,000 seeded samples. With `budgetMs: Infinity` every result is a pure function of the hand.
- **Confidence:** `confident = false` when the top two options differ by less than the paired Monte Carlo standard error, or (postflop only) when the dominant opponent's range has more than **60%** of its non-dead combos live (weight ≥ 5% of the max) and evenness `exp(entropy)/combos ≥ 0.85`.
- **Spot strings (Phase 6 grammar, exact):** preflop `pf.open | pf.vs_limp | pf.vs_open | pf.squeeze | pf.vs_3bet | pf.vs_4bet` (no suffix); postflop `<flop|turn|river>.<cbet|no_bet|facing_bet|facing_raise>.<ip|oop>`.
- **EV lost per 100 decisions** (review summary) = `sum(evLoss over all graded decisions, confident or not) / 2 / decisions × 100` BB, `null` with no decisions.
- **Timeouts:** analysis worker request `ANALYSIS_TIMEOUT_MS = 6000` (re-grade calls pass `REGRADE_TIMEOUT_MS = 30000`); table hand queue `QUEUE_TIMEOUT_MS = 8000`. A timeout, worker error or invalid result delivers `{ decisions: [], heroAllinEv: null }`.
- **API limits:** `MAX_GRADES_PER_BATCH = 20`, `MAX_UNGRADED_PAGE = 20`, `REVIEW_PAGE_HANDS = 300`, `RECENT_SESSIONS_LIMIT = 20`, `COSTLIEST_LIMIT = 5`. Big pot filter: pot > 30 BB (`BIG_POT_UNITS = 60`).
- **Function count:** Vercel Hobby allows **12**. This phase adds **no** function: new reads and the re-grade live in `api/trainers/poker/hands.js` and `sessions.js`. With Phase 6 the total is 10.
- **Handlers** keep the Phase 4 pattern: `guard(req, res, { methods, auth, getSql })`, Zod `safeParse` → 400 `VALIDATION_ERROR` with `z.flattenError(...)` (or `{ problems }`), `try/catch` logging `console.error('trainers/poker/<name> failed:', err)` → 500 `INTERNAL`, SQL only through `sql` tagged templates.
- **CSS:** every new selector is scoped under `.pk`. Tokens only (`--pk-*`). Grades are never color alone: each carries its text label.
- **Accessibility:** replayer keys `←`/`→` step, `Space` play/pause, `Home`/`End`; every control is a button reachable by keyboard; the step description is in an `aria-live="polite"` region; cards keep Phase 2 `aria-label`s.
- **Tests:** Vitest runs `src/**/*.test.js`, `api/**/*.test.js`, `scripts/**/*.test.js` in the node environment. There is no jsdom. `.jsx` files are checked with the bundle check below plus `npm run build`, and in the browser in Task 17. Slow checks sit behind `POKER_SLOW=1`.
- **Bundle check for `.jsx` tasks:** `npx esbuild <entry> --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning` must exit 0 with no output.
- **Build:** `npm run build` must succeed. Its existing "Some chunks are larger than 500 kB" warning for the main `index` chunk is not a failure.
- **Commits:** stage explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. Never stage `wa.geo.json`. Every commit message ends with exactly this trailer line:
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Single test file: `npx vitest run <path>`. Full suite: `npm test`.

## Cross-phase dependencies (what this plan assumes exists on `feat/poker`)

Phase 3 Tasks 1–7 and Phase 2 Tasks 1–13 were built when this plan was written; for later tasks this plan relies only on those plans' Interfaces blocks. Task 1 Step 1 greps every one of them.

| Phase | File (under `src/private/trainers/poker/` unless it starts with `api/` or `src/`) | Exports / facts used | Tasks |
|---|---|---|---|
| 1 | `engine/handState.js` | `applyEvent`, `reduceHand`, `legalActions` (`{ seat, canCheck, toCall, canRaise, raiseKind, minRaiseTo, maxRaiseTo }`), state fields `street, board, players[{seat, stack, committed, total, folded, allIn, hole}], currentBet, toAct, needsBoard, bb, result` | 2–7, 15 |
| 1 | `engine/view.js`, `engine/evaluator.js`, `engine/pots.js`, `engine/cards.js`, `core/rng.js` | `viewFor`, `eventsFor`; `evaluate(cards)`; `buildPots(contributions) → {amount, eligible}[]`; `shuffle`, `parseCards`, `cardsToString`; `mulberry32` | 4, 5, 7, 13, 15 |
| 3 (built) | `bots/handClass.js` | `COMBO_COUNT`, `COMBO_CARDS`, `classOf`, `comboOf`, `classWeightsToCombos` | 3, 5, 6 |
| 3 (built) | `bots/charts.js` | `hasChart(key)`, `chartFreqs(key, cls) → { raise, call }` | 3 |
| 3 (built) | `bots/situation.js` | `positionsOf(view)`, `actsByStreet(events)`, `preflopSpot(view, preflopActs, seat) → { kind, position, raiser, raiserPosition, raises, limpers, callers, ip }`, `chartKeyFor(spot, hasChart)` (throws when no chart), `postflopContext(view, events, seat, legal) → { toCall, ip, aggressor, betsThisStreet, … }` | 2, 3, 12 |
| 3 (built) | `bots/dials.js`, `bots/equity.js`, `bots/baselines.js`, `bots/personas.js`, `bots/testHands.js` | `resolveDials(partial)`; `equityVsRanges({ hole, board, ranges, rng, iterations }) → { equity, iterations, stderr }`; `callingStation`; `getPersona(id)` (throws on unknown), `listPersonas()`; `buildLog(steps, { holes, stack, button })`, `contextAfter(steps, options) → { state, events, legal, seat, view, seatEvents }`, `HOLES6` | 2–7, 13, 15 |
| 3 (Task 8) | `bots/ranges.js` | `DEFAULT_TYPE`, `createRangeTracker() → { track(view, events, seat, typeOf) → { classWeights: Map<seat, Float32Array(169)>, comboRanges: Map<seat, Float32Array(1326)> } }` (live opponents only; `comboRanges` empty preflop; returned arrays are the tracker's own and must be copied before mutation) | 5 |
| 3 (Task 9) | `bots/legalize.js`, `bots/preflop.js` | `legalize(choice, legal) → BotChoice`; `raiseSize(spot, view, dials, bb) → units` (`Infinity` for a 5-bet) | 3 |
| 3 (Task 11) | `bots/index.js` | `createBrain(persona, options?)` with `options = { iterations, budgetMs, now }` returning a new heuristic brain per call; fixed brains ignore options; brains read dials from `ctx.persona.dials` | 5 |
| 2 (built) | `lib/sizing.js`, `lib/format.js`, `lib/tableView.js`, `lib/actionLog.js`, `lib/tableDriver.js`, `lib/constants.js` | `potTotal(view)`, `clampRaise(legal, amount)`; `formatBb`, `formatBbLabel`, `formatNetBb`, `cardText`; `seatViews(session)`, `tableCenter(session)`; `logLines(events, { nameOf, heroSeat })`; `createTableDriver({ …, onHandComplete })` whose `settleHand` calls `safeCall('onHandComplete', onHandComplete, record)`; `HERO_SEAT` | 1, 8, 10, 13, 15, 16 |
| 2 (built) | `ui/PokerShell.jsx`, `ui/poker.css`, `ui/sprites/TableArt.jsx`, `ui/lobby/PlayTab.jsx` | `<PokerShell back onBack>`; `.pk` tokens and classes `pk-box`, `pk-h2`, `pk-h3`, `pk-muted`, `pk-error`, `pk-btn`, `pk-btn--fold|call|raise`, `pk-title`, `pk-sr-only`, `pk-select`, `pk-radio`; `<TableArt />`; PlayTab's "Recent sessions" placeholder section | 14, 16 |
| 2 (Tasks 14, 16, 17) | `ui/table/Seat.jsx`, `ui/table/Board.jsx`, `ui/table/table.css`, `ui/table/SessionEnd.jsx`, `lib/useTableSession.js`, `src/App.jsx` | `<Seat seat={SeatView} handNo />`, `<Board board pot handNo />`, `.pk-table` layout; SessionEnd's "Sessions are not saved yet" paragraph; `useTableSession` building the driver with `onHandComplete: (record) => callbacks.current.onHandComplete(record)`; poker routes before `/me/:trainer` using `<RequireAuth>{() => <Suspense fallback={privateFallback}>…</Suspense>}</RequireAuth>` | 10, 14, 16 |
| 4 | `api/_lib/pokerSchemas.js` | `handItem`, internal `decision` schema, `MAX_DECISIONS_PER_HAND = 40`, `MAX_HAND_NO`, `MAX_POT`, `GRADES`, `openSessionsQuery` | 7, 11, 12 |
| 4 | `api/trainers/poker/hands.js`, `sessions.js` and tests; `api/_lib/pokerHttp.js`, `http.js`, `db.js`, `session.js`, `testing.js`, `trainerSchemas.js`, `pokerTesting.js`, `pokerBundle.test.js` | `createPokerHandsHandler`, `createPokerSessionsHandler`, `decisionRows` shape; `guard`, `sendError`, `getSql`, `authConfig`; `mockRes`, `authedReq`, `mockSql` (with `sql.transaction`, `sql.transactions`, `sql.transactionResult`), `TEST_AUTH`; `idQuery`; `pokerHandRecord({ seed, handNo, heroSeat })`, `POKER_SESSION_ID`, `pokerHandId` | 7, 11, 12 |
| 4 | `lib/persistence/api.js`, `api.test.js`, `withPokerPersistence.jsx` | `request`-based wrappers with base `/api/trainers/poker`; the table's `onHandComplete` is `pokerPersistence.onHandComplete(record, analysis = {})` | 10, 13 |
| — | `src/private/trainers/lib/api.js` | `request`, `ApiError` (`status`, `code`) | 13, 14 |

## Decisions (already made)

1. **A separate analysis worker.** Phase 3's worker answers bot decisions with a 3 s timeout after which the bot folds. A 2 s grading job in the same single-threaded worker would delay the next hand's bot decisions into timeouts. A dedicated `analysis/worker/analysisWorker.js` isolates latency and failures (a stuck or crashed grading job is terminated and recreated without touching the table's bots), and the review pages can use it with no table running. Its cost is a second copy of the evaluator and charts in memory (well under 1 MB).
2. **Grade first, then save, never block.** Spec §6.1 grades before the hand enters the outbox. `createHandAnalysisQueue` grades hands one at a time and delivers `onHandComplete(record, analysis)` in hand order. A timeout, error or invalid result delivers the empty analysis. `abandon()` and `pagehide` deliver every pending hand at once with the empty analysis, and the session end is delivered only after every pending hand, so the outbox still receives open → hands → close in order.
3. **Rollout model.** For each option: sample opponents' hole cards from the hero-view Phase 3 ranges (`DEFAULT_TYPE`, because the hero cannot see bot dials) with card removal, give folded seats random live cards, shuffle the runout, apply the option, then play the hand out through the engine. Bot seats act with their persona's heuristic brain (`createBrain(persona, { iterations: 24, budgetMs: Infinity })`, spec: "responses drawn from their persona model"); the hero's later actions use a default-dial heuristic brain (`HERO_MODEL`). No profile is passed (bots do not adapt inside a rollout). EV = hero's final stack − stack before the decision; fold is exactly 0. Common random numbers across options make EV differences far less noisy than the EVs themselves.
4. **Preflop.** The chart check uses the unscaled chart for the hero's spot and hand class. Charts carry no EV table (Phase 3 refinement), so off-chart preflop decisions use the same rollouts with the options fold/check/call, Phase 3's standard raise size (`raiseSize` with default dials) and all-in. The range-vagueness confidence rule is postflop only: preflop, every opponent who has not acted holds any hand, which is correct information, not range uncertainty.
5. **Dominant opponent:** the live opponent who made the latest bet or raise in the hand so far; with none, the live opponent with the largest contribution (lowest seat on ties).
6. **Explanations are rendered, not stored.** `explainDecision(decision, { chart })` renders templates from the stored DecisionRecord (plus chart frequencies recomputed from the event log for chart-graded preflop decisions), so template wording can improve without re-grading.
7. **Re-grade flow.** Opening a session review lists that session's hands with `hero_actions > 0` and no decision at the current version (`GET hands?ungraded=1`), grades them one by one in the analysis worker (30 s timeout each) and saves them in batches of 5 (`PATCH hands`), refreshing the review after each batch. The replayer does the same for one hand. A hand that fails is skipped for this page view (the cursor moves past it).
8. **Re-grade SQL.** `PATCH hands` validates each grade against the stored events, then runs one Neon transaction: (1) lock the hand rows `FOR UPDATE` in id order; (2) one statement that keeps only hands whose stored max `analysis_version` is below the incoming version, deletes their decisions whose `idx` is not in the new set, upserts the new decisions on `(hand_id, idx)`, sets `hero_allin_ev`, and adds `COALESCE(new, hero_net) − COALESCE(old, hero_net)` per session to `allin_adj_net`. Statement 2 runs after the locks, so its snapshot sees any concurrent re-grade, which makes the version guard and the delta race-free. Replaying a request is a no-op. No migration: the guard reads `poker_decisions.analysis_version`.
9. **Review payload size.** `GET sessions?id=` returns the session, a SQL summary, the costliest 5 decisions, opponents, and one page of up to 300 hand summaries (no event logs, no bot hole cards, hero position computed from the start event) with a `nextAfterHandNo` cursor, about 300 bytes per hand. The replayer loads a single hand with events and decisions through `GET hands?id=`.
10. **Lobby recent sessions (spec §8.2)** use `GET sessions?status=recent` and link to the review; the table's end-of-session panel links to the review too.
11. **Shared UI helpers.** `ui/shared/usePokerResource.js` generalizes Phase 6's planned hook with a `loginFrom` argument, and `analysis/spots.js` exports `parseSpot` and `spotLabel` with exactly Phase 6's planned outputs, so whichever of Phases 5 and 6 merges second imports these instead of adding copies (see "Contract changes").

---

## File Structure

All paths are under `src/private/trainers/poker/` unless they start with `api/`, `src/` or `db/`.

| File | Responsibility | Task |
|---|---|---|
| `analysis/version.js` | `ANALYSIS_VERSION` (dependency-free, imported by the API) | 1 |
| `analysis/grade.js` | Grade bands, `gradeFor`, EV/probability rounding, seeds | 1 |
| `analysis/options.js` | Option menu per decision, option keys | 1 |
| `analysis/spots.js` | `decisionPoints` (every hero decision with its state, spot, pot, price), `parseSpot`, `spotLabel` | 2 |
| `analysis/preflopCheck.js` | Chart frequencies for a preflop decision, `standardRaiseTo` | 3 |
| `analysis/allinEv.js` | `allInPoint`, `heroAllinEv` | 4 |
| `analysis/rollout.js` | Hero-view ranges, hole sampling, rollout world, `rolloutOnce` | 5 |
| `analysis/evOptions.js` | Round-robin EV estimation, `pairedStderr`, `rankOptions` | 6 |
| `analysis/confidence.js` | Range spread, dominant opponent, `isConfident` | 6 |
| `analysis/gradeHand.js` | `gradeDecision`, `gradeHand` | 7 |
| `api/_lib/pokerAnalysisSchema.test.js` | Graded random hands always pass the server schema | 7 |
| `analysis/gradeHand.slow.test.js` | Opt-in timing check of the 2 s budget | 7 |
| `analysis/explain.js` | `explainDecision`, `errorType`, `optionLabel`, `spotFamily` | 8 |
| `analysis/worker/protocol.js`, `analysis/worker/analysisClient.js`, `analysis/worker/analysisWorker.js` | Worker message handler, client with timeouts and restart, entry | 9 |
| `analysis/handQueue.js` | Ordered grading queue with timeout, flush and drain | 9 |
| `lib/tableDriver.js`, `lib/tableDriver.test.js` | Modified: `analyzeHand`, `analysisTimeoutMs`, `flushAnalyses()` | 10 |
| `lib/useTableSession.js`, `ui/table/SessionEnd.jsx` | Modified: worker analysis, `pagehide` flush, review link | 10 |
| `api/_lib/pokerSchemas.js` | Modified: `decisionProblems`, query and re-grade schemas | 11, 12 |
| `api/trainers/poker/hands.js` | Modified: `GET ?id=`, `GET ?ungraded=1`, `PATCH` re-grade | 11 |
| `api/_lib/pokerReview.js` | Review shaping: hero position and cards, worst grade, summary, opponents | 12 |
| `api/trainers/poker/sessions.js` | Modified: paginated review `GET ?id=`, `GET ?status=recent` | 12 |
| `lib/persistence/api.js` | Modified: review, recent, hand, ungraded and re-grade calls | 13 |
| `analysis/regrade.js` | `regradeSession`, `regradeHand` | 13 |
| `ui/review/reviewView.js` | Pure review view models and filters | 13 |
| `ui/shared/usePokerResource.js` | Fetch hook with reload, 401 redirect and status | 14 |
| `ui/review/useSessionRegrade.js`, `ui/review/SessionReviewPage.jsx`, `ReviewSummary.jsx`, `CostliestDecisions.jsx`, `HandList.jsx`, `OpponentsPanel.jsx`, `review.css` | Session review page | 14 |
| `ui/lobby/RecentSessions.jsx`, `ui/lobby/PlayTab.jsx` | Recent sessions with review links | 14 |
| `ui/replayer/replayModel.js` | Replay steps, seat views, reveal-all, decision lookup, step reducer | 15 |
| `ui/replayer/HandReplayerPage.jsx`, `ReplayTable.jsx`, `DecisionPanel.jsx`, `replayer.css` | Hand replayer page | 16 |
| `src/App.jsx` | Modified: review and replayer routes | 14, 16 |

---
### Task 1: Analysis version, grade bands, seeds and the option menu

**Files:**
- Create: `src/private/trainers/poker/analysis/version.js`
- Create: `src/private/trainers/poker/analysis/grade.js`
- Create: `src/private/trainers/poker/analysis/options.js`
- Test: `src/private/trainers/poker/analysis/grade.test.js`
- Test: `src/private/trainers/poker/analysis/options.test.js`

**Interfaces:**
- Consumes: `legalActions` (`engine/handState.js`); `potTotal`, `clampRaise` (Phase 2 `lib/sizing.js`); tests use `contextAfter` (Phase 3 `bots/testHands.js`).
- Produces:
  - `version.js`: `ANALYSIS_VERSION = 1`
  - `grade.js`: `GRADES = ['good','inaccuracy','mistake','blunder']`, `GOOD_BELOW = 0.03`, `INACCURACY_BELOW = 0.1`, `MISTAKE_UP_TO = 0.25`, `gradeFor(evLoss, pot) → grade`, `roundEv(x) → number` (2 decimals, never `-0`), `roundProb(x) → number` (4 decimals), `hashString(text) → uint32` (FNV-1a), `seedFor(handId, idx) → uint32`, `mixSeed(seed, n) → uint32`
  - `options.js`: `SIZE_FRACTIONS = [1/3, 1/2, 3/4, 1]`, `optionKey(action, size?) → 'fold'|'check'|'call'|'bet:<u>'|'raise:<u>'`, `parseOptionKey(key) → { action, size:number|null }`, `optionsFor(state, { preflopRaiseTo?, chosen? }) → { key, action, size:number|null }[]` (order: fold, check/call, sizes ascending as generated, all-in, the chosen option last if new; duplicates dropped)

- [ ] **Step 1: Confirm the merged phases**

Run:
```bash
git log --oneline -1
grep -n "export function legalActions\|export function applyEvent\|export function reduceHand" src/private/trainers/poker/engine/handState.js
grep -n "export function viewFor\|export const eventsFor" src/private/trainers/poker/engine/view.js
grep -n "export function buildPots" src/private/trainers/poker/engine/pots.js
grep -n "export function createRangeTracker\|export const DEFAULT_TYPE" src/private/trainers/poker/bots/ranges.js
grep -n "export function legalize" src/private/trainers/poker/bots/legalize.js
grep -n "export function raiseSize" src/private/trainers/poker/bots/preflop.js
grep -n "export function createBrain" src/private/trainers/poker/bots/index.js
grep -n "export function equityVsRanges" src/private/trainers/poker/bots/equity.js
grep -n "export function positionsOf\|export function preflopSpot\|export function chartKeyFor\|export function postflopContext\|export function actsByStreet" src/private/trainers/poker/bots/situation.js
grep -n "export function buildLog\|export function contextAfter" src/private/trainers/poker/bots/testHands.js
grep -n "export const potTotal\|export function clampRaise" src/private/trainers/poker/lib/sizing.js
grep -n "safeCall('onHandComplete', onHandComplete, record)" src/private/trainers/poker/lib/tableDriver.js
grep -n "onHandComplete: (record) => callbacks.current.onHandComplete(record)" src/private/trainers/poker/lib/useTableSession.js
grep -n "export default function Seat\|export default function Board" src/private/trainers/poker/ui/table/Seat.jsx src/private/trainers/poker/ui/table/Board.jsx
grep -n "export function createPokerHandsHandler\|export function createPokerSessionsHandler" api/trainers/poker/hands.js api/trainers/poker/sessions.js
grep -n "transaction" api/_lib/testing.js
ls api/trainers/poker/profile.js src/private/trainers/poker/lib/persistence/withPokerPersistence.jsx
```
Expected: every grep prints at least one line and `ls` lists both files. If `createBrain` does not accept a second `options` argument (read its JSDoc), if `useTableSession.js` no longer contains that `onHandComplete` line (Phase 3 or 4 may have reformatted it; find the equivalent line), or anything else is missing, stop and report the exact item to the controller.

- [ ] **Step 2: Write the failing tests**

```js
// src/private/trainers/poker/analysis/grade.test.js
import { describe, it, expect } from 'vitest';
import { ANALYSIS_VERSION } from './version.js';
import {
  GRADES, GOOD_BELOW, INACCURACY_BELOW, MISTAKE_UP_TO, gradeFor, roundEv, roundProb, hashString, seedFor, mixSeed,
} from './grade.js';

describe('grade bands (spec §7.1)', () => {
  it('uses the documented constants', () => {
    expect(ANALYSIS_VERSION).toBe(1);
    expect(GRADES).toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
    expect([GOOD_BELOW, INACCURACY_BELOW, MISTAKE_UP_TO]).toEqual([0.03, 0.1, 0.25]);
  });

  it('grades EV loss as a share of the pot before the decision', () => {
    expect(gradeFor(0, 100)).toBe('good');
    expect(gradeFor(2.99, 100)).toBe('good');
    expect(gradeFor(3, 100)).toBe('inaccuracy');
    expect(gradeFor(9.99, 100)).toBe('inaccuracy');
    expect(gradeFor(10, 100)).toBe('mistake');
    expect(gradeFor(25, 100)).toBe('mistake');
    expect(gradeFor(25.01, 100)).toBe('blunder');
    expect(gradeFor(1, 0)).toBe('blunder');
    expect(gradeFor(-1, 10)).toBe('good');
  });
});

describe('rounding', () => {
  it('rounds EVs to 2 decimals without negative zero, probabilities to 4', () => {
    expect(roundEv(2.345678)).toBe(2.35);
    expect(roundEv(-7.891)).toBe(-7.89);
    expect(Object.is(roundEv(-0.001), 0)).toBe(true);
    expect(roundProb(0.123456)).toBe(0.1235);
  });
});

describe('seeds', () => {
  it('hashes with FNV-1a', () => {
    expect(hashString('')).toBe(2166136261);
    expect(hashString('a')).toBe(3826002220);
  });

  it('derives stable, distinct uint32 seeds', () => {
    expect(seedFor('h1', 4)).toBe(seedFor('h1', 4));
    expect(seedFor('h1', 4)).not.toBe(seedFor('h1', 5));
    expect(seedFor('h1', 4)).not.toBe(seedFor('h2', 4));
    const mixed = new Set([0, 1, 2, 3, 4].map((n) => mixSeed(seedFor('h1', 4), n)));
    expect(mixed.size).toBe(5);
    for (const s of mixed) expect(Number.isInteger(s) && s >= 0 && s < 2 ** 32).toBe(true);
    expect(mixSeed(7, 3)).toBe(mixSeed(7, 3));
  });
});
```

```js
// src/private/trainers/poker/analysis/options.test.js
import { describe, it, expect } from 'vitest';
import { reduceHand } from '../engine/handState.js';
import { buildLog, contextAfter } from '../bots/testHands.js';
import { SIZE_FRACTIONS, optionKey, parseOptionKey, optionsFor } from './options.js';

const keys = (list) => list.map((o) => o.key);
// Six seats, button 5: SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5. The BTN opens to 5 and the BB calls.
const FLOP = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s'];

describe('option keys', () => {
  it('formats and parses keys', () => {
    expect(SIZE_FRACTIONS).toEqual([1 / 3, 1 / 2, 3 / 4, 1]);
    expect(optionKey('fold')).toBe('fold');
    expect(optionKey('call', null)).toBe('call');
    expect(optionKey('raise', 24)).toBe('raise:24');
    expect(parseOptionKey('bet:11')).toEqual({ action: 'bet', size: 11 });
    expect(parseOptionKey('check')).toEqual({ action: 'check', size: null });
  });
});

describe('optionsFor', () => {
  it('bets 1/3, 1/2, 3/4 and pot of the pot, then all-in, when checking is free', () => {
    const { state } = contextAfter(FLOP); // BB to act, pot 11, stack 195
    const options = optionsFor(state);
    expect(keys(options)).toEqual(['check', 'bet:4', 'bet:6', 'bet:8', 'bet:11', 'bet:195']);
    expect(options[1]).toEqual({ key: 'bet:4', action: 'bet', size: 4 });
  });

  it('adds fold and sizes raises from the pot after calling', () => {
    const { state } = contextAfter([...FLOP, 'b 1 4']); // BTN faces 4 into 15
    expect(keys(optionsFor(state))).toEqual(['fold', 'call', 'raise:10', 'raise:14', 'raise:18', 'raise:23', 'raise:195']);
  });

  it('uses the given standard size preflop, keeps the chosen size and drops duplicates', () => {
    const { state } = contextAfter([]); // UTG, pot 3, 200 behind
    expect(keys(optionsFor(state, { preflopRaiseTo: 5 }))).toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 5, chosen: { action: 'raise', amount: 7 } })))
      .toEqual(['fold', 'call', 'raise:5', 'raise:200', 'raise:7']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 5, chosen: { action: 'raise', amount: 5 } })))
      .toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(keys(optionsFor(state))).toEqual(['fold', 'call', 'raise:200']);
  });

  it('offers check and raises to the big blind when limpers let it check', () => {
    const { state } = contextAfter(['c 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    expect(keys(optionsFor(state, { preflopRaiseTo: 8, chosen: { action: 'check' } }))).toEqual(['check', 'raise:8', 'raise:200']);
    expect(keys(optionsFor(state, { chosen: { action: 'fold' } }))).toEqual(['check', 'raise:200', 'fold']);
  });

  it('throws when nobody is to act', () => {
    const state = reduceHand(buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0'])); // the big blind wins
    expect(() => optionsFor(state)).toThrow('nobody is to act');
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/analysis/grade.test.js src/private/trainers/poker/analysis/options.test.js`
Expected: FAIL, cannot find modules `./version.js`, `./grade.js` and `./options.js`.

- [ ] **Step 4: Write the implementation**

```js
// src/private/trainers/poker/analysis/version.js
// Bump when grading changes enough that stored hands should be re-graded (spec §6.2 analysis_version).
// The API imports this file, so it must stay dependency-free.
export const ANALYSIS_VERSION = 1;
```

```js
// src/private/trainers/poker/analysis/grade.js
// Grade bands (spec §7.1), rounding for stored values, and deterministic seeds for rollouts.

export const GRADES = Object.freeze(['good', 'inaccuracy', 'mistake', 'blunder']);
export const GOOD_BELOW = 0.03;
export const INACCURACY_BELOW = 0.1;
export const MISTAKE_UP_TO = 0.25;

/**
 * Grade from EV loss as a share of the pot before the decision (both in units):
 * good < 3%, inaccuracy 3–10%, mistake 10–25% (inclusive), blunder > 25%.
 * @returns {'good'|'inaccuracy'|'mistake'|'blunder'}
 */
export function gradeFor(evLoss, pot) {
  if (!(evLoss > 0)) return 'good';
  const share = pot > 0 ? evLoss / pot : Infinity;
  if (share < GOOD_BELOW) return 'good';
  if (share < INACCURACY_BELOW) return 'inaccuracy';
  if (share <= MISTAKE_UP_TO) return 'mistake';
  return 'blunder';
}

/** EVs are stored as fractional units with 2 decimals. Adding 0 turns -0 into 0. */
export const roundEv = (x) => Math.round(x * 100) / 100 + 0;

/** Equities are stored with 4 decimals. */
export const roundProb = (x) => Math.round(x * 10000) / 10000 + 0;

/** FNV-1a 32-bit hash. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Seed for decision `idx` of a hand (idx -1 seeds the hand's all-in EV). */
export const seedFor = (handId, idx) => hashString(`${handId}:${idx}`);

/** Seed for sample `n` of a base seed (murmur3 finalizer), independent of evaluation order. */
export function mixSeed(seed, n) {
  let h = (seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
```

```js
// src/private/trainers/poker/analysis/options.js
// The options graded at one decision (spec §7.1): fold, check/call, bet or raise at 1/3, 1/2, 3/4 and pot
// of the pot after calling (postflop) or the standard preflop size, all-in, and the hero's own size.
import { legalActions } from '../engine/handState.js';
import { potTotal, clampRaise } from '../lib/sizing.js';

export const SIZE_FRACTIONS = Object.freeze([1 / 3, 1 / 2, 3 / 4, 1]);

/** 'fold' | 'check' | 'call' | 'bet:<units>' | 'raise:<units>' (the evByOption keys). */
export const optionKey = (action, size = null) => (size === null || size === undefined ? action : `${action}:${size}`);

/** @returns {{ action:string, size:number|null }} */
export function parseOptionKey(key) {
  const [action, size] = String(key).split(':');
  return { action, size: size === undefined ? null : Number(size) };
}

/**
 * @param {object} state engine state with a player to act
 * @param {{ preflopRaiseTo?:number|null, chosen?:{ action:string, amount?:number }|null }} [extras]
 * @returns {{ key:string, action:string, size:number|null }[]}
 */
export function optionsFor(state, { preflopRaiseTo = null, chosen = null } = {}) {
  const legal = legalActions(state);
  if (!legal) throw new Error('nobody is to act');
  const out = [];
  const seen = new Set();
  const add = (action, size = null) => {
    const key = optionKey(action, size);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, action, size });
  };
  if (!legal.canCheck) add('fold');
  add(legal.canCheck ? 'check' : 'call');
  if (legal.canRaise) {
    const kind = legal.raiseKind;
    if (state.street === 'preflop') {
      if (Number.isFinite(preflopRaiseTo)) add(kind, clampRaise(legal, preflopRaiseTo));
    } else {
      const potAfterCall = potTotal(state) + legal.toCall;
      for (const f of SIZE_FRACTIONS) add(kind, clampRaise(legal, state.currentBet + f * potAfterCall));
    }
    add(kind, legal.maxRaiseTo);
  }
  if (chosen) {
    const aggressive = chosen.action === 'bet' || chosen.action === 'raise';
    add(chosen.action, aggressive ? chosen.amount : null);
  }
  return out;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/analysis/grade.test.js src/private/trainers/poker/analysis/options.test.js`
Expected: PASS (grade: 5 tests, options: 6 tests). If an `optionsFor` expectation is off by one unit, print `legalActions(state)` and `potTotal(state)` and check the rounding (`Math.round`, halves round up) before changing anything; the expected numbers follow the Phase 2 preset formula. Then run `npm test`. Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/analysis/version.js src/private/trainers/poker/analysis/grade.js src/private/trainers/poker/analysis/options.js src/private/trainers/poker/analysis/grade.test.js src/private/trainers/poker/analysis/options.test.js
git commit -m "Add poker analysis version, grade bands, seeds and option menu

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Decision points and spot strings

**Files:**
- Create: `src/private/trainers/poker/analysis/spots.js`
- Test: `src/private/trainers/poker/analysis/spots.test.js`

**Interfaces:**
- Consumes: `applyEvent`, `legalActions` (engine); `viewFor`, `eventsFor` (engine view); `positionsOf`, `actsByStreet`, `preflopSpot`, `postflopContext` (Phase 3 `bots/situation.js`); tests use `buildLog`, `HOLES6`.
- Produces:
  - `PREFLOP_SPOTS = { open:'pf.open', vsLimp:'pf.vs_limp', vsOpen:'pf.vs_open', squeeze:'pf.squeeze', vs3bet:'pf.vs_3bet', vs4bet:'pf.vs_4bet' }`
  - `postflopSituation({ toCall, betsThisStreet, aggressor }) → 'cbet'|'no_bet'|'facing_bet'|'facing_raise'`
  - `decisionPoints(events, heroSeat) → DecisionPoint[]`, `DecisionPoint = { idx, event, before, legal, view, seatEvents, street, position, spot, pot, toCall, neededEquity:number|null, preflop:PreflopSpot|null, context:PostflopContext|null }` where `before` is the engine state just before the act, `view = viewFor(before, heroSeat)`, `seatEvents = eventsFor(events.slice(0, idx), heroSeat)`, `pot` = sum of `total`, `neededEquity = toCall / (pot + toCall)` or null.
  - `parseSpot(spot) → { street, situation, position:'ip'|'oop'|null } | null`, `spotLabel(spot) → string` (same outputs as Phase 6's planned `leaks/spotCopy.js`).

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/analysis/spots.test.js
import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { PREFLOP_SPOTS, postflopSituation, decisionPoints, parseSpot, spotLabel } from './spots.js';

// Six seats, button 5: SB 0, BB 1, UTG 2, HJ 3, CO 4, BTN 5.
const LOG_A = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'b 5 4', 'c 1', 'B 2d', 'k 1', 'k 5', 'B 3s', 'b 1 10', 'c 5'];
const summary = (points) => points.map((p) => [p.idx, p.street, p.position, p.spot, p.pot, p.toCall]);

describe('postflopSituation', () => {
  it('classifies by price, bets on the street and the last aggressor', () => {
    expect(postflopSituation({ toCall: 0, betsThisStreet: 0, aggressor: true })).toBe('cbet');
    expect(postflopSituation({ toCall: 0, betsThisStreet: 0, aggressor: false })).toBe('no_bet');
    expect(postflopSituation({ toCall: 4, betsThisStreet: 1, aggressor: true })).toBe('facing_bet');
    expect(postflopSituation({ toCall: 8, betsThisStreet: 2, aggressor: false })).toBe('facing_raise');
  });
});

describe('decisionPoints', () => {
  it('finds every hero decision with its street, position, spot, pot and price', () => {
    const events = buildLog(LOG_A);
    expect(summary(decisionPoints(events, 5))).toEqual([
      [10, 'preflop', 'BTN', 'pf.open', 3, 2],
      [15, 'flop', 'BTN', 'flop.cbet.ip', 11, 0],
      [19, 'turn', 'BTN', 'turn.cbet.ip', 19, 0],
      [22, 'river', 'BTN', 'river.facing_bet.ip', 29, 10],
    ]);
    expect(summary(decisionPoints(events, 1))).toEqual([
      [12, 'preflop', 'BB', 'pf.vs_open', 8, 3],
      [14, 'flop', 'BB', 'flop.no_bet.oop', 11, 0],
      [16, 'flop', 'BB', 'flop.facing_bet.oop', 15, 4],
      [18, 'turn', 'BB', 'turn.no_bet.oop', 19, 0],
      [21, 'river', 'BB', 'river.no_bet.oop', 19, 0],
    ]);
  });

  it('keeps the state before the act, the price and only the hero-visible cards', () => {
    const events = buildLog(LOG_A);
    const [pre, flop] = decisionPoints(events, 1);
    expect(pre.event).toEqual({ type: 'act', seat: 1, action: 'call' });
    expect(pre.neededEquity).toBeCloseTo(3 / 11, 10);
    expect(flop.neededEquity).toBeNull();
    expect(pre.legal.toCall).toBe(3);
    expect(pre.before.toAct).toBe(1);
    expect(pre.view.players.find((p) => p.seat === 5).hole).toBeNull();
    expect(pre.view.players.find((p) => p.seat === 1).hole).not.toBeNull();
    expect(pre.seatEvents).toHaveLength(12);
    expect(pre.seatEvents.filter((e) => e.type === 'hole' && e.cards !== null).map((e) => e.seat)).toEqual([1]);
    expect(pre.preflop.kind).toBe('vsOpen');
    expect(flop.context.ip).toBe(false);
  });

  it('labels facing a raise and a donk bet', () => {
    const events = buildLog(['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'b 1 4', 'r 5 12', 'c 1']);
    expect(decisionPoints(events, 1).map((p) => p.spot)).toEqual(['pf.vs_open', 'flop.no_bet.oop', 'flop.facing_raise.oop']);
    expect(decisionPoints(events, 5).map((p) => p.spot)).toEqual(['pf.open', 'flop.facing_bet.ip']);
  });

  it.each([
    [['f 2', 'f 3', 'r 4 5'], 4, 'pf.open', 'CO'],
    [['c 2', 'f 3', 'r 4 8'], 4, 'pf.vs_limp', 'CO'],
    [['r 2 5', 'f 3', 'f 4', 'c 5'], 5, 'pf.vs_open', 'BTN'],
    [['r 2 5', 'c 3', 'r 4 20'], 4, 'pf.squeeze', 'CO'],
    [['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'c 2'], 2, 'pf.vs_3bet', 'UTG'],
    [['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'r 2 40', 'c 5'], 5, 'pf.vs_4bet', 'BTN'],
  ])('preflop %j for seat %i is %s', (steps, hero, spot, position) => {
    const last = decisionPoints(buildLog(steps), hero).at(-1);
    expect(last.spot).toBe(spot);
    expect(last.position).toBe(position);
    expect(Object.values(PREFLOP_SPOTS)).toContain(spot);
  });

  it('returns nothing when the hero never acts', () => {
    expect(decisionPoints(buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']), 1)).toEqual([]);
  });
});

describe('parseSpot and spotLabel (Phase 6 outputs)', () => {
  it('reads street, situation and position', () => {
    expect(parseSpot('pf.vs_3bet')).toEqual({ street: 'preflop', situation: 'vs_3bet', position: null });
    expect(parseSpot('river.facing_bet.oop')).toEqual({ street: 'river', situation: 'facing_bet', position: 'oop' });
    expect(parseSpot('turn.no_bet.multiway.oop')).toEqual({ street: 'turn', situation: 'no_bet', position: 'oop' });
    for (const bad of ['', 'pf', 'preflop.open', 'river.', null, undefined, 42]) expect(parseSpot(bad), String(bad)).toBeNull();
  });

  it('labels known, unknown and unparseable spots', () => {
    expect(spotLabel('pf.open')).toBe('Preflop · first in');
    expect(spotLabel('river.facing_bet.oop')).toBe('River · facing a bet · out of position');
    expect(spotLabel('flop.cbet.ip')).toBe('Flop · c-bet chance · in position');
    expect(spotLabel('turn.overbet_probe')).toBe('Turn · overbet probe');
    expect(spotLabel('weird')).toBe('weird');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/analysis/spots.test.js`
Expected: FAIL, cannot find module `./spots.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/spots.js
// Every hero decision in a hand log, with what the hero could see at that moment, and its spot string.
// Spot grammar (contracts §4.1, Phase 6): pf.<open|vs_limp|vs_open|squeeze|vs_3bet|vs_4bet> or
// <flop|turn|river>.<cbet|no_bet|facing_bet|facing_raise>.<ip|oop>. Phase 5 emits no other modifiers.
import { applyEvent, legalActions } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { positionsOf, actsByStreet, preflopSpot, postflopContext } from '../bots/situation.js';

export const PREFLOP_SPOTS = Object.freeze({
  open: 'pf.open',
  vsLimp: 'pf.vs_limp',
  vsOpen: 'pf.vs_open',
  squeeze: 'pf.squeeze',
  vs3bet: 'pf.vs_3bet',
  vs4bet: 'pf.vs_4bet',
});

/** @returns {'cbet'|'no_bet'|'facing_bet'|'facing_raise'} */
export function postflopSituation({ toCall, betsThisStreet, aggressor }) {
  if (toCall > 0) return betsThisStreet >= 2 ? 'facing_raise' : 'facing_bet';
  if (betsThisStreet === 0 && aggressor) return 'cbet';
  return 'no_bet';
}

/**
 * @param {object[]} events a full hand log (every hole card), complete or not
 * @param {number} heroSeat
 * @returns {object[]} DecisionPoint[] in log order (see the Task 2 Interfaces block)
 */
export function decisionPoints(events, heroSeat) {
  const points = [];
  let state = null;
  events.forEach((event, idx) => {
    if (event.type === 'act' && event.seat === heroSeat) {
      const legal = legalActions(state);
      const view = viewFor(state, heroSeat);
      const seatEvents = eventsFor(events.slice(0, idx), heroSeat);
      const pot = view.players.reduce((sum, p) => sum + p.total, 0);
      const street = state.street;
      let preflop = null;
      let context = null;
      let spot;
      if (street === 'preflop') {
        preflop = preflopSpot(view, actsByStreet(seatEvents).preflop, heroSeat);
        spot = PREFLOP_SPOTS[preflop.kind];
      } else {
        context = postflopContext(view, seatEvents, heroSeat, legal);
        spot = `${street}.${postflopSituation(context)}.${context.ip ? 'ip' : 'oop'}`;
      }
      points.push({
        idx,
        event,
        before: state,
        legal,
        view,
        seatEvents,
        street,
        position: positionsOf(view)[heroSeat],
        spot,
        pot,
        toCall: legal.toCall,
        neededEquity: legal.toCall > 0 ? legal.toCall / (pot + legal.toCall) : null,
        preflop,
        context,
      });
    }
    state = applyEvent(state, event);
  });
  return points;
}

const STREET_BY_PREFIX = { pf: 'preflop', flop: 'flop', turn: 'turn', river: 'river' };
const STREET_LABEL = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River' };
const POSITION_LABEL = { ip: 'in position', oop: 'out of position' };
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/analysis/spots.test.js`
Expected: PASS (12 tests). If a pot or index differs, print `buildLog(LOG_A).map((e, i) => [i, e.type, e.seat, e.action])` and recount; the expected indexes assume 1 start event and 6 hole events before the first act. Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/spots.js src/private/trainers/poker/analysis/spots.test.js
git commit -m "Add poker decision points and Phase 6 spot strings

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Preflop chart check

**Files:**
- Create: `src/private/trainers/poker/analysis/preflopCheck.js`
- Test: `src/private/trainers/poker/analysis/preflopCheck.test.js`

**Interfaces:**
- Consumes: `decisionPoints` (Task 2); `classOf` (Phase 3 `bots/handClass.js`); `hasChart`, `chartFreqs` (`bots/charts.js`); `chartKeyFor` (`bots/situation.js`); `raiseSize` (Phase 3 Task 9 `bots/preflop.js`); `legalize` (Phase 3 Task 9 `bots/legalize.js`); `resolveDials` (`bots/dials.js`).
- Produces:
  - `CHART_GOOD_FREQ = 0.2`
  - `standardRaiseTo(point) → number` (Phase 3 `raiseSize` with default dials; `legal.maxRaiseTo` when that is not finite; `null` when raising is not legal)
  - `chartCheck(point) → { key, freqs:{ raise, call, fold }, chosenFreq, ok, recommended:{ action, size:number|null } } | null` (null postflop or when no chart applies). The chosen action's frequency is `raise` for bet/raise, `call` for call, `1 − raise` for check, and `fold` for fold (0 when checking was free). `recommended` is the chart's most frequent action (raise ≥ call ≥ fold on ties) at the standard size, passed through `legalize`.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/analysis/preflopCheck.test.js
import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { classOf } from '../bots/handClass.js';
import { chartFreqs } from '../bots/charts.js';
import { parseCards } from '../engine/cards.js';
import { decisionPoints } from './spots.js';
import { CHART_GOOD_FREQ, chartCheck, standardRaiseTo } from './preflopCheck.js';

const lastPoint = (steps, hero, options) => decisionPoints(buildLog(steps, options), hero).at(-1);
// Seat 2 (UTG) holds 7c2d instead of AhAs.
const SEVEN_DEUCE = { holes: ['2c3d', '7h2s', '7c2d', 'KdQd', 'JcTc', '9s9h'] };
const cls = (text) => {
  const [a, b] = parseCards(text);
  return classOf(a, b);
};

describe('chartCheck', () => {
  it('passes a raise the chart makes with AA under the gun', () => {
    expect(CHART_GOOD_FREQ).toBe(0.2);
    const check = chartCheck(lastPoint(['r 2 5'], 2));
    expect(check.key).toBe('open.UTG');
    expect(check.freqs.raise).toBeGreaterThanOrEqual(0.9);
    expect(check.chosenFreq).toBe(check.freqs.raise);
    expect(check.ok).toBe(true);
    expect(check.recommended).toEqual({ action: 'raise', size: 5 });
  });

  it('passes folding 72o under the gun and fails raising it', () => {
    const base = chartFreqs('open.UTG', cls('7c2d'));
    expect(base.raise).toBeLessThan(CHART_GOOD_FREQ);
    const fold = chartCheck(lastPoint(['f 2'], 2, SEVEN_DEUCE));
    expect(fold.chosenFreq).toBeCloseTo(1 - base.raise - base.call, 10);
    expect(fold.ok).toBe(true);
    expect(fold.recommended).toEqual({ action: 'fold', size: null });
    const raise = chartCheck(lastPoint(['r 2 5'], 2, SEVEN_DEUCE));
    expect(raise.chosenFreq).toBe(base.raise);
    expect(raise.ok).toBe(false);
  });

  it('scores a big blind check as not raising and recommends check over fold', () => {
    const point = lastPoint(['c 2', 'f 3', 'f 4', 'f 5', 'f 0', 'k 1'], 1); // BB holds 7h2s
    const check = chartCheck(point);
    expect(check.key).toBe('vsLimp.BB');
    expect(check.chosenFreq).toBeCloseTo(1 - check.freqs.raise, 10);
    expect(check.recommended.action).toBe(check.freqs.raise >= Math.max(check.freqs.call, check.freqs.fold) ? 'raise' : 'check');
  });

  it('is null postflop', () => {
    const point = lastPoint(['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1'], 1);
    expect(chartCheck(point)).toBeNull();
  });
});

describe('standardRaiseTo', () => {
  it('uses the default open size, 3x in position against an open, and all-in for a 5-bet', () => {
    expect(standardRaiseTo(lastPoint(['r 2 5'], 2))).toBe(5);
    expect(standardRaiseTo(lastPoint(['r 2 5', 'f 3', 'f 4', 'c 5'], 5))).toBe(15);
    expect(standardRaiseTo(lastPoint(['r 2 5', 'f 3', 'f 4', 'r 5 16', 'f 0', 'f 1', 'r 2 40', 'c 5'], 5))).toBe(200);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/analysis/preflopCheck.test.js`
Expected: FAIL, cannot find module `./preflopCheck.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/preflopCheck.js
// Spec §7.1 preflop: an action the chart takes at least 20% of the time is good. The charts carry no EV
// table (Phase 3), so anything else is graded by rollouts. Uses the unscaled chart: the hero is graded
// against sound play, not against a persona's width.
import { classOf } from '../bots/handClass.js';
import { hasChart, chartFreqs } from '../bots/charts.js';
import { chartKeyFor } from '../bots/situation.js';
import { raiseSize } from '../bots/preflop.js';
import { legalize } from '../bots/legalize.js';
import { resolveDials } from '../bots/dials.js';

export const CHART_GOOD_FREQ = 0.2;
const DEFAULT_DIALS = resolveDials({});

/** Phase 3's standard raise-to for this preflop spot, or null when raising is not legal. */
export function standardRaiseTo(point) {
  if (!point.preflop || !point.legal.canRaise) return null;
  const size = raiseSize(point.preflop, point.view, DEFAULT_DIALS, point.view.bb);
  return Number.isFinite(size) ? size : point.legal.maxRaiseTo;
}

/** Chart frequencies for the hero's hand at a preflop decision point, or null when not applicable. */
export function chartCheck(point) {
  if (!point.preflop) return null;
  let key;
  try {
    key = chartKeyFor(point.preflop, hasChart);
  } catch {
    return null;
  }
  const { legal, view, event } = point;
  const hero = view.players.find((p) => p.seat === event.seat);
  const { raise, call } = chartFreqs(key, classOf(hero.hole[0], hero.hole[1]));
  const fold = Math.max(0, 1 - raise - call);
  const freqOf = {
    bet: raise,
    raise,
    call: legal.canCheck ? 0 : call,
    check: legal.canCheck ? 1 - raise : 0,
    fold: legal.canCheck ? 0 : fold,
  };
  const chosenFreq = freqOf[event.action] ?? 0;
  let intended;
  if (raise >= call && raise >= fold) intended = { action: 'raise', amount: standardRaiseTo(point) ?? legal.minRaiseTo };
  else intended = { action: call >= fold ? 'call' : 'fold' };
  const choice = legalize(intended, legal);
  return {
    key,
    freqs: { raise, call, fold },
    chosenFreq,
    ok: chosenFreq >= CHART_GOOD_FREQ,
    recommended: { action: choice.action, size: choice.amount ?? null },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/analysis/preflopCheck.test.js`
Expected: PASS (5 tests). The AA and 72o assertions depend on Phase 3's generated `charts-v1.json`; if `open.UTG` gives AA a raise frequency under 0.9 or 72o a raise frequency of 0.2 or more, report the chart values to the controller instead of editing the test. Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/preflopCheck.js src/private/trainers/poker/analysis/preflopCheck.test.js
git commit -m "Add poker preflop chart check for grading

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: All-in EV

**Files:**
- Create: `src/private/trainers/poker/analysis/allinEv.js`
- Test: `src/private/trainers/poker/analysis/allinEv.test.js`

**Interfaces:**
- Consumes: `applyEvent` (engine), `evaluate` (`engine/evaluator.js`), `buildPots` (`engine/pots.js`); tests use `buildLog`, `mulberry32`.
- Produces:
  - `ALLIN_SAMPLES = 20000`
  - `allInPoint(events, heroSeat) → state|null`: the first state in which a street has closed (`needsBoard` set), at least two players are live, the hero is live and at most one live player still has chips.
  - `heroAllinEv(events, heroSeat, { rng?, samples? }) → number|null` (units, 2 decimals): expected hero share of every pot the hero is eligible for, over the remaining runouts with the live players' actual cards, minus the hero's total contribution. Exact enumeration when 1–2 board cards are missing; otherwise `samples` Monte Carlo runouts with `rng` (throws `heroAllinEv needs an rng for a preflop all-in` without one). `null` when there is no such point.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/analysis/allinEv.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { buildLog } from '../bots/testHands.js';
import { ALLIN_SAMPLES, allInPoint, heroAllinEv } from './allinEv.js';

// Heads-up: seat 1 is the button and small blind, seat 0 the big blind (the hero).
const HU = (holes, steps) => buildLog(steps, { holes });

describe('allInPoint and heroAllinEv', () => {
  it('is null without an all-in before the river', () => {
    expect(ALLIN_SAMPLES).toBe(20000);
    const folded = HU(['AhAs', 'KdKc'], ['r 1 6', 'f 0']);
    expect(allInPoint(folded, 0)).toBeNull();
    expect(heroAllinEv(folded, 0)).toBeNull();
    const riverShove = HU(['AhAs', 'KdKc'], ['c 1', 'k 0', 'B 2c7d9h', 'k 0', 'k 1', 'B Js', 'k 0', 'k 1', 'B 3h', 'b 0 198', 'c 1']);
    expect(heroAllinEv(riverShove, 0)).toBeNull();
  });

  it('is null for a hero who folded while others went all-in', () => {
    // Three seats, button 2: SB 0, BB 1, the button acts first preflop.
    const events = buildLog(['r 2 200', 'c 0', 'f 1', 'B 2c7d9h', 'B Js', 'B 3h'], { holes: ['AhAs', 'KdKc', 'QsQh'] });
    expect(heroAllinEv(events, 1)).toBeNull();
    expect(allInPoint(events, 0).board).toEqual([]);
  });

  it('enumerates the last two cards exactly: a flopped royal flush is worth the whole pot', () => {
    const events = HU(['AhKh', '2c2d'], ['c 1', 'k 0', 'B QhJhTh', 'b 0 198', 'c 1', 'B 3c', 'B 4d']);
    expect(allInPoint(events, 0).board).toHaveLength(3);
    expect(heroAllinEv(events, 0)).toBe(200);
    expect(heroAllinEv(events, 1)).toBe(-200);
  });

  it('samples a preflop all-in: AA against KK is worth about 82% of 400 minus 200', () => {
    const events = HU(['AhAs', 'KdKc'], ['r 1 200', 'c 0', 'B 2c7d9h', 'B Js', 'B 3h']);
    expect(() => heroAllinEv(events, 0)).toThrow('heroAllinEv needs an rng for a preflop all-in');
    const ev = heroAllinEv(events, 0, { rng: mulberry32(11) });
    expect(ev).toBeGreaterThan(116);
    expect(ev).toBeLessThan(140);
    expect(heroAllinEv(events, 0, { rng: mulberry32(11) })).toBe(ev);
    expect(Math.abs(ev * 100 - Math.round(ev * 100))).toBeLessThan(1e-6);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/analysis/allinEv.test.js`
Expected: FAIL, cannot find module `./allinEv.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/allinEv.js
// All-in EV (spec §7.1): when the betting is over before the river and the hero is still in, the hero's
// expected share of the pots with the actual cards of the live players, minus what the hero put in.
// Stored as hero_allin_ev and used for the all-in adjusted net.
import { applyEvent } from '../engine/handState.js';
import { evaluate } from '../engine/evaluator.js';
import { buildPots } from '../engine/pots.js';

export const ALLIN_SAMPLES = 20000;

const round2 = (x) => Math.round(x * 100) / 100 + 0;

/** The first state where no more betting is possible before the river and the hero is live, or null. */
export function allInPoint(events, heroSeat) {
  let state = null;
  for (const event of events) {
    state = applyEvent(state, event);
    if (!state.needsBoard) continue;
    const live = state.players.filter((p) => !p.folded);
    const withChips = live.filter((p) => !p.allIn);
    if (live.length >= 2 && withChips.length <= 1 && live.some((p) => p.seat === heroSeat)) return state;
  }
  return null;
}

function heroShare(live, pots, board, heroSeat) {
  const scores = new Map(live.map((p) => [p.seat, evaluate([...p.hole, ...board])]));
  let share = 0;
  for (const pot of pots) {
    if (!pot.eligible.includes(heroSeat)) continue;
    let best = -Infinity;
    let winners = 0;
    let heroWins = false;
    for (const seat of pot.eligible) {
      const score = scores.get(seat);
      if (score > best) {
        best = score;
        winners = 1;
        heroWins = seat === heroSeat;
      } else if (score === best) {
        winners += 1;
        if (seat === heroSeat) heroWins = true;
      }
    }
    if (heroWins) share += pot.amount / winners;
  }
  return share;
}

/**
 * @param {object[]} events full hand log (every hole card)
 * @param {number} heroSeat
 * @param {{ rng?:() => number, samples?:number }} [options]
 * @returns {number|null} units with 2 decimals
 */
export function heroAllinEv(events, heroSeat, { rng = null, samples = ALLIN_SAMPLES } = {}) {
  const point = allInPoint(events, heroSeat);
  if (!point) return null;
  const live = point.players.filter((p) => !p.folded);
  const pots = buildPots(point.players.map((p) => ({ seat: p.seat, total: p.total, folded: p.folded })));
  const used = new Uint8Array(52);
  for (const p of live) for (const c of p.hole) used[c] = 1;
  for (const c of point.board) used[c] = 1;
  const deck = [];
  for (let c = 0; c < 52; c += 1) if (!used[c]) deck.push(c);
  const need = 5 - point.board.length;
  const hero = point.players.find((p) => p.seat === heroSeat);
  let total = 0;
  let count = 0;
  const tally = (runout) => {
    total += heroShare(live, pots, [...point.board, ...runout], heroSeat);
    count += 1;
  };

  if (need === 1) {
    for (const a of deck) tally([a]);
  } else if (need === 2) {
    for (let i = 0; i < deck.length; i += 1) for (let j = i + 1; j < deck.length; j += 1) tally([deck[i], deck[j]]);
  } else {
    if (!rng) throw new Error('heroAllinEv needs an rng for a preflop all-in');
    const cards = deck.slice();
    for (let s = 0; s < samples; s += 1) {
      for (let k = 0; k < need; k += 1) {
        const j = k + Math.floor(rng() * (cards.length - k));
        [cards[k], cards[j]] = [cards[j], cards[k]];
      }
      tally(cards.slice(0, need));
    }
  }
  return round2(total / count - hero.total);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/analysis/allinEv.test.js`
Expected: PASS (4 tests). Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/allinEv.js src/private/trainers/poker/analysis/allinEv.test.js
git commit -m "Add poker all-in EV with exact and seeded runouts

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 5: Rollout world: hero-view ranges, hole sampling and one rollout

**Files:**
- Create: `src/private/trainers/poker/analysis/rollout.js`
- Test: `src/private/trainers/poker/analysis/rollout.test.js`

**Interfaces:**
- Consumes: `decisionPoints`, `DecisionPoint` (Task 2); `optionsFor` (Task 1); `applyEvent`, `legalActions`, `viewFor`, `eventsFor`, `shuffle`, `mulberry32`; `COMBO_COUNT`, `COMBO_CARDS`, `classWeightsToCombos` (Phase 3 `bots/handClass.js`); `createRangeTracker`, `DEFAULT_TYPE` (Phase 3 Task 8 `bots/ranges.js`); `createBrain(persona, options)` (Phase 3 Task 11 `bots/index.js`); `getPersona` (`bots/personas.js`); tests use `callingStation`, `comboOf`, `parseCard`, `parseCards`, `buildLog`.
- Produces:
  - `ROLLOUT_BRAIN_OPTIONS = { iterations: 24, budgetMs: Infinity }`, `HERO_MODEL = { id:'hero-model', name:'Hero model', tag:'HRO', style:'tight-aggressive', brain:'heuristic', dials:{} }`
  - `personaFor(personaId) → Persona` (`getPersona`, or a default-dial heuristic persona for an unknown id)
  - `heroRanges(point, heroSeat) → Map<seat, Float32Array(1326)>` (live opponents; copies, safe to keep)
  - `prepareRange(weights, dead) → { combos:Int16Array, cumulative:Float64Array, total }` (any live combo when the range is empty)
  - `sampleHoles(prepared: Map<seat, PreparedRange>, folded: number[], dead: Uint8Array, rng) → { holes: Map<seat, [number, number]>, used: Uint8Array }`
  - `createRolloutWorld({ events, point, heroSeat, lineup, brainOptions?, createBrainImpl? }) → RolloutWorld`, `RolloutWorld = { prefix, heroSeat, heroStack, dead, ranges, prepared, folded, personas: Map<seat, Persona>, brains: Map<seat, Brain>, boardLength }`
  - `rolloutOnce(world, option: { action, size }, seed) → number` (hero's final stack minus the stack before the decision, units; a fold returns 0)

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/analysis/rollout.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCard, parseCards } from '../engine/cards.js';
import { buildLog } from '../bots/testHands.js';
import { callingStation } from '../bots/baselines.js';
import { getPersona } from '../bots/personas.js';
import { COMBO_COUNT, comboOf } from '../bots/handClass.js';
import { decisionPoints } from './spots.js';
import { optionsFor } from './options.js';
import {
  ROLLOUT_BRAIN_OPTIONS, HERO_MODEL, personaFor, heroRanges, prepareRange, sampleHoles, createRolloutWorld, rolloutOnce,
} from './rollout.js';

// Heads-up, seat 1 is the button. SB raises to 6, BB (hero, AhKh) 3-bets to 18, SB 4-bets to 40, BB calls.
// The hero flops a royal flush and the hand checks to the river.
const PREFLOP = ['r 1 6', 'r 0 18', 'r 1 40', 'c 0'];
const TO_RIVER = [...PREFLOP, 'B QhJhTh', 'k 0', 'k 1', 'B 2c', 'k 0', 'k 1', 'B 3d'];
const HU = { holes: ['AhKh', '9c9d'] };
const HU_LINEUP = [{ seat: 1, personaId: 'moss' }];
const riverPoint = (events) => decisionPoints(events, 0).find((p) => p.street === 'river');
const stationWorld = (events, point) => createRolloutWorld({ events, point, heroSeat: 0, lineup: HU_LINEUP, createBrainImpl: () => callingStation });

describe('personaFor', () => {
  it('uses the persona list and falls back to a default heuristic persona', () => {
    expect(ROLLOUT_BRAIN_OPTIONS).toEqual({ iterations: 24, budgetMs: Infinity });
    expect(HERO_MODEL.brain).toBe('heuristic');
    expect(personaFor('moss')).toBe(getPersona('moss'));
    expect(personaFor('nobody')).toMatchObject({ id: 'nobody', brain: 'heuristic', dials: {} });
  });
});

describe('heroRanges', () => {
  it('covers live opponents only, with dead combos removed postflop', () => {
    const pre = decisionPoints(buildLog(['r 2 5', 'f 3', 'f 4', 'c 5']), 5).at(-1);
    const preRanges = heroRanges(pre, 5);
    expect([...preRanges.keys()].sort()).toEqual([0, 1, 2]);
    for (const range of preRanges.values()) expect(range).toHaveLength(COMBO_COUNT);

    const point = riverPoint(buildLog([...TO_RIVER, 'k 0', 'k 1'], HU));
    const ranges = heroRanges(point, 0);
    expect([...ranges.keys()]).toEqual([1]);
    expect(ranges.get(1)[comboOf(parseCard('Qh'), parseCard('9s'))]).toBe(0);
    expect(ranges.get(1)[comboOf(parseCard('9c'), parseCard('9d'))]).toBeGreaterThan(0);
  });
});

describe('prepareRange and sampleHoles', () => {
  const dead = new Uint8Array(52);
  for (const c of parseCards('AhKhQhJhTh')) dead[c] = 1;

  it('falls back to every live combo for an empty range', () => {
    expect(prepareRange(new Float32Array(COMBO_COUNT), dead).combos).toHaveLength(1081);
  });

  it('deals ranged seats from their ranges, folded seats random live cards, with no shared cards', () => {
    const only = new Float32Array(COMBO_COUNT);
    only[comboOf(parseCard('9c'), parseCard('9d'))] = 1;
    const prepared = new Map([[1, prepareRange(only, dead)], [2, prepareRange(new Float32Array(COMBO_COUNT).fill(1), dead)]]);
    const { holes, used } = sampleHoles(prepared, [3, 4], dead, mulberry32(5));
    expect(holes.get(1)).toEqual([parseCard('9c'), parseCard('9d')]);
    const cards = [...holes.values()].flat();
    expect(new Set(cards).size).toBe(8);
    for (const c of cards) expect(dead[c]).toBe(0);
    expect(used.reduce((a, b) => a + b, 0)).toBe(13);
    expect(sampleHoles(prepared, [3, 4], dead, mulberry32(5)).holes).toEqual(holes);
  });
});

describe('rolloutOnce', () => {
  it('scores check and all-in exactly against a calling station, and fold as 0', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'k 1'], HU);
    const point = riverPoint(events);
    const world = stationWorld(events, point);
    expect(world.heroStack).toBe(160);
    const options = optionsFor(point.before, { chosen: point.event });
    const ev = (key, seed) => rolloutOnce(world, options.find((o) => o.key === key), seed);
    for (const seed of [1, 2, 3]) {
      expect(ev('check', seed)).toBe(80);
      expect(ev('bet:40', seed)).toBe(120);
      expect(ev('bet:160', seed)).toBe(240);
    }
    expect(rolloutOnce(world, { action: 'fold', size: null }, 9)).toBe(0);
  });

  it('plays a preflop spot to the end with persona brains, deterministically, without touching the log', () => {
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'c 5', 'f 0', 'f 1', 'B Kh8d4s', 'k 2', 'k 5', 'B 2d', 'k 2', 'k 5', 'B 3s', 'k 2', 'k 5']);
    const lineup = [0, 1, 2, 3, 4].map((seat, i) => ({ seat, personaId: ['moss', 'viper', 'duchess', 'rook', 'ink'][i] }));
    const point = decisionPoints(events, 5)[0];
    const snapshot = JSON.stringify(events);
    const world = createRolloutWorld({ events, point, heroSeat: 5, lineup });
    for (const option of [{ action: 'call', size: null }, { action: 'raise', size: 15 }]) {
      const a = rolloutOnce(world, option, 42);
      expect(Number.isInteger(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(-200);
      expect(rolloutOnce(world, option, 42)).toBe(a);
    }
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/analysis/rollout.test.js`
Expected: FAIL, cannot find module `./rollout.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/rollout.js
// One Monte Carlo rollout of a hero option (spec §7.1): opponents' hole cards come from their weighted ranges
// as the hero saw them, folded seats get random live cards, the runout is shuffled, and the rest of the hand
// is played by the engine with each bot's persona brain (the hero's later actions by HERO_MODEL).
import { applyEvent, legalActions } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { shuffle } from '../engine/cards.js';
import { mulberry32 } from '../../core/rng.js';
import { COMBO_COUNT, COMBO_CARDS, classWeightsToCombos } from '../bots/handClass.js';
import { createRangeTracker, DEFAULT_TYPE } from '../bots/ranges.js';
import { createBrain } from '../bots/index.js';
import { getPersona } from '../bots/personas.js';

export const ROLLOUT_BRAIN_OPTIONS = Object.freeze({ iterations: 24, budgetMs: Infinity });

/** The hero's own later decisions in a rollout: a sound default player. */
export const HERO_MODEL = Object.freeze({
  id: 'hero-model', name: 'Hero model', tag: 'HRO', style: 'tight-aggressive', brain: 'heuristic', dials: Object.freeze({}),
});

const DEAL_ATTEMPTS = 64;
const MAX_ROLLOUT_STEPS = 400;
const BOARD_CARDS = { flop: 3, turn: 1, river: 1 };

/** @returns {import('../bots/contract.js').Persona} */
export function personaFor(personaId) {
  try {
    return getPersona(personaId);
  } catch {
    return { id: personaId, name: String(personaId), tag: '???', style: 'unknown', brain: 'heuristic', dials: {} };
  }
}

/**
 * Opponents' 1,326-combo ranges from the hero's view at a decision (Phase 3 tracker, default player type).
 * If the tracker throws (a spot no chart covers), every live opponent gets a uniform range instead.
 */
export function heroRanges(point, heroSeat) {
  const out = new Map();
  let tracked;
  try {
    tracked = createRangeTracker().track(point.view, point.seatEvents, heroSeat, () => DEFAULT_TYPE);
  } catch {
    for (const p of point.before.players) {
      if (p.seat !== heroSeat && !p.folded) out.set(p.seat, new Float32Array(COMBO_COUNT).fill(1));
    }
    return out;
  }
  const { classWeights, comboRanges } = tracked;
  for (const [seat, weights] of classWeights) {
    const combos = comboRanges.get(seat);
    out.set(seat, combos ? Float32Array.from(combos) : classWeightsToCombos(weights));
  }
  return out;
}

/** Live combos of a range with cumulative weights; every live combo when the range is empty. */
export function prepareRange(weights, dead) {
  const combos = [];
  const cumulative = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const w = weights[i];
    if (!(w > 0) || dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    total += w;
    combos.push(i);
    cumulative.push(total);
  }
  if (combos.length === 0) return prepareRange(new Float32Array(COMBO_COUNT).fill(1), dead);
  return { combos: Int16Array.from(combos), cumulative: Float64Array.from(cumulative), total };
}

function pickCards(range, rng) {
  const target = rng() * range.total;
  let lo = 0;
  let hi = range.combos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (range.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  const combo = range.combos[lo];
  return [COMBO_CARDS[2 * combo], COMBO_CARDS[2 * combo + 1]];
}

function randomLiveCard(used, rng) {
  for (;;) {
    const card = Math.floor(rng() * 52);
    if (!used[card]) return card;
  }
}

/**
 * Deals every ranged seat a combo from its range with no shared cards (whole-set rejection, then seat by seat,
 * then random cards), and every folded seat two random live cards.
 */
export function sampleHoles(prepared, folded, dead, rng) {
  const seats = [...prepared.keys()];
  const used = new Uint8Array(52);
  const holes = new Map();
  let dealt = false;
  for (let attempt = 0; attempt < DEAL_ATTEMPTS && !dealt; attempt += 1) {
    used.set(dead);
    holes.clear();
    dealt = true;
    for (const seat of seats) {
      const [a, b] = pickCards(prepared.get(seat), rng);
      if (used[a] || used[b]) {
        dealt = false;
        break;
      }
      used[a] = 1;
      used[b] = 1;
      holes.set(seat, [a, b]);
    }
  }
  if (!dealt) {
    used.set(dead);
    holes.clear();
    for (const seat of seats) {
      let cards = null;
      for (let k = 0; k < DEAL_ATTEMPTS && !cards; k += 1) {
        const [a, b] = pickCards(prepared.get(seat), rng);
        if (!used[a] && !used[b]) cards = [a, b];
      }
      if (!cards) {
        const a = randomLiveCard(used, rng);
        used[a] = 1;
        cards = [a, randomLiveCard(used, rng)];
      }
      used[cards[0]] = 1;
      used[cards[1]] = 1;
      holes.set(seat, cards);
    }
  }
  for (const seat of folded) {
    const a = randomLiveCard(used, rng);
    used[a] = 1;
    const b = randomLiveCard(used, rng);
    used[b] = 1;
    holes.set(seat, [a, b]);
  }
  return { holes, used };
}

/**
 * Everything the rollouts of one decision share.
 * @param {{ events:object[], point:object, heroSeat:number, lineup:{seat:number, personaId:string}[],
 *   brainOptions?:object, createBrainImpl?:(persona:object, options:object) => object }} input
 */
export function createRolloutWorld({ events, point, heroSeat, lineup, brainOptions = ROLLOUT_BRAIN_OPTIONS, createBrainImpl = createBrain }) {
  const { before } = point;
  const hero = before.players.find((p) => p.seat === heroSeat);
  const dead = new Uint8Array(52);
  for (const c of hero.hole) dead[c] = 1;
  for (const c of before.board) dead[c] = 1;
  const ranges = heroRanges(point, heroSeat);
  const prepared = new Map([...ranges].map(([seat, weights]) => [seat, prepareRange(weights, dead)]));
  const folded = before.players.filter((p) => p.seat !== heroSeat && !ranges.has(p.seat)).map((p) => p.seat);
  const personaIds = new Map(lineup.map((entry) => [entry.seat, entry.personaId]));
  const personas = new Map();
  const brains = new Map();
  for (const p of before.players) {
    const persona = p.seat === heroSeat ? HERO_MODEL : personaFor(personaIds.get(p.seat) ?? 'unknown');
    personas.set(p.seat, persona);
    brains.set(p.seat, createBrainImpl(persona, brainOptions));
  }
  return {
    prefix: events.slice(0, point.idx),
    heroSeat,
    heroStack: hero.stack,
    dead,
    ranges,
    prepared,
    folded,
    personas,
    brains,
    boardLength: before.board.length,
  };
}

/** Plays `option` for the hero and the rest of the hand once. Deterministic for a seed. */
export function rolloutOnce(world, option, seed) {
  if (option.action === 'fold') return 0;
  const dealRng = mulberry32(seed);
  const actRng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const { holes, used } = sampleHoles(world.prepared, world.folded, world.dead, dealRng);
  const live = [];
  for (let c = 0; c < 52; c += 1) if (!used[c]) live.push(c);
  const runout = shuffle(live, dealRng).slice(0, 5 - world.boardLength);

  const events = [];
  let state = null;
  const push = (event) => {
    state = applyEvent(state, event);
    events.push(event);
  };
  // A fresh start object per rollout also resets every brain's per-hand range cache.
  for (const event of world.prefix) {
    if (event.type === 'start') push({ ...event, seats: event.seats.map((s) => ({ ...s })) });
    else if (event.type === 'hole' && event.seat !== world.heroSeat) push({ type: 'hole', seat: event.seat, cards: holes.get(event.seat) });
    else push(event);
  }
  const aggressive = option.action === 'bet' || option.action === 'raise';
  push(aggressive
    ? { type: 'act', seat: world.heroSeat, action: option.action, amount: option.size }
    : { type: 'act', seat: world.heroSeat, action: option.action });

  let next = 0;
  for (let step = 0; state.street !== 'complete'; step += 1) {
    if (step > MAX_ROLLOUT_STEPS) throw new Error('rollout did not finish');
    if (state.needsBoard) {
      const count = BOARD_CARDS[state.needsBoard];
      push({ type: 'board', cards: runout.slice(next, next + count) });
      next += count;
      continue;
    }
    const seat = state.toAct;
    const legal = legalActions(state);
    const ctx = {
      view: viewFor(state, seat), seat, legal, events: eventsFor(events, seat),
      persona: world.personas.get(seat), profile: null, heroSeat: null, bb: state.bb,
    };
    try {
      push({ type: 'act', seat, ...world.brains.get(seat).decide(ctx, actRng) });
    } catch {
      push({ type: 'act', seat, action: legal.canCheck ? 'check' : 'fold' });
    }
  }
  return state.players.find((p) => p.seat === world.heroSeat).stack - world.heroStack;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/analysis/rollout.test.js`
Expected: PASS (6 tests). The persona-brain case depends on Phase 3's heuristic brain; if it throws `rollout did not finish` or a non-integer, print the rollout's events and report to the controller. Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/rollout.js src/private/trainers/poker/analysis/rollout.test.js
git commit -m "Add poker grading rollouts with range-sampled holes and persona brains

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: EV estimation per option and confidence

**Files:**
- Create: `src/private/trainers/poker/analysis/evOptions.js`
- Create: `src/private/trainers/poker/analysis/confidence.js`
- Test: `src/private/trainers/poker/analysis/evOptions.test.js`
- Test: `src/private/trainers/poker/analysis/confidence.test.js`

**Interfaces:**
- Consumes: `mixSeed` (Task 1); `rolloutOnce` (Task 5); `COMBO_COUNT`, `COMBO_CARDS` (Phase 3 `bots/handClass.js`); tests use `buildLog`, `reduceHand`.
- Produces:
  - `evOptions.js`: `MIN_ROLLOUTS = 12`, `MAX_ROLLOUTS = 400`, `estimateOptionEvs(world, options, { seed, minRollouts?, maxRollouts?, budgetMs?, now?, rollout? }) → OptionEv[]` with `OptionEv = { key, action, size, mean, n, samples:Float64Array }` in the input order (same `n` for every option; fold is exactly 0 and never rolled out; sample `n` of every option uses seed `mixSeed(seed, n)`; with a finite budget the clock is read before each round once `n ≥ minRollouts`), `pairedStderr(a, b) → number` (`Infinity` below 2 samples), `rankOptions(evs) → OptionEv[]` (mean descending, input order on ties)
  - `confidence.js`: `VAGUE_LIVE_SHARE = 0.6`, `VAGUE_EVENNESS = 0.85`, `LIVE_WEIGHT_FLOOR = 0.05`, `rangeSpread(weights, dead) → { liveShare, evenness }`, `isVagueRange(weights, dead) → boolean`, `dominantOpponent(state, events, heroSeat) → seat|null`, `isConfident(ranked, { vagueRange? }) → boolean`

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/analysis/evOptions.test.js
import { describe, it, expect, vi } from 'vitest';
import { mixSeed } from './grade.js';
import { MIN_ROLLOUTS, MAX_ROLLOUTS, estimateOptionEvs, pairedStderr, rankOptions } from './evOptions.js';

const OPTIONS = [
  { key: 'fold', action: 'fold', size: null },
  { key: 'call', action: 'call', size: null },
  { key: 'raise:20', action: 'raise', size: 20 },
];
// A fake rollout: calls win 3 or lose 1 by seed parity, raises win 10 or lose 5.
const fakeRollout = vi.fn((world, option, seed) => {
  const even = seed % 2 === 0;
  if (option.action === 'call') return even ? 3 : -1;
  return even ? 10 : -5;
});

describe('estimateOptionEvs', () => {
  it('rolls every non-fold option on the same seeds, round robin', () => {
    expect([MIN_ROLLOUTS, MAX_ROLLOUTS]).toEqual([12, 400]);
    fakeRollout.mockClear();
    const evs = estimateOptionEvs({}, OPTIONS, { seed: 99, maxRollouts: 6, rollout: fakeRollout });
    expect(evs.map((o) => [o.key, o.n])).toEqual([['fold', 6], ['call', 6], ['raise:20', 6]]);
    expect(fakeRollout).toHaveBeenCalledTimes(12);
    expect(fakeRollout.mock.calls.slice(0, 2).map((c) => [c[1].key, c[2]])).toEqual([['call', mixSeed(99, 0)], ['raise:20', mixSeed(99, 0)]]);
    expect(evs[0].mean).toBe(0);
    expect([...evs[0].samples]).toEqual([0, 0, 0, 0, 0, 0]);
    const evens = [0, 1, 2, 3, 4, 5].filter((n) => mixSeed(99, n) % 2 === 0).length;
    expect(evs[1].mean).toBeCloseTo((3 * evens - (6 - evens)) / 6, 10);
    expect(evs[2].mean).toBeCloseTo((10 * evens - 5 * (6 - evens)) / 6, 10);
  });

  it('stops at the deadline once the minimum rollouts are done', () => {
    let t = 0;
    const now = () => (t += 10);
    const evs = estimateOptionEvs({}, OPTIONS, { seed: 1, minRollouts: 3, maxRollouts: 1000, budgetMs: 25, now, rollout: fakeRollout });
    expect(evs[1].n).toBe(5);
  });
});

describe('pairedStderr and rankOptions', () => {
  it('computes the standard error of paired differences', () => {
    expect(pairedStderr(Float64Array.of(1, 2, 3), Float64Array.of(0, 0, 0))).toBeCloseTo(Math.sqrt(1 / 3), 10);
    expect(pairedStderr(Float64Array.of(1), Float64Array.of(0))).toBe(Infinity);
  });

  it('ranks by mean and keeps input order on ties', () => {
    const evs = [{ key: 'fold', mean: 0 }, { key: 'check', mean: 2 }, { key: 'bet:4', mean: 2 }, { key: 'bet:8', mean: 5 }];
    expect(rankOptions(evs).map((o) => o.key)).toEqual(['bet:8', 'check', 'bet:4', 'fold']);
  });
});
```

```js
// src/private/trainers/poker/analysis/confidence.test.js
import { describe, it, expect } from 'vitest';
import { reduceHand } from '../engine/handState.js';
import { buildLog } from '../bots/testHands.js';
import { COMBO_COUNT } from '../bots/handClass.js';
import {
  VAGUE_LIVE_SHARE, VAGUE_EVENNESS, LIVE_WEIGHT_FLOOR, rangeSpread, isVagueRange, dominantOpponent, isConfident,
} from './confidence.js';

const noDead = new Uint8Array(52);

describe('range spread', () => {
  it('uses the documented thresholds', () => {
    expect([VAGUE_LIVE_SHARE, VAGUE_EVENNESS, LIVE_WEIGHT_FLOOR]).toEqual([0.6, 0.85, 0.05]);
  });

  it('calls a uniform range vague', () => {
    const uniform = new Float32Array(COMBO_COUNT).fill(1);
    expect(rangeSpread(uniform, noDead)).toEqual({ liveShare: 1, evenness: expect.closeTo(1, 6) });
    expect(isVagueRange(uniform, noDead)).toBe(true);
  });

  it('does not call a narrow or a skewed range vague', () => {
    const narrow = new Float32Array(COMBO_COUNT);
    narrow.fill(1, 0, 132);
    expect(rangeSpread(narrow, noDead).liveShare).toBeCloseTo(132 / COMBO_COUNT, 10);
    expect(isVagueRange(narrow, noDead)).toBe(false);
    const skewed = Float32Array.from({ length: COMBO_COUNT }, (_, i) => (i % 2 === 0 ? 1 : 0.06));
    expect(rangeSpread(skewed, noDead).liveShare).toBe(1);
    expect(rangeSpread(skewed, noDead).evenness).toBeLessThan(VAGUE_EVENNESS);
    expect(isVagueRange(skewed, noDead)).toBe(false);
    expect(rangeSpread(new Float32Array(COMBO_COUNT), noDead)).toEqual({ liveShare: 0, evenness: 0 });
  });
});

describe('dominantOpponent', () => {
  it('is the live opponent with the latest bet or raise', () => {
    const steps = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1'];
    const events = buildLog(steps);
    expect(dominantOpponent(reduceHand(events), events, 1)).toBe(5);
  });

  it('is the live opponent who put in the most chips when nobody raised, lowest seat on ties', () => {
    const events = buildLog(['c 2', 'f 3', 'f 4', 'f 5', 'c 0', 'k 1', 'B Kh8d4s']);
    expect(dominantOpponent(reduceHand(events), events, 1)).toBe(0);
  });
});

describe('isConfident', () => {
  const opt = (mean, samples) => ({ mean, samples: Float64Array.from(samples) });
  it('is false for a vague range or when the top two are within one standard error', () => {
    expect(isConfident([opt(5, [5, 5, 5]), opt(4, [4, 4, 4])], { vagueRange: true })).toBe(false);
    expect(isConfident([opt(1, [3, -1, 5, -3]), opt(0, [0, 0, 0, 0])])).toBe(false);
  });

  it('is true when the gap exceeds the standard error or there is one option', () => {
    expect(isConfident([opt(5, [4, 6, 5]), opt(4, [3, 5, 4])])).toBe(true);
    expect(isConfident([opt(2, [2, 2])])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/analysis/evOptions.test.js src/private/trainers/poker/analysis/confidence.test.js`
Expected: FAIL, cannot find modules `./evOptions.js` and `./confidence.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/evOptions.js
// EV of every option at one decision by round-robin rollouts on shared seeds (common random numbers),
// so the differences between options, which decide the grade, carry far less noise than the EVs.
import { mixSeed } from './grade.js';
import { rolloutOnce } from './rollout.js';

export const MIN_ROLLOUTS = 12;
export const MAX_ROLLOUTS = 400;
const defaultNow = () => performance.now();

/**
 * @param {object} world createRolloutWorld output (passed through to `rollout`)
 * @param {{ key:string, action:string, size:number|null }[]} options
 * @param {{ seed:number, minRollouts?:number, maxRollouts?:number, budgetMs?:number, now?:() => number,
 *   rollout?:(world:object, option:object, seed:number) => number }} settings
 */
export function estimateOptionEvs(world, options, {
  seed, minRollouts = MIN_ROLLOUTS, maxRollouts = MAX_ROLLOUTS, budgetMs = Infinity, now = defaultNow, rollout = rolloutOnce,
}) {
  const rolled = options.map((option, i) => [option, i]).filter(([option]) => option.action !== 'fold');
  const buffers = options.map(() => new Float64Array(maxRollouts));
  const timed = budgetMs !== Infinity;
  const started = timed ? now() : 0;
  let n = 0;
  while (n < maxRollouts) {
    if (timed && n >= minRollouts && now() - started >= budgetMs) break;
    const sampleSeed = mixSeed(seed, n);
    for (const [option, i] of rolled) buffers[i][n] = rollout(world, option, sampleSeed);
    n += 1;
  }
  return options.map((option, i) => {
    const samples = buffers[i].slice(0, n);
    let sum = 0;
    for (const x of samples) sum += x;
    return { ...option, mean: n > 0 ? sum / n : 0, n, samples };
  });
}

/** Standard error of the mean of a[i] - b[i]. */
export function pairedStderr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return Infinity;
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < n; i += 1) {
    const d = a[i] - b[i];
    sum += d;
    sumSq += d * d;
  }
  const mean = sum / n;
  const variance = Math.max(0, (sumSq - n * mean * mean) / (n - 1));
  return Math.sqrt(variance / n);
}

/** Best first; ties keep the input order (fold, check/call, then sizes), so the cheaper option wins a tie. */
export function rankOptions(evs) {
  return evs
    .map((option, i) => [option, i])
    .sort(([a, i], [b, j]) => b.mean - a.mean || i - j)
    .map(([option]) => option);
}
```

```js
// src/private/trainers/poker/analysis/confidence.js
// Spec §7.1 confidence: not confident when the top two options are within the Monte Carlo standard error,
// or when the dominant opponent's range is still wide open (more than 60% of combos live, near-uniform).
import { COMBO_COUNT, COMBO_CARDS } from '../bots/handClass.js';
import { pairedStderr } from './evOptions.js';

export const VAGUE_LIVE_SHARE = 0.6;
export const VAGUE_EVENNESS = 0.85;
export const LIVE_WEIGHT_FLOOR = 0.05;

/**
 * Over combos not touching dead cards: liveShare = share with weight ≥ 5% of the max weight;
 * evenness = exp(entropy of the normalized weights) / combos (1 for a uniform range).
 */
export function rangeSpread(weights, dead) {
  let combos = 0;
  let max = 0;
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    if (dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    combos += 1;
    const w = weights[i] > 0 ? weights[i] : 0;
    total += w;
    if (w > max) max = w;
  }
  if (combos === 0 || total <= 0) return { liveShare: 0, evenness: 0 };
  let live = 0;
  let entropy = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    if (dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    const w = weights[i] > 0 ? weights[i] : 0;
    if (w <= 0) continue;
    if (w >= LIVE_WEIGHT_FLOOR * max) live += 1;
    const p = w / total;
    entropy -= p * Math.log(p);
  }
  return { liveShare: live / combos, evenness: Math.exp(entropy) / combos };
}

export function isVagueRange(weights, dead) {
  const { liveShare, evenness } = rangeSpread(weights, dead);
  return liveShare > VAGUE_LIVE_SHARE && evenness >= VAGUE_EVENNESS;
}

/**
 * The live opponent who made the latest bet or raise in `events`; otherwise the live opponent with the largest
 * contribution (lowest seat on ties); null without live opponents.
 */
export function dominantOpponent(state, events, heroSeat) {
  const live = new Set(state.players.filter((p) => !p.folded && p.seat !== heroSeat).map((p) => p.seat));
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'act' && (e.action === 'bet' || e.action === 'raise') && live.has(e.seat)) return e.seat;
  }
  let best = null;
  for (const p of state.players) {
    if (live.has(p.seat) && (best === null || p.total > best.total)) best = p;
  }
  return best ? best.seat : null;
}

/** @param {{ mean:number, samples:Float64Array }[]} ranked best first */
export function isConfident(ranked, { vagueRange = false } = {}) {
  if (vagueRange) return false;
  if (ranked.length < 2) return true;
  const [first, second] = ranked;
  return Math.abs(first.mean - second.mean) >= pairedStderr(first.samples, second.samples);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/analysis/evOptions.test.js src/private/trainers/poker/analysis/confidence.test.js`
Expected: PASS (evOptions: 4 tests, confidence: 7 tests). Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/evOptions.js src/private/trainers/poker/analysis/confidence.js src/private/trainers/poker/analysis/evOptions.test.js src/private/trainers/poker/analysis/confidence.test.js
git commit -m "Add poker option EV estimation on shared seeds and grade confidence

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Grade a hand

**Files:**
- Create: `src/private/trainers/poker/analysis/gradeHand.js`
- Test: `src/private/trainers/poker/analysis/gradeHand.test.js`
- Test: `api/_lib/pokerAnalysisSchema.test.js`
- Test: `src/private/trainers/poker/analysis/gradeHand.slow.test.js` (opt-in, `POKER_SLOW=1`)

**Interfaces:**
- Consumes: Tasks 1–6 (`ANALYSIS_VERSION`, `gradeFor`, `roundEv`, `roundProb`, `seedFor`, `optionsFor`, `optionKey`, `decisionPoints`, `chartCheck`, `standardRaiseTo`, `heroAllinEv`, `ALLIN_SAMPLES`, `createRolloutWorld`, `estimateOptionEvs`, `rankOptions`, `isVagueRange`, `dominantOpponent`, `isConfident`); `equityVsRanges` (Phase 3 `bots/equity.js`); `mulberry32`. The schema test consumes Phase 4 `handItem` and `pokerHandRecord`, `pokerHandId`.
- Produces:
  - `HAND_BUDGET_MS = 2000`, `EQUITY_ITERATIONS = 2000`, `MAX_GRADED_DECISIONS = 40`
  - `gradeDecision(point, { record, seed, budgetMs?, now?, minRollouts?, maxRollouts?, rollout?, createWorld? }) → DecisionRecord` (contracts §4.1)
  - `gradeHand(record: { id, heroSeat, lineup, events }, { budgetMs?, now?, minRollouts?, maxRollouts?, allinSamples?, rollout?, createWorld? }) → { decisions: DecisionRecord[], heroAllinEv: number|null }`. More than 40 hero decisions returns `decisions: []`. Throws only on a malformed record (the worker turns that into an error response).

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/analysis/gradeHand.test.js
import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { callingStation } from '../bots/baselines.js';
import { GRADES } from './grade.js';
import { createRolloutWorld } from './rollout.js';
import { HAND_BUDGET_MS, EQUITY_ITERATIONS, MAX_GRADED_DECISIONS, gradeHand } from './gradeHand.js';

const FAST = { budgetMs: Infinity, minRollouts: 2, maxRollouts: 2, allinSamples: 200 };
const stationWorld = (args) => createRolloutWorld({ ...args, createBrainImpl: () => callingStation });
const HU = { holes: ['AhKh', '9c9d'] };
const HU_LINEUP = [{ seat: 1, personaId: 'moss' }];
// SB raises to 6, the hero (BB, AhKh) 3-bets to 18, SB 4-bets to 40, the hero calls; a royal flush on the flop.
const TO_RIVER = ['r 1 6', 'r 0 18', 'r 1 40', 'c 0', 'B QhJhTh', 'k 0', 'k 1', 'B 2c', 'k 0', 'k 1', 'B 3d'];
const SIX_LINEUP = (hero) => [0, 1, 2, 3, 4, 5].filter((s) => s !== hero)
  .map((seat, i) => ({ seat, personaId: ['moss', 'viper', 'duchess', 'rook', 'ink'][i] }));

describe('gradeHand golden spots', () => {
  it('uses the documented budget constants', () => {
    expect([HAND_BUDGET_MS, EQUITY_ITERATIONS, MAX_GRADED_DECISIONS]).toEqual([2000, 2000, 40]);
  });

  it('returns no decisions for a walk', () => {
    const events = buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    expect(gradeHand({ id: 'walk', heroSeat: 1, lineup: SIX_LINEUP(1), events }, FAST)).toEqual({ decisions: [], heroAllinEv: null });
  });

  it('passes an under-the-gun AA open by the chart, with no rollouts', () => {
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
    const { decisions, heroAllinEv } = gradeHand({ id: 'aa', heroSeat: 2, lineup: SIX_LINEUP(2), events }, FAST);
    expect(heroAllinEv).toBeNull();
    expect(decisions).toEqual([{
      idx: 7, street: 'preflop', position: 'UTG', spot: 'pf.open', action: 'raise', size: 5, pot: 3, toCall: 2,
      equity: null, neededEquity: 0.4, recommended: { action: 'raise', size: 5, evByOption: {} },
      evLoss: 0, grade: 'good', confident: true, analysisVersion: 1,
    }]);
  });

  it('calls checking the nuts on the river a blunder and recommends all-in against a station', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'k 1'], HU);
    const { decisions } = gradeHand({ id: 'nuts-check', heroSeat: 0, lineup: HU_LINEUP, events }, { ...FAST, createWorld: stationWorld });
    const river = decisions.find((d) => d.street === 'river');
    expect(river).toEqual({
      idx: river.idx, street: 'river', position: 'BB', spot: 'river.no_bet.oop', action: 'check', size: null, pot: 80, toCall: 0,
      equity: 1, neededEquity: null,
      recommended: { action: 'bet', size: 160, evByOption: { check: 80, 'bet:27': 107, 'bet:40': 120, 'bet:60': 140, 'bet:80': 160, 'bet:160': 240 } },
      evLoss: 160, grade: 'blunder', confident: true, analysisVersion: 1,
    });
  });

  it('calls folding the nuts to a river bet a blunder', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'b 1 40', 'f 0'], HU);
    const { decisions } = gradeHand({ id: 'nuts-fold', heroSeat: 0, lineup: HU_LINEUP, events }, { ...FAST, createWorld: stationWorld });
    expect(decisions.at(-1)).toMatchObject({
      spot: 'river.facing_bet.oop', action: 'fold', pot: 120, toCall: 40, equity: 1, neededEquity: 0.25,
      recommended: { action: 'raise', size: 160, evByOption: { fold: 0, call: 160, 'raise:93': 173, 'raise:120': 200, 'raise:160': 240 } },
      evLoss: 240, grade: 'blunder', confident: true,
    });
  });

  it('grades an off-chart preflop raise by rollouts, deterministically', () => {
    const holes = ['2c3d', '7h2s', '7c2d', 'KdQd', 'JcTc', '9s9h'];
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1'], { holes });
    const record = { id: 'seven-deuce', heroSeat: 2, lineup: SIX_LINEUP(2), events };
    const first = gradeHand(record, FAST);
    const [d] = first.decisions;
    expect(d.spot).toBe('pf.open');
    expect(Object.keys(d.recommended.evByOption)).toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(d.recommended.evByOption.fold).toBe(0);
    expect(d.evLoss).toBeGreaterThanOrEqual(0);
    expect(GRADES).toContain(d.grade);
    expect(typeof d.confident).toBe('boolean');
    expect(gradeHand(record, FAST)).toEqual(first);
  });
});
```

```js
// api/_lib/pokerAnalysisSchema.test.js
import { describe, it, expect } from 'vitest';
import { handItem } from './pokerSchemas.js';
import { pokerHandRecord, pokerHandId } from './pokerTesting.js';
import { gradeHand } from '../../src/private/trainers/poker/analysis/gradeHand.js';

// Whatever the grader produces must always pass the server schema: a rejected hand is never saved.
describe('graded hands pass the POST hands schema', () => {
  it('accepts graded random engine hands after a JSON round trip', () => {
    for (let seed = 1; seed <= 8; seed += 1) {
      const hand = pokerHandRecord({ seed, handNo: seed, id: pokerHandId(seed) });
      const analysis = gradeHand(hand, { budgetMs: Infinity, minRollouts: 2, maxRollouts: 2, allinSamples: 200 });
      const heroActs = hand.events.filter((e) => e.type === 'act' && e.seat === hand.heroSeat).length;
      expect(analysis.decisions, `seed ${seed}`).toHaveLength(heroActs);
      const result = handItem.safeParse(JSON.parse(JSON.stringify({ hand, ...analysis })));
      expect(result.error?.issues ?? [], `seed ${seed}`).toEqual([]);
    }
  }, 120_000);
});
```

```js
// src/private/trainers/poker/analysis/gradeHand.slow.test.js
import { describe, it, expect } from 'vitest';
import { pokerHandRecord, pokerHandId } from '../../../../../api/_lib/pokerTesting.js';
import { HAND_BUDGET_MS, gradeHand } from './gradeHand.js';

// Opt-in: POKER_SLOW=1 npx vitest run src/private/trainers/poker/analysis/gradeHand.slow.test.js
describe.skipIf(process.env.POKER_SLOW !== '1')('gradeHand timing with the production budget', () => {
  it('grades each hand within about the 2 s budget', () => {
    const times = [];
    let decisions = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const hand = pokerHandRecord({ seed, handNo: seed, id: pokerHandId(seed) });
      const started = performance.now();
      decisions += gradeHand(hand).decisions.length;
      times.push(performance.now() - started);
    }
    const worst = Math.max(...times);
    console.log(`gradeHand: ${decisions} decisions, mean ${Math.round(times.reduce((a, b) => a + b) / times.length)} ms, worst ${Math.round(worst)} ms per hand`);
    expect(worst).toBeLessThan(HAND_BUDGET_MS + 1500);
  }, 120_000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/analysis/gradeHand.test.js api/_lib/pokerAnalysisSchema.test.js`
Expected: FAIL, cannot find module `./gradeHand.js` (and `../../src/private/trainers/poker/analysis/gradeHand.js`).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/gradeHand.js
// Grades every hero decision of one hand on the information the hero had (spec §7.1) and computes the
// all-in EV. Pure given the hand when budgetMs is Infinity; in the worker the 2 s budget caps the rollouts.
import { mulberry32 } from '../../core/rng.js';
import { equityVsRanges } from '../bots/equity.js';
import { ANALYSIS_VERSION } from './version.js';
import { gradeFor, roundEv, roundProb, seedFor } from './grade.js';
import { decisionPoints } from './spots.js';
import { optionsFor, optionKey } from './options.js';
import { chartCheck, standardRaiseTo } from './preflopCheck.js';
import { heroAllinEv, ALLIN_SAMPLES } from './allinEv.js';
import { createRolloutWorld } from './rollout.js';
import { estimateOptionEvs, rankOptions } from './evOptions.js';
import { isVagueRange, dominantOpponent, isConfident } from './confidence.js';

export const HAND_BUDGET_MS = 2000;
export const EQUITY_ITERATIONS = 2000;
export const MAX_GRADED_DECISIONS = 40; // the POST hands limit per hand
const defaultNow = () => performance.now();

/**
 * @param {object} point a DecisionPoint (analysis/spots.js)
 * @param {{ record:{ id:string, heroSeat:number, lineup:object[], events:object[] }, seed:number, budgetMs?:number,
 *   now?:() => number, minRollouts?:number, maxRollouts?:number, rollout?:Function, createWorld?:Function }} settings
 * @returns {object} DecisionRecord (contracts §4.1)
 */
export function gradeDecision(point, {
  record, seed, budgetMs = Infinity, now = defaultNow, minRollouts, maxRollouts, rollout, createWorld = createRolloutWorld,
}) {
  const { event } = point;
  const size = event.action === 'bet' || event.action === 'raise' ? event.amount : null;
  const decision = {
    idx: point.idx,
    street: point.street,
    position: point.position,
    spot: point.spot,
    action: event.action,
    size,
    pot: point.pot,
    toCall: point.toCall,
    equity: null,
    neededEquity: point.neededEquity === null ? null : roundProb(point.neededEquity),
    analysisVersion: ANALYSIS_VERSION,
  };
  const unrolled = (recommended) => ({
    ...decision, recommended: { ...recommended, evByOption: {} }, evLoss: 0, grade: 'good', confident: true,
  });

  if (point.street === 'preflop') {
    const chart = chartCheck(point);
    if (chart?.ok) return unrolled(chart.recommended);
  }

  let world = null;
  const worldFor = () => {
    world ??= createWorld({ events: record.events, point, heroSeat: record.heroSeat, lineup: record.lineup });
    return world;
  };
  if (point.street !== 'preflop') {
    const hero = point.view.players.find((p) => p.seat === record.heroSeat);
    const { equity } = equityVsRanges({
      hole: hero.hole, board: point.view.board, ranges: [...worldFor().ranges.values()], rng: mulberry32(seed), iterations: EQUITY_ITERATIONS,
    });
    decision.equity = roundProb(equity);
  }

  const options = optionsFor(point.before, {
    preflopRaiseTo: point.street === 'preflop' ? standardRaiseTo(point) : null,
    chosen: event,
  });
  if (options.length < 2) return unrolled({ action: event.action, size });

  const evs = estimateOptionEvs(worldFor(), options, { seed, budgetMs, now, minRollouts, maxRollouts, rollout });
  const ranked = rankOptions(evs);
  const best = ranked[0];
  const chosen = evs.find((o) => o.key === optionKey(event.action, size));
  const evLoss = roundEv(Math.max(0, best.mean - chosen.mean));
  let vagueRange = false;
  if (point.street !== 'preflop') {
    const seat = dominantOpponent(point.before, point.seatEvents, record.heroSeat);
    vagueRange = seat !== null && world.ranges.has(seat) && isVagueRange(world.ranges.get(seat), world.dead);
  }
  return {
    ...decision,
    recommended: {
      action: best.action,
      size: best.size,
      evByOption: Object.fromEntries(evs.map((o) => [o.key, roundEv(o.mean)])),
    },
    evLoss,
    grade: gradeFor(evLoss, point.pot),
    confident: isConfident(ranked, { vagueRange }),
  };
}

/**
 * @param {{ id:string, heroSeat:number, lineup:{seat:number, personaId:string}[], events:object[] }} record
 * @returns {{ decisions:object[], heroAllinEv:number|null }}
 */
export function gradeHand(record, {
  budgetMs = HAND_BUDGET_MS, now = defaultNow, minRollouts, maxRollouts, allinSamples = ALLIN_SAMPLES, rollout, createWorld,
} = {}) {
  const heroAllin = heroAllinEv(record.events, record.heroSeat, { rng: mulberry32(seedFor(record.id, -1)), samples: allinSamples });
  const points = decisionPoints(record.events, record.heroSeat);
  if (points.length === 0 || points.length > MAX_GRADED_DECISIONS) return { decisions: [], heroAllinEv: heroAllin };
  const timed = budgetMs !== Infinity;
  const started = timed ? now() : 0;
  const decisions = points.map((point, i) => {
    const share = timed ? Math.max(0, budgetMs - (now() - started)) / (points.length - i) : Infinity;
    return gradeDecision(point, {
      record, seed: seedFor(record.id, point.idx), budgetMs: share, now, minRollouts, maxRollouts, rollout, createWorld,
    });
  });
  return { decisions, heroAllinEv: heroAllin };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/analysis/gradeHand.test.js api/_lib/pokerAnalysisSchema.test.js`
Expected: PASS (gradeHand: 6 tests; schema: 1 test, under about 20 s). If the station golden spots report `confident: false`, print `rangeSpread(world.ranges.get(1), world.dead)` for the river decision: after a 4-bet the SB range must be far below 60% live combos, so a vague result means the Phase 3 tracker did not narrow the range; report it to the controller rather than loosening the test. If the schema test fails, the issue path names the field: fix the grader (rounding, a missing field, a non-finite EV), never the schema.

- [ ] **Step 5: Measure the real budget (opt-in)**

Run: `POKER_SLOW=1 npx vitest run src/private/trainers/poker/analysis/gradeHand.slow.test.js`
Expected: PASS, printing one line like `gradeHand: 61 decisions, mean 1400 ms, worst 2300 ms per hand`. Report the printed line in the task summary. If the worst hand exceeds 3.5 s, the floor of `MIN_ROLLOUTS × options × decisions` is too slow on this machine: report the numbers to the controller (the fix is lowering `ROLLOUT_BRAIN_OPTIONS.iterations` or `MIN_ROLLOUTS`, which is a controller decision).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all pass (the slow test is skipped).

- [ ] **Step 7: Commit**

```bash
git add src/private/trainers/poker/analysis/gradeHand.js src/private/trainers/poker/analysis/gradeHand.test.js src/private/trainers/poker/analysis/gradeHand.slow.test.js api/_lib/pokerAnalysisSchema.test.js
git commit -m "Grade poker hands: chart check, rollout EVs, grades, confidence and all-in EV

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Explanation templates

**Files:**
- Create: `src/private/trainers/poker/analysis/explain.js`
- Test: `src/private/trainers/poker/analysis/explain.test.js`

**Interfaces:**
- Consumes: `parseSpot` (Task 2); `optionKey`, `parseOptionKey` (Task 1); `formatBb` (Phase 2 `lib/format.js`).
- Produces:
  - `SPOT_FAMILIES = ['open','vs_limp','vs_open','squeeze','vs_3bet','vs_4bet','cbet','no_bet','facing_bet','facing_raise','other']`, `ERROR_TYPES = ['chart','best','overfold','loose_call','too_passive','too_aggressive','sizing']`
  - `spotFamily(spot) → family`, `errorType(decision) → errorType`, `optionLabel(key) → 'Fold'|'Check'|'Call'|'Bet 2.0 BB'|'Raise to 12.5 BB'`, `formatEv(units) → '4.5 BB'|'−1.0 BB'`
  - `explainDecision(decision, { chart? }) → string` (chart = `chartCheck` output, used for chart-graded preflop decisions)

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/analysis/explain.test.js
import { describe, it, expect } from 'vitest';
import { formatBb } from '../lib/format.js';
import { SPOT_FAMILIES, ERROR_TYPES, spotFamily, errorType, optionLabel, formatEv, explainDecision } from './explain.js';

const PREFLOP = ['open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet'];
const POSTFLOP = ['cbet', 'no_bet', 'facing_bet', 'facing_raise'];

/** A coherent decision for one spot family and error type. */
function fixture(family, type) {
  const preflop = PREFLOP.includes(family);
  const base = {
    idx: 9, street: preflop ? 'preflop' : 'flop', position: 'BTN',
    spot: preflop ? `pf.${family}` : family === 'other' ? 'weird' : `flop.${family}.ip`,
    pot: 12, toCall: 0, equity: preflop ? null : 0.42, neededEquity: null, confident: true, analysisVersion: 1,
  };
  const rec = (action, size, evByOption) => ({ action, size, evByOption });
  switch (type) {
    case 'chart':
      return { ...base, action: 'raise', size: 5, recommended: rec('raise', 5, {}), evLoss: 0, grade: 'good' };
    case 'best':
      return { ...base, action: 'check', size: null, recommended: rec('check', null, { check: 3, 'bet:6': 1 }), evLoss: 0, grade: 'good' };
    case 'overfold':
      return { ...base, toCall: 6, neededEquity: 0.3333, action: 'fold', size: null, recommended: rec('call', null, { fold: 0, call: 4.5 }), evLoss: 4.5, grade: 'mistake' };
    case 'loose_call':
      return { ...base, toCall: 6, neededEquity: 0.3333, action: 'call', size: null, recommended: rec('fold', null, { fold: 0, call: -3 }), evLoss: 3, grade: 'mistake' };
    case 'too_passive':
      return { ...base, action: 'check', size: null, recommended: rec('bet', 8, { check: 1, 'bet:8': 5 }), evLoss: 4, grade: 'blunder' };
    case 'too_aggressive':
      return { ...base, action: 'bet', size: 8, recommended: rec('check', null, { check: 5, 'bet:8': 1 }), evLoss: 4, grade: 'blunder' };
    default:
      return { ...base, action: 'bet', size: 8, recommended: rec('bet', 16, { 'bet:8': 2, 'bet:16': 6 }), evLoss: 4, grade: 'blunder' };
  }
}

describe('labels', () => {
  it('names families, options and EVs', () => {
    expect(SPOT_FAMILIES).toEqual([...PREFLOP, ...POSTFLOP, 'other']);
    expect(spotFamily('river.facing_bet.oop')).toBe('facing_bet');
    expect(spotFamily('pf.vs_3bet')).toBe('vs_3bet');
    expect(spotFamily('turn.overbet_probe')).toBe('other');
    expect(spotFamily('weird')).toBe('other');
    expect(optionLabel('fold')).toBe('Fold');
    expect(optionLabel('bet:4')).toBe('Bet 2.0 BB');
    expect(optionLabel('raise:25')).toBe('Raise to 12.5 BB');
    expect(formatEv(9)).toBe('4.5 BB');
    expect(formatEv(-2)).toBe('−1.0 BB');
    expect(formatEv(-0.04)).toBe('0.0 BB');
  });
});

describe('errorType', () => {
  it.each(ERROR_TYPES)('classifies %s', (type) => {
    const family = type === 'chart' ? 'open' : 'no_bet';
    expect(errorType(fixture(family, type))).toBe(type);
  });
});

describe('explainDecision', () => {
  it('renders the spec example with real numbers', () => {
    const d = {
      street: 'river', spot: 'river.facing_bet.oop', action: 'call', size: null, pot: 60, toCall: 48,
      equity: 0.21, neededEquity: 0.34, recommended: { action: 'fold', size: null, evByOption: { fold: 0, call: -10.2 } },
      evLoss: 10.2, grade: 'blunder', confident: true,
    };
    expect(explainDecision(d)).toBe(
      'You faced a bet. You called 24.0 BB into 30.0 BB. You needed 34% equity and had about 21% against their likely range. Folding loses nothing; calling cost about 5.1 BB.',
    );
  });

  it('renders every spot family with every error type that can occur there', () => {
    for (const family of [...PREFLOP, ...POSTFLOP, 'other']) {
      for (const type of ERROR_TYPES) {
        if (type === 'chart' && !PREFLOP.includes(family)) continue;
        const d = fixture(family, type);
        const text = explainDecision(d, type === 'chart' ? { chart: { chosenFreq: 0.85 } } : {});
        expect(text, `${family}.${type}`).not.toMatch(/undefined|NaN|null|\[object/);
        expect(text.length, `${family}.${type}`).toBeGreaterThan(30);
        if (d.evLoss > 0) expect(text, `${family}.${type}`).toContain(`${formatBb(d.evLoss)} BB`);
      }
    }
  });

  it('cites the chart frequency and marks debatable grades', () => {
    expect(explainDecision(fixture('open', 'chart'), { chart: { chosenFreq: 0.85 } })).toContain('85% of the time');
    expect(explainDecision(fixture('open', 'chart'))).toContain('matches the preflop chart');
    expect(explainDecision({ ...fixture('no_bet', 'too_passive'), confident: false })).toMatch(/debatable\.$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/analysis/explain.test.js`
Expected: FAIL, cannot find module `./explain.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/explain.js
// Template explanations with real numbers, keyed by spot family and error type (spec §7.1). Rendered from the
// stored DecisionRecord at display time, so wording can change without re-grading.
import { formatBb } from '../lib/format.js';
import { parseSpot } from './spots.js';
import { optionKey, parseOptionKey } from './options.js';

export const SPOT_FAMILIES = Object.freeze([
  'open', 'vs_limp', 'vs_open', 'squeeze', 'vs_3bet', 'vs_4bet', 'cbet', 'no_bet', 'facing_bet', 'facing_raise', 'other',
]);
export const ERROR_TYPES = Object.freeze(['chart', 'best', 'overfold', 'loose_call', 'too_passive', 'too_aggressive', 'sizing']);

const pct = (x) => `${Math.round(x * 100)}%`;
const bb = (units) => `${formatBb(units)} BB`;
const lower = (text) => text.charAt(0).toLowerCase() + text.slice(1);
const aggressive = (action) => action === 'bet' || action === 'raise';

/** Signed EV in BB with a real minus sign; tiny negatives read as 0.0. */
export function formatEv(units) {
  const text = formatBb(Math.abs(units));
  return units < 0 && text !== '0.0' ? `−${text} BB` : `${text} BB`;
}

export function spotFamily(spot) {
  const parsed = parseSpot(spot);
  return parsed && SPOT_FAMILIES.includes(parsed.situation) ? parsed.situation : 'other';
}

export function optionLabel(key) {
  const { action, size } = parseOptionKey(key);
  if (action === 'bet') return `Bet ${bb(size)}`;
  if (action === 'raise') return `Raise to ${bb(size)}`;
  return action.charAt(0).toUpperCase() + action.slice(1);
}

/** @returns {'chart'|'best'|'overfold'|'loose_call'|'too_passive'|'too_aggressive'|'sizing'} */
export function errorType(d) {
  const best = d.recommended;
  if (d.street === 'preflop' && Object.keys(best.evByOption).length === 0) return 'chart';
  if (d.evLoss === 0 || (d.action === best.action && (d.size ?? null) === (best.size ?? null))) return 'best';
  if (d.action === 'fold') return 'overfold';
  if (aggressive(d.action) && aggressive(best.action)) return 'sizing';
  if (aggressive(d.action)) return 'too_aggressive';
  if (d.action === 'call' && best.action === 'fold') return 'loose_call';
  if (aggressive(best.action)) return 'too_passive';
  return 'too_aggressive';
}

const CONTEXT = {
  open: 'The action folded to you preflop.',
  vs_limp: 'Someone limped in front of you.',
  vs_open: 'You faced an open raise.',
  squeeze: 'You faced a raise and at least one call.',
  vs_3bet: 'Your raise was 3-bet.',
  vs_4bet: 'You faced a 4-bet.',
  cbet: 'You made the last raise on the previous street.',
  no_bet: 'Nobody had bet yet.',
  facing_bet: 'You faced a bet.',
  facing_raise: 'You faced a raise.',
  other: '',
};

function leadSentence(d) {
  switch (d.action) {
    case 'fold':
      return d.toCall > 0 ? `You folded to ${bb(d.toCall)} with ${bb(d.pot)} in the pot.` : 'You folded.';
    case 'check':
      return `You checked with ${bb(d.pot)} in the pot.`;
    case 'call':
      return `You called ${bb(d.toCall)} into ${bb(d.pot)}.`;
    case 'bet':
      return `You bet ${bb(d.size)} into ${bb(d.pot)}.`;
    default:
      return `You raised to ${bb(d.size)} with ${bb(d.pot)} in the pot.`;
  }
}

function equitySentence(d) {
  if (d.equity === null || d.equity === undefined) return '';
  if (d.neededEquity !== null && d.neededEquity !== undefined) {
    return `You needed ${pct(d.neededEquity)} equity and had about ${pct(d.equity)} against their likely range.`;
  }
  return `Your equity against their likely range was about ${pct(d.equity)}.`;
}

const VERDICT = {
  chart: (d, x) => (x.chart
    ? `The preflop chart plays your hand this way ${pct(x.chart.chosenFreq)} of the time, so it is a sound choice.`
    : 'This matches the preflop chart.'),
  best: (d, x) => (x.chosenEv === null ? 'That was the best option.' : `That was the best option, worth about ${formatEv(x.chosenEv)}.`),
  overfold: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  loose_call: (d) => `Folding loses nothing; calling cost about ${bb(d.evLoss)}.`,
  too_passive: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  too_aggressive: (d, x) => `${x.bestLabel} was worth about ${formatEv(x.bestEv)}; ${lower(x.chosenLabel)} was worth ${formatEv(x.chosenEv)} and cost about ${bb(d.evLoss)}.`,
  sizing: (d, x) => `${x.bestLabel} was worth about ${bb(d.evLoss)} more than ${lower(x.chosenLabel)}.`,
};

// Spot-specific wording where the family changes the lesson.
const OVERRIDES = {
  'vs_3bet.overfold': (d, x) => `Folding to 3-bets too often is easy to exploit: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  'open.too_passive': (d, x) => `Open with a raise: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  'cbet.too_passive': (d, x) => `As the last raiser you can often keep betting: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)} against ${formatEv(x.chosenEv)} for ${lower(x.chosenLabel)}, about ${bb(d.evLoss)} more.`,
  'cbet.too_aggressive': (d, x) => `Not every board is worth a continuation bet: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, and ${lower(x.chosenLabel)} cost about ${bb(d.evLoss)}.`,
  'facing_bet.overfold': (d, x) => `Folding too often to bets is easy to exploit: ${lower(x.bestLabel)} was worth about ${formatEv(x.bestEv)}, so folding cost about ${bb(d.evLoss)}.`,
  'facing_raise.loose_call': (d) => `Raises are usually strong. Folding loses nothing; calling cost about ${bb(d.evLoss)}.`,
};

/**
 * @param {object} d DecisionRecord
 * @param {{ chart?:{ chosenFreq:number }|null }} [extras] chartCheck output for chart-graded preflop decisions
 */
export function explainDecision(d, { chart = null } = {}) {
  const family = spotFamily(d.spot);
  const type = errorType(d);
  const evByOption = d.recommended.evByOption;
  const chosenKey = optionKey(d.action, d.size);
  const bestKey = optionKey(d.recommended.action, d.recommended.size);
  const x = {
    chart,
    chosenEv: Object.hasOwn(evByOption, chosenKey) ? evByOption[chosenKey] : null,
    bestEv: Object.hasOwn(evByOption, bestKey) ? evByOption[bestKey] : 0,
    chosenLabel: optionLabel(chosenKey),
    bestLabel: optionLabel(bestKey),
  };
  const verdict = (OVERRIDES[`${family}.${type}`] ?? VERDICT[type])(d, x);
  const debatable = d.confident ? '' : 'The simulation could not clearly separate the top options, so treat this grade as debatable.';
  return [CONTEXT[family], leadSentence(d), equitySentence(d), verdict, debatable].filter(Boolean).join(' ');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/analysis/explain.test.js`
Expected: PASS (11 tests). Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/explain.js src/private/trainers/poker/analysis/explain.test.js
git commit -m "Add poker decision explanation templates by spot family and error type

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 9: Analysis worker, client and hand queue

**Files:**
- Create: `src/private/trainers/poker/analysis/worker/protocol.js`
- Create: `src/private/trainers/poker/analysis/worker/analysisClient.js`
- Create: `src/private/trainers/poker/analysis/worker/analysisWorker.js`
- Create: `src/private/trainers/poker/analysis/handQueue.js`
- Test: `src/private/trainers/poker/analysis/worker/analysisWorker.test.js`
- Test: `src/private/trainers/poker/analysis/handQueue.test.js`

**Interfaces:**
- Consumes: `gradeHand` (Task 7); tests use `buildLog`.
- Produces:
  - `protocol.js`: `ANALYSIS_REQUEST = { GRADE:'grade' }`, `ANALYSIS_RESPONSE = { GRADED:'graded', ERROR:'error' }`, `createAnalysisHandler({ gradeHand }) → (message) → response`. Request `{ type:'grade', id:int, record:{ id, heroSeat, lineup, events }, budgetMs?:number }`; response `{ type:'graded', id, analysis }` or `{ type:'error', id, error:{ message } }`.
  - `analysisClient.js`: `ANALYSIS_TIMEOUT_MS = 6000`, `REGRADE_TIMEOUT_MS = 30000`, `createAnalysisClient({ createWorker?, timeoutMs? }) → { analyze(record, { timeoutMs?, budgetMs? }?) → Promise<Analysis>, dispose() }` (starts the worker lazily; a timeout terminates the worker and rejects every pending request with `analysis timed out`; the next call starts a new worker; a worker `error` event rejects pending requests), `sharedAnalysisClient() → client` (one per page).
  - `analysisWorker.js`: the module worker entry.
  - `handQueue.js`: `QUEUE_TIMEOUT_MS = 8000`, `emptyAnalysis() → { decisions: [], heroAllinEv: null }`, `isAnalysis(value) → boolean`, `createHandAnalysisQueue({ analyze, deliver, timeoutMs?, setTimer?, clearTimer?, logger? }) → { push(record) → Promise, pending() → number, flushNow(), drain() → Promise }`.

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/analysis/worker/analysisWorker.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildLog } from '../../bots/testHands.js';
import { ANALYSIS_REQUEST, ANALYSIS_RESPONSE, createAnalysisHandler } from './protocol.js';
import { ANALYSIS_TIMEOUT_MS, REGRADE_TIMEOUT_MS, createAnalysisClient } from './analysisClient.js';

const WALK = { id: 'walk', heroSeat: 1, lineup: [], events: buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']) };
const clone = (x) => structuredClone(x);

describe('createAnalysisHandler', () => {
  it('grades a record and passes a positive budget through', () => {
    const gradeHand = vi.fn(() => ({ decisions: [], heroAllinEv: 1.5 }));
    const handle = createAnalysisHandler({ gradeHand });
    expect(ANALYSIS_REQUEST.GRADE).toBe('grade');
    expect(handle(clone({ type: 'grade', id: 4, record: WALK, budgetMs: 900 }))).toEqual({
      type: ANALYSIS_RESPONSE.GRADED, id: 4, analysis: { decisions: [], heroAllinEv: 1.5 },
    });
    expect(gradeHand.mock.calls[0][1]).toEqual({ budgetMs: 900 });
    handle({ type: 'grade', id: 5, record: WALK });
    expect(gradeHand.mock.calls[1][1]).toEqual({});
  });

  it('answers malformed, unknown and failing requests with errors', () => {
    const handle = createAnalysisHandler({ gradeHand: () => { throw new Error('boom'); } });
    expect(handle(null)).toEqual({ type: 'error', id: null, error: { message: 'malformed message' } });
    expect(handle({ type: 'nope', id: 2 })).toEqual({ type: 'error', id: 2, error: { message: 'unknown message type: nope' } });
    expect(handle({ type: 'grade', id: 3, record: { id: 'x' } }).error.message).toBe('grade needs a record with id, heroSeat, lineup and events');
    expect(handle({ type: 'grade', id: 4, record: WALK })).toEqual({ type: 'error', id: 4, error: { message: 'boom' } });
  });
});

/** In-memory worker driven by a handler; `silent` never answers. */
function fakeWorker({ silent = false, gradeHand = () => ({ decisions: [], heroAllinEv: null }) } = {}) {
  const listeners = { message: [], error: [] };
  const handle = createAnalysisHandler({ gradeHand });
  const worker = {
    posted: [],
    terminated: false,
    addEventListener: (type, fn) => listeners[type].push(fn),
    postMessage(message) {
      worker.posted.push(message);
      if (!silent) queueMicrotask(() => listeners.message.forEach((fn) => fn({ data: handle(clone(message)) })));
    },
    terminate() {
      worker.terminated = true;
    },
    crash: (message) => listeners.error.forEach((fn) => fn({ message })),
  };
  return worker;
}

describe('createAnalysisClient', () => {
  it('starts the worker lazily and resolves analyses by id', async () => {
    expect([ANALYSIS_TIMEOUT_MS, REGRADE_TIMEOUT_MS]).toEqual([6000, 30000]);
    const worker = fakeWorker({ gradeHand: (record) => ({ decisions: [], heroAllinEv: record.id === 'walk' ? 2 : 3 }) });
    const createWorker = vi.fn(() => worker);
    const client = createAnalysisClient({ createWorker });
    expect(createWorker).not.toHaveBeenCalled();
    const [a, b] = await Promise.all([client.analyze(WALK), client.analyze({ ...WALK, id: 'other' }, { budgetMs: 500 })]);
    expect([a.heroAllinEv, b.heroAllinEv]).toEqual([2, 3]);
    expect(createWorker).toHaveBeenCalledTimes(1);
    expect(worker.posted.map((m) => [m.id, m.budgetMs])).toEqual([[1, undefined], [2, 500]]);
  });

  it('restarts the worker after a timeout and rejects what was pending', async () => {
    vi.useFakeTimers();
    try {
      const workers = [fakeWorker({ silent: true }), fakeWorker()];
      const client = createAnalysisClient({ createWorker: () => workers.shift(), timeoutMs: 100 });
      const results = Promise.allSettled([client.analyze(WALK), client.analyze(WALK, { timeoutMs: 1000 })]);
      vi.advanceTimersByTime(100);
      expect((await results).map((r) => r.reason?.message)).toEqual(['analysis timed out', 'analysis timed out']);
      const third = client.analyze(WALK);
      await vi.runAllTimersAsync();
      await expect(third).resolves.toEqual({ decisions: [], heroAllinEv: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects on a worker error and after dispose', async () => {
    const worker = fakeWorker({ silent: true });
    const client = createAnalysisClient({ createWorker: () => worker, timeoutMs: 10_000 });
    const pending = client.analyze(WALK);
    worker.crash('kaput');
    await expect(pending).rejects.toThrow('kaput');
    const second = client.analyze(WALK);
    client.dispose();
    await expect(second).rejects.toThrow('analysis client disposed');
    await expect(client.analyze(WALK)).rejects.toThrow('analysis client disposed');
  });

  it('rejects when the worker cannot be created', async () => {
    const client = createAnalysisClient({ createWorker: () => { throw new Error('no workers here'); } });
    await expect(client.analyze(WALK)).rejects.toThrow('no workers here');
  });
});

describe('analysisWorker entry', () => {
  it('posts graded responses for grade requests', async () => {
    const posted = [];
    let listener = null;
    vi.stubGlobal('self', { addEventListener: (type, fn) => { if (type === 'message') listener = fn; }, postMessage: (m) => posted.push(m) });
    try {
      await import('./analysisWorker.js');
      listener({ data: clone({ type: 'grade', id: 9, record: WALK }) });
      expect(posted).toEqual([{ type: 'graded', id: 9, analysis: { decisions: [], heroAllinEv: null } }]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
```

```js
// src/private/trainers/poker/analysis/handQueue.test.js
import { describe, it, expect, vi } from 'vitest';
import { QUEUE_TIMEOUT_MS, emptyAnalysis, isAnalysis, createHandAnalysisQueue } from './handQueue.js';

const quiet = () => ({ warn: vi.fn() });
const record = (n) => ({ id: `h${n}`, handNo: n });
const analysis = (n) => ({ decisions: [{ idx: n }], heroAllinEv: n });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe('handQueue helpers', () => {
  it('knows the empty analysis and valid shapes', () => {
    expect(QUEUE_TIMEOUT_MS).toBe(8000);
    expect(emptyAnalysis()).toEqual({ decisions: [], heroAllinEv: null });
    expect(isAnalysis(analysis(1))).toBe(true);
    expect(isAnalysis({ decisions: [], heroAllinEv: NaN })).toBe(false);
    expect(isAnalysis({ decisions: 'x', heroAllinEv: null })).toBe(false);
    expect(isAnalysis(null)).toBe(false);
  });
});

describe('createHandAnalysisQueue', () => {
  it('grades one hand at a time and delivers in push order', async () => {
    let active = 0;
    let maxActive = 0;
    const analyze = vi.fn(async (r) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await wait(r.handNo === 1 ? 15 : 0);
      active -= 1;
      return analysis(r.handNo);
    });
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger: quiet() });
    queue.push(record(1));
    queue.push(record(2));
    expect(queue.pending()).toBe(2);
    await queue.drain();
    expect(deliver.mock.calls).toEqual([[record(1), analysis(1)], [record(2), analysis(2)]]);
    expect(maxActive).toBe(1);
    expect(queue.pending()).toBe(0);
  });

  it('delivers the empty analysis on an error, an invalid result or a timeout', async () => {
    const logger = quiet();
    const results = [() => Promise.reject(new Error('boom')), () => ({ nope: true }), () => new Promise(() => {})];
    const analyze = vi.fn(() => results.shift()());
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, timeoutMs: 5, logger });
    [1, 2, 3].forEach((n) => queue.push(record(n)));
    await queue.drain();
    expect(deliver.mock.calls.map(([r, a]) => [r.handNo, a])).toEqual([[1, emptyAnalysis()], [2, emptyAnalysis()], [3, emptyAnalysis()]]);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('flushNow delivers every pending hand at once without grades and ignores late results', async () => {
    let release;
    const analyze = vi.fn(() => new Promise((resolve) => { release = () => resolve(analysis(1)); }));
    const deliver = vi.fn();
    const queue = createHandAnalysisQueue({ analyze, deliver, logger: quiet() });
    queue.push(record(1));
    queue.push(record(2));
    await vi.waitFor(() => expect(analyze).toHaveBeenCalledTimes(1));
    queue.flushNow();
    expect(deliver.mock.calls).toEqual([[record(1), emptyAnalysis()], [record(2), emptyAnalysis()]]);
    expect(queue.pending()).toBe(0);
    release();
    await queue.drain();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it('keeps going when deliver throws', async () => {
    const logger = quiet();
    const deliver = vi.fn(() => { throw new Error('storage full'); });
    const queue = createHandAnalysisQueue({ analyze: async (r) => analysis(r.handNo), deliver, logger });
    queue.push(record(1));
    queue.push(record(2));
    await queue.drain();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith('poker analysis: delivering a hand failed', expect.any(Error));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/analysis/worker/analysisWorker.test.js src/private/trainers/poker/analysis/handQueue.test.js`
Expected: FAIL, cannot find modules `./protocol.js`, `./analysisClient.js`, `./analysisWorker.js` and `./handQueue.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/analysis/worker/protocol.js
// Messages between the page and analysisWorker.js. The handler is pure given its dependencies, so it is
// tested in Node without a real Worker.
//   request:  { type:'grade', id:number, record:{ id, heroSeat, lineup, events }, budgetMs?:number }
//   response: { type:'graded', id, analysis:{ decisions, heroAllinEv } } | { type:'error', id, error:{ message } }

export const ANALYSIS_REQUEST = Object.freeze({ GRADE: 'grade' });
export const ANALYSIS_RESPONSE = Object.freeze({ GRADED: 'graded', ERROR: 'error' });

const isRecord = (r) => r !== null && typeof r === 'object' && typeof r.id === 'string'
  && Number.isInteger(r.heroSeat) && Array.isArray(r.lineup) && Array.isArray(r.events);

/** @param {{ gradeHand:(record:object, options:object) => object }} deps */
export function createAnalysisHandler({ gradeHand }) {
  return (message) => {
    const id = message && typeof message === 'object' && Number.isInteger(message.id) ? message.id : null;
    const fail = (text) => ({ type: ANALYSIS_RESPONSE.ERROR, id, error: { message: text } });
    if (id === null) return fail('malformed message');
    if (message.type !== ANALYSIS_REQUEST.GRADE) return fail(`unknown message type: ${message.type}`);
    if (!isRecord(message.record)) return fail('grade needs a record with id, heroSeat, lineup and events');
    const options = Number.isFinite(message.budgetMs) && message.budgetMs > 0 ? { budgetMs: message.budgetMs } : {};
    try {
      return { type: ANALYSIS_RESPONSE.GRADED, id, analysis: gradeHand(message.record, options) };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };
}
```

```js
// src/private/trainers/poker/analysis/worker/analysisClient.js
// Grading runs in its own module worker, separate from the bot worker, so a slow or stuck grading job never
// delays bot decisions. A timed-out job is killed with its worker; the next request starts a fresh one.
import { ANALYSIS_REQUEST, ANALYSIS_RESPONSE } from './protocol.js';

export const ANALYSIS_TIMEOUT_MS = 6000;
export const REGRADE_TIMEOUT_MS = 30000;

const defaultCreateWorker = () => new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' });

/**
 * @param {{ createWorker?:() => { postMessage:Function, addEventListener:Function, terminate:Function }, timeoutMs?:number }} [options]
 * @returns {{ analyze:(record:object, options?:{ timeoutMs?:number, budgetMs?:number }) => Promise<object>, dispose:() => void }}
 */
export function createAnalysisClient({ createWorker = defaultCreateWorker, timeoutMs = ANALYSIS_TIMEOUT_MS } = {}) {
  let worker = null;
  let nextId = 1;
  let disposed = false;
  const pending = new Map();

  const rejectAll = (error) => {
    for (const [id, entry] of [...pending]) {
      pending.delete(id);
      clearTimeout(entry.timer);
      entry.reject(error);
    }
  };
  const stop = () => {
    if (!worker) return;
    worker.terminate();
    worker = null;
  };
  const start = () => {
    if (worker) return worker;
    const created = createWorker();
    created.addEventListener('message', (event) => {
      const message = event.data;
      const entry = message ? pending.get(message.id) : undefined;
      if (!entry) return;
      pending.delete(message.id);
      clearTimeout(entry.timer);
      if (message.type === ANALYSIS_RESPONSE.GRADED) entry.resolve(message.analysis);
      else entry.reject(new Error(message.error?.message ?? 'analysis failed'));
    });
    created.addEventListener('error', (event) => {
      if (worker === created) stop();
      rejectAll(new Error(event.message ?? 'analysis worker crashed'));
    });
    worker = created;
    return created;
  };

  return {
    analyze(record, { timeoutMs: callTimeoutMs = timeoutMs, budgetMs } = {}) {
      if (disposed) return Promise.reject(new Error('analysis client disposed'));
      return new Promise((resolve, reject) => {
        let target;
        try {
          target = start();
        } catch (err) {
          reject(err);
          return;
        }
        const id = nextId;
        nextId += 1;
        const timer = setTimeout(() => {
          if (!pending.has(id)) return;
          // The worker is busy with a job that will not finish in time: kill it and everything queued behind it.
          stop();
          rejectAll(new Error('analysis timed out'));
        }, callTimeoutMs);
        pending.set(id, { resolve, reject, timer });
        target.postMessage({ type: ANALYSIS_REQUEST.GRADE, id, record, budgetMs });
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      rejectAll(new Error('analysis client disposed'));
      stop();
    },
  };
}

let shared = null;

/** The page's analysis client (the table and the review pages share one worker). */
export function sharedAnalysisClient() {
  shared ??= createAnalysisClient();
  return shared;
}
```

```js
// src/private/trainers/poker/analysis/worker/analysisWorker.js
// Module worker entry: new Worker(new URL('./analysisWorker.js', import.meta.url), { type: 'module' }).
import { gradeHand } from '../gradeHand.js';
import { createAnalysisHandler } from './protocol.js';

const handle = createAnalysisHandler({ gradeHand });

self.addEventListener('message', (event) => {
  self.postMessage(handle(event.data));
});
```

```js
// src/private/trainers/poker/analysis/handQueue.js
// Grades finished hands one at a time and hands each to `deliver(record, analysis)` in push order (spec §6.1:
// grade, then save). Grading never blocks saving: an error, an invalid result or a timeout delivers the empty
// analysis, and flushNow() delivers everything pending at once (page hide, leaving the table). Hands delivered
// without grades are re-graded later from the review pages.

export const QUEUE_TIMEOUT_MS = 8000;

export const emptyAnalysis = () => ({ decisions: [], heroAllinEv: null });

export const isAnalysis = (value) => value !== null && typeof value === 'object' && Array.isArray(value.decisions)
  && (value.heroAllinEv === null || Number.isFinite(value.heroAllinEv));

/**
 * @param {{ analyze:(record:object) => Promise<object>, deliver:(record:object, analysis:object) => void, timeoutMs?:number,
 *   setTimer?:typeof setTimeout, clearTimer?:typeof clearTimeout, logger?:Pick<Console, 'warn'> }} deps
 */
export function createHandAnalysisQueue({
  analyze, deliver, timeoutMs = QUEUE_TIMEOUT_MS, setTimer = setTimeout, clearTimer = clearTimeout, logger = console,
}) {
  const waiting = [];
  let tail = Promise.resolve();

  const handOver = (item, analysis) => {
    if (item.delivered) return;
    item.delivered = true;
    waiting.splice(waiting.indexOf(item), 1);
    try {
      deliver(item.record, analysis);
    } catch (err) {
      logger.warn('poker analysis: delivering a hand failed', err);
    }
  };

  const analyzeWithTimeout = (record) => new Promise((resolve) => {
    const timer = setTimer(() => {
      logger.warn('poker analysis timed out');
      resolve(emptyAnalysis());
    }, timeoutMs);
    Promise.resolve()
      .then(() => analyze(record))
      .then(
        (analysis) => (isAnalysis(analysis) ? analysis : emptyAnalysis()),
        (err) => {
          logger.warn('poker analysis failed', err);
          return emptyAnalysis();
        },
      )
      .then((analysis) => {
        clearTimer(timer);
        resolve(analysis);
      });
  });

  return {
    push(record) {
      const item = { record, delivered: false, release: null };
      // Resolves when flushNow() hands the record over, so a grading job still running for it
      // does not hold back the hands pushed after the flush.
      const flushed = new Promise((resolve) => { item.release = resolve; });
      waiting.push(item);
      tail = tail.then(async () => {
        if (item.delivered) return;
        const analysis = await Promise.race([analyzeWithTimeout(record), flushed]);
        handOver(item, analysis);
      });
      return tail;
    },
    pending: () => waiting.length,
    flushNow() {
      for (const item of [...waiting]) {
        handOver(item, emptyAnalysis());
        item.release(null);
      }
    },
    drain: () => tail,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/analysis/worker/analysisWorker.test.js src/private/trainers/poker/analysis/handQueue.test.js`
Expected: PASS (worker: 7 tests, queue: 5 tests). Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/analysis/worker/protocol.js src/private/trainers/poker/analysis/worker/analysisClient.js src/private/trainers/poker/analysis/worker/analysisWorker.js src/private/trainers/poker/analysis/worker/analysisWorker.test.js src/private/trainers/poker/analysis/handQueue.js src/private/trainers/poker/analysis/handQueue.test.js
git commit -m "Add poker analysis worker, client with restarts and ordered hand queue

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Grade hands at the table

**Files:**
- Modify: `src/private/trainers/poker/lib/tableDriver.js`
- Modify: `src/private/trainers/poker/lib/tableDriver.test.js` (append a describe block)
- Modify: `src/private/trainers/poker/lib/useTableSession.js`
- Modify: `src/private/trainers/poker/ui/table/SessionEnd.jsx`
- Modify: `src/private/trainers/poker/ui/table/table.css` (one rule)

**Interfaces:**
- Consumes: `createHandAnalysisQueue`, `QUEUE_TIMEOUT_MS` (Task 9); `sharedAnalysisClient` (Task 9); Phase 2 `createTableDriver`, `useTableSession`, `SessionEnd`; Phase 4's persistence `onHandComplete(record, analysis = {})`.
- Produces:
  - `createTableDriver` options gain `analyzeHand?: (record) => Promise<{ decisions, heroAllinEv }>` (default `null`: `onHandComplete(record)` exactly as before) and `analysisTimeoutMs?` (default `QUEUE_TIMEOUT_MS`). With `analyzeHand`, every hand is delivered as `onHandComplete(record, analysis)` in order, and `onSessionEnd` is emitted after every pending hand.
  - The driver gains `flushAnalyses()`; `abandon()` delivers pending hands at once with the empty analysis before `onSessionEnd`.
  - `useTableSession` grades hands in the shared analysis worker, forwards `analysis` to `onHandComplete`, and flushes pending hands on `pagehide`.
  - `SessionEnd` links to `/me/poker/session/:id`.

- [ ] **Step 1: Write the failing driver tests**

Append this block at the end of `src/private/trainers/poker/lib/tableDriver.test.js` (it reuses the file's `setup`, `settle` and `heroPlaysUntil` helpers):

```js
describe('hand analysis (Phase 5)', () => {
  const graded = (record) => ({ decisions: [], heroAllinEv: record.handNo });

  it('delivers onHandComplete(record, analysis) in hand order', async () => {
    const analyzeHand = vi.fn(async (record) => graded(record));
    const { driver, onHandComplete } = setup({ analyzeHand });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 2);
    await vi.waitFor(() => expect(onHandComplete).toHaveBeenCalledTimes(2));
    expect(onHandComplete.mock.calls.map(([r, a]) => [r.handNo, a.heroAllinEv])).toEqual([[1, 1], [2, 2]]);
  });

  it('delivers the empty analysis when grading never answers', async () => {
    const analyzeHand = vi.fn(() => new Promise(() => {}));
    const { driver, onHandComplete } = setup({ analyzeHand, analysisTimeoutMs: 5 });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    await vi.waitFor(() => expect(onHandComplete).toHaveBeenCalledTimes(1));
    expect(onHandComplete.mock.calls[0][1]).toEqual({ decisions: [], heroAllinEv: null });
  });

  it('emits onSessionEnd only after the last hand is delivered', async () => {
    let release = null;
    const analyzeHand = vi.fn(() => new Promise((resolve) => { release = () => resolve({ decisions: [], heroAllinEv: 3 }); }));
    const order = [];
    const { driver } = setup({
      analyzeHand, onHandComplete: vi.fn(() => order.push('hand')), onSessionEnd: vi.fn(() => order.push('end')),
    });
    driver.start();
    await settle(driver);
    driver.getUp();
    driver.act({ action: 'fold' });
    await vi.waitFor(() => expect(driver.getSession().phase).toBe('ended'));
    await vi.waitFor(() => expect(analyzeHand).toHaveBeenCalledTimes(1));
    expect(order).toEqual([]);
    release();
    await vi.waitFor(() => expect(order).toEqual(['hand', 'end']));
  });

  it('abandon and flushAnalyses deliver pending hands at once without grades', async () => {
    const analyzeHand = vi.fn(() => new Promise(() => {}));
    const order = [];
    const { driver } = setup({
      analyzeHand, onHandComplete: vi.fn((r, a) => order.push(['hand', r.handNo, a])), onSessionEnd: vi.fn(() => order.push(['end'])),
    });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    await vi.waitFor(() => expect(analyzeHand).toHaveBeenCalledTimes(1));
    driver.flushAnalyses();
    expect(order).toEqual([['hand', 1, { decisions: [], heroAllinEv: null }]]);
    await heroPlaysUntil(driver, 2);
    await vi.waitFor(() => expect(analyzeHand).toHaveBeenCalledTimes(2));
    driver.abandon();
    expect(order.slice(1)).toEqual([['hand', 2, { decisions: [], heroAllinEv: null }], ['end']]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/tableDriver.test.js`
Expected: FAIL in the new block only: `onHandComplete` is called without a second argument, and `driver.flushAnalyses is not a function`. Every existing test still passes.

- [ ] **Step 3: Change the driver**

In `src/private/trainers/poker/lib/tableDriver.js`:

1. Add this import below the existing `import { legalActions } from '../engine/handState.js';`:

```js
import { createHandAnalysisQueue, QUEUE_TIMEOUT_MS } from '../analysis/handQueue.js';
```

2. Replace the whole `endOnce` function with:

```js
function endOnce(d) {
  if (d.ended || d.disposed) return;
  d.ended = true;
  const summary = sessionSummary(d.current, d.opts.now());
  const emit = () => safeCall('onSessionEnd', d.opts.onSessionEnd, summary);
  // Hands still being graded are delivered first, so the session close always follows its hands.
  if (d.analysis && d.analysis.pending() > 0) d.analysis.drain().then(emit);
  else emit();
}
```

3. In `settleHand`, replace these two lines:

```js
  // The optional second argument (analysis) arrives with Phase 5.
  safeCall('onHandComplete', onHandComplete, record);
```

with:

```js
  // With an analyzer the hand is graded first and delivered as onHandComplete(record, analysis).
  if (d.analysis) d.analysis.push(record);
  else safeCall('onHandComplete', onHandComplete, record);
```

4. In the JSDoc above `createTableDriver`, replace `onHandComplete?: (record:object) => void,` with:

```js
 *   onHandComplete?: (record:object, analysis?:{ decisions:object[], heroAllinEv:number|null }) => void,
 *   analyzeHand?: ((record:object) => Promise<object>)|null, analysisTimeoutMs?: number,
```

5. In `createTableDriver`, add `analyzeHand: null, analysisTimeoutMs: QUEUE_TIMEOUT_MS,` to the defaults object right after `decideTimeoutMs: DEFAULT_DECIDE_TIMEOUT_MS,`, and directly after the line that creates `const d = { … };` add:

```js
  d.analysis = opts.analyzeHand
    ? createHandAnalysisQueue({
      analyze: opts.analyzeHand,
      deliver: (record, analysis) => safeCall('onHandComplete', opts.onHandComplete, record, analysis),
      timeoutMs: opts.analysisTimeoutMs,
      logger: opts.logger,
    })
    : null;
```

6. In the returned object, make `abandon()` flush first and add `flushAnalyses()` after it:

```js
    /** Leaves at once (page closed or navigated away). Emits onSessionEnd if it has not been emitted. */
    abandon() {
      d.analysis?.flushNow();
      if (d.started && !d.ended) {
        d.current = abandonSession(d.current);
        endOnce(d);
      }
      d.disposed = true;
    },
    /** Delivers every hand still being graded now, without grades (page hide); they are re-graded later. */
    flushAnalyses() {
      d.analysis?.flushNow();
    },
```

- [ ] **Step 4: Run the driver tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/tableDriver.test.js`
Expected: PASS, including every pre-existing test (without `analyzeHand` nothing changes).

- [ ] **Step 5: Grade in the worker from the session hook**

In `src/private/trainers/poker/lib/useTableSession.js`:

1. Add the import below the other imports:

```js
import { sharedAnalysisClient } from '../analysis/worker/analysisClient.js';
```

2. In the `createTableDriver({ … })` call, replace:

```js
      onHandComplete: (record) => callbacks.current.onHandComplete(record),
```

with:

```js
      analyzeHand: (record) => sharedAnalysisClient().analyze(record),
      onHandComplete: (record, analysis) => callbacks.current.onHandComplete(record, analysis),
```

3. Directly after `driverRef.current = driver;` add:

```js
    // Closing the tab skips React cleanup: hand any hand still being graded to the outbox now.
    const onPageHide = () => driver.flushAnalyses();
    window.addEventListener('pagehide', onPageHide);
```

and make the effect cleanup remove it first:

```js
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      clearTimeout(timer);
      driver.abandon();
      runner.dispose();
      driverRef.current = null;
    };
```

(Keep any other cleanup lines Phases 3 and 4 added, in their current order, after the `removeEventListener` line.)

4. In the hook's JSDoc, change `onHandComplete:(record:object) => void` to `onHandComplete:(record:object, analysis?:object) => void`.

- [ ] **Step 6: Link the session end panel to the review**

In `src/private/trainers/poker/ui/table/SessionEnd.jsx`, replace:

```jsx
      <p className="pk-muted">Sessions are not saved yet, so this session has no review.</p>
      <Link to="/me/poker" className="pk-btn pk-btn--raise" data-hot>Back to the lobby</Link>
```

with:

```jsx
      <p className="pk-muted">Each hand is graded when it ends. The review fills in as hands finish saving.</p>
      <div className="pk-end__links">
        <Link to={`/me/poker/session/${encodeURIComponent(session.id)}`} className="pk-btn pk-btn--raise" data-hot>Review this session</Link>
        <Link to="/me/poker" className="pk-btn" data-hot>Back to the lobby</Link>
      </div>
```

If Phase 4 Task 11 already changed that paragraph, replace whatever paragraph and lobby link sit in the same place. In `src/private/trainers/poker/ui/table/table.css`, add below the `.pk .pk-end__bots` rule:

```css
.pk .pk-end__links { display: flex; flex-wrap: wrap; gap: 12px; }
```

- [ ] **Step 7: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/table/TablePage.jsx --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: all pass.

Run: `npm run build`
Expected: `✓ built`, and the output lists an `analysisWorker-*.js` asset (the module worker chunk). Only the existing chunk-size warning.

- [ ] **Step 8: Commit**

```bash
git add src/private/trainers/poker/lib/tableDriver.js src/private/trainers/poker/lib/tableDriver.test.js src/private/trainers/poker/lib/useTableSession.js src/private/trainers/poker/ui/table/SessionEnd.jsx src/private/trainers/poker/ui/table/table.css
git commit -m "Grade poker hands in the analysis worker before saving, never blocking the save

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Hands API: one hand, ungraded hands and the re-grade

**Files:**
- Modify: `api/_lib/pokerSchemas.js`
- Modify: `api/_lib/pokerSchemas.test.js` (append a describe block)
- Modify: `api/trainers/poker/hands.js` (full file below)
- Modify: `api/trainers/poker/hands.test.js` (one test replaced, describe blocks appended)
- Optional: `api/trainers/poker/realDb.test.js` (Step 7)

**Interfaces:**
- Consumes: Phase 4 `handItem`, `decision` schema, `guard`, `sendError`, `getSql`, `authConfig`, `sendSessionNotFound`, `replayHandRecord`, `mockSql` with `transaction`; fixtures `findHandRecord`, `heroActed`, `heroDecision`, `pokerHandId`, `POKER_SESSION_ID`.
- Produces:
  - `pokerSchemas.js`: `export const decision` (was internal), `decisionProblems(decisions, events, heroSeat) → { index, message }[]` (used by `handItem`), `MAX_GRADES_PER_BATCH = 20`, `MAX_UNGRADED_PAGE = 20`, `queryInt(min, max)`, `handIdQuery`, `ungradedHandsQuery` (`{ ungraded:'1', sessionId, belowVersion, afterHandNo = 0, limit = 10 }`), `handGradesBatch` (`{ grades: [{ handId, analysisVersion, decisions (1–40, each with the grade's analysisVersion), heroAllinEv:number|null }] (1–20, distinct handId) }`).
  - `GET /api/trainers/poker/hands?id=` → 200 `{ hand: { id, sessionId, handNo, playedAt, buttonSeat, heroSeat, lineup, events, pot, heroNet, heroAllinEv, showdown, heroActions, prevHandId, nextHandId }, decisions: DecisionRow[] }` (DecisionRow = DecisionRecord fields, ordered by idx); 404 `NOT_FOUND`.
  - `GET /api/trainers/poker/hands?ungraded=1&sessionId=&belowVersion=&afterHandNo=&limit=` → 200 `{ hands: [{ id, handNo, heroSeat, lineup, events }], nextAfterHandNo: number|null }`: hands with `hero_actions > 0` whose max decision `analysis_version` (0 without decisions) is below `belowVersion`, ordered by `hand_no`.
  - `PATCH /api/trainers/poker/hands` body `handGradesBatch` → 200 `{ updated: string[], skipped: string[], missing: string[] }`; 400 `VALIDATION_ERROR` with `details.problems: [{ path, message }]` when a decision does not match the stored events.

- [ ] **Step 1: Write the failing schema tests**

In `api/_lib/pokerSchemas.test.js`, extend the import from `./pokerSchemas.js` with `ungradedHandsQuery, handGradesBatch, decisionProblems, MAX_GRADES_PER_BATCH, MAX_UNGRADED_PAGE`, then append:

```js
describe('re-grade schemas', () => {
  it('coerces the ungraded hands query with defaults', () => {
    expect(ok(ungradedHandsQuery, { ungraded: '1', sessionId: POKER_SESSION_ID, belowVersion: '2' })).toEqual({
      ungraded: '1', sessionId: POKER_SESSION_ID, belowVersion: 2, afterHandNo: 0, limit: 10,
    });
    expect(MAX_UNGRADED_PAGE).toBe(20);
    for (const bad of [{ belowVersion: '0' }, { limit: '21' }, { afterHandNo: '-1' }, { sessionId: 'x' }, { ungraded: 'yes' }]) {
      expect(ungradedHandsQuery.safeParse({ ungraded: '1', sessionId: POKER_SESSION_ID, belowVersion: '1', ...bad }).success, JSON.stringify(bad)).toBe(false);
    }
  });

  it('caps grade batches and requires matching versions, decisions and distinct hands', () => {
    const hand = findHandRecord(heroActed);
    const grade = { handId: hand.id, analysisVersion: 1, decisions: [heroDecision(hand)], heroAllinEv: null };
    expect(MAX_GRADES_PER_BATCH).toBe(20);
    expect(ok(handGradesBatch, { grades: [grade] }).grades).toHaveLength(1);
    expect(handGradesBatch.safeParse({ grades: Array.from({ length: 21 }, (_, i) => ({ ...grade, handId: pokerHandId(i + 1) })) }).success).toBe(false);
    expect(messages(handGradesBatch, { grades: [grade, grade] })).toContain('duplicate handId in batch');
    expect(messages(handGradesBatch, { grades: [{ ...grade, analysisVersion: 2 }] })).toContain('decision analysisVersion must match the grade');
    expect(handGradesBatch.safeParse({ grades: [{ ...grade, decisions: [] }] }).success).toBe(false);
  });

  it('reports decision problems against a hand log', () => {
    const hand = findHandRecord(heroActed);
    const d = heroDecision(hand);
    expect(decisionProblems([d], hand.events, hand.heroSeat)).toEqual([]);
    expect(decisionProblems([d, d], hand.events, hand.heroSeat)).toEqual([{ index: 1, message: 'duplicate decision idx' }]);
    expect(decisionProblems([{ ...d, idx: 0 }], hand.events, hand.heroSeat)).toEqual([
      { index: 0, message: 'decision idx must point at a hero action with the same action' },
    ]);
  });
});
```

- [ ] **Step 2: Write the failing handler tests**

In `api/trainers/poker/hands.test.js`, replace the test `it('405 for GET', …)` with:

```js
  it('405 for PUT', async () => {
    const res = await call(db(), { method: 'PUT' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, PATCH');
  });
```

Then append at the end of the file:

```js
describe('GET /api/trainers/poker/hands?id=', () => {
  const ID = pokerHandId(7);

  it('400 for a bad id and 404 when the hand is missing', async () => {
    let res = await call(mockSql(), { method: 'GET', query: { id: 'nope' } });
    expect(res.statusCode).toBe(400);
    res = await call(mockSql([[], []]), { method: 'GET', query: { id: ID } });
    expect(res.statusCode).toBe(404);
    expect(res.body).toEqual({ error: 'Hand not found', code: 'NOT_FOUND' });
  });

  it('returns one hand with its events, neighbours and decisions', async () => {
    const hand = { id: ID, handNo: 7, events: [{ type: 'start' }], prevHandId: null, nextHandId: pokerHandId(8) };
    const decisions = [{ idx: 9, grade: 'good' }];
    const sql = mockSql((text) => (text.includes('AS "prevHandId"') ? [hand] : decisions));
    const res = await call(sql, { method: 'GET', query: { id: ID } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hand, decisions });
    const [handQuery, decisionQuery] = sql.queries;
    for (const fragment of ['FROM poker_hands h WHERE h.id =', 'h.events', 'ORDER BY p.hand_no DESC LIMIT 1', 'ORDER BY n.hand_no LIMIT 1']) {
      expect(handQuery.text).toContain(fragment);
    }
    expect(handQuery.values).toEqual([ID]);
    expect(decisionQuery.text).toContain('FROM poker_decisions WHERE hand_id =');
    expect(decisionQuery.text).toContain('ORDER BY idx');
  });
});

describe('GET /api/trainers/poker/hands?ungraded=1', () => {
  const query = (extra = {}) => ({ ungraded: '1', sessionId: POKER_SESSION_ID, belowVersion: '1', ...extra });

  it('400 for a bad query before touching the database', async () => {
    const sql = mockSql();
    for (const bad of [{ sessionId: 'x' }, { belowVersion: '0' }, { limit: '21' }, { ungraded: 'yes' }]) {
      const res = await call(sql, { method: 'GET', query: query(bad) });
      expect(res.statusCode, JSON.stringify(bad)).toBe(400);
    }
    expect(sql.queries).toHaveLength(0);
  });

  it('pages hands without current grades after a cursor', async () => {
    const rows = [5, 6, 9].map((handNo) => ({ id: pokerHandId(handNo), handNo, heroSeat: 0, lineup: [], events: [] }));
    const sql = mockSql([rows]);
    const res = await call(sql, { method: 'GET', query: query({ afterHandNo: '4', limit: '2' }) });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ hands: rows.slice(0, 2), nextAfterHandNo: 6 });
    const [q] = sql.queries;
    for (const fragment of ['h.hero_actions > 0', 'max(d.analysis_version)', 'ORDER BY h.hand_no']) expect(q.text).toContain(fragment);
    expect(q.values).toEqual([POKER_SESSION_ID, 4, 1, 3]);
    const last = await call(mockSql([rows.slice(0, 1)]), { method: 'GET', query: query() });
    expect(last.body).toEqual({ hands: rows.slice(0, 1), nextAfterHandNo: null });
  });
});

describe('PATCH /api/trainers/poker/hands (re-grade)', () => {
  const first = findHandRecord(heroActed, { handNo: 1 });
  const second = findHandRecord(heroActed, { handNo: 2 });
  const grade = (hand, version = 2, overrides = {}) => ({
    handId: hand.id, analysisVersion: version, decisions: [heroDecision(hand, { analysisVersion: version })], heroAllinEv: null, ...overrides,
  });
  const stored = (...list) => list.map((h) => ({ id: h.id, heroSeat: h.heroSeat, events: h.events }));
  const patch = (sql, body) => call(sql, { method: 'PATCH', body });

  it('400 for an invalid batch before touching the database', async () => {
    const sql = mockSql();
    const mismatched = { ...grade(first), decisions: [heroDecision(first, { analysisVersion: 3 })] };
    for (const body of [{ grades: [] }, { grades: [grade(first), grade(first)] }, { grades: [mismatched] }]) {
      const res = await patch(sql, body);
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    }
    expect(sql.queries).toHaveLength(0);
  });

  it('400 when a decision does not point at a stored hero action', async () => {
    const sql = mockSql([stored(first)]);
    const bad = grade(first, 2, { decisions: [heroDecision(first, { analysisVersion: 2, idx: 0 })] });
    const res = await patch(sql, { grades: [bad] });
    expect(res.statusCode).toBe(400);
    expect(res.body.details.problems).toEqual([
      { path: ['grades', 0, 'decisions', 0, 'idx'], message: 'decision idx must point at a hero action with the same action' },
    ]);
    expect(sql.transactions).toHaveLength(0);
  });

  it('reports hands that are not stored without a transaction', async () => {
    const sql = mockSql([[]]);
    const res = await patch(sql, { grades: [grade(first)] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ updated: [], skipped: [], missing: [first.id] });
    expect(sql.transactions).toHaveLength(0);
  });

  it('locks the hands, then upserts newer grades and moves allin_adj_net in one statement', async () => {
    const sql = mockSql([stored(first, second)]);
    sql.transactionResult = [[{ id: first.id }, { id: second.id }], [{ id: first.id }]];
    const res = await patch(sql, { grades: [grade(first, 2, { heroAllinEv: 12.5 }), grade(second)] });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ updated: [first.id], skipped: [second.id], missing: [] });
    expect(sql.queries[0].text).toContain('SELECT id, hero_seat AS "heroSeat", events FROM poker_hands');
    expect(sql.transactions).toHaveLength(1);
    const [lock, upsert] = sql.transactions[0];
    expect(lock.text).toContain('ORDER BY id FOR UPDATE');
    for (const fragment of [
      'COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < i.analysis_version',
      'DELETE FROM poker_decisions d USING target t',
      'ON CONFLICT (hand_id, idx) DO UPDATE SET',
      'UPDATE poker_hands h SET hero_allin_ev = t.new_ev',
      'sum(COALESCE(new_ev, hero_net) - COALESCE(old_ev, hero_net))',
      'UPDATE poker_sessions s',
    ]) {
      expect(upsert.text).toContain(fragment);
    }
    const rows = JSON.parse(upsert.values[0]);
    expect(rows.map((r) => [r.hand_id, r.analysis_version, r.hero_allin_ev])).toEqual([[first.id, 2, 12.5], [second.id, 2, null]]);
    expect(rows[0].decisions[0]).toMatchObject({ idx: heroDecision(first).idx, to_call: 2, ev_loss: 1.5, analysis_version: 2 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run api/_lib/pokerSchemas.test.js api/trainers/poker/hands.test.js`
Expected: FAIL: the new schema exports are undefined, `405 for PUT` reports `Allow: POST`, and the GET/PATCH cases get 405.

- [ ] **Step 4: Change the schemas**

In `api/_lib/pokerSchemas.js`:

1. Change `const decision = z.object({` to `export const decision = z.object({`.

2. Directly above `export const handItem = z`, add:

```js
/** Problems with decisions against a hand log: a repeated idx, or an idx that is not a hero act with the same action. */
export function decisionProblems(decisions, events, heroSeat) {
  const problems = [];
  const seen = new Set();
  decisions.forEach((d, index) => {
    if (seen.has(d.idx)) problems.push({ index, message: 'duplicate decision idx' });
    seen.add(d.idx);
    const event = events[d.idx];
    if (!event || event.type !== 'act' || event.seat !== heroSeat || event.action !== d.action) {
      problems.push({ index, message: 'decision idx must point at a hero action with the same action' });
    }
  });
  return problems;
}
```

3. In `handItem`'s `superRefine`, replace the block from `const seen = new Set();` through the end of the `decisions.forEach((d, i) => { … });` call with:

```js
    decisionProblems(decisions, hand.events, hand.heroSeat)
      .forEach(({ index, message }) => issue(message, ['decisions', index, 'idx']));
```

4. At the end of the file, append:

```js
// Phase 5: one hand for the replayer, hands without current grades, and the re-grade batch.
export const MAX_GRADES_PER_BATCH = 20;
export const MAX_UNGRADED_PAGE = 20;

/** A query-string integer (Vercel passes strings; a repeated key arrives as an array and fails). */
export const queryInt = (min, max) => z.coerce.number().pipe(z.int().min(min).max(max));

export const handIdQuery = z.object({ id: uuid });

export const ungradedHandsQuery = z.object({
  ungraded: z.literal('1'),
  sessionId: uuid,
  belowVersion: queryInt(1, 1000),
  afterHandNo: queryInt(0, MAX_HAND_NO).default(0),
  limit: queryInt(1, MAX_UNGRADED_PAGE).default(10),
});

const handGrade = z
  .object({
    handId: uuid,
    analysisVersion: z.int().min(1).max(1000),
    decisions: z.array(decision).min(1).max(MAX_DECISIONS_PER_HAND),
    heroAllinEv: z.number().min(-MAX_POT).max(MAX_POT).nullable(),
  })
  .superRefine((grade, ctx) => {
    const issue = issuesFor(ctx);
    grade.decisions.forEach((d, i) => {
      if (d.analysisVersion !== grade.analysisVersion) issue('decision analysisVersion must match the grade', ['decisions', i, 'analysisVersion']);
    });
  });

export const handGradesBatch = z
  .object({ grades: z.array(handGrade).min(1).max(MAX_GRADES_PER_BATCH) })
  .superRefine(({ grades }, ctx) => {
    const issue = issuesFor(ctx);
    const ids = new Set();
    grades.forEach((grade, i) => {
      if (ids.has(grade.handId)) issue('duplicate handId in batch', ['grades', i, 'handId']);
      ids.add(grade.handId);
    });
  });
```

- [ ] **Step 5: Replace the hands handler**

Replace the whole of `api/trainers/poker/hands.js` with:

```js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { handsBatch, handIdQuery, ungradedHandsQuery, handGradesBatch, decisionProblems } from '../../_lib/pokerSchemas.js';
import { replayHandRecord } from '../../_lib/pokerReplay.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST  /api/trainers/poker/hands  { hands: [{ hand, decisions?, heroAllinEv? }] }  at most 50 hands, 40 decisions each
// PATCH /api/trainers/poker/hands  { grades: [{ handId, analysisVersion, decisions, heroAllinEv }] }  re-grade, at most 20
// GET   /api/trainers/poker/hands?id=                                        one hand with events and decisions (replayer)
// GET   /api/trainers/poker/hands?ungraded=1&sessionId=&belowVersion=&afterHandNo=&limit=   hands to re-grade
// Amounts are integer units (1 unit = 0.5 BB); EVs are fractional units.

const invalid = (res, message, error) => sendError(res, 400, 'VALIDATION_ERROR', message, z.flattenError(error));
const idList = (ids) => JSON.stringify(ids);

function handRow({ hand, heroAllinEv }) {
  const { facts } = replayHandRecord(hand); // already validated by handsBatch, so facts is set
  return {
    id: hand.id,
    session_id: hand.sessionId,
    hand_no: hand.handNo,
    played_at: hand.playedAt,
    button_seat: hand.buttonSeat,
    hero_seat: hand.heroSeat,
    hero_start_stack: facts.heroStartStack,
    hero_actions: facts.heroActions,
    lineup: hand.lineup,
    hole_cards: facts.holeCards,
    board: facts.board,
    events: hand.events,
    pot: hand.pot,
    hero_net: hand.heroNet,
    hero_allin_ev: heroAllinEv,
    showdown: hand.showdown,
  };
}

function decisionRows({ hand, decisions }) {
  return decisions.map((d) => ({
    hand_id: hand.id,
    idx: d.idx,
    street: d.street,
    position: d.position,
    spot: d.spot,
    action: d.action,
    size: d.size,
    pot: d.pot,
    to_call: d.toCall,
    equity: d.equity,
    needed_equity: d.neededEquity,
    recommended: d.recommended,
    ev_loss: d.evLoss,
    grade: d.grade,
    confident: d.confident,
    analysis_version: d.analysisVersion,
  }));
}

async function save(sql, req, res) {
  const parsed = handsBatch.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid hands payload', z.flattenError(parsed.error));
  }
  const { hands } = parsed.data;

  // Hands can reach the server before their session row (spec §6.3). Reject the whole batch
  // so the outbox retries it once the session is saved.
  const sessionIds = [...new Set(hands.map((item) => item.hand.sessionId))];
  const found = await sql`
    SELECT id, hero_seat AS "heroSeat" FROM poker_sessions
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(sessionIds)}::jsonb))`;
  const known = new Set(found.map((r) => r.id));
  const missing = sessionIds.filter((id) => !known.has(id));
  if (missing.length > 0) return sendSessionNotFound(res, missing);

  // A hand's heroSeat must match the seat the session was opened with; the table doesn't
  // change seats mid-session.
  const heroSeatBySession = new Map(found.map((r) => [r.id, r.heroSeat]));
  const mismatched = hands
    .filter((item) => item.hand.heroSeat !== heroSeatBySession.get(item.hand.sessionId))
    .map((item) => item.hand.id);
  if (mismatched.length > 0) {
    return sendError(res, 409, 'HERO_SEAT_MISMATCH', "heroSeat does not match the session's hero seat", { handIds: mismatched });
  }

  // One statement, so it is atomic. Conflicts on id or (session_id, hand_no) insert nothing,
  // and decisions and session totals only follow the hands this statement actually inserted.
  const [{ inserted }] = await sql`
    WITH ins AS (
      INSERT INTO poker_hands (id, session_id, hand_no, played_at, button_seat, hero_seat, hero_start_stack,
                               hero_actions, lineup, hole_cards, board, events, pot, hero_net, hero_allin_ev, showdown)
      SELECT x.id, x.session_id, x.hand_no, x.played_at, x.button_seat, x.hero_seat, x.hero_start_stack,
             x.hero_actions, x.lineup, x.hole_cards, x.board, x.events, x.pot, x.hero_net, x.hero_allin_ev, x.showdown
      FROM jsonb_to_recordset(${JSON.stringify(hands.map(handRow))}::jsonb)
        AS x(id uuid, session_id uuid, hand_no int, played_at timestamptz, button_seat int, hero_seat int,
             hero_start_stack int, hero_actions int, lineup jsonb, hole_cards jsonb, board text, events jsonb,
             pot int, hero_net int, hero_allin_ev numeric, showdown boolean)
      ON CONFLICT DO NOTHING
      RETURNING id, session_id, hero_net, hero_allin_ev, played_at
    ), d AS (
      INSERT INTO poker_decisions (hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
                                   needed_equity, recommended, ev_loss, grade, confident, analysis_version)
      SELECT y.hand_id, y.idx, y.street, y.position, y.spot, y.action, y.size, y.pot, y.to_call, y.equity,
             y.needed_equity, y.recommended, y.ev_loss, y.grade, y.confident, y.analysis_version
      FROM jsonb_to_recordset(${JSON.stringify(hands.flatMap(decisionRows))}::jsonb)
        AS y(hand_id uuid, idx int, street text, position text, spot text, action text, size int, pot int,
             to_call int, equity real, needed_equity real, recommended jsonb, ev_loss real, grade text,
             confident boolean, analysis_version int)
      JOIN ins ON ins.id = y.hand_id
    ), totals AS (
      -- A hand saved after its session was closed moves ended_at forward; an open session stays NULL.
      UPDATE poker_sessions s
      SET hands = s.hands + t.n, net = s.net + t.net, allin_adj_net = s.allin_adj_net + t.adj,
          ended_at = CASE WHEN s.ended_at IS NULL THEN NULL ELSE GREATEST(s.ended_at, t.last_played_at) END
      FROM (
        SELECT session_id, count(*)::int AS n, sum(hero_net)::int AS net,
               sum(COALESCE(hero_allin_ev, hero_net)) AS adj, max(played_at) AS last_played_at
        FROM ins GROUP BY session_id
      ) t
      WHERE s.id = t.session_id
    )
    SELECT count(*)::int AS inserted FROM ins`;

  if (inserted < hands.length) {
    const conflicts = await findHandNoConflicts(sql, hands);
    if (conflicts.length > 0) {
      return sendError(res, 409, 'HAND_NO_CONFLICT', 'handNo is already used by another hand in this session', { handIds: conflicts });
    }
  }
  return res.status(200).json({ saved: true, inserted, duplicate: hands.length - inserted });
}

// Hands the insert skipped are true duplicates only if their id is stored. A hand whose id is
// absent but whose (session_id, hand_no) is taken collided with a different hand. This read
// runs only when some hand was skipped, as its own statement so its snapshot also sees rows a
// concurrent request committed while the insert ran (CTEs in the insert share one snapshot).
async function findHandNoConflicts(sql, hands) {
  const keys = hands.map(({ hand }) => ({ id: hand.id, session_id: hand.sessionId, hand_no: hand.handNo }));
  const rows = await sql`
    SELECT x.id FROM jsonb_to_recordset(${JSON.stringify(keys)}::jsonb) AS x(id uuid, session_id uuid, hand_no int)
    WHERE NOT EXISTS (SELECT 1 FROM poker_hands p WHERE p.id = x.id)
      AND EXISTS (SELECT 1 FROM poker_hands p WHERE p.session_id = x.session_id AND p.hand_no = x.hand_no)`;
  const conflicting = new Set(rows.map((r) => r.id));
  return keys.map((k) => k.id).filter((id) => conflicting.has(id));
}

async function readHand(sql, req, res) {
  const parsed = handIdQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid hand id is required', parsed.error);
  const { id } = parsed.data;
  const [rows, decisions] = await Promise.all([
    sql`
      SELECT h.id, h.session_id AS "sessionId", h.hand_no AS "handNo", h.played_at AS "playedAt",
             h.button_seat AS "buttonSeat", h.hero_seat AS "heroSeat", h.lineup, h.events, h.pot,
             h.hero_net AS "heroNet", h.hero_allin_ev::float8 AS "heroAllinEv", h.showdown, h.hero_actions AS "heroActions",
             (SELECT p.id FROM poker_hands p WHERE p.session_id = h.session_id AND p.hand_no < h.hand_no
               ORDER BY p.hand_no DESC LIMIT 1) AS "prevHandId",
             (SELECT n.id FROM poker_hands n WHERE n.session_id = h.session_id AND n.hand_no > h.hand_no
               ORDER BY n.hand_no LIMIT 1) AS "nextHandId"
      FROM poker_hands h WHERE h.id = ${id}`,
    sql`
      SELECT idx, street, position, spot, action, size, pot, to_call AS "toCall", equity, needed_equity AS "neededEquity",
             recommended, ev_loss AS "evLoss", grade, confident, analysis_version AS "analysisVersion"
      FROM poker_decisions WHERE hand_id = ${id} ORDER BY idx`,
  ]);
  if (!rows[0]) return sendError(res, 404, 'NOT_FOUND', 'Hand not found');
  return res.status(200).json({ hand: rows[0], decisions });
}

async function listUngraded(sql, req, res) {
  const parsed = ungradedHandsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'Invalid ungraded hands query', parsed.error);
  const { sessionId, belowVersion, afterHandNo, limit } = parsed.data;
  const rows = await sql`
    SELECT h.id, h.hand_no AS "handNo", h.hero_seat AS "heroSeat", h.lineup, h.events
    FROM poker_hands h
    WHERE h.session_id = ${sessionId} AND h.hand_no > ${afterHandNo} AND h.hero_actions > 0
      AND COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < ${belowVersion}
    ORDER BY h.hand_no
    LIMIT ${limit + 1}`;
  const hands = rows.slice(0, limit);
  const nextAfterHandNo = rows.length > limit ? hands[hands.length - 1].handNo : null;
  return res.status(200).json({ hands, nextAfterHandNo });
}

// Re-grade (Phase 5). Statement 1 locks the hands, so statement 2 (a new snapshot in READ COMMITTED) sees any
// concurrent re-grade: the version guard and the allin_adj_net delta are then race-free, and a replay is a no-op.
async function saveGrades(sql, req, res) {
  const parsed = handGradesBatch.safeParse(req.body);
  if (!parsed.success) return invalid(res, 'Invalid grades payload', parsed.error);
  const { grades } = parsed.data;
  const ids = grades.map((g) => g.handId);
  const stored = await sql`
    SELECT id, hero_seat AS "heroSeat", events FROM poker_hands
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${idList(ids)}::jsonb))`;
  const byId = new Map(stored.map((row) => [row.id, row]));

  const problems = [];
  grades.forEach((grade, i) => {
    const row = byId.get(grade.handId);
    if (!row) return;
    for (const { index, message } of decisionProblems(grade.decisions, row.events, row.heroSeat)) {
      problems.push({ path: ['grades', i, 'decisions', index, 'idx'], message });
    }
  });
  if (problems.length > 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Decisions do not match the stored hands', { problems });

  const present = grades.filter((g) => byId.has(g.handId));
  const missing = ids.filter((id) => !byId.has(id));
  if (present.length === 0) return res.status(200).json({ updated: [], skipped: [], missing });

  const presentIds = present.map((g) => g.handId);
  const rows = present.map((g) => ({
    hand_id: g.handId,
    analysis_version: g.analysisVersion,
    hero_allin_ev: g.heroAllinEv,
    decisions: decisionRows({ hand: { id: g.handId }, decisions: g.decisions }),
  }));
  const [, updatedRows] = await sql.transaction([
    sql`
      SELECT id FROM poker_hands
      WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${idList(presentIds)}::jsonb))
      ORDER BY id FOR UPDATE`,
    sql`
      WITH input AS (
        SELECT g.hand_id, g.analysis_version, g.hero_allin_ev, g.decisions
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS g(hand_id uuid, analysis_version int, hero_allin_ev numeric, decisions jsonb)
      ), target AS (
        SELECT h.id, h.session_id, h.hero_net, h.hero_allin_ev AS old_ev, i.hero_allin_ev AS new_ev, i.decisions
        FROM input i JOIN poker_hands h ON h.id = i.hand_id
        WHERE COALESCE((SELECT max(d.analysis_version) FROM poker_decisions d WHERE d.hand_id = h.id), 0) < i.analysis_version
      ), fresh AS (
        SELECT t.id AS hand_id, y.idx, y.street, y.position, y.spot, y.action, y.size, y.pot, y.to_call, y.equity,
               y.needed_equity, y.recommended, y.ev_loss, y.grade, y.confident, y.analysis_version
        FROM target t
        CROSS JOIN LATERAL jsonb_to_recordset(t.decisions)
          AS y(idx int, street text, position text, spot text, action text, size int, pot int, to_call int, equity real,
               needed_equity real, recommended jsonb, ev_loss real, grade text, confident boolean, analysis_version int)
      ), removed AS (
        DELETE FROM poker_decisions d USING target t
        WHERE d.hand_id = t.id AND NOT EXISTS (SELECT 1 FROM fresh f WHERE f.hand_id = d.hand_id AND f.idx = d.idx)
        RETURNING d.hand_id
      ), upserted AS (
        INSERT INTO poker_decisions (hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
                                     needed_equity, recommended, ev_loss, grade, confident, analysis_version)
        SELECT hand_id, idx, street, position, spot, action, size, pot, to_call, equity,
               needed_equity, recommended, ev_loss, grade, confident, analysis_version
        FROM fresh
        ON CONFLICT (hand_id, idx) DO UPDATE SET
          street = EXCLUDED.street, position = EXCLUDED.position, spot = EXCLUDED.spot, action = EXCLUDED.action,
          size = EXCLUDED.size, pot = EXCLUDED.pot, to_call = EXCLUDED.to_call, equity = EXCLUDED.equity,
          needed_equity = EXCLUDED.needed_equity, recommended = EXCLUDED.recommended, ev_loss = EXCLUDED.ev_loss,
          grade = EXCLUDED.grade, confident = EXCLUDED.confident, analysis_version = EXCLUDED.analysis_version
        RETURNING hand_id
      ), hand_ev AS (
        UPDATE poker_hands h SET hero_allin_ev = t.new_ev FROM target t WHERE h.id = t.id RETURNING h.id
      ), session_adj AS (
        UPDATE poker_sessions s
        SET allin_adj_net = s.allin_adj_net + x.delta
        FROM (
          SELECT session_id, sum(COALESCE(new_ev, hero_net) - COALESCE(old_ev, hero_net)) AS delta
          FROM target GROUP BY session_id
        ) x
        WHERE s.id = x.session_id
        RETURNING s.id
      )
      SELECT t.id FROM target t ORDER BY t.id`,
  ]);
  const updated = updatedRows.map((row) => row.id);
  const updatedSet = new Set(updated);
  return res.status(200).json({ updated, skipped: presentIds.filter((id) => !updatedSet.has(id)), missing });
}

export function createPokerHandsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await save(sql, req, res);
      if (req.method === 'PATCH') return await saveGrades(sql, req, res);
      return req.query?.ungraded !== undefined ? await listUngraded(sql, req, res) : await readHand(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/hands failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerHandsHandler();
```

The POST path (`handRow`, `decisionRows`, `save`, `findHandNoConflicts`) is unchanged from Phase 4. If the merged file differs from the code above in those functions, keep the merged versions of those four functions and add only the new parts.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/pokerSchemas.test.js api/trainers/poker/hands.test.js api/_lib/pokerBundle.test.js`
Expected: PASS, including every pre-existing POST and schema test. Then run `npm test`. Expected: all pass.

- [ ] **Step 7: (Optional, with the controller's go-ahead) Real-database check**

Only if the Phase 4 opt-in real-DB test is set up (`POKER_DB_IT=1` plus `DATABASE_URL` for a migrated disposable branch). Append inside the `describe.skipIf(!RUN, …)` block of `api/trainers/poker/realDb.test.js`:

```js
  it('re-grades a stored hand once per analysis version and moves allin_adj_net by the all-in EV delta', async () => {
    const hand = findHandRecord(heroActed, { id: randomUUID(), sessionId, handNo: 60 });
    let res = await call(hands, { method: 'POST', body: { hands: [{ hand }] } });
    expect(res.body.inserted).toBe(1);
    const before = await call(sessions, { query: { id: sessionId } });
    const startAdj = before.body.session.allinAdjNet;
    const grade = (version, heroAllinEv) => ({
      grades: [{ handId: hand.id, analysisVersion: version, decisions: [heroDecision(hand, { analysisVersion: version })], heroAllinEv }],
    });

    res = await call(hands, { query: { ungraded: '1', sessionId, belowVersion: '1', afterHandNo: '59' } });
    expect(res.body.hands.map((h) => h.id)).toContain(hand.id);
    res = await call(hands, { method: 'PATCH', body: grade(1, hand.heroNet + 10) });
    expect(res.body).toEqual({ updated: [hand.id], skipped: [], missing: [] });
    res = await call(hands, { method: 'PATCH', body: grade(1, hand.heroNet + 99) });
    expect(res.body).toEqual({ updated: [], skipped: [hand.id], missing: [] });
    res = await call(hands, { method: 'PATCH', body: grade(2, hand.heroNet + 4) });
    expect(res.body.updated).toEqual([hand.id]);

    const after = await call(sessions, { query: { id: sessionId } });
    expect(after.body.session.allinAdjNet).toBeCloseTo(startAdj + 4, 2);
    const one = await call(hands, { query: { id: hand.id } });
    expect(one.body.hand.heroAllinEv).toBeCloseTo(hand.heroNet + 4, 2);
    expect(one.body.decisions.map((d) => d.analysisVersion)).toEqual([2]);
    res = await call(hands, { query: { ungraded: '1', sessionId, belowVersion: '2', afterHandNo: '59' } });
    expect(res.body.hands.map((h) => h.id)).not.toContain(hand.id);
  });
```

Run: `POKER_DB_IT=1 npx vitest run api/trainers/poker/realDb.test.js`
Expected: every case passes. A Postgres error here is a real bug in the Step 5 SQL: fix the query and keep the Step 2 fragments matching.

- [ ] **Step 8: Commit**

```bash
git add api/_lib/pokerSchemas.js api/_lib/pokerSchemas.test.js api/trainers/poker/hands.js api/trainers/poker/hands.test.js
git commit -m "Add poker hand read, ungraded hand list and version-guarded re-grade API

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If Step 7 was done, also stage `api/trainers/poker/realDb.test.js` in the same commit.

---

### Task 12: Session review API and recent sessions

**Files:**
- Create: `api/_lib/pokerReview.js`
- Test: `api/_lib/pokerReview.test.js`
- Modify: `api/_lib/pokerSchemas.js` (two query schemas)
- Modify: `api/trainers/poker/sessions.js` (full file below)
- Modify: `api/trainers/poker/sessions.test.js` (the `describe('GET', …)` block)
- Modify: `api/trainers/poker/realDb.test.js` (the read-back assertions that used the old response)

**Interfaces:**
- Consumes: `queryInt`, `MAX_HAND_NO` (Task 11 / Phase 4 `pokerSchemas.js`); `ANALYSIS_VERSION` (Task 1); `applyEvent` (engine); `positionsOf` (Phase 3 `bots/situation.js`); `pokerHandRecord` fixture.
- Produces:
  - `pokerSchemas.js`: `pokerReviewQuery = { id, afterHandNo = 0 }`, `recentSessionsQuery = { status:'recent' }`.
  - `pokerReview.js`: `REVIEW_PAGE_HANDS = 300`, `RECENT_SESSIONS_LIMIT = 20`, `COSTLIEST_LIMIT = 5`, `SEVERITY_GRADES`, `heroPosition(start, heroSeat) → position|null`, `shapeReviewHand(row) → ReviewHand`, `shapeSummary(session, row?) → ReviewSummary`, `shapeOpponents(rows, sessionLineup) → { seat, personaIds:string[] }[]`.
    - `ReviewHand = { id, handNo, playedAt, position, heroCards:string|null, board, pot, heroNet, heroAllinEv, showdown, decisions, evLoss, worstGrade:grade|null, confident:boolean|null, needsGrading:boolean }`
    - `ReviewSummary = { hands, net, allinAdjNet, decisions, evLoss, gradedHands, ungradedHands, grades:{ good, inaccuracy, mistake, blunder }, debatable }` (units)
  - `GET /api/trainers/poker/sessions?id=&afterHandNo=` → 200 `{ session, summary: ReviewSummary, costliest: CostlyDecision[], opponents, hands: ReviewHand[] (≤ 300, by hand_no), nextAfterHandNo: number|null }`, `CostlyDecision = { handId, handNo, idx, street, position, spot, action, size, pot, toCall, recommended, evLoss, grade, confident }`; 404 `NOT_FOUND`. No event logs and no bot hole cards.
  - `GET /api/trainers/poker/sessions?status=recent` → 200 `{ sessions: [{ id, startedAt, endedAt, tableMode, hands, net, allinAdjNet }] }` (latest 20 with hands).

- [ ] **Step 1: Write the failing tests**

```js
// api/_lib/pokerReview.test.js
import { describe, it, expect } from 'vitest';
import { pokerHandRecord } from './pokerTesting.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, SEVERITY_GRADES, heroPosition, shapeReviewHand, shapeSummary, shapeOpponents,
} from './pokerReview.js';

describe('review shaping', () => {
  it('keeps the documented limits', () => {
    expect([REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT]).toEqual([300, 20, 5]);
    expect(SEVERITY_GRADES).toEqual(['good', 'inaccuracy', 'mistake', 'blunder']);
  });

  it('computes the hero position from the start event', () => {
    const start = pokerHandRecord({ button: 0 }).events[0];
    expect(heroPosition(start, 0)).toBe('BTN');
    expect(heroPosition(start, 1)).toBe('SB');
    expect(heroPosition({ type: 'start' }, 0)).toBeNull();
  });

  it('shapes a hand row with hero cards only, the worst grade and whether it needs grading', () => {
    const start = pokerHandRecord({ button: 3 }).events[0];
    const row = {
      id: 'h1', handNo: 4, playedAt: '2026-09-16T18:04:00.000Z', heroSeat: 0, start,
      holeCards: [{ seat: 0, cards: 'AhKs' }, { seat: 1, cards: '2c2d' }], board: 'Qh7d2s', pot: 64, heroNet: -30,
      heroAllinEv: null, showdown: true, heroActions: 3, decisions: 3, evLoss: 7.5, severity: 2, confident: false, version: 1,
    };
    expect(shapeReviewHand(row)).toEqual({
      id: 'h1', handNo: 4, playedAt: '2026-09-16T18:04:00.000Z', position: 'UTG', heroCards: 'AhKs', board: 'Qh7d2s', pot: 64,
      heroNet: -30, heroAllinEv: null, showdown: true, decisions: 3, evLoss: 7.5, worstGrade: 'mistake', confident: false, needsGrading: false,
    });
    expect(shapeReviewHand({ ...row, decisions: 0, evLoss: 0, severity: null, confident: null, version: null })).toMatchObject({
      worstGrade: null, confident: null, needsGrading: true,
    });
    expect(shapeReviewHand({ ...row, heroActions: 0, severity: null, version: null }).needsGrading).toBe(false);
  });

  it('fills summary defaults and groups opponents by seat in order of appearance', () => {
    const session = { hands: 12, net: -20, allinAdjNet: -4.5, lineup: [{ seat: 2, personaId: 'moss' }] };
    expect(shapeSummary(session, undefined)).toEqual({
      hands: 12, net: -20, allinAdjNet: -4.5, decisions: 0, evLoss: 0, gradedHands: 0, ungradedHands: 0,
      grades: { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, debatable: 0,
    });
    const rows = [
      { seat: 3, personaId: 'viper' }, { seat: 1, personaId: 'rook' }, { seat: 1, personaId: 'ink' }, { seat: 1, personaId: 'rook' },
    ];
    expect(shapeOpponents(rows, session.lineup)).toEqual([{ seat: 1, personaIds: ['rook', 'ink'] }, { seat: 3, personaIds: ['viper'] }]);
    expect(shapeOpponents([], session.lineup)).toEqual([{ seat: 2, personaIds: ['moss'] }]);
  });
});
```

In `api/trainers/poker/sessions.test.js`:

1. Change the imports at the top to:

```js
import { createPokerSessionsHandler, OPEN_SESSIONS_LIMIT } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { POKER_SESSION_ID as ID, POKER_STARTED_AT, pokerSessionBody, pokerHandRecord } from '../../_lib/pokerTesting.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, shapeReviewHand, shapeSummary, shapeOpponents,
} from '../../_lib/pokerReview.js';
import { ANALYSIS_VERSION } from '../../../src/private/trainers/poker/analysis/version.js';
```

2. In `describe('GET', …)`, replace the test `it('400 without a valid id, 404 when missing, 200 with hands and decisions', …)` with:

```js
    it('400 without a valid id and 404 when missing', async () => {
      let res = await call(mockSql(), { query: { id: 'x' } });
      expect(res.statusCode).toBe(400);
      res = await call(mockSql([[]]), { query: { id: ID } });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');
    });

    const start = pokerHandRecord({ button: 2 }).events[0];
    const handRow = (handNo) => ({
      id: `h${handNo}`, handNo, playedAt: POKER_STARTED_AT, heroSeat: 0, start, holeCards: [{ seat: 0, cards: 'AhKs' }],
      board: '', pot: 3, heroNet: -1, heroAllinEv: null, showdown: false, heroActions: 1, decisions: 1, evLoss: 0,
      severity: 0, confident: true, version: ANALYSIS_VERSION,
    });
    const reviewDb = ({ hands, session = { id: ID, hands: 2, net: 5, allinAdjNet: 3.5, lineup: [{ seat: 1, personaId: 'moss' }] } }) => {
      const summary = { decisions: 4, evLoss: 9, gradedHands: 2, ungradedHands: 1, good: 2, inaccuracy: 1, mistake: 1, blunder: 0, debatable: 1 };
      const costliest = [{ handId: 'h2', handNo: 2, idx: 12, evLoss: 6, grade: 'mistake', confident: true }];
      const opponents = [{ seat: 1, personaId: 'moss' }];
      const sql = mockSql((text) => {
        if (text.includes('FROM poker_sessions WHERE id')) return [session];
        if (text.includes('CROSS JOIN LATERAL (')) return hands;
        if (text.includes('AS "ungradedHands"')) return [summary];
        if (text.includes('ORDER BY d.ev_loss DESC')) return costliest;
        if (text.includes('jsonb_array_elements(h.lineup)')) return opponents;
        return [];
      });
      return { sql, session, summary, costliest, opponents };
    };

    it('returns the review page without event logs', async () => {
      const hands = [handRow(1), handRow(2)];
      const { sql, session, summary, costliest, opponents } = reviewDb({ hands });
      const res = await call(sql, { query: { id: ID } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        session,
        summary: shapeSummary(session, summary),
        costliest,
        opponents: shapeOpponents(opponents, session.lineup),
        hands: hands.map(shapeReviewHand),
        nextAfterHandNo: null,
      });
      const handQuery = sql.queries.find((q) => q.text.includes('CROSS JOIN LATERAL ('));
      expect(handQuery.text).toContain('h.events->0 AS start');
      expect(handQuery.text).not.toMatch(/h\.events,/);
      expect(handQuery.values).toEqual([ID, 0, REVIEW_PAGE_HANDS + 1]);
      const summaryQuery = sql.queries.find((q) => q.text.includes('AS "ungradedHands"'));
      expect(summaryQuery.values).toEqual([ID, ANALYSIS_VERSION, ID]);
      const costliestQuery = sql.queries.find((q) => q.text.includes('ORDER BY d.ev_loss DESC'));
      expect(costliestQuery.values).toEqual([ID, COSTLIEST_LIMIT]);
    });

    it('pages hands after a cursor', async () => {
      const hands = Array.from({ length: REVIEW_PAGE_HANDS + 1 }, (_, i) => handRow(301 + i));
      const { sql } = reviewDb({ hands });
      const res = await call(sql, { query: { id: ID, afterHandNo: '300' } });
      expect(res.body.hands).toHaveLength(REVIEW_PAGE_HANDS);
      expect(res.body.nextAfterHandNo).toBe(600);
      expect(sql.queries.find((q) => q.text.includes('CROSS JOIN LATERAL (')).values).toEqual([ID, 300, REVIEW_PAGE_HANDS + 1]);
    });

    it('lists recent sessions with hands', async () => {
      const sessions = [{ id: ID, startedAt: POKER_STARTED_AT, endedAt: null, tableMode: 'random', hands: 3, net: 4, allinAdjNet: 4 }];
      const sql = mockSql([sessions]);
      const res = await call(sql, { query: { status: 'recent' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ sessions });
      expect(sql.queries[0].text).toContain('WHERE hands > 0');
      expect(sql.queries[0].text).toContain('ORDER BY started_at DESC, id DESC');
      expect(sql.queries[0].values).toEqual([RECENT_SESSIONS_LIMIT]);
    });
```

(Keep `it('lists open sessions with their last activity', …)` and `it('400 for an unknown status', …)` unchanged.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run api/_lib/pokerReview.test.js api/trainers/poker/sessions.test.js`
Expected: FAIL: `pokerReview.js` is missing, so both files fail to load.

- [ ] **Step 3: Add the query schemas**

At the end of `api/_lib/pokerSchemas.js`, append:

```js
// GET sessions?id=&afterHandNo= (review page) and GET sessions?status=recent (lobby).
export const pokerReviewQuery = z.object({ id: uuid, afterHandNo: queryInt(0, MAX_HAND_NO).default(0) });
export const recentSessionsQuery = z.object({ status: z.literal('recent') });
```

- [ ] **Step 4: Write the shaping module**

```js
// api/_lib/pokerReview.js
// Shapes the session review payload (spec §7.2). Hand rows carry the start event only (for the hero position)
// and every seat's hole cards only so the hero's can be picked out; neither leaves this module.
import { applyEvent } from '../../src/private/trainers/poker/engine/handState.js';
import { positionsOf } from '../../src/private/trainers/poker/bots/situation.js';
import { ANALYSIS_VERSION } from '../../src/private/trainers/poker/analysis/version.js';

export const REVIEW_PAGE_HANDS = 300;
export const RECENT_SESSIONS_LIMIT = 20;
export const COSTLIEST_LIMIT = 5;
export const SEVERITY_GRADES = Object.freeze(['good', 'inaccuracy', 'mistake', 'blunder']);

/** 'UTG'|'HJ'|'CO'|'BTN'|'SB'|'BB' for the hero from a stored start event, or null. */
export function heroPosition(start, heroSeat) {
  try {
    return positionsOf(applyEvent(null, start))[heroSeat] ?? null;
  } catch {
    return null;
  }
}

export function shapeReviewHand(row) {
  const hero = Array.isArray(row.holeCards) ? row.holeCards.find((h) => h.seat === row.heroSeat) : null;
  return {
    id: row.id,
    handNo: row.handNo,
    playedAt: row.playedAt,
    position: heroPosition(row.start, row.heroSeat),
    heroCards: hero ? hero.cards : null,
    board: row.board,
    pot: row.pot,
    heroNet: row.heroNet,
    heroAllinEv: row.heroAllinEv,
    showdown: row.showdown,
    decisions: row.decisions ?? 0,
    evLoss: row.evLoss ?? 0,
    worstGrade: row.severity === null || row.severity === undefined ? null : SEVERITY_GRADES[row.severity],
    confident: row.confident ?? null,
    needsGrading: row.heroActions > 0 && (row.version ?? 0) < ANALYSIS_VERSION,
  };
}

export function shapeSummary(session, row = {}) {
  const r = row ?? {};
  return {
    hands: session.hands,
    net: session.net,
    allinAdjNet: session.allinAdjNet,
    decisions: r.decisions ?? 0,
    evLoss: r.evLoss ?? 0,
    gradedHands: r.gradedHands ?? 0,
    ungradedHands: r.ungradedHands ?? 0,
    grades: { good: r.good ?? 0, inaccuracy: r.inaccuracy ?? 0, mistake: r.mistake ?? 0, blunder: r.blunder ?? 0 },
    debatable: r.debatable ?? 0,
  };
}

/** Personas per seat in order of first appearance; the session lineup when no hand is stored yet. */
export function shapeOpponents(rows, sessionLineup) {
  const source = rows.length > 0 ? rows : (sessionLineup ?? []);
  const bySeat = new Map();
  for (const { seat, personaId } of source) {
    if (!bySeat.has(seat)) bySeat.set(seat, []);
    const list = bySeat.get(seat);
    if (!list.includes(personaId)) list.push(personaId);
  }
  return [...bySeat].sort(([a], [b]) => a - b).map(([seat, personaIds]) => ({ seat, personaIds }));
}
```

- [ ] **Step 5: Replace the sessions handler**

Replace the whole of `api/trainers/poker/sessions.js` with:

```js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { idQuery } from '../../_lib/trainerSchemas.js';
import {
  pokerSessionOpen, pokerSessionClose, openSessionsQuery, pokerReviewQuery, recentSessionsQuery,
} from '../../_lib/pokerSchemas.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';
import {
  REVIEW_PAGE_HANDS, RECENT_SESSIONS_LIMIT, COSTLIEST_LIMIT, shapeReviewHand, shapeSummary, shapeOpponents,
} from '../../_lib/pokerReview.js';
import { ANALYSIS_VERSION } from '../../../src/private/trainers/poker/analysis/version.js';

// POST  /api/trainers/poker/sessions                  open a session (idempotent on id)
// PATCH /api/trainers/poker/sessions?id=              close it: { endedAt } (null = stale close at the last hand)
// GET   /api/trainers/poker/sessions?id=&afterHandNo= review page: summary, costliest, opponents, 300 hand summaries
// GET   /api/trainers/poker/sessions?status=open      sessions never closed (stale-session cleanup)
// GET   /api/trainers/poker/sessions?status=recent    latest sessions with hands (lobby)
// Amounts are integer units (1 unit = 0.5 BB). Event logs are served one hand at a time by GET hands?id=.

export const OPEN_SESSIONS_LIMIT = 20;

const invalid = (res, message, error) => sendError(res, 400, 'VALIDATION_ERROR', message, z.flattenError(error));

async function open(sql, req, res) {
  const parsed = pokerSessionOpen.safeParse(req.body);
  if (!parsed.success) return invalid(res, 'Invalid session payload', parsed.error);
  const s = parsed.data;
  const rows = await sql`
    INSERT INTO poker_sessions (id, bot_version, table_mode, lineup, hero_seat, started_at)
    VALUES (${s.id}, ${s.botVersion}, ${s.tableMode}, ${JSON.stringify(s.lineup)}::jsonb, ${s.heroSeat}, ${s.startedAt})
    ON CONFLICT (id) DO NOTHING
    RETURNING id`;
  return res.status(200).json({ id: s.id, saved: true, duplicate: rows.length === 0 });
}

async function close(sql, req, res) {
  const query = idQuery.safeParse(req.query ?? {});
  if (!query.success) return invalid(res, 'A valid session id is required', query.error);
  const body = pokerSessionClose.safeParse(req.body ?? {});
  if (!body.success) return invalid(res, 'Invalid close payload', body.error);
  const { id } = query.data;
  const { endedAt } = body.data;

  // hands/net/allin_adj_net are already kept current by POST hands. Closing sets the end
  // time (an explicit time wins; null keeps an earlier end, else the last hand's start)
  // and counts rebuys: hands that start above the previous hand's ending stack.
  const [row] = await sql`
    WITH h AS (
      SELECT played_at, hero_start_stack,
             lag(hero_start_stack + hero_net) OVER (ORDER BY hand_no) AS prev_end
      FROM poker_hands WHERE session_id = ${id}
    ), agg AS (
      SELECT max(played_at) AS last_at,
             (count(*) FILTER (WHERE prev_end IS NOT NULL AND hero_start_stack > prev_end))::int AS rebuys
      FROM h
    )
    UPDATE poker_sessions s
    SET ended_at = COALESCE(${endedAt}::timestamptz, s.ended_at, agg.last_at, s.started_at),
        rebuys = agg.rebuys
    FROM agg
    WHERE s.id = ${id}
    RETURNING s.id, s.ended_at AS "endedAt", s.hands, s.net, s.allin_adj_net::float8 AS "allinAdjNet", s.rebuys`;
  if (!row) return sendSessionNotFound(res, [id]);
  return res.status(200).json({ ...row, closed: true });
}

async function read(sql, req, res) {
  const parsed = pokerReviewQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid session id is required', parsed.error);
  const { id, afterHandNo } = parsed.data;
  const [session] = await sql`
    SELECT id, bot_version AS "botVersion", table_mode AS "tableMode", lineup, hero_seat AS "heroSeat",
           started_at AS "startedAt", ended_at AS "endedAt", hands, net,
           allin_adj_net::float8 AS "allinAdjNet", rebuys
    FROM poker_sessions WHERE id = ${id}`;
  if (!session) return sendError(res, 404, 'NOT_FOUND', 'Session not found');

  const [handRows, summaryRows, costliest, opponentRows] = await Promise.all([
    sql`
      SELECT h.id, h.hand_no AS "handNo", h.played_at AS "playedAt", h.hero_seat AS "heroSeat", h.events->0 AS start,
             h.hole_cards AS "holeCards", h.board, h.pot, h.hero_net AS "heroNet", h.hero_allin_ev::float8 AS "heroAllinEv",
             h.showdown, h.hero_actions AS "heroActions",
             d.decisions, d.ev_loss AS "evLoss", d.severity, d.confident, d.version
      FROM poker_hands h
      CROSS JOIN LATERAL (
        SELECT count(*)::int AS decisions, COALESCE(sum(x.ev_loss), 0)::float8 AS ev_loss,
               max(CASE x.grade WHEN 'blunder' THEN 3 WHEN 'mistake' THEN 2 WHEN 'inaccuracy' THEN 1 ELSE 0 END)::int AS severity,
               bool_and(x.confident) AS confident, max(x.analysis_version)::int AS version
        FROM poker_decisions x WHERE x.hand_id = h.id
      ) d
      WHERE h.session_id = ${id} AND h.hand_no > ${afterHandNo}
      ORDER BY h.hand_no
      LIMIT ${REVIEW_PAGE_HANDS + 1}`,
    sql`
      SELECT (SELECT count(*) FROM poker_hands u
              WHERE u.session_id = ${id} AND u.hero_actions > 0
                AND COALESCE((SELECT max(v.analysis_version) FROM poker_decisions v WHERE v.hand_id = u.id), 0) < ${ANALYSIS_VERSION}
             )::int AS "ungradedHands",
             count(d.hand_id)::int AS decisions,
             COALESCE(sum(d.ev_loss), 0)::float8 AS "evLoss",
             count(DISTINCT d.hand_id)::int AS "gradedHands",
             count(*) FILTER (WHERE d.grade = 'good')::int AS good,
             count(*) FILTER (WHERE d.grade = 'inaccuracy')::int AS inaccuracy,
             count(*) FILTER (WHERE d.grade = 'mistake')::int AS mistake,
             count(*) FILTER (WHERE d.grade = 'blunder')::int AS blunder,
             count(*) FILTER (WHERE NOT d.confident)::int AS debatable
      FROM poker_hands h JOIN poker_decisions d ON d.hand_id = h.id
      WHERE h.session_id = ${id}`,
    sql`
      SELECT d.hand_id AS "handId", h.hand_no AS "handNo", d.idx, d.street, d.position, d.spot, d.action, d.size, d.pot,
             d.to_call AS "toCall", d.recommended, d.ev_loss AS "evLoss", d.grade, d.confident
      FROM poker_decisions d JOIN poker_hands h ON h.id = d.hand_id
      WHERE h.session_id = ${id} AND d.ev_loss > 0
      ORDER BY d.ev_loss DESC, h.hand_no, d.idx
      LIMIT ${COSTLIEST_LIMIT}`,
    sql`
      SELECT (e->>'seat')::int AS seat, e->>'personaId' AS "personaId", min(h.hand_no)::int AS "firstHand"
      FROM poker_hands h CROSS JOIN LATERAL jsonb_array_elements(h.lineup) e
      WHERE h.session_id = ${id}
      GROUP BY 1, 2
      ORDER BY 1, 3`,
  ]);
  const page = handRows.slice(0, REVIEW_PAGE_HANDS).map(shapeReviewHand);
  return res.status(200).json({
    session,
    summary: shapeSummary(session, summaryRows[0]),
    costliest,
    opponents: shapeOpponents(opponentRows, session.lineup),
    hands: page,
    nextAfterHandNo: handRows.length > REVIEW_PAGE_HANDS ? page[page.length - 1].handNo : null,
  });
}

async function listOpen(sql, req, res) {
  const parsed = openSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open or recent', parsed.error);
  const sessions = await sql`
    SELECT s.id, s.started_at AS "startedAt", s.hands,
           GREATEST(s.started_at, max(h.played_at)) AS "lastActivityAt"
    FROM poker_sessions s LEFT JOIN poker_hands h ON h.session_id = s.id
    WHERE s.ended_at IS NULL
    GROUP BY s.id
    ORDER BY s.started_at DESC
    LIMIT ${OPEN_SESSIONS_LIMIT}`;
  return res.status(200).json({ sessions });
}

async function listRecent(sql, req, res) {
  const parsed = recentSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open or recent', parsed.error);
  const sessions = await sql`
    SELECT id, started_at AS "startedAt", ended_at AS "endedAt", table_mode AS "tableMode", hands, net,
           allin_adj_net::float8 AS "allinAdjNet"
    FROM poker_sessions
    WHERE hands > 0
    ORDER BY started_at DESC, id DESC
    LIMIT ${RECENT_SESSIONS_LIMIT}`;
  return res.status(200).json({ sessions });
}

export function createPokerSessionsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await open(sql, req, res);
      if (req.method === 'PATCH') return await close(sql, req, res);
      const status = req.query?.status;
      if (status === 'recent') return await listRecent(sql, req, res);
      if (status !== undefined) return await listOpen(sql, req, res);
      return await read(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/sessions failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerSessionsHandler();
```

`open`, `close` and `listOpen` are unchanged from Phase 4 apart from the `listOpen` message. If the merged versions differ, keep the merged `open` and `close`.

- [ ] **Step 6: Keep the opt-in real-DB test in step with the new response**

In `api/trainers/poker/realDb.test.js`, replace:

```js
    expect(res.body.hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(res.body.hands[0].events).toEqual(first.events);
    expect(res.body.decisions).toHaveLength(1);
    expect(res.body.session.hands).toBe(2);
```

with:

```js
    expect(res.body.hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(res.body.hands[0]).not.toHaveProperty('events');
    expect(res.body.summary.decisions).toBe(1);
    expect(res.body.session.hands).toBe(2);
    const one = await call(hands, { query: { id: first.id } });
    expect(one.body.hand.events).toEqual(first.events);
    expect(one.body.decisions).toHaveLength(1);
```

The other real-DB cases only read `session` and `hands[].heroAllinEv`, which the new response keeps.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run api/_lib/pokerReview.test.js api/trainers/poker/sessions.test.js api/_lib/pokerBundle.test.js api/_lib/pokerSchemas.test.js`
Expected: PASS. If the `sessions.js` bundle case fails, a module imported by `pokerReview.js` is not plain-Node ESM: report the exact error to the controller. Then run `npm test`. Expected: all pass. If the real-DB environment is set up and the controller agrees, also run `POKER_DB_IT=1 npx vitest run api/trainers/poker/realDb.test.js` and expect every case to pass.

- [ ] **Step 8: Commit**

```bash
git add api/_lib/pokerReview.js api/_lib/pokerReview.test.js api/_lib/pokerSchemas.js api/trainers/poker/sessions.js api/trainers/poker/sessions.test.js api/trainers/poker/realDb.test.js
git commit -m "Serve a paginated poker session review without event logs, and recent sessions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---
### Task 13: Client API, re-grade loop and review view models

**Files:**
- Modify: `src/private/trainers/poker/lib/persistence/api.js`
- Modify: `src/private/trainers/poker/lib/persistence/api.test.js` (append a case)
- Create: `src/private/trainers/poker/analysis/regrade.js`
- Test: `src/private/trainers/poker/analysis/regrade.test.js`
- Create: `src/private/trainers/poker/ui/review/reviewView.js`
- Test: `src/private/trainers/poker/ui/review/reviewView.test.js`

**Interfaces:**
- Consumes: `request` (`src/private/trainers/lib/api.js`); Task 11 and 12 response shapes; `ANALYSIS_VERSION` (Task 1); `spotLabel` (Task 2); `optionKey` (Task 1); `optionLabel` (Task 8); `formatBb`, `formatNetBb`, `cardText` (Phase 2 `lib/format.js`); `parseCards`; `getPersona`; `formatDay` (`src/private/trainers/core/format.js`).
- Produces:
  - `api.js`: `getPokerSessionPage(id, afterHandNo = 0, opts)`, `listRecentPokerSessions(opts)`, `getPokerHand(id, opts)`, `listUngradedPokerHands({ sessionId, belowVersion, afterHandNo = 0, limit = 10 }, opts)`, `savePokerHandGrades(body, opts)` (PATCH).
  - `regrade.js`: `REGRADE_PAGE = 10`, `REGRADE_BATCH = 5`, `regradeSession({ sessionId, api, analyze, isCancelled?, onProgress? }) → Promise<{ graded, failed, cancelled }>` (rejects when a save fails), `regradeHand(hand, { api, analyze }) → Promise<boolean>`. `analyze(record)` receives `{ id, heroSeat, lineup, events }`; a rejected or empty analysis counts as failed. `graded` counts hands the server updated or had already graded (`updated + skipped`).
  - `reviewView.js`: `BIG_POT_UNITS = 60`, `POSITIONS`, `GRADE_LABELS`, `DEFAULT_FILTERS`, `sessionHref(id)`, `handHref(id, idx?)`, `bbText(units)`, `netText(units)`, `cardsText(text)`, `evLostPer100Decisions(evLoss, decisions) → BB|null`, `gradeText(grade, confident)`, `summaryView(summary)`, `costliestView(costliest)`, `matchesFilters(hand, filters)`, `positionsIn(hands)`, `handRowView(hand)`, `opponentsView(opponents)`, `recentSessionView(session)`, `mergePages(acc, page)`.

- [ ] **Step 1: Write the failing tests**

In `src/private/trainers/poker/lib/persistence/api.test.js`, extend the import with `getPokerSessionPage, listRecentPokerSessions, getPokerHand, listUngradedPokerHands, savePokerHandGrades`, and append inside `describe('poker persistence api', …)`:

```js
  it('calls the review, hand and re-grade endpoints', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await getPokerSessionPage('s 1', 0, { fetchImpl });
    await getPokerSessionPage('s1', 300, { fetchImpl });
    await listRecentPokerSessions({ fetchImpl });
    await getPokerHand('h 1', { fetchImpl });
    await listUngradedPokerHands({ sessionId: 's1', belowVersion: 1, afterHandNo: 9 }, { fetchImpl });
    await savePokerHandGrades({ grades: [] }, { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/trainers/poker/sessions?id=s%201', 'GET', undefined],
      ['/api/trainers/poker/sessions?id=s1&afterHandNo=300', 'GET', undefined],
      ['/api/trainers/poker/sessions?status=recent', 'GET', undefined],
      ['/api/trainers/poker/hands?id=h%201', 'GET', undefined],
      ['/api/trainers/poker/hands?ungraded=1&sessionId=s1&belowVersion=1&afterHandNo=9&limit=10', 'GET', undefined],
      ['/api/trainers/poker/hands', 'PATCH', '{"grades":[]}'],
    ]);
  });
```

```js
// src/private/trainers/poker/analysis/regrade.test.js
import { describe, it, expect, vi } from 'vitest';
import { ANALYSIS_VERSION } from './version.js';
import { REGRADE_PAGE, REGRADE_BATCH, regradeSession, regradeHand } from './regrade.js';

const hand = (n) => ({ id: `h${n}`, handNo: n, heroSeat: 0, lineup: [{ seat: 1, personaId: 'moss' }], events: [{ type: 'start', n }] });
const decision = (n) => ({ idx: 7, grade: 'good', n });

function fakeApi(pages) {
  const queue = [...pages];
  return {
    listUngradedPokerHands: vi.fn(async () => queue.shift()),
    savePokerHandGrades: vi.fn(async ({ grades }) => ({ updated: grades.map((g) => g.handId), skipped: [], missing: [] })),
  };
}

describe('regradeSession', () => {
  it('grades every page, saves in batches and counts failures', async () => {
    expect([REGRADE_PAGE, REGRADE_BATCH]).toEqual([10, 5]);
    const api = fakeApi([
      { hands: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(hand), nextAfterHandNo: 10 },
      { hands: [11, 12].map(hand), nextAfterHandNo: null },
    ]);
    const analyze = vi.fn(async (record) => {
      if (record.id === 'h3') throw new Error('timed out');
      if (record.id === 'h4') return { decisions: [], heroAllinEv: null };
      return { decisions: [decision(Number(record.id.slice(1)))], heroAllinEv: record.id === 'h1' ? 4.5 : null };
    });
    const progress = [];
    const result = await regradeSession({ sessionId: 's1', api, analyze, onProgress: (p) => progress.push(p) });
    expect(result).toEqual({ graded: 10, failed: 2, cancelled: false });
    expect(api.listUngradedPokerHands.mock.calls.map(([q]) => q)).toEqual([
      { sessionId: 's1', belowVersion: ANALYSIS_VERSION, afterHandNo: 0, limit: 10 },
      { sessionId: 's1', belowVersion: ANALYSIS_VERSION, afterHandNo: 10, limit: 10 },
    ]);
    expect(analyze.mock.calls[0][0]).toEqual({ id: 'h1', heroSeat: 0, lineup: [{ seat: 1, personaId: 'moss' }], events: [{ type: 'start', n: 1 }] });
    const saved = api.savePokerHandGrades.mock.calls.map(([body]) => body.grades.map((g) => g.handId));
    expect(saved).toEqual([['h1', 'h2', 'h5', 'h6', 'h7'], ['h8', 'h9', 'h10', 'h11', 'h12']]);
    expect(api.savePokerHandGrades.mock.calls[0][0].grades[0]).toEqual({
      handId: 'h1', analysisVersion: ANALYSIS_VERSION, decisions: [decision(1)], heroAllinEv: 4.5,
    });
    expect(progress.at(-1)).toEqual({ graded: 10, failed: 2 });
  });

  it('stops when cancelled and still saves what it graded', async () => {
    const api = fakeApi([{ hands: [1, 2, 3].map(hand), nextAfterHandNo: 3 }]);
    let calls = 0;
    const analyze = vi.fn(async () => {
      calls += 1;
      return { decisions: [decision(calls)], heroAllinEv: null };
    });
    const result = await regradeSession({ sessionId: 's1', api, analyze, isCancelled: () => calls >= 2 });
    expect(result).toEqual({ graded: 2, failed: 0, cancelled: true });
    expect(api.listUngradedPokerHands).toHaveBeenCalledTimes(1);
    expect(api.savePokerHandGrades.mock.calls[0][0].grades.map((g) => g.handId)).toEqual(['h1', 'h2']);
  });

  it('rejects when saving fails', async () => {
    const api = fakeApi([{ hands: [hand(1)], nextAfterHandNo: null }]);
    api.savePokerHandGrades.mockRejectedValueOnce(new Error('offline'));
    await expect(regradeSession({ sessionId: 's1', api, analyze: async () => ({ decisions: [decision(1)], heroAllinEv: null }) }))
      .rejects.toThrow('offline');
  });
});

describe('regradeHand', () => {
  it('saves one graded hand and reports whether it is graded now', async () => {
    const api = fakeApi([]);
    expect(await regradeHand(hand(1), { api, analyze: async () => ({ decisions: [decision(1)], heroAllinEv: null }) })).toBe(true);
    expect(await regradeHand(hand(2), { api, analyze: async () => { throw new Error('x'); } })).toBe(false);
    expect(api.savePokerHandGrades).toHaveBeenCalledTimes(1);
  });
});
```

```js
// src/private/trainers/poker/ui/review/reviewView.test.js
import { describe, it, expect } from 'vitest';
import { formatDay } from '../../../core/format.js';
import { getPersona } from '../../bots/personas.js';
import {
  BIG_POT_UNITS, POSITIONS, DEFAULT_FILTERS, sessionHref, handHref, bbText, netText, cardsText, evLostPer100Decisions, gradeText,
  summaryView, costliestView, matchesFilters, positionsIn, handRowView, opponentsView, recentSessionView, mergePages,
} from './reviewView.js';

const reviewHand = (o = {}) => ({
  id: 'h1', handNo: 3, playedAt: '2026-09-16T18:03:00.000Z', position: 'BTN', heroCards: 'AhKs', board: 'Qh7d2s', pot: 64,
  heroNet: -30, heroAllinEv: null, showdown: true, decisions: 2, evLoss: 7, worstGrade: 'mistake', confident: true, needsGrading: false, ...o,
});

describe('formatting helpers', () => {
  it('formats links, money, cards, grades and the EV rate', () => {
    expect([BIG_POT_UNITS, POSITIONS]).toEqual([60, ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']]);
    expect(DEFAULT_FILTERS).toEqual({ mistakesOnly: false, bigPots: false, showdowns: false, position: 'all' });
    expect(sessionHref('s 1')).toBe('/me/poker/session/s%201');
    expect(handHref('h1')).toBe('/me/poker/hand/h1');
    expect(handHref('h1', 12)).toBe('/me/poker/hand/h1?d=12');
    expect(bbText(9)).toBe('4.5 BB');
    expect(netText(-7)).toBe('−3.5 BB');
    expect(cardsText('AhKs')).toBe('A♥ K♠');
    expect(cardsText('')).toBe('—');
    expect(evLostPer100Decisions(9, 4)).toBe(112.5);
    expect(evLostPer100Decisions(0, 0)).toBeNull();
    expect(gradeText('blunder', true)).toBe('Blunder');
    expect(gradeText('mistake', false)).toBe('Mistake (debatable)');
    expect(gradeText(null, null)).toBe('Not graded');
  });
});

describe('summaryView', () => {
  it('builds the tiles and grade counts', () => {
    const view = summaryView({
      hands: 40, net: 25, allinAdjNet: 7, decisions: 4, evLoss: 9, gradedHands: 3, ungradedHands: 2,
      grades: { good: 2, inaccuracy: 1, mistake: 1, blunder: 0 }, debatable: 1,
    });
    expect(view.tiles).toEqual([
      { key: 'hands', label: 'Hands', value: '40' },
      { key: 'net', label: 'Net', value: '+12.5 BB' },
      { key: 'allinAdj', label: 'All-in adjusted', value: '+3.5 BB' },
      { key: 'evLost', label: 'EV lost / 100 decisions', value: '112.5 BB' },
    ]);
    expect(view.grades).toEqual([
      { grade: 'good', label: 'Good', count: 2 }, { grade: 'inaccuracy', label: 'Inaccuracy', count: 1 },
      { grade: 'mistake', label: 'Mistake', count: 1 }, { grade: 'blunder', label: 'Blunder', count: 0 },
    ]);
    expect([view.decisions, view.debatable, view.ungradedHands]).toEqual([4, 1, 2]);
    expect(summaryView({ hands: 1, net: 0, allinAdjNet: 0, decisions: 0, evLoss: 0, gradedHands: 0, ungradedHands: 1, grades: { good: 0, inaccuracy: 0, mistake: 0, blunder: 0 }, debatable: 0 }).tiles[3].value).toBe('—');
  });
});

describe('costliestView', () => {
  it('links each decision to its step in the replayer', () => {
    const d = {
      handId: 'h2', handNo: 7, idx: 15, street: 'river', position: 'BB', spot: 'river.facing_bet.oop', action: 'call', size: null,
      pot: 60, toCall: 48, recommended: { action: 'fold', size: null, evByOption: {} }, evLoss: 10.2, grade: 'blunder', confident: false,
    };
    expect(costliestView([d])).toEqual([{
      key: 'h2:15', href: '/me/poker/hand/h2?d=15', title: 'Hand 7 · River · facing a bet · out of position',
      actionText: 'You: Call · Best: Fold', lossText: '5.1 BB', gradeText: 'Blunder (debatable)',
    }]);
  });
});

describe('hand list', () => {
  it('filters by mistakes, big pots, showdowns and position', () => {
    const hands = [
      reviewHand(),
      reviewHand({ id: 'h2', worstGrade: 'good', pot: 20, showdown: false, position: 'BB' }),
      reviewHand({ id: 'h3', worstGrade: 'blunder', pot: 60, position: 'BB' }),
    ];
    const ids = (filters) => hands.filter((h) => matchesFilters(h, { ...DEFAULT_FILTERS, ...filters })).map((h) => h.id);
    expect(ids({})).toEqual(['h1', 'h2', 'h3']);
    expect(ids({ mistakesOnly: true })).toEqual(['h1', 'h3']);
    expect(ids({ bigPots: true })).toEqual(['h1']);
    expect(ids({ showdowns: true })).toEqual(['h1', 'h3']);
    expect(ids({ position: 'BB' })).toEqual(['h2', 'h3']);
    expect(positionsIn(hands)).toEqual(['BTN', 'BB']);
  });

  it('builds rows with grade, pending and ungraded states', () => {
    expect(handRowView(reviewHand())).toEqual({
      key: 'h1', href: '/me/poker/hand/h1', handNo: 3, position: 'BTN', cards: 'A♥ K♠', board: 'Q♥ 7♦ 2♠', pot: '32.0 BB',
      net: '−15.0 BB', grade: 'Mistake', loss: '3.5 BB', showdown: true,
    });
    expect(handRowView(reviewHand({ needsGrading: true, decisions: 0, worstGrade: null })).grade).toBe('Grading pending');
    expect(handRowView(reviewHand({ decisions: 0, worstGrade: null, position: null })))
      .toMatchObject({ grade: 'No decisions', loss: '—', position: '—' });
  });
});

describe('opponents, recent sessions and pages', () => {
  it('names personas with their revealed style, and unknown ids plainly', () => {
    const moss = getPersona('moss');
    expect(opponentsView([{ seat: 1, personaIds: ['moss', 'ghost'] }])).toEqual([{
      seat: 1,
      entries: [
        { personaId: 'moss', name: moss.name, tag: moss.tag, style: moss.style },
        { personaId: 'ghost', name: 'ghost', tag: '???', style: 'unknown style' },
      ],
    }]);
  });

  it('describes a recent session and merges review pages', () => {
    const s = { id: 's1', startedAt: '2026-09-16T18:00:00.000Z', endedAt: null, tableMode: 'random', hands: 12, net: 9, allinAdjNet: 9 };
    expect(recentSessionView(s)).toEqual({ key: 's1', href: '/me/poker/session/s1', when: formatDay(s.startedAt), detail: '12 hands · +4.5 BB', open: true });
    const first = { summary: { hands: 2 }, hands: [reviewHand()], nextAfterHandNo: 3 };
    const next = { summary: { hands: 3 }, hands: [reviewHand({ id: 'h4', handNo: 4 })], nextAfterHandNo: null };
    expect(mergePages(first, next)).toEqual({ summary: { hands: 3 }, hands: [reviewHand(), reviewHand({ id: 'h4', handNo: 4 })], nextAfterHandNo: null });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/analysis/regrade.test.js src/private/trainers/poker/ui/review/reviewView.test.js`
Expected: FAIL: the new API functions are not exported, and `./regrade.js` and `./reviewView.js` do not exist.

- [ ] **Step 3: Add the client calls**

Append to `src/private/trainers/poker/lib/persistence/api.js`:

```js
// Phase 5: review pages, the replayer and re-grading.
export const getPokerSessionPage = (id, afterHandNo = 0, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}${afterHandNo > 0 ? `&afterHandNo=${afterHandNo}` : ''}`, opts);

export const listRecentPokerSessions = (opts) => request(`${BASE}/sessions?status=recent`, opts);

export const getPokerHand = (id, opts) => request(`${BASE}/hands?id=${encodeURIComponent(id)}`, opts);

export function listUngradedPokerHands({ sessionId, belowVersion, afterHandNo = 0, limit = 10 }, opts) {
  const query = new URLSearchParams({
    ungraded: '1', sessionId, belowVersion: String(belowVersion), afterHandNo: String(afterHandNo), limit: String(limit),
  });
  return request(`${BASE}/hands?${query}`, opts);
}

export const savePokerHandGrades = (body, opts) => request(`${BASE}/hands`, { method: 'PATCH', body, ...opts });
```

- [ ] **Step 4: Write the re-grade loop**

```js
// src/private/trainers/poker/analysis/regrade.js
// Grades stored hands that have no decisions at the current analysis version (hands saved before Phase 5,
// or whose grading timed out at the table) and saves them with PATCH hands.
import { ANALYSIS_VERSION } from './version.js';

export const REGRADE_PAGE = 10;
export const REGRADE_BATCH = 5;

const recordOf = (hand) => ({ id: hand.id, heroSeat: hand.heroSeat, lineup: hand.lineup, events: hand.events });

async function gradeOne(analyze, hand) {
  try {
    const analysis = await analyze(recordOf(hand));
    return analysis && Array.isArray(analysis.decisions) && analysis.decisions.length > 0 ? analysis : null;
  } catch {
    return null;
  }
}

const gradeEntry = (hand, analysis) => ({
  handId: hand.id, analysisVersion: ANALYSIS_VERSION, decisions: analysis.decisions, heroAllinEv: analysis.heroAllinEv ?? null,
});

/**
 * @param {{ sessionId:string, api:{ listUngradedPokerHands:Function, savePokerHandGrades:Function },
 *   analyze:(record:object) => Promise<object>, isCancelled?:() => boolean,
 *   onProgress?:(progress:{ graded:number, failed:number }) => void }} input
 * @returns {Promise<{ graded:number, failed:number, cancelled:boolean }>}
 */
export async function regradeSession({ sessionId, api, analyze, isCancelled = () => false, onProgress = () => {} }) {
  let afterHandNo = 0;
  let graded = 0;
  let failed = 0;
  let batch = [];
  const report = () => onProgress({ graded, failed });
  const flush = async () => {
    if (batch.length === 0) return;
    const grades = batch;
    batch = [];
    const result = await api.savePokerHandGrades({ grades });
    graded += result.updated.length + result.skipped.length;
    report();
  };

  while (!isCancelled()) {
    const page = await api.listUngradedPokerHands({ sessionId, belowVersion: ANALYSIS_VERSION, afterHandNo, limit: REGRADE_PAGE });
    for (const hand of page.hands) {
      if (isCancelled()) break;
      const analysis = await gradeOne(analyze, hand);
      if (!analysis) {
        failed += 1;
        report();
        continue;
      }
      batch.push(gradeEntry(hand, analysis));
      if (batch.length >= REGRADE_BATCH) await flush();
    }
    if (page.nextAfterHandNo === null) break;
    afterHandNo = page.nextAfterHandNo;
  }
  await flush();
  return { graded, failed, cancelled: isCancelled() };
}

/** Grades and saves one stored hand (the replayer). @returns {Promise<boolean>} whether it is graded now */
export async function regradeHand(hand, { api, analyze }) {
  const analysis = await gradeOne(analyze, hand);
  if (!analysis) return false;
  const result = await api.savePokerHandGrades({ grades: [gradeEntry(hand, analysis)] });
  return result.updated.length + result.skipped.length > 0;
}
```

- [ ] **Step 5: Write the review view models**

```js
// src/private/trainers/poker/ui/review/reviewView.js
// Pure display data for the session review (spec §7.2) and the lobby's recent sessions (spec §8.2).
import { formatBb, formatNetBb, cardText } from '../../lib/format.js';
import { parseCards } from '../../engine/cards.js';
import { getPersona } from '../../bots/personas.js';
import { formatDay } from '../../../core/format.js';
import { spotLabel } from '../../analysis/spots.js';
import { optionKey } from '../../analysis/options.js';
import { optionLabel } from '../../analysis/explain.js';

export const BIG_POT_UNITS = 60; // 30 BB
export const POSITIONS = Object.freeze(['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB']);
export const GRADE_LABELS = Object.freeze({ good: 'Good', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder' });
export const DEFAULT_FILTERS = Object.freeze({ mistakesOnly: false, bigPots: false, showdowns: false, position: 'all' });

export const sessionHref = (id) => `/me/poker/session/${encodeURIComponent(id)}`;
export const handHref = (id, idx = null) => `/me/poker/hand/${encodeURIComponent(id)}${idx === null || idx === undefined ? '' : `?d=${idx}`}`;
export const bbText = (units) => `${formatBb(units)} BB`;
export const netText = (units) => `${formatNetBb(units)} BB`;
export const cardsText = (text) => (text ? parseCards(text).map(cardText).join(' ') : '—');

/** BB lost per 100 graded decisions, confident or not (contracts §4.1, matches the Phase 6 trend). */
export const evLostPer100Decisions = (evLoss, decisions) => (decisions > 0 ? (evLoss / 2 / decisions) * 100 : null);

export function gradeText(grade, confident) {
  if (!grade) return 'Not graded';
  return confident === false ? `${GRADE_LABELS[grade]} (debatable)` : GRADE_LABELS[grade];
}

export function summaryView(summary) {
  const rate = evLostPer100Decisions(summary.evLoss, summary.decisions);
  return {
    tiles: [
      { key: 'hands', label: 'Hands', value: String(summary.hands) },
      { key: 'net', label: 'Net', value: netText(summary.net) },
      { key: 'allinAdj', label: 'All-in adjusted', value: netText(summary.allinAdjNet) },
      { key: 'evLost', label: 'EV lost / 100 decisions', value: rate === null ? '—' : `${rate.toFixed(1)} BB` },
    ],
    grades: Object.keys(GRADE_LABELS).map((grade) => ({ grade, label: GRADE_LABELS[grade], count: summary.grades[grade] })),
    decisions: summary.decisions,
    debatable: summary.debatable,
    ungradedHands: summary.ungradedHands,
  };
}

export function costliestView(costliest) {
  return costliest.map((d) => ({
    key: `${d.handId}:${d.idx}`,
    href: handHref(d.handId, d.idx),
    title: `Hand ${d.handNo} · ${spotLabel(d.spot)}`,
    actionText: `You: ${optionLabel(optionKey(d.action, d.size))} · Best: ${optionLabel(optionKey(d.recommended.action, d.recommended.size))}`,
    lossText: bbText(d.evLoss),
    gradeText: gradeText(d.grade, d.confident),
  }));
}

export function matchesFilters(hand, filters) {
  if (filters.mistakesOnly && hand.worstGrade !== 'mistake' && hand.worstGrade !== 'blunder') return false;
  if (filters.bigPots && !(hand.pot > BIG_POT_UNITS)) return false;
  if (filters.showdowns && !hand.showdown) return false;
  if (filters.position !== 'all' && hand.position !== filters.position) return false;
  return true;
}

export function positionsIn(hands) {
  const present = new Set(hands.map((h) => h.position));
  return POSITIONS.filter((p) => present.has(p));
}

function gradeCell(hand) {
  if (hand.needsGrading) return 'Grading pending';
  if (hand.decisions === 0) return 'No decisions';
  return gradeText(hand.worstGrade, hand.confident);
}

export function handRowView(hand) {
  return {
    key: hand.id,
    href: handHref(hand.id),
    handNo: hand.handNo,
    position: hand.position ?? '—',
    cards: cardsText(hand.heroCards),
    board: cardsText(hand.board),
    pot: bbText(hand.pot),
    net: netText(hand.heroNet),
    grade: gradeCell(hand),
    loss: hand.decisions > 0 ? bbText(hand.evLoss) : '—',
    showdown: hand.showdown,
  };
}

function personaEntry(personaId) {
  try {
    const p = getPersona(personaId);
    return { personaId, name: p.name, tag: p.tag, style: p.style };
  } catch {
    return { personaId, name: personaId, tag: '???', style: 'unknown style' };
  }
}

export const opponentsView = (opponents) => opponents.map(({ seat, personaIds }) => ({ seat, entries: personaIds.map(personaEntry) }));

export const recentSessionView = (s) => ({
  key: s.id, href: sessionHref(s.id), when: formatDay(s.startedAt), detail: `${s.hands} hands · ${netText(s.net)}`, open: s.endedAt === null,
});

/** Appends a later review page: newest summary and cursor, all hands so far. */
export const mergePages = (acc, page) => ({ ...page, hands: [...acc.hands, ...page.hands] });
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/analysis/regrade.test.js src/private/trainers/poker/ui/review/reviewView.test.js`
Expected: PASS. Then run `npm test`. Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/private/trainers/poker/lib/persistence/api.js src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/analysis/regrade.js src/private/trainers/poker/analysis/regrade.test.js src/private/trainers/poker/ui/review/reviewView.js src/private/trainers/poker/ui/review/reviewView.test.js
git commit -m "Add poker review client calls, re-grade loop and review view models

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Session review page and lobby recent sessions

**Files:**
- Create: `src/private/trainers/poker/ui/shared/usePokerResource.js`
- Create: `src/private/trainers/poker/ui/review/useSessionRegrade.js`
- Create: `src/private/trainers/poker/ui/review/SessionReviewPage.jsx`
- Create: `src/private/trainers/poker/ui/review/ReviewSummary.jsx`
- Create: `src/private/trainers/poker/ui/review/CostliestDecisions.jsx`
- Create: `src/private/trainers/poker/ui/review/OpponentsPanel.jsx`
- Create: `src/private/trainers/poker/ui/review/HandList.jsx`
- Create: `src/private/trainers/poker/ui/review/review.css`
- Create: `src/private/trainers/poker/ui/lobby/RecentSessions.jsx`
- Modify: `src/private/trainers/poker/ui/lobby/PlayTab.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: Task 13 (`getPokerSessionPage`, `listRecentPokerSessions`, `regradeSession`, all `reviewView.js` exports); Task 9 (`sharedAnalysisClient`, `REGRADE_TIMEOUT_MS`); `ApiError` (`src/private/trainers/lib/api.js`); `formatDay`; Phase 2 `PokerShell` and `.pk` classes.
- Produces:
  - `usePokerResource(load, key, loginFrom) → { status:'loading'|'ready'|'error', data, error:string|null, errorStatus:number|null, reload() }` (`load` must be module-scope; a 401 redirects to `/login` with `state.from = loginFrom`; reloading keeps the last data).
  - `useSessionRegrade(sessionId, ungradedHands, onSaved) → { status:'idle'|'grading'|'done'|'error', graded, failed, total, error }`.
  - `SessionReviewPage` (default export) at `/me/poker/session/:id`; `<RecentSessions />` in the lobby's Play tab.

This task has no unit test: it adds hooks, `.jsx` and CSS over the Task 13 view models, which are tested. The checks are the bundle check, the full suite and the build.

- [ ] **Step 1: Write the hooks**

```js
// src/private/trainers/poker/ui/shared/usePokerResource.js
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../../lib/api.js';

/**
 * Loads `load(key)`. While reloading the same key it keeps the last data, so panels do not blank; a new key starts
 * empty. A 401 sends the user to /login and back to `loginFrom` afterwards. `load` must be defined at module scope.
 */
export function usePokerResource(load, key, loginFrom) {
  const navigate = useNavigate();
  const [state, setState] = useState({ key, status: 'loading', data: null, error: null, errorStatus: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setState((s) => ({ key, status: 'loading', data: s.key === key ? s.data : null, error: null, errorStatus: null }));
    load(key)
      .then((data) => {
        if (live) setState({ key, status: 'ready', data, error: null, errorStatus: null });
      })
      .catch((err) => {
        if (!live) return;
        if (err instanceof ApiError && err.status === 401) {
          navigate('/login', { replace: true, state: { from: loginFrom } });
          return;
        }
        const error = err instanceof Error ? err.message : 'Request failed';
        const errorStatus = err instanceof ApiError ? err.status : null;
        setState((s) => ({ key, status: 'error', data: s.key === key ? s.data : null, error, errorStatus }));
      });
    return () => { live = false; };
  }, [load, key, nonce, navigate, loginFrom]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  if (state.key !== key) return { status: 'loading', data: null, error: null, errorStatus: null, reload };
  return { status: state.status, data: state.data, error: state.error, errorStatus: state.errorStatus, reload };
}
```

```js
// src/private/trainers/poker/ui/review/useSessionRegrade.js
import { useEffect, useRef, useState } from 'react';
import * as pokerApi from '../../lib/persistence/api.js';
import { sharedAnalysisClient, REGRADE_TIMEOUT_MS } from '../../analysis/worker/analysisClient.js';
import { regradeSession } from '../../analysis/regrade.js';

const analyze = (record) => sharedAnalysisClient().analyze(record, { timeoutMs: REGRADE_TIMEOUT_MS });
const IDLE = { status: 'idle', graded: 0, failed: 0, total: 0, error: null };

/**
 * Grades this session's stored hands that have no current grades, in the analysis worker, and calls `onSaved`
 * after each saved batch so the review reloads. Runs once per session while ungraded hands exist; leaving the
 * page cancels it after the hand in progress.
 */
export function useSessionRegrade(sessionId, ungradedHands, onSaved) {
  const [state, setState] = useState(IDLE);
  const savedRef = useRef(onSaved);
  savedRef.current = onSaved;
  const needed = ungradedHands > 0;
  const totalRef = useRef(ungradedHands);
  totalRef.current = ungradedHands;

  useEffect(() => {
    if (!needed) return undefined;
    let cancelled = false;
    let lastGraded = 0;
    setState({ status: 'grading', graded: 0, failed: 0, total: totalRef.current, error: null });
    regradeSession({
      sessionId,
      api: pokerApi,
      analyze,
      isCancelled: () => cancelled,
      onProgress: ({ graded, failed }) => {
        if (cancelled) return;
        setState((s) => ({ ...s, graded, failed }));
        if (graded > lastGraded) {
          lastGraded = graded;
          savedRef.current();
        }
      },
    }).then(
      ({ graded, failed }) => {
        if (!cancelled) setState((s) => ({ ...s, status: 'done', graded, failed }));
      },
      (err) => {
        if (!cancelled) setState((s) => ({ ...s, status: 'error', error: err instanceof Error ? err.message : 'Grading failed' }));
      },
    );
    return () => { cancelled = true; };
  }, [sessionId, needed]);

  return state;
}
```

- [ ] **Step 2: Write the review components**

```jsx
// src/private/trainers/poker/ui/review/ReviewSummary.jsx
import { summaryView } from './reviewView.js';

/** Hands, net, all-in adjusted net, EV lost per 100 decisions and the count by grade (spec §7.2). */
export default function ReviewSummary({ summary }) {
  const view = summaryView(summary);
  return (
    <section className="pk-box pk-review__summary" aria-labelledby="pk-review-summary">
      <h2 id="pk-review-summary" className="pk-h2">Summary</h2>
      <dl className="pk-review__tiles">
        {view.tiles.map((tile) => (
          <div key={tile.key}>
            <dt>{tile.label}</dt>
            <dd>{tile.value}</dd>
          </div>
        ))}
      </dl>
      {view.decisions === 0 ? (
        <p className="pk-muted">No graded decisions yet.</p>
      ) : (
        <ul className="pk-review__grades" aria-label="Decisions by grade">
          {view.grades.map((g) => (
            <li key={g.grade} className={`pk-grade pk-grade--${g.grade}`}>{g.label}: {g.count}</li>
          ))}
          <li className="pk-muted">Debatable: {view.debatable} (not counted as leaks)</li>
        </ul>
      )}
    </section>
  );
}
```

```jsx
// src/private/trainers/poker/ui/review/CostliestDecisions.jsx
import { Link } from 'react-router-dom';
import { costliestView } from './reviewView.js';

export default function CostliestDecisions({ costliest }) {
  const items = costliestView(costliest);
  return (
    <section className="pk-box" aria-labelledby="pk-review-costliest">
      <h2 id="pk-review-costliest" className="pk-h2">Costliest decisions</h2>
      {items.length === 0 ? (
        <p className="pk-muted">No decision in this session lost EV.</p>
      ) : (
        <ol className="pk-review__costliest">
          {items.map((item) => (
            <li key={item.key}>
              <Link to={item.href} className="pk-review__link" data-hot>{item.title}</Link>
              <span>{item.actionText}</span>
              <span>{item.gradeText} · lost {item.lossText}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
```

```jsx
// src/private/trainers/poker/ui/review/OpponentsPanel.jsx
import { opponentsView } from './reviewView.js';

/** Each seat's personas with their style labels, revealed after the session (spec §7.2). */
export default function OpponentsPanel({ opponents }) {
  const seats = opponentsView(opponents);
  return (
    <section className="pk-box" aria-labelledby="pk-review-opponents">
      <h2 id="pk-review-opponents" className="pk-h2">Opponents</h2>
      {seats.length === 0 ? (
        <p className="pk-muted">No opponents recorded.</p>
      ) : (
        <ul className="pk-review__opponents">
          {seats.map(({ seat, entries }) => (
            <li key={seat}>
              Seat {seat}: {entries.map((e) => `${e.tag} · ${e.name} · ${e.style}`).join(', then ')}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

```jsx
// src/private/trainers/poker/ui/review/HandList.jsx
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_FILTERS, matchesFilters, positionsIn, handRowView } from './reviewView.js';

const TOGGLES = [
  { key: 'mistakesOnly', label: 'Mistakes only' },
  { key: 'bigPots', label: 'Big pots (over 30 BB)' },
  { key: 'showdowns', label: 'Showdowns' },
];

function Filters({ filters, setFilters, positions }) {
  return (
    <fieldset className="pk-review__filters">
      <legend className="pk-sr-only">Filter hands</legend>
      {TOGGLES.map(({ key, label }) => (
        <label key={key} className="pk-radio">
          <input type="checkbox" checked={filters[key]} onChange={(e) => setFilters({ ...filters, [key]: e.target.checked })} />
          {label}
        </label>
      ))}
      <label className="pk-radio">
        Position
        <select className="pk-select" value={filters.position} onChange={(e) => setFilters({ ...filters, position: e.target.value })}>
          <option value="all">All</option>
          {positions.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </label>
    </fieldset>
  );
}

export default function HandList({ hands, hasMore, onLoadMore, loadingMore, moreError }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const positions = useMemo(() => positionsIn(hands), [hands]);
  const rows = useMemo(() => hands.filter((h) => matchesFilters(h, filters)).map(handRowView), [hands, filters]);
  return (
    <section className="pk-box pk-review__hands" aria-labelledby="pk-review-hands">
      <h2 id="pk-review-hands" className="pk-h2">Hands</h2>
      <Filters filters={filters} setFilters={setFilters} positions={positions} />
      {rows.length === 0 ? (
        <p className="pk-muted" role="status">No hands match these filters.</p>
      ) : (
        <div className="pk-review__scroll">
          <table className="pk-review__table">
            <caption className="pk-sr-only">Hands in this session</caption>
            <thead>
              <tr><th scope="col">Hand</th><th scope="col">Pos</th><th scope="col">Cards</th><th scope="col">Board</th><th scope="col">Pot</th><th scope="col">Net</th><th scope="col">Grade</th><th scope="col">EV lost</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td><Link to={r.href} className="pk-review__link" data-hot>#{r.handNo}</Link></td>
                  <td>{r.position}</td><td>{r.cards}</td><td>{r.board}</td><td>{r.pot}</td><td>{r.net}</td><td>{r.grade}</td><td>{r.loss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moreError && <p className="pk-error" role="alert">Couldn&apos;t load more hands: {moreError}</p>}
      {hasMore && (
        <button type="button" className="pk-btn" data-hot disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? 'Loading…' : 'Load more hands'}
        </button>
      )}
    </section>
  );
}
```

```jsx
// src/private/trainers/poker/ui/review/SessionReviewPage.jsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import { usePokerResource } from '../shared/usePokerResource.js';
import { getPokerSessionPage } from '../../lib/persistence/api.js';
import { formatDay } from '../../../core/format.js';
import { useSessionRegrade } from './useSessionRegrade.js';
import { mergePages } from './reviewView.js';
import ReviewSummary from './ReviewSummary';
import CostliestDecisions from './CostliestDecisions';
import OpponentsPanel from './OpponentsPanel';
import HandList from './HandList';
import './review.css';

const LOBBY = { to: '/me/poker', label: 'Lobby' };
const loadReview = (id) => getPokerSessionPage(id);

/** Later pages of hands, appended locally; reset whenever the first page reloads. */
function useMorePages(id, data) {
  const [more, setMore] = useState({ pages: [], loading: false, error: null });
  useEffect(() => setMore({ pages: [], loading: false, error: null }), [data]);
  const merged = useMemo(() => (data ? more.pages.reduce(mergePages, data) : null), [data, more.pages]);
  const loadMore = useCallback(() => {
    if (!merged || merged.nextAfterHandNo === null) return;
    setMore((m) => ({ ...m, loading: true, error: null }));
    getPokerSessionPage(id, merged.nextAfterHandNo)
      .then((page) => setMore((m) => ({ pages: [...m.pages, page], loading: false, error: null })))
      .catch((err) => setMore((m) => ({ ...m, loading: false, error: err instanceof Error ? err.message : 'Request failed' })));
  }, [id, merged]);
  return { merged, loadMore, loadingMore: more.loading, moreError: more.error };
}

function GradingStatus({ grading }) {
  if (grading.status === 'grading') {
    const failed = grading.failed > 0 ? `, ${grading.failed} could not be graded` : '';
    return <p className="pk-muted pk-review__grading" role="status">Grading older hands: {grading.graded} of {grading.total} saved{failed}…</p>;
  }
  if (grading.status === 'error') {
    return <p className="pk-error" role="alert">Couldn&apos;t save grades for older hands: {grading.error}. Reload the page to try again.</p>;
  }
  if (grading.status === 'done' && grading.failed > 0) {
    return <p className="pk-muted" role="status">{grading.failed} older hands could not be graded.</p>;
  }
  return null;
}

function ReviewBody({ review, data, grading, more }) {
  if (!data && review.status === 'error') {
    const message = review.errorStatus === 404
      ? 'This session is not saved yet, or it does not exist.'
      : `Couldn't load this session: ${review.error}`;
    return (
      <div className="pk-review__msg">
        <p className="pk-error" role="alert">{message}</p>
        <button type="button" className="pk-btn" data-hot onClick={review.reload}>Retry</button>
      </div>
    );
  }
  if (!data) return <p className="pk-muted pk-review__msg" role="status">Loading the session…</p>;
  if (data.hands.length === 0) {
    return <p className="pk-muted pk-review__msg">No hands saved for this session yet. They appear here once they finish saving.</p>;
  }
  return (
    <div className="pk-review">
      <GradingStatus grading={grading} />
      <ReviewSummary summary={data.summary} />
      <CostliestDecisions costliest={data.costliest} />
      <OpponentsPanel opponents={data.opponents} />
      <HandList hands={data.hands} hasMore={data.nextAfterHandNo !== null} onLoadMore={more.loadMore} loadingMore={more.loadingMore} moreError={more.moreError} />
    </div>
  );
}

/** Route: /me/poker/session/:id (spec §7.2). */
export default function SessionReviewPage() {
  const { id } = useParams();
  const review = usePokerResource(loadReview, id, `/me/poker/session/${id}`);
  const more = useMorePages(id, review.data);
  const grading = useSessionRegrade(id, review.data?.summary.ungradedHands ?? 0, review.reload);
  const session = more.merged?.session;
  return (
    <PokerShell back={LOBBY}>
      <header className="pk-head">
        <h1 className="pk-title">Session review</h1>
        {session && (
          <p className="pk-muted">{formatDay(session.startedAt)} · {session.tableMode === 'custom' ? 'Custom table' : 'Random table'}</p>
        )}
      </header>
      <ReviewBody review={review} data={more.merged} grading={grading} more={more} />
    </PokerShell>
  );
}
```

```jsx
// src/private/trainers/poker/ui/lobby/RecentSessions.jsx
import { Link } from 'react-router-dom';
import { usePokerResource } from '../shared/usePokerResource.js';
import { listRecentPokerSessions } from '../../lib/persistence/api.js';
import { recentSessionView } from '../review/reviewView.js';

const loadRecent = () => listRecentPokerSessions();

function RecentBody({ recent }) {
  if (!recent.data && recent.status === 'error') {
    return (
      <>
        <p className="pk-error" role="alert">Couldn&apos;t load recent sessions: {recent.error}</p>
        <button type="button" className="pk-btn" data-hot onClick={recent.reload}>Retry</button>
      </>
    );
  }
  if (!recent.data) return <p className="pk-muted" role="status">Loading recent sessions…</p>;
  if (recent.data.sessions.length === 0) return <p className="pk-muted">No saved sessions yet. Sit down to play your first.</p>;
  return (
    <ul className="pk-recent">
      {recent.data.sessions.map(recentSessionView).map((s) => (
        <li key={s.key}>
          <Link to={s.href} className="pk-review__link" data-hot>{s.when}</Link> {s.detail}{s.open ? ' · still open' : ''}
        </li>
      ))}
    </ul>
  );
}

/** The lobby's recent sessions with review links (spec §8.2). */
export default function RecentSessions() {
  const recent = usePokerResource(loadRecent, 'recent', '/me/poker');
  return (
    <section className="pk-box" aria-labelledby="pk-recent-title">
      <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
      <RecentBody recent={recent} />
    </section>
  );
}
```

```css
/* src/private/trainers/poker/ui/review/review.css */
/* Session review and lobby recent sessions. Scoped under .pk. */
.pk .pk-review { display: grid; gap: 20px; padding-top: 20px; }
.pk .pk-review__msg { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; padding-top: 24px; }
.pk .pk-review__grading { border: 3px solid var(--pk-rail-hi); padding: 10px 14px; }
.pk .pk-review__tiles { display: flex; flex-wrap: wrap; gap: 16px 32px; margin: 0; }
.pk .pk-review__tiles dt { color: var(--pk-muted); font-size: 11px; }
.pk .pk-review__tiles dd { margin: 4px 0 0; font-size: 20px; color: var(--pk-accent); }
.pk .pk-review__grades, .pk .pk-review__opponents, .pk .pk-recent { list-style: none; margin: 0; padding: 0; display: flex;
  flex-wrap: wrap; gap: 8px 20px; font-size: 12px; line-height: 1.6; }
.pk .pk-review__opponents, .pk .pk-recent { flex-direction: column; }
.pk .pk-grade--good { color: var(--pk-text); }
.pk .pk-grade--inaccuracy { color: var(--pk-accent-2); }
.pk .pk-grade--mistake { color: var(--pk-accent); }
.pk .pk-grade--blunder { color: var(--pk-red); }
.pk .pk-review__costliest { margin: 0; padding-left: 20px; display: grid; gap: 10px; font-size: 12px; }
.pk .pk-review__costliest li { display: flex; flex-direction: column; gap: 2px; }
.pk .pk-review__link { color: var(--pk-accent-2); }
.pk .pk-review__link:focus-visible { outline: 2px solid var(--pk-text); outline-offset: 2px; }
.pk .pk-review__filters { border: 0; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px 20px; font-size: 12px; }
.pk .pk-review__scroll { width: 100%; overflow-x: auto; }
.pk .pk-review__table { width: 100%; border-collapse: collapse; font-size: 12px; }
.pk .pk-review__table th, .pk .pk-review__table td { text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--pk-rail-hi); white-space: nowrap; }
.pk .pk-review__table th { color: var(--pk-muted); font-weight: 400; }
```

- [ ] **Step 3: Show recent sessions in the lobby**

In `src/private/trainers/poker/ui/lobby/PlayTab.jsx`, add `import RecentSessions from './RecentSessions';` below the `TableBuilder` import and `import '../review/review.css';` below that, then replace:

```jsx
      <section className="pk-box" aria-labelledby="pk-recent-title">
        <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
        <p className="pk-muted">Sessions are not saved yet. Your recent sessions and their reviews will be listed here.</p>
      </section>
```

with:

```jsx
      <RecentSessions />
```

If Phase 4 Task 11 changed that placeholder's text, replace the whole "Recent sessions" section whatever its text.

- [ ] **Step 4: Add the review route**

In `src/App.jsx`, add below the poker table lazy import:

```jsx
const PokerSessionReviewPage = lazy(() => import('./private/trainers/poker/ui/review/SessionReviewPage'));
```

and insert this route directly after the `/me/poker/table/:sessionId` route (still before `/me/:trainer`):

```jsx
      <Route
        path="/me/poker/session/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerSessionReviewPage /></Suspense>}</RequireAuth>}
      />
```

- [ ] **Step 5: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/review/SessionReviewPage.jsx src/private/trainers/poker/ui/lobby/PlayTab.jsx --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: all pass.

Run: `npm run build`
Expected: `✓ built` with a `SessionReviewPage-*.js` chunk; only the existing chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/ui/shared/usePokerResource.js src/private/trainers/poker/ui/review/useSessionRegrade.js src/private/trainers/poker/ui/review/SessionReviewPage.jsx src/private/trainers/poker/ui/review/ReviewSummary.jsx src/private/trainers/poker/ui/review/CostliestDecisions.jsx src/private/trainers/poker/ui/review/OpponentsPanel.jsx src/private/trainers/poker/ui/review/HandList.jsx src/private/trainers/poker/ui/review/review.css src/private/trainers/poker/ui/lobby/RecentSessions.jsx src/private/trainers/poker/ui/lobby/PlayTab.jsx src/App.jsx
git commit -m "Add poker session review page with background re-grading and lobby recent sessions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Replay model

**Files:**
- Create: `src/private/trainers/poker/ui/replayer/replayModel.js`
- Test: `src/private/trainers/poker/ui/replayer/replayModel.test.js`

**Interfaces:**
- Consumes: `applyEvent` (engine); `seatViews`, `tableCenter` (Phase 2 `lib/tableView.js`); `logLines` (Phase 2 `lib/actionLog.js`); `getPersona`; `decisionPoints` (Task 2); `chartCheck` (Task 3); tests use `buildLog`, `listPersonas`, `parseCards`.
- Produces:
  - `PLAY_INTERVAL_MS = 900`, `REPLAY_START = { index: 0, playing: false }`
  - `buildSteps(events) → { eventIdx, state }[]` (step 0: after the last hole event; then one step per `act` or `board` event)
  - `nameOfSeat(hand) → (seat) => 'You' | persona name` (throws `Unknown persona: <id>`)
  - `frameAt(hand, steps, index, { revealAll? }) → { seats: SeatView[], center: { board, pot, handNo, street } }` (Phase 2 shapes; `revealAll` fills every bot's `cards`, folded or not)
  - `stepLines(hand, steps, index) → string[]` (Phase 2 log lines up to that step), `stepDescription(hand, steps, index) → string`
  - `decisionAt(decisions, steps, index) → DecisionRow|null`, `decisionMarks(steps, decisions) → { idx, step, street, grade, confident }[]`, `initialStepIndex(steps, decisions, dParam) → number`
  - `chartForDecision(hand, decision) → chartCheck output|null` (preflop decisions graded by the chart)
  - `replayReducer(state, { type:'next'|'prev'|'first'|'last'|'goto'|'toggle'|'tick', count, index? }) → { index, playing }`, `replayKeyAction(key) → type|null`
  - `hand` everywhere is the `GET hands?id=` `hand` object (`{ id, handNo, heroSeat, buttonSeat, lineup, events, … }`).

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/ui/replayer/replayModel.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from '../../engine/cards.js';
import { buildLog, HOLES6 } from '../../bots/testHands.js';
import { listPersonas } from '../../bots/personas.js';
import {
  PLAY_INTERVAL_MS, REPLAY_START, buildSteps, nameOfSeat, frameAt, stepLines, stepDescription, decisionAt, decisionMarks,
  initialStepIndex, chartForDecision, replayReducer, replayKeyAction,
} from './replayModel.js';

const personas = listPersonas();
// Hero in seat 5 (the button) opens to 5, the big blind calls, then folds to a flop c-bet.
const LOG = ['f 2', 'f 3', 'f 4', 'r 5 5', 'f 0', 'c 1', 'B Kh8d4s', 'k 1', 'b 5 4', 'f 1'];
const hand = (o = {}) => ({
  id: 'h1', handNo: 3, heroSeat: 5, buttonSeat: 5,
  lineup: [0, 1, 2, 3, 4].map((seat) => ({ seat, personaId: personas[seat].id })),
  events: buildLog(LOG), ...o,
});
const DECISIONS = [
  { idx: 10, street: 'preflop', spot: 'pf.open', action: 'raise', size: 5, grade: 'good', confident: true, recommended: { action: 'raise', size: 5, evByOption: {} } },
  { idx: 15, street: 'flop', spot: 'flop.cbet.ip', action: 'bet', size: 4, grade: 'mistake', confident: false, recommended: { action: 'check', size: null, evByOption: { check: 3, 'bet:4': 1 } } },
];

describe('steps', () => {
  it('starts after the deal and adds a step per action or board card', () => {
    expect([PLAY_INTERVAL_MS, REPLAY_START]).toEqual([900, { index: 0, playing: false }]);
    const steps = buildSteps(hand().events);
    expect(steps).toHaveLength(11);
    expect(steps[0].eventIdx).toBe(6);
    expect(steps[0].state.toAct).toBe(2);
    expect(steps.at(-1).state.street).toBe('complete');
  });
});

describe('frameAt', () => {
  it('shows the hero cards, hides bot cards and marks whose turn it is', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats, center } = frameAt(h, steps, 0);
    expect(seats).toHaveLength(6);
    const hero = seats.find((s) => s.isHero);
    expect(hero).toMatchObject({ seat: 5, slot: 0, name: 'You', cards: parseCards(HOLES6[5]) });
    expect(seats.find((s) => s.seat === 2)).toMatchObject({ name: personas[2].name, cards: [null, null], isActive: true });
    expect(center).toMatchObject({ board: [], pot: 0, handNo: 3, street: 'preflop' });
  });

  it('reveals every bot hand, folded or not, on request', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats } = frameAt(h, steps, 4, { revealAll: true });
    expect(seats.find((s) => s.seat === 2).cards).toEqual(parseCards(HOLES6[2]));
    expect(seats.find((s) => s.seat === 1).cards).toEqual(parseCards(HOLES6[1]));
  });

  it('shows the winner and the whole pot at the end, after the uncalled bet is returned', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    const { seats, center } = frameAt(h, steps, steps.length - 1);
    expect(seats.find((s) => s.isHero).won).toBe(11);
    expect(center.pot).toBe(11);
  });

  it('throws for a persona this build does not know', () => {
    const h = hand({ lineup: [{ seat: 0, personaId: 'ghost' }, ...hand().lineup.slice(1)] });
    expect(() => frameAt(h, buildSteps(h.events), 0)).toThrow('Unknown persona: ghost');
  });
});

describe('log and decisions', () => {
  it('describes each step in the hero voice', () => {
    const h = hand();
    const steps = buildSteps(h.events);
    expect(nameOfSeat(h)(5)).toBe('You');
    expect(stepDescription(h, steps, 0)).toBe('You are dealt 9♠ 9♥');
    expect(stepDescription(h, steps, 4)).toBe('You raise to 2.5 BB');
    expect(stepLines(h, steps, 4).length).toBeGreaterThan(stepLines(h, steps, 3).length);
  });

  it('finds hero decisions by step and opens at ?d=', () => {
    const steps = buildSteps(hand().events);
    expect(decisionAt(DECISIONS, steps, 4)).toBe(DECISIONS[0]);
    expect(decisionAt(DECISIONS, steps, 5)).toBeNull();
    expect(decisionMarks(steps, DECISIONS)).toEqual([
      { idx: 10, step: 4, street: 'preflop', grade: 'good', confident: true },
      { idx: 15, step: 9, street: 'flop', grade: 'mistake', confident: false },
    ]);
    expect(initialStepIndex(steps, DECISIONS, '15')).toBe(9);
    expect(initialStepIndex(steps, DECISIONS, '11')).toBe(0);
    expect(initialStepIndex(steps, DECISIONS, null)).toBe(0);
    expect(initialStepIndex(steps, DECISIONS, '')).toBe(0);
  });

  it('recomputes chart frequencies for a chart-graded preflop decision', () => {
    const h = hand();
    expect(chartForDecision(h, DECISIONS[0])).toMatchObject({ key: 'open.BTN', ok: expect.any(Boolean) });
    expect(chartForDecision(h, DECISIONS[1])).toBeNull();
  });
});

describe('replayReducer and keys', () => {
  const run = (state, type, extra = {}) => replayReducer(state, { type, count: 5, ...extra });
  it('steps, jumps and clamps', () => {
    expect(run(REPLAY_START, 'next')).toEqual({ index: 1, playing: false });
    expect(run(REPLAY_START, 'prev')).toEqual({ index: 0, playing: false });
    expect(run(REPLAY_START, 'last')).toEqual({ index: 4, playing: false });
    expect(run({ index: 3, playing: true }, 'first')).toEqual({ index: 0, playing: false });
    expect(run(REPLAY_START, 'goto', { index: 9 })).toEqual({ index: 4, playing: false });
  });

  it('plays to the end and restarts from the start when finished', () => {
    let state = run(REPLAY_START, 'toggle');
    expect(state).toEqual({ index: 0, playing: true });
    for (let i = 0; i < 4; i += 1) state = run(state, 'tick');
    expect(state).toEqual({ index: 4, playing: false });
    expect(run(state, 'tick')).toBe(state);
    expect(run(state, 'toggle')).toEqual({ index: 0, playing: true });
    expect(run({ index: 2, playing: true }, 'toggle')).toEqual({ index: 2, playing: false });
  });

  it('maps keys', () => {
    expect(['ArrowRight', 'ArrowLeft', ' ', 'Home', 'End', 'x'].map(replayKeyAction)).toEqual(['next', 'prev', 'toggle', 'first', 'last', null]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/ui/replayer/replayModel.test.js`
Expected: FAIL, cannot find module `./replayModel.js`.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/ui/replayer/replayModel.js
// Pure replay of a stored hand (spec §7.3): steps through the event log, builds Phase 2 seat views for the
// pixel table (hero cards only unless reveal-all), log lines, and the hero decisions to show at each step.
import { applyEvent } from '../../engine/handState.js';
import { seatViews, tableCenter } from '../../lib/tableView.js';
import { logLines } from '../../lib/actionLog.js';
import { getPersona } from '../../bots/personas.js';
import { decisionPoints } from '../../analysis/spots.js';
import { chartCheck } from '../../analysis/preflopCheck.js';

export const PLAY_INTERVAL_MS = 900;
export const REPLAY_START = Object.freeze({ index: 0, playing: false });

export function buildSteps(events) {
  const firstPlay = events.findIndex((e) => e.type === 'act' || e.type === 'board');
  const dealtIdx = firstPlay === -1 ? events.length - 1 : firstPlay - 1;
  const steps = [];
  let state = null;
  events.forEach((event, i) => {
    state = applyEvent(state, event);
    if (i >= dealtIdx) steps.push({ eventIdx: i, state });
  });
  return steps;
}

const lineupOf = (hand) => new Map(hand.lineup.map((entry) => [entry.seat, entry.personaId]));

export function nameOfSeat(hand) {
  const lineup = lineupOf(hand);
  return (seat) => (seat === hand.heroSeat ? 'You' : getPersona(lineup.get(seat)).name);
}

// A TableSession-shaped object for Phase 2's seatViews/tableCenter at one step.
function replaySession(hand, step) {
  const lineup = lineupOf(hand);
  for (const personaId of lineup.values()) getPersona(personaId); // fail fast with "Unknown persona: <id>"
  return {
    heroSeat: hand.heroSeat,
    seats: hand.events[0].seats.map(({ seat, stack }) => ({
      seat, kind: seat === hand.heroSeat ? 'hero' : 'bot', personaId: lineup.get(seat) ?? null, stack,
    })),
    hand: { no: hand.handNo, state: step.state },
    phase: 'playing',
    button: hand.buttonSeat,
  };
}

export function frameAt(hand, steps, index, { revealAll = false } = {}) {
  const step = steps[index];
  const session = replaySession(hand, step);
  let seats = seatViews(session);
  if (revealAll) {
    const holes = new Map(step.state.players.map((p) => [p.seat, p.hole]));
    seats = seats.map((s) => (s.isHero ? s : { ...s, cards: holes.get(s.seat) ?? s.cards }));
  }
  return { seats, center: tableCenter(session) };
}

export const stepLines = (hand, steps, index) =>
  logLines(hand.events.slice(0, steps[index].eventIdx + 1), { nameOf: nameOfSeat(hand), heroSeat: hand.heroSeat });

export function stepDescription(hand, steps, index) {
  const lines = stepLines(hand, steps, index);
  return lines.length > 0 ? lines[lines.length - 1] : 'Cards dealt';
}

export function decisionAt(decisions, steps, index) {
  const idx = steps[index]?.eventIdx;
  return decisions.find((d) => d.idx === idx) ?? null;
}

export function decisionMarks(steps, decisions) {
  return decisions
    .map((d) => ({ idx: d.idx, step: steps.findIndex((s) => s.eventIdx === d.idx), street: d.street, grade: d.grade, confident: d.confident }))
    .filter((mark) => mark.step >= 0);
}

/** The step of the decision named by ?d=<idx>, else the first step. */
export function initialStepIndex(steps, decisions, dParam) {
  if (dParam === null || dParam === undefined || dParam === '') return 0;
  const idx = Number(dParam);
  if (!Number.isInteger(idx) || !decisions.some((d) => d.idx === idx)) return 0;
  return Math.max(0, steps.findIndex((s) => s.eventIdx === idx));
}

/** Chart frequencies for a preflop decision graded by the chart (no evByOption), for its explanation. */
export function chartForDecision(hand, decision) {
  if (decision.street !== 'preflop' || Object.keys(decision.recommended.evByOption).length > 0) return null;
  const point = decisionPoints(hand.events, hand.heroSeat).find((p) => p.idx === decision.idx);
  return point ? chartCheck(point) : null;
}

export function replayReducer(state, action) {
  const last = Math.max(0, action.count - 1);
  switch (action.type) {
    case 'next':
      return { index: Math.min(last, state.index + 1), playing: false };
    case 'prev':
      return { index: Math.max(0, state.index - 1), playing: false };
    case 'first':
      return { index: 0, playing: false };
    case 'last':
      return { index: last, playing: false };
    case 'goto':
      return { index: Math.max(0, Math.min(last, action.index)), playing: false };
    case 'toggle':
      if (state.playing) return { ...state, playing: false };
      return { index: state.index >= last ? 0 : state.index, playing: true };
    case 'tick': {
      if (!state.playing) return state;
      const index = Math.min(last, state.index + 1);
      return { index, playing: index < last };
    }
    default:
      return state;
  }
}

const KEY_ACTIONS = { ArrowRight: 'next', ArrowLeft: 'prev', ' ': 'toggle', Spacebar: 'toggle', Home: 'first', End: 'last' };

export const replayKeyAction = (key) => KEY_ACTIONS[key] ?? null;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/ui/replayer/replayModel.test.js`
Expected: PASS (11 tests). The final pot is 11 units (SB 1 + BB 5 + BTN 5): the engine returns the hero's uncalled 4-unit flop bet before awarding the pot. Then run `npm test`. Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/ui/replayer/replayModel.js src/private/trainers/poker/ui/replayer/replayModel.test.js
git commit -m "Add poker hand replay model with reveal-all, decisions by step and controls reducer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Hand replayer page

**Files:**
- Create: `src/private/trainers/poker/ui/replayer/useHandRegrade.js`
- Create: `src/private/trainers/poker/ui/replayer/useReplayControls.js`
- Create: `src/private/trainers/poker/ui/replayer/ReplayTable.jsx`
- Create: `src/private/trainers/poker/ui/replayer/DecisionPanel.jsx`
- Create: `src/private/trainers/poker/ui/replayer/HandReplayerPage.jsx`
- Create: `src/private/trainers/poker/ui/replayer/replayer.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: Task 15 (all `replayModel.js` exports); Task 13 (`getPokerHand`, `savePokerHandGrades` via the api module, `regradeHand`, `gradeText`, `bbText`, `sessionHref`, `handHref`); Task 14 (`usePokerResource`); Task 9 (`sharedAnalysisClient`, `REGRADE_TIMEOUT_MS`); Task 8 (`explainDecision`, `optionLabel`, `formatEv`); Task 1 (`ANALYSIS_VERSION`, `optionKey`); Phase 2 `PokerShell`, `TableArt`, `Seat`, `Board`, `ui/table/table.css`.
- Produces:
  - `useHandRegrade(data, reload) → 'idle'|'grading'|'failed'` (grades a hand with hero actions and no current-version decisions once, then reloads)
  - `useReplayControls(count, initialIndex) → { index, playing, dispatch(type, extra?) }` (window keys ←/→, Space, Home, End outside form fields; autoplay every 900 ms)
  - `<ReplayTable frame handNo />`, `<DecisionPanel hand decision />`
  - `HandReplayerPage` (default export) at `/me/poker/hand/:id`

This task has no unit test: the model is tested in Task 15. The checks are the bundle check, the full suite and the build.

- [ ] **Step 1: Write the hooks**

```js
// src/private/trainers/poker/ui/replayer/useHandRegrade.js
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
```

```js
// src/private/trainers/poker/ui/replayer/useReplayControls.js
import { useCallback, useEffect, useReducer } from 'react';
import { PLAY_INTERVAL_MS, replayReducer, replayKeyAction } from './replayModel.js';

const isFormField = (target) => target instanceof Element && Boolean(target.closest('input, select, textarea, [contenteditable="true"]'));

/** Step state with keyboard control (←/→, Space, Home, End) and autoplay. */
export function useReplayControls(count, initialIndex) {
  const [state, rawDispatch] = useReducer(replayReducer, { index: initialIndex, playing: false });
  const dispatch = useCallback((type, extra = {}) => rawDispatch({ type, count, ...extra }), [count]);

  useEffect(() => {
    const onKey = (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey || isFormField(event.target)) return;
      const type = replayKeyAction(event.key);
      if (!type) return;
      // Space on a focused button would also click it; the key handler owns play/pause.
      event.preventDefault();
      dispatch(type);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch]);

  useEffect(() => {
    if (!state.playing) return undefined;
    const timer = setTimeout(() => dispatch('tick'), PLAY_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [state, dispatch]);

  return { index: state.index, playing: state.playing, dispatch };
}
```

- [ ] **Step 2: Write the components**

```jsx
// src/private/trainers/poker/ui/replayer/ReplayTable.jsx
import TableArt from '../sprites/TableArt';
import Seat from '../table/Seat';
import Board from '../table/Board';
import '../table/table.css';

/** The Phase 2 pixel table drawn from a replay frame (no chip animations). */
export default function ReplayTable({ frame, handNo }) {
  return (
    <div className="pk-table">
      <TableArt />
      {frame.seats.map((seat) => <Seat key={seat.seat} seat={seat} handNo={handNo} />)}
      <Board board={frame.center.board} pot={frame.center.pot} handNo={handNo} />
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/replayer/DecisionPanel.jsx
import { explainDecision, optionLabel, formatEv } from '../../analysis/explain.js';
import { optionKey } from '../../analysis/options.js';
import { chartForDecision } from './replayModel.js';
import { gradeText, bbText } from '../review/reviewView.js';

function EvTable({ decision }) {
  const chosen = optionKey(decision.action, decision.size);
  const best = optionKey(decision.recommended.action, decision.recommended.size);
  const rows = Object.entries(decision.recommended.evByOption).sort(([, a], [, b]) => b - a);
  if (rows.length === 0) return <p className="pk-muted">Graded by the preflop chart, so there are no simulated EVs.</p>;
  return (
    <table className="pk-replay__ev">
      <caption className="pk-sr-only">EV by option</caption>
      <thead><tr><th scope="col">Option</th><th scope="col">EV</th><th scope="col"><span className="pk-sr-only">Notes</span></th></tr></thead>
      <tbody>
        {rows.map(([key, ev]) => (
          <tr key={key} className={key === chosen ? 'pk-replay__chosen' : undefined}>
            <td>{optionLabel(key)}</td>
            <td>{formatEv(ev)}</td>
            <td>{[key === best && 'best', key === chosen && 'your play'].filter(Boolean).join(', ')}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Grade, recommended action, EV by option and explanation for one hero decision (spec §7.3). */
export default function DecisionPanel({ hand, decision }) {
  if (!decision) {
    return (
      <section className="pk-box pk-replay__decision" aria-labelledby="pk-replay-decision">
        <h2 id="pk-replay-decision" className="pk-h2">Decision</h2>
        <p className="pk-muted">Step to one of your actions to see its grade.</p>
      </section>
    );
  }
  const chart = chartForDecision(hand, decision);
  return (
    <section className="pk-box pk-replay__decision" aria-labelledby="pk-replay-decision">
      <h2 id="pk-replay-decision" className="pk-h2">Your decision</h2>
      <p className={`pk-grade pk-grade--${decision.grade}`}>{gradeText(decision.grade, decision.confident)}</p>
      <p>
        You: {optionLabel(optionKey(decision.action, decision.size))} · Best: {optionLabel(optionKey(decision.recommended.action, decision.recommended.size))}
        {decision.evLoss > 0 && ` · Lost ${bbText(decision.evLoss)}`}
      </p>
      <EvTable decision={decision} />
      <p className="pk-replay__explain">{explainDecision(decision, { chart })}</p>
    </section>
  );
}
```

```jsx
// src/private/trainers/poker/ui/replayer/HandReplayerPage.jsx
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
```

```css
/* src/private/trainers/poker/ui/replayer/replayer.css */
/* Hand replayer. Scoped under .pk; the table itself uses ui/table/table.css. */
.pk .pk-replay { display: grid; gap: 20px; padding-top: 16px; }
@media (min-width: 1200px) { .pk .pk-replay { grid-template-columns: minmax(0, 1fr) 340px; align-items: start; } }
.pk .pk-replay__main { display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 0; }
.pk .pk-replay__side { display: grid; gap: 16px; }
.pk .pk-replay__controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; }
.pk .pk-replay__marks { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.pk .pk-replay__marks .pk-btn[aria-current="step"] { border-color: var(--pk-accent); }
.pk .pk-replay__nav { display: flex; flex-wrap: wrap; gap: 16px; padding-top: 12px; font-size: 12px; }
.pk .pk-replay__decision p { margin: 0; font-size: 12px; line-height: 1.6; }
.pk .pk-replay__ev { width: 100%; border-collapse: collapse; font-size: 12px; }
.pk .pk-replay__ev th, .pk .pk-replay__ev td { text-align: left; padding: 4px 8px; border-bottom: 2px solid var(--pk-rail-hi); }
.pk .pk-replay__ev th { color: var(--pk-muted); font-weight: 400; }
.pk .pk-replay__chosen td { color: var(--pk-accent); }
.pk .pk-replay__explain { color: var(--pk-text); }
```

- [ ] **Step 3: Add the replayer route**

In `src/App.jsx`, add below the review lazy import:

```jsx
const PokerHandReplayerPage = lazy(() => import('./private/trainers/poker/ui/replayer/HandReplayerPage'));
```

and insert directly after the `/me/poker/session/:id` route:

```jsx
      <Route
        path="/me/poker/hand/:id"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerHandReplayerPage /></Suspense>}</RequireAuth>}
      />
```

- [ ] **Step 4: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/replayer/HandReplayerPage.jsx --bundle --format=esm --jsx=automatic --packages=external --loader:.css=empty --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: all pass.

Run: `npm run build`
Expected: `✓ built` with a `HandReplayerPage-*.js` chunk; only the existing chunk-size warning.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/ui/replayer/useHandRegrade.js src/private/trainers/poker/ui/replayer/useReplayControls.js src/private/trainers/poker/ui/replayer/ReplayTable.jsx src/private/trainers/poker/ui/replayer/DecisionPanel.jsx src/private/trainers/poker/ui/replayer/HandReplayerPage.jsx src/private/trainers/poker/ui/replayer/replayer.css src/App.jsx
git commit -m "Add poker hand replayer with keyboard stepping, reveal-all and graded decisions

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17 (controller): Final verification in the browser

Needs `DATABASE_URL` in `.env.local` for a migrated disposable Neon branch and a login. If either is unavailable, run only Steps 1 and 5 and say so.

- [ ] **Step 1:** `npm test` and `npm run build` pass; `POKER_SLOW=1 npx vitest run src/private/trainers/poker/analysis/gradeHand.slow.test.js` prints its timing line (record it).
- [ ] **Step 2: Table grading.** `npm run dev`, sign in, sit down and play 10 hands. In DevTools → Network every `POST …/hands` body has `decisions` with one entry per hero action and a `heroAllinEv`; bot decisions never slow down while a hand is being graded (Performance panel: grading runs in the `analysisWorker` thread). Throttle the CPU 6× for 3 hands: saves still arrive (with `decisions: []` if grading timed out).
- [ ] **Step 3: Review.** Get up, click "Review this session". Loading, then summary tiles, grade counts, costliest 5 (links open the replayer at that decision), opponents with style labels, and the hand list; each filter (mistakes, big pots, showdowns, position) narrows the list and an impossible combination shows "No hands match these filters". Any hand saved with `decisions: []` is re-graded: the "Grading older hands" line counts up and the page refreshes. Stop the dev API (or go offline) and reload: the error state with Retry appears. Open `/me/poker/session/<random uuid>`: "not saved yet, or it does not exist".
- [ ] **Step 4: Replayer.** `←`/`→`, `Home`/`End` and `Space` step and play/pause; the live region announces each step; "Reveal all cards" shows every bot's hole cards and hides them again; grades appear only on the hero's actions; EV by option, the recommended action and the explanation render; Previous/Next hand links work. Under `prefers-reduced-motion` nothing animates.
- [ ] **Step 5: Stats handoff.** If Phase 6 is merged, the Stats tab's leak and trend panels unlock once 200 graded hands exist, and its example hand links open this replayer.

---

## Execution order

Tasks 1 → 16 run in order, one fresh implementer per task, each followed by a review. Tasks 1–8 are the pure analysis core (Node-tested), 9–10 run it in the worker and at the table, 11–12 are the API, 13–16 the review and replayer. Task 17 is the controller's check before merging `feat/poker-analysis` into `feat/poker`. No migration is needed, so deploying needs no `db:migrate` step for this phase.

## Spec coverage

| Requirement | Task |
|---|---|
| §7.1 grades use only information available at the decision (hero view, hero-view ranges) | 2, 5, 7 |
| §7.1 preflop chart lookup, ≥ 20% is good | 3, 7 |
| §7.1 off-chart preflop EV loss by rollouts (no EV table exists) | 1, 5, 6, 7 |
| §7.1 postflop EV of fold, check/call, ⅓, ½, ¾, pot, all-in by Monte Carlo rollouts with weighted ranges and persona responses, ~2 s per hand | 1, 5, 6, 7 |
| §7.1 recommended = best option, `ev_loss = EV(best) − EV(chosen)` | 7 |
| §7.1 grade bands by share of the pot before the decision | 1, 7 |
| §7.1 confidence: top two within MC stderr, or near-uniform dominant range with > 60% live combos | 6, 7 |
| §7.1 template explanations with real numbers, keyed by spot and error type | 8, 16 |
| §7.1 all-in EV stored for the all-in adjusted net | 4, 7, 11 |
| §6.1 grading in the worker after each hand, before the outbox; never blocking the save | 9, 10 |
| §6.2 `analysis_version` re-grading of old hands | 11, 13, 14, 16 |
| Ledger: re-grade upsert on `(hand_id, idx)` guarded by version, `hero_allin_ev` update, `allin_adj_net` delta | 11 |
| Ledger: review response size under 4.5 MB (pagination, events fetched per hand) | 11, 12 |
| Ledger: Vercel functions ≤ 12 (no new function) | 11, 12 |
| §7.2 summary: hands, net, all-in adjusted net, EV lost per 100 decisions, count by grade | 12, 13, 14 |
| §7.2 costliest 5 decisions linking to the hand | 12, 13, 14 |
| §7.2 hand list filters: mistakes, big pots > 30 BB, showdowns, position | 12, 13, 14 |
| §7.2 opponents' persona names and style labels | 12, 13, 14 |
| §7.3 replayer: step through the log with ←/→ and play/pause | 15, 16 |
| §7.3 grade, recommended action, EV by option and explanation on hero decisions | 15, 16 |
| §7.3 reveal-all toggle | 15, 16 |
| §8.1 routes `/me/poker/session/:id` and `/me/poker/hand/:id` behind `RequireAuth`, lazy, before `/me/:trainer` | 14, 16 |
| §8.2 lobby recent sessions with review links | 12, 13, 14 |
| §10 analysis: golden hand-built spots with known correct actions and grade bands; explanations rendered for every spot type | 7, 8 |
| Loading, empty and error states on every data view | 14, 16 |
| Phase 6: exact spot strings, EV lost per 100 over all graded decisions, hand links `/me/poker/hand/:id` | 2, 13, 14, 16 |

## Contract changes

These need the controller's sign-off and an update to `docs/superpowers/specs/2026-09-16-poker-contracts.md` before other phases rely on them.

1. **`GET /api/trainers/poker/sessions?id=` changes shape (Phase 4 area).** It now returns `{ session, summary, costliest, opponents, hands: ReviewHand[], nextAfterHandNo }` with at most 300 hand summaries per page (`&afterHandNo=` for more) and no `events`, no bot hole cards and no `decisions` list. Nothing outside Phase 4's opt-in real-DB test read the old shape; Task 12 updates that test.
2. **New read and write modes (no new function):** `GET sessions?status=recent`; `GET hands?id=` (one hand with events, decisions, previous/next hand ids); `GET hands?ungraded=1&sessionId=&belowVersion=&afterHandNo=&limit=`; `PATCH hands` with `{ grades: [{ handId, analysisVersion, decisions, heroAllinEv }] }` → `{ updated, skipped, missing }`. `api/_lib/pokerSchemas.js` exports `decision`, `decisionProblems`, `queryInt`, `handIdQuery`, `ungradedHandsQuery`, `handGradesBatch`, `pokerReviewQuery`, `recentSessionsQuery`, `MAX_GRADES_PER_BATCH`, `MAX_UNGRADED_PAGE`.
3. **Re-grade semantics:** a stored hand is "ungraded" when `hero_actions > 0` and its max decision `analysis_version` (0 without decisions) is below the current `ANALYSIS_VERSION` (`analysis/version.js`, imported by the API). A newer version replaces all of the hand's decisions, sets `hero_allin_ev`, and moves `poker_sessions.allin_adj_net` by `COALESCE(new, hero_net) − COALESCE(old, hero_net)`. Phase 6's "graded hands" window therefore grows backwards as old hands are re-graded, which is intended.
4. **DecisionRecord details (contracts §4.1 additions):** `recommended.evByOption` keys are `fold | check | call | bet:<units> | raise:<units>`, values in units with 2 decimals; it is `{}` for preflop decisions graded by the chart (and for single-option decisions). `equity` and `neededEquity` have 4 decimals. Preflop spots carry no `.ip/.oop` suffix; postflop spots always carry one; no other modifiers are emitted.
5. **Confidence refinement:** the range-vagueness rule applies postflop only, to the dominant opponent (latest live bettor or raiser, else the largest contributor). Chart-graded preflop decisions are confident.
6. **Table driver (Phase 2 area):** `createTableDriver` gains `analyzeHand` and `analysisTimeoutMs`, and the driver gains `flushAnalyses()`. With `analyzeHand`, `onHandComplete(record, analysis)` is delivered asynchronously in hand order and `onSessionEnd` is emitted after the last pending hand; `abandon()` and `pagehide` deliver pending hands with `{ decisions: [], heroAllinEv: null }`. `useTableSession` always passes `analyzeHand`, so the table now always calls `onHandComplete` with two arguments.
7. **Analysis worker ownership:** grading runs in a new worker under `analysis/worker/**` (Phase 5), not in Phase 3's `worker/**`.
8. **Shared helpers for Phase 6:** `analysis/spots.js` exports `parseSpot` and `spotLabel` with exactly the outputs Phase 6's plan tests for `leaks/spotCopy.js`, and `ui/shared/usePokerResource.js` is Phase 6's planned hook with a third `loginFrom` argument and an `errorStatus` field. Whichever phase merges second should import these (Phase 6: `spotCopy.js` re-exports `parseSpot`/`spotLabel` from `analysis/spots.js`, and `ui/stats/*` calls `usePokerResource(load, key, '/me/poker?tab=stats')`) instead of adding copies. Both phases also append to `lib/persistence/api.js` and its test, which merge trivially.
9. **Lobby (Phase 2 area):** PlayTab's "Recent sessions" placeholder becomes `<RecentSessions />`, and `SessionEnd` links to the review.
