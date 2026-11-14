# Nightly Games Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Games section to `/nightly`. It has two nightly puzzles: a mental-math sprint that code generates, and a "spot the flaw" puzzle that the model writes. It also logs Hari's five daily-game scores (Krillion, Chainle, Fermi, Farflung, Hopdown) and shows a 14-night history.

**Architecture:**
- Server logic lives in pure modules under `api/_lib/nightly/`: sprint, flaws, the games catalog, queries, the payload view, puzzle generation and the actions.
- The logic is exposed as four new `?action=` values on the existing `api/nightly.js`, so no new function is needed.
- A new migration, `009_nightly_games.sql`, re-keys game results by night and adds `nightly_puzzles`.
- The page gets a self-contained `src/private/nightly/games/` section, with its own fetch and states, rendered under the existing body.

**Tech Stack:** Node ESM and Vercel functions; Neon (`@neondatabase/serverless` tagged SQL); zod 4; `@anthropic-ai/sdk` structured outputs; React 18 and react-router; vitest (node, no jsdom). The project has no eslint, so the quality gate is `npx vitest run` plus `npm run build`.

**Spec:** `docs/superpowers/specs/2026-11-13-nightly-games-design.md`. Read it alongside this plan. The parent design is `docs/superpowers/specs/2026-11-12-nightly-design.md`.

## Global Constraints

- Add no new file directly under `api/`. Each file there is a Vercel function, and `api/_lib/functionCount.test.js` caps the total at 12. New files go in `api/_lib/nightly/`.
- The frontend never imports from `api/`. The catalog reaches the page in the payload.
- Puzzle game keys are exactly `puzzle_sprint` and `puzzle_flaw`. Catalog keys never start with `puzzle_`.
- Dates are night strings `'YYYY-MM-DD'` from `nightDate()` in `api/_lib/nightly/dates.js`. Read `date` columns as `::text` and `numeric` as `::float8`, because Neon returns numeric as a string.
- No response includes `answer_index`, `explanation` or the sprint answers before that puzzle is solved.
- Puzzle results are insert-only. Catalog scores upsert. Both are keyed `(night, game)`.
- The model call uses the existing `MODEL`, `send`, `checkStop`, `structuredCall` and deadline in `api/_lib/nightly/model.js`, with no tools and effort `'low'`.
- Errors use `sendError(res, status, CODE, message, details?)` from `api/_lib/http.js`.
- Styles: the light site frame, `nt-` prefixed classes in a new `games.css`, and only the existing CSS custom properties. Read `src/private/nightly/nightly.css` for the tokens in use.
- Never print or read `.env*` values.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Sloppy sprint and log input** ("2,400", "$45", "15%", "1.94×", blank) should parse to a number. A blank sprint answer counts as wrong and doesn't fail the request. Pinned in Task 2 (`isCorrect(null)`), Task 3 (nullable schema) and Task 7 (`parseAnswer`).
2. **Night rollover mid-puzzle:** a sprint started at 2:58am and submitted at 3:01am must not be scored against the next night's problems. `solve` and `log` carry `night`, and a mismatch is a 409 `NIGHT_CLOSED`. Pinned in Task 6.
3. **Decimal and range handling per game:** Fermi accepts 1.94 but rejects 0.5 and 1.945. Krillion rejects 540.5 and 701. Pinned in Task 3 (`LogBody`) and Task 7 (`readLogInputs`).
4. **Double "Make tonight's flaw":** two overlapping generations both return the one stored puzzle, because the first insert wins. Pinned in Task 5 (insert `ON CONFLICT DO NOTHING`, then re-read) and Task 6.
5. **A fresh night** with no puzzles row, no results and no history must give a valid payload: `flaw: null`, sprint present, `logged: {}`, `history: []`. Pinned in Task 5.

---

### Task 1: Migration 009

**Files:**
- Create: `db/migrations/009_nightly_games.sql`
- Create: `api/_lib/nightlyGamesMigration.test.js`

**Interfaces:**
- Produces two tables:
  - `nightly_game_results (night date, game text, score numeric NOT NULL, detail jsonb, logged_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (night, game))`
  - `nightly_puzzles (night date PRIMARY KEY, flaw jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`

- [ ] **Step 1: Write the failing test**, modelled on `api/_lib/nightlyMigration.test.js`. It reads the file text and asserts:
  - `MIGRATION_NAME.test('009_nightly_games.sql')`, and that `pendingMigrations(['009_nightly_games.sql','004_nightly.sql'], [])` puts 004 first.
  - The text has `RAISE EXCEPTION` inside a `DO $$` block that checks `EXISTS (SELECT 1 FROM nightly_game_results)`, before `DROP TABLE nightly_game_results;`. Assert the order with `indexOf`.
  - The text contains `CREATE TABLE nightly_game_results (`, `PRIMARY KEY (night, game)`, `CREATE TABLE nightly_puzzles (` and `night date PRIMARY KEY`.
  - It defines a `BEFORE UPDATE ON nightly_game_results` trigger whose function `nightly_puzzle_results_final()` raises when `OLD.game LIKE 'puzzle\_%'`.
- [ ] **Step 2: Run it and confirm it fails.** `npx vitest run api/_lib/nightlyGamesMigration.test.js` should FAIL with ENOENT.
- [ ] **Step 3: Write the migration** in plain SQL, in the style of `004_nightly.sql`.
- [ ] **Step 4: Run it and confirm it passes.** Same command, PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add migration 009: night-keyed game results and nightly puzzles"`

### Task 2: Sprint generator and scoring

**Files:**
- Create: `api/_lib/nightly/sprint.js`
- Create: `api/_lib/nightly/sprint.test.js`

**Interfaces:**
- Produces:
  - `seededRand(seed: string): () => number`: a deterministic PRNG returning values in [0,1). It is mulberry32, seeded by a 32-bit hash of the string.
  - `SPRINT_KINDS = ['percentOf','percentChange','product','perUnit','breakEven']`.
  - `sprintProblems(night: string): Array<{ kind, prompt: string, answer: number }>`: five problems, one of each kind in that order, seeded with `seededRand('sprint:' + night)`.
  - `isCorrect(given: number|null, answer: number): boolean`: true when `given` is finite and `|given - answer| <= 0.01 * |answer|`.
  - `scoreSprint(night: string, answers: (number|null)[]): { score: number, correct: boolean[] }`.

- [ ] **Step 1: Write the failing tests.**
  - `sprintProblems('2026-11-13')` deep-equals a second call, and differs from `'2026-11-14'`.
  - Across 200 nights (using `addDays` from `dates.js`), every answer is finite and non-zero, and is an integer or has one decimal (`Math.round(a*10) === a*10`). The kinds equal `SPRINT_KINDS`, and every prompt is non-empty and contains neither `NaN` nor `undefined`.
  - `isCorrect(2400, 2400)` and `isCorrect(2420, 2400)` are true. `isCorrect(2430, 2400)`, `isCorrect(null, 5)` and `isCorrect(NaN, 5)` are false.
  - `scoreSprint(night, answers)` with every answer right gives `{ score: 5, correct: [true x5] }`. With `[null, ...rest]` it gives score 4 and `correct[0] === false`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run api/_lib/nightly/sprint.test.js` should FAIL.
- [ ] **Step 3: Implement.** The prompts are consulting-flavoured and use round inputs. Examples:
  - "What is 35% of 2,400?"
  - "Revenue went from 80 to 92. Percent change?" (the answer is in %)
  - "1.2M units at $45 each. Revenue in $M?"
  - "$3.6M revenue over 9,000 customers. Revenue per customer in $?"
  - "Fixed costs $120,000, price $50, variable cost $30. Break-even units?"
  Pick operands so the answers come out exact. Format numbers with `toLocaleString('en-US')`.
- [ ] **Step 4: Run them and confirm they pass.** Same command, PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add the nightly sprint: seeded mental-math problems and scoring"`

### Task 3: Flaw list, games catalog and the solve/log schemas

**Files:**
- Modify: `api/_lib/nightly/picker.js` (export the existing `sample`)
- Create: `api/_lib/nightly/flaws.js`, `api/_lib/nightly/flaws.test.js`
- Create: `api/_lib/nightly/games.js`, `api/_lib/nightly/games.test.js`
- Modify: `api/_lib/nightly/schemas.js`, `api/_lib/nightly/schemas.test.js`

**Interfaces:**
- `flaws.js` produces:
  - `FLAWS`: a frozen array of `{ key, name, definition }`. The keys are exactly `survivorship`, `base_rate`, `correlation_causation`, `selection_bias`, `small_sample`, `regression_to_mean`, `sunk_cost`, `percentage_points`, `cherry_picked_window` and `goodhart`.
  - `SETTINGS`: a string[] of at least 10 industries or business functions.
  - `flawByKey(key) → flaw`. Throws on an unknown key.
  - `pickFlaw({ recentFlawKeys: string[], rand }) → key`. Excludes the recent keys, and falls back to all keys if every one is recent.
  - `flawChoices(key, rand) → { choices: string[4] /* names */, answerIndex: 0..3 }`.
  - `pickOne(list, rand)`.
- `games.js` produces:
  - `GAMES`: a frozen array of `{ key, name, unit, min, max, decimals, lowerIsBetter, url }`, copied exactly from the spec §7 table: krillion, chainle, fermi, farflung, hopdown. A top comment says Hari edits this list as his games change, and that Krillion's range came from a third-party guide.
  - `PUZZLE_GAMES = Object.freeze({ sprint: 'puzzle_sprint', flaw: 'puzzle_flaw' })`.
  - `gameByKey(key) → entry|undefined`.
  - `hasAtMostDecimals(n: number, decimals: number): boolean`. Use `Math.abs(n * 10**d - Math.round(n * 10**d)) < 1e-9`.
- `schemas.js` produces:
  - `FlawDraft = z.object({ argument: text, explanation: text })`.
  - `SolveBody = z.discriminatedUnion('puzzle', …)`. Every branch has `night: z.iso.date()`. The branches:
    - sprint: `answer: { answers: z.array(z.number().finite().nullable()).length(5), seconds: z.number().min(0).max(3600) }`
    - flaw: `answer: { choice: z.int().min(0).max(3) }`
  - `LogBody = { night: z.iso.date(), game: z.enum(GAMES keys), score: z.number().finite() }`. It is refined so the score is within that game's min..max and passes `hasAtMostDecimals`. The error goes at path `['score']`.

- [ ] **Step 1: Write the failing tests.**
  - `FLAWS` has 10 unique keys, and `flawByKey('nope')` throws.
  - `pickFlaw` returns the one key that isn't recent. When every key is recent, it still returns a valid key.
  - Across 100 seeds, `flawChoices` gives 4 distinct names, `choices[answerIndex] === flawByKey(key).name`, and every name comes from `FLAWS`.
  - `GAMES` has five unique keys, none starting with `puzzle_`, and `min < max` for every entry. Fermi has `lowerIsBetter: true` and `decimals: 2`. The other four have `lowerIsBetter: false` and `decimals: 0`.
  - `LogBody` accepts `{night:'2026-11-13', game:'krillion', score:540}` and `{…, game:'fermi', score:1.94}`. It rejects:
    - krillion with 540.5 or 701;
    - fermi with 0.5 or 1.945;
    - `game:'puzzle_sprint'`;
    - `game:'wordle'`;
    - a missing night.
  - `SolveBody` accepts both branches and a null inside the sprint `answers`. It rejects `answers` of length 4, `choice: 4`, and `puzzle: 'estimate'`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run api/_lib/nightly/flaws.test.js api/_lib/nightly/games.test.js api/_lib/nightly/schemas.test.js` should FAIL.
- [ ] **Step 3: Implement.** Export `sample` from `picker.js` unchanged, and use it in `pickFlaw`, `flawChoices` and `pickOne`. `flawChoices` samples three distractors from the other flaws, then shuffles all four with `sample(all, 4, rand)`.
- [ ] **Step 4: Run them and confirm they pass.** Same command, PASS. Then run `npx vitest run api/_lib/nightly` and confirm everything passes.
- [ ] **Step 5: Commit.** `git commit -m "Add the flaw list, the games catalog and the solve and log schemas"`

### Task 4: The flaw model call

**Files:**
- Modify: `api/_lib/nightly/prompts.js` (add `FLAW_SYSTEM`)
- Modify: `api/_lib/nightly/model.js` (add `buildFlawRequest` and `createModel().writeFlaw`)
- Modify: `api/_lib/nightly/model.test.js`

**Interfaces:**
- Consumes `FlawDraft` (Task 3).
- Produces:
  - `buildFlawRequest({ flaw: { key, name, definition }, setting: string }) → request`. It is built with `structuredRequest(FLAW_SYSTEM, user, jsonFormat(FlawDraft), 'low')`, and the user message names the flaw (name and definition) and the setting.
  - `model.writeFlaw({ flaw, setting, deadline }) → Promise<{ argument, explanation }>`. It retries once on `INVALID_OUTPUT` when `deadline.canRetry()`.

- [ ] **Step 1: Write the failing tests**, using the fake client already in `model.test.js`:
  - `buildFlawRequest` has no `tools`, has `output_config.effort === 'low'` and `output_config.format.type === 'json_schema'`, and its user message contains the flaw's name and the setting.
  - `writeFlaw` returns the parsed draft from `textReply(draft)`.
  - A reply that isn't JSON, followed by a valid one, succeeds after 2 client calls with `roomy()`. Under `tight()`, the first bad reply throws `INVALID_OUTPUT` with no retry.
  - A refusal throws a `ModelError` with code `REFUSAL`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run api/_lib/nightly/model.test.js` should FAIL.
- [ ] **Step 3: Implement.** `FLAW_SYSTEM` tells the model to:
  - write an original argument of 3-5 sentences, set in the given setting, whose central inference commits exactly the named flaw;
  - never name or hint at the flaw;
  - make the argument plausible, not a strawman;
  - use no real named people or companies and no current news;
  - then add a 2-sentence explanation of where the flaw is.
  Put the dynamic parts in the user message, as the existing prompts do.
- [ ] **Step 4: Run them and confirm they pass.** Same command, PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add the spot-the-flaw model call"`

### Task 5: Games queries, the payload view and puzzle generation

**Files:**
- Create: `api/_lib/nightly/gamesQueries.js`
- Create: `api/_lib/nightly/gamesView.js`, `api/_lib/nightly/gamesView.test.js`
- Create: `api/_lib/nightly/puzzleGen.js`, `api/_lib/nightly/puzzleGen.test.js`

**Interfaces:**
- Consumes:
  - `sprintProblems` (Task 2);
  - `flawByKey`, `pickFlaw`, `flawChoices`, `pickOne` and `SETTINGS` (Task 3);
  - `GAMES` and `PUZZLE_GAMES` (Task 3);
  - `addDays` (`dates.js`);
  - `model.writeFlaw` (Task 4).
- `gamesQueries.js` produces the functions below. Each is one tagged statement using `night::text AS night` and `score::float8 AS score`.
  - `getPuzzles(sql, night) → { night, flaw } | null`
  - `insertPuzzles(sql, night, flaw) → void`, using `ON CONFLICT (night) DO NOTHING`.
  - `recentFlawKeys(sql, sinceNight) → string[]`, selecting `flaw->>'flaw_key'` where `night >= sinceNight`.
  - `getResults(sql, night) → [{ game, score, detail }]`
  - `getHistory(sql, fromNight, toNight) → [{ night, game, score }]`. Both ends are inclusive, ordered by night, then game.
  - `insertPuzzleResult(sql, { night, game, score, detail }) → boolean`, using `ON CONFLICT DO NOTHING RETURNING game`. Returns true when a row was inserted.
  - `upsertGameScore(sql, { night, game, score }) → void`, using `ON CONFLICT (night, game) DO UPDATE SET score = EXCLUDED.score, updated_at = now()`.
- `gamesView.js` produces `gamesPayload({ night, puzzlesRow, results, history }) → payload`. It returns exactly the spec §8 shape, built from an explicit allow-list:
  - `catalog` is `GAMES` mapped to `{ key, name, unit, min, max, decimals, lowerIsBetter, url }`.
  - `logged` has catalog games only.
  - Each `score` is converted with `Number()`.
  - The sprint result carries `answers` (the true answers, from `sprintProblems`), plus `correct` and `seconds` from `detail`.
  - The flaw result is `{ score, choice, answerIndex, flawName, explanation }`.
- `puzzleGen.js` produces `runPuzzles({ sql, model, night, deadline, rand = Math.random }) → puzzlesRow`. If tonight's row exists, it returns that row. Otherwise:
  1. Pick a flaw that wasn't used in the last 7 nights, and a setting.
  2. Call `model.writeFlaw`.
  3. Build `{ flaw_key, setting, argument, choices, answer_index, explanation }` and pass it to `insertPuzzles`.
  4. Return the result of `getPuzzles`, so if two generations overlap, the first insert wins.

- [ ] **Step 1: Write the failing tests.**
  - In `gamesView.test.js`:
    - A fresh night (`puzzlesRow: null, results: [], history: []`) gives `flaw: null`, five sprint `problems` that each have only a `prompt` key, `result: null`, `logged: {}`, `history: []` and five catalog entries.
    - With a puzzles row and no results, the payload's deep keys (reuse the `deepKeys` idea from `api/nightly.test.js`) include none of `answer_index`, `answerIndex`, `explanation`, `answers` or `flaw_key`.
    - With results for both puzzles, those fields appear with the right values.
    - A `'1.94'` score string becomes the number 1.94.
    - A `puzzle_*` row never appears in `logged`.
  - In `puzzleGen.test.js`, use `mockSql` from `api/_lib/testing.js` with the route-helper pattern from `api/nightly.test.js`:
    - When tonight's row exists, there is no model call.
    - When it doesn't, there is one `writeFlaw` call and an INSERT is issued.
    - The stored row's `choices[answer_index]` is the picked flaw's name.
    - When the model throws, no INSERT is issued and the error propagates.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run api/_lib/nightly/gamesView.test.js api/_lib/nightly/puzzleGen.test.js` should FAIL.
- [ ] **Step 3: Implement the three modules.**
- [ ] **Step 4: Run them and confirm they pass.** Same command, PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add the games queries, the games payload allow-list and flaw puzzle generation"`

### Task 6: The four actions on /api/nightly

**Files:**
- Create: `api/_lib/nightly/parse.js` (move `parseBody` here from `api/nightly.js`)
- Create: `api/_lib/nightly/gamesActions.js`
- Modify: `api/nightly.js` (register the new actions, add `puzzles` to `MODEL_ACTIONS`, update the header comment)
- Create: `api/nightly.games.test.js`

**Interfaces:**
- Consumes Tasks 2 to 5.
- Produces:
  - `parseBody(schema, req, res) → data|null`, behaving exactly as it does today.
  - `GAMES_ACTIONS = { games: {method:'GET',auth:true}, puzzles: {method:'POST',auth:true}, solve: {method:'POST',auth:true}, log: {method:'POST',auth:true} }`.
  - `GAMES_HANDLERS = { games, puzzles, solve, log }`. Each handler is `(ctx) => Promise` and gets the same ctx as the existing handlers.
  - `api/nightly.js` spreads both objects into its `ACTIONS` and `HANDLERS`.
- Every successful action returns `200 { games: payload }`. The payload is loaded from `getPuzzles`, `getResults` and `getHistory(addDays(night,-13), night)`.
- `puzzles`:
  - A missing model gives 500 `MODEL_NOT_CONFIGURED`.
  - A model failure gives 502 `PUZZLES_FAILED`, with `details.reason` set to the ModelError code.
- `solve`:
  - When `night !== nightDate(now)`, return 409 `NIGHT_CLOSED`.
  - A flaw answer when no puzzles row exists returns 409 `NO_PUZZLES`.
  - When the insert returns false, return 409 `ALREADY_SOLVED`.
  - A sprint answer is scored with `scoreSprint` and stored with `detail {seconds, correct, answers: <given>}`.
  - A flaw answer stores `detail {choice}` and scores 1 or 0.
- `log`:
  - A `night` mismatch returns 409 `NIGHT_CLOSED`.
  - Otherwise call `upsertGameScore`.

- [ ] **Step 1: Write the failing tests** in `api/nightly.games.test.js`. Copy the `setup`, `db` and `issued` helpers from `api/nightly.test.js`, and set NOW to `2026-11-13T23:00:00Z`.
  - All four actions return 401 when unauthenticated, and 405 on the wrong method.
  - `games` on a fresh night returns 200 with `games.puzzles.flaw === null`.
  - `puzzles` calls `model.writeFlaw` once and returns the flaw without `answerIndex`.
  - `puzzles` with a model that throws `ModelError('REFUSAL')` returns 502 `PUZZLES_FAILED` with `details.reason === 'REFUSAL'`, and issues no INSERT.
  - `puzzles` when tonight's row exists makes no model call.
  - `solve`:
    - a sprint with all answers right issues an INSERT with score 5;
    - a flaw with the right choice scores 1, and with the wrong choice scores 0;
    - an insert conflict (the route returns `[]`) gives 409 `ALREADY_SOLVED`;
    - `night: '2026-11-12'` gives 409 `NIGHT_CLOSED`;
    - a flaw answer with no puzzles row gives 409 `NO_PUZZLES`;
    - a malformed body gives 400 `VALIDATION_ERROR`.
  - `log`:
    - `{krillion, 540}` and `{fermi, 1.94}` each issue an upsert;
    - `{krillion, 540.5}` gives 400;
    - a night mismatch gives 409.
  - The existing `api/nightly.test.js` still passes.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run api/nightly.games.test.js` should FAIL.
- [ ] **Step 3: Implement** `parse.js` and `gamesActions.js`, then wire them into `api/nightly.js`.
- [ ] **Step 4: Run them and confirm they pass.** Run `npx vitest run api/` and confirm every test passes, including `functionCount.test.js`.
- [ ] **Step 5: Commit.** `git commit -m "Add games, puzzles, solve and log actions to /api/nightly"`

### Task 7: Client API, messages and pure games logic

**Files:**
- Create: `src/private/nightly/games/gamesApi.js`, `src/private/nightly/games/gamesApi.test.js`
- Create: `src/private/nightly/games/gamesLogic.js`, `src/private/nightly/games/gamesLogic.test.js`
- Modify: `src/private/nightly/view.js`, `src/private/nightly/view.test.js` (new messages)

**Interfaces:**
- Consumes the payload shape from spec §8 (Task 6).
- `gamesApi.js` produces `getGames(opts)`, `makePuzzles(opts)`, `solve(night, puzzle, answer, opts)` and `logScore(night, game, score, opts)`. Each calls `request` from `../../trainers/lib/api.js` at `/api/nightly?action=…` and returns `res.games`.
- `gamesLogic.js` produces:
  - `parseAnswer(text: string) → number|null`. It strips spaces, commas, `$`, `%`, `×` and a trailing `x`, and returns null for blank or non-finite input.
  - `nightsBack(night, n) → string[]`: n nights ending with `night`, oldest first, using UTC date arithmetic.
  - `historyGrid(payload) → { nights: string[14], rows: [{ key, name, unit, cells: (number|null)[] }] }`. The rows are Sprint and Spot the flaw first, then the catalog in its order.
  - `formatScore(value, decimals) → string`. Uses `toLocaleString('en-US')` with exactly `decimals` fraction digits.
  - `formatSeconds(s)`: `'m:ss'`, or `'Ns'` under 60.
  - `sprintSummary(result)`, e.g. `'4/5 in 52s'`.
  - `logInputs(catalog, logged) → { [key]: string }`.
  - `readLogInputs(catalog, inputs) → { entries: [{game, score}], errors: { [key]: string } }`. It skips blanks, uses `parseAnswer`, and reports an out-of-range value or too many decimals with a message like `'Krillion: enter 0 to 700'` or `'Fermi: up to 2 decimals'`.
- `view.js` changes:
  - Add `ALREADY_SOLVED: 'You already answered this one tonight.'` and `NO_PUZZLES: "Tonight's flaw isn't made yet."` to `MESSAGES`.
  - Add `PUZZLES_FAILED: "Tonight's flaw did not come together"` to `MODEL_FAILURES`.

- [ ] **Step 1: Write the failing tests.**
  - `parseAnswer`: `'2,400'`→2400, `'$45'`→45, `'15%'`→15, `'1.94×'`→1.94, `'1.94x'`→1.94, `' 3.5 '`→3.5, `''`→null, `'abc'`→null.
  - `nightsBack('2026-03-09', 3)` → `['2026-03-07','2026-03-08','2026-03-09']`, across the DST weekend.
  - `historyGrid`: a history row lands in the right cell, a missing one is null, and the row order is as specified.
  - `sprintSummary({score:4, seconds:52})` → `'4/5 in 52s'`, and with 125 seconds → `'4/5 in 2:05'`.
  - `readLogInputs`:
    - a blank is skipped;
    - krillion `'540'` becomes an entry;
    - krillion `'701'` and `'540.5'` are errors;
    - fermi `'1.94×'` becomes an entry with 1.94;
    - fermi `'0.5'` is an error.
  - `gamesApi.solve` POSTs to `/api/nightly?action=solve` with body `{night, puzzle, answer}`, using the injected `fetchImpl` pattern from `nightlyApi.test.js`.
  - `messageFor({code:'PUZZLES_FAILED', details:{reason:'REFUSAL'}})` contains `"Tonight's flaw did not come together (reason: REFUSAL)"`.
- [ ] **Step 2: Run them and confirm they fail.** `npx vitest run src/private/nightly` should FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run them and confirm they pass.** Same command, PASS.
- [ ] **Step 5: Commit.** `git commit -m "Add the games client API, history grid and input parsing for /nightly"`

### Task 8: The Games section UI

**Files:**
- Create in `src/private/nightly/games/`: `useGames.js`, `GamesSection.jsx`, `SprintCard.jsx`, `FlawCard.jsx`, `GameLog.jsx`, `GameHistory.jsx` and `games.css`
- Modify: `src/private/nightly/NightlyPage.jsx` (render `<GamesSection />` after `<Body …/>`)

**Interfaces:**
- Consumes Task 7.
- Produces `useGames() → { payload, error, busy: { make, solve, log }, notice: { action, message } | null, load, make, solveOne(puzzle, answer), saveLog(entries) }`.
  - A 401 navigates to `/login` with `state.from '/nightly'`, the same way `useNightly` does through `isAuthLost`.
  - `saveLog` posts the entries one after another and keeps the last payload.

- [ ] **Step 1: Build the components**, following the layout in spec §9.
  - **Loading** shows "Loading games…". **Error** shows a Failure-style panel with a Retry button.
  - **SprintCard:**
    - Starts with a Start button. On Start, the five problems appear, each with a labelled input (`inputMode="decimal"`).
    - Submit sends the seconds since Start (measured with `performance.now()`, capped at 3600).
    - Once solved, it shows `sprintSummary`, and each problem with ✓ or ✗ and the right answer.
  - **FlawCard:**
    - While `flaw === null`, it shows the "Make tonight's flaw" button.
    - Otherwise it shows the argument, a fieldset with the legend "Which flaw?" and 4 radio buttons, and Submit.
    - Once solved, it shows right or wrong, the flaw's name and the explanation.
  - **GameLog:**
    - One labelled input per catalog game. The label is the game's name, which links to `url` in a new tab with `rel="noopener noreferrer"`, followed by the unit and "lower is better" or "higher is better".
    - Inputs are prefilled from `logInputs`.
    - Save shows inline errors from `readLogInputs`, then "Saved" once done.
  - **GameHistory:**
    - A `<table>` captioned "Last 14 nights", with short-date column headers, a game name as each row header, cells from `formatScore`, and `·` for empty cells.
    - The table sits in a wrapper with `overflow-x: auto`, `tabindex="0"` and an aria-label.
  - **Announcements:** GamesSection has one live region (`role="status"`). It announces "Sprint: 4/5", "Flaw: correct" and "Scores saved".
  - **Errors and busy states:**
    - Notices for failed actions appear next to their action, using copy from `messageFor`.
    - Buttons are `aria-disabled` while busy, and a second submit is ignored.
- [ ] **Step 2: Style it.** `games.css` uses `nt-games-*` classes and the existing tokens, mobile first. The two puzzle cards stack, and sit side by side at `min-width: 768px`.
- [ ] **Step 3: Verify.**
  - `npx vitest run`: everything passes, and `src/routes.test.js`, the structure tests and the nightly tests are unchanged.
  - `npm run build`: succeeds with no new warnings.
- [ ] **Step 4: Commit.** `git commit -m "Add the Games section to /nightly: puzzles, your games and a 14-night history"`

### Task 9: Docs and the final gate

**Files:**
- Modify: `docs/superpowers/specs/2026-11-12-nightly-design.md`. In the §2 non-goals, change "daily games UI" so it points to the new spec.
- Modify: `DEPLOYMENT.md`. In the Nightly section, add that migration 009 must be applied too.

- [ ] **Step 1: Make the doc edits.**
- [ ] **Step 2: Run the full gate.** `npx vitest run` passes in full, and `npm run build` succeeds.
- [ ] **Step 3: Commit.** `git commit -m "Point the nightly docs at the games design and note migration 009"`

This step needs Hari's OK, so it isn't a task: apply `009_nightly_games.sql` to the Neon database with `npm run db:migrate`, then check the Games section in a browser on the dev server.
