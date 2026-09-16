# Poker Trainer Phase 4: Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store every poker session and hand in Neon Postgres through idempotent, authenticated API routes and the durable outbox, close abandoned sessions, serve the adaptive profile, and wire all of it into the table.

**Architecture:** A migration adds `poker_sessions`, `poker_hands` and `poker_decisions`, with money in integer units. Three Vercel functions under `api/trainers/poker/` (`sessions`, `hands`, `profile`) follow the existing trainers handlers: `guard()`, Zod, one SQL statement per write, and fakes for SQL and auth in tests. The server replays each hand with the Phase 1 engine before storing it. The shared outbox gains optional ordered groups, and poker uses its own outbox instance, so a session's open, hands and close are always sent in that order. Client modules under `lib/persistence/` expose the table's `onSessionStart`, `onHandComplete` and `onSessionEnd` handlers.

**Tech Stack:** JavaScript ES modules with JSDoc, React 18, Vite 6, Vercel Node functions (ESM), `@neondatabase/serverless` 1.x, Zod 4, Vitest 5 (node environment), Node 22. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-trainer-design.md` §6 (plus the API bullet of §10).
**Contracts:** `docs/superpowers/specs/2026-09-16-poker-contracts.md` §2 (ownership) and §4 (HandRecord, session props, units).

## Global Constraints

- Work in the worktree `C:\Users\hgrid\jp-poker-persist` (Git Bash: `/c/Users/hgrid/jp-poker-persist`) on branch `feat/poker-persist`. Run every command from its root.
- Plain JavaScript ES modules, JSDoc types, no TypeScript, no new npm dependencies.
- Edit only Phase 4 paths: `api/trainers/poker/**`, `api/_lib/poker*`, `db/migrations/*_poker.sql`, `src/private/trainers/poker/lib/persistence/**`, `src/private/trainers/lib/outbox*.js`. The one exception is Task 11 (post-merge wiring), which may edit the Phase 2 table page, lobby and poker routes in `src/App.jsx`, as contracts §2 allows.
- **Money is integer units, 1 unit = 0.5 BB** (`sb: 1, bb: 2`). Chip amounts are `int` columns and `z.int()` fields. Expected values (all-in EV, EV loss) are fractional units (`numeric(…,2)` or `real`). No column or field ends in `_bb`/`Bb`.
- Every handler: a `createXHandler({ getSql, auth })` factory plus `export default createXHandler()`. It starts with `guard(req, res, { methods, auth, getSql })` from `api/_lib/http.js`, which gives 405 with `Allow`, `Cache-Control: no-store`, 401 `UNAUTHORIZED` via `verifySession` and 500 `DB_NOT_CONFIGURED`. It validates with Zod `safeParse` → 400 `VALIDATION_ERROR` with `z.flattenError(...)` details, and sends every error through `sendError` as `{ error, code, details? }`. It wraps the body in `try/catch`, logging `console.error('trainers/poker/<name> failed:', err)` and returning 500 `INTERNAL`.
- SQL uses only `sql` tagged templates, with one statement per write (no `sql.transaction`). Multi-row inserts go through `jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)`, as `api/trainers/sessions.js` does.
- Caps (spec §6.3): at most **50 hands per batch**, **40 decisions per hand** and **500 events per hand**.
- A hand or close for a session row that does not exist returns **HTTP 409, code `SESSION_NOT_FOUND`**, with `details: { sessionIds }`. The poker outbox retries it up to **10 attempts** before marking it failed.
- Tests never need a real database: handlers are tested with `mockSql`, `mockRes`, `authedReq` and `TEST_AUTH` from `api/_lib/testing.js`. The only real-DB test is opt-in (`POKER_DB_IT=1` plus `DATABASE_URL`) and is skipped otherwise.
- Existing Zetamac/Optiver behavior is unchanged. **Existing test cases in `src/private/trainers/lib/outbox.test.js` stay byte-for-byte unchanged.** The only edit to existing lines is adding `browserStorage` to the import list. New cases are appended.
- Vercel Hobby allows 12 functions. `api/` has 6 today, and this phase adds 3 (Phase 6 `stats` makes 10).
- Commit messages end with exactly this trailer line (copy it verbatim):
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- Stage files explicitly by path (`git add <paths>`), never `git add -A` or `git add .`. Never stage `wa.geo.json`.
- Single test file: `npx vitest run <path>`. Full suite: `npm test`. Every task ends with `npm test` green.

**Deliberate refinements of the spec (already decided):**
- Units instead of `numeric(10,1)` BB. Columns are renamed accordingly: `net`, `allin_adj_net`, `pot`, `hero_net`, `hero_allin_ev`, `size`, `to_call`, `ev_loss`.
- There is no `seed` column. The Phase 1 log stores the dealt cards, so `events` (renamed from `actions`) replays exactly.
- Added columns: `poker_sessions.hero_seat`, plus `poker_hands.hero_start_stack` (to detect rebuys), `hero_actions` (to bound the profile window) and `lineup` (bots are refilled per hand). The redundant `poker_hands_session` index is dropped, because `UNIQUE (session_id, hand_no)` already indexes it.
- The server replays every hand with the engine (`reduceHand`). It rejects hands that are illegal, incomplete or disagree with `heroNet`/`pot`/`showdown`/`buttonSeat`/`startStacks`, and derives `board`, `hole_cards`, `hero_start_stack` and `hero_actions` itself.
- A `POST hands` item is `{ hand: HandRecord, decisions?: DecisionRecord[] = [], heroAllinEv?: number|null = null }`. Phase 4 always sends `decisions: []`. Phase 5 fills them.
- Session totals (`hands`, `net`, `allin_adj_net`) are incremented by the same statement that inserts new hands, so they always match stored hands, even for hands that arrive after a close.
- `PATCH sessions?id=` takes `{ endedAt: string|null }`. Other summary keys (`id`, `hands`, `net`, `rebuys`) are accepted and stripped. `null` means a stale close at the last saved hand's time. An explicit `endedAt` overrides an earlier stale close. `rebuys` is computed from stored stacks (a hand that starts above the previous hand's end).
- `GET sessions?status=open` lists unclosed sessions with `lastActivityAt`. On lobby load, a session is closed if its last activity is at least **15 minutes** old and this device's poker outbox has nothing queued for it. This way a live table in another tab or a session waiting offline is never closed.
- Poker uses its own outbox instance (storage key `pk-outbox-v1`), so the Zetamac/Optiver "games waiting to sync" banner never counts poker saves. Each hand is its own entry and request, so one bad hand never blocks the others. The endpoint still accepts batches of up to 50.
- `GET profile` folds the hands that hold the latest **2,000 hero decisions** (hero `act` events, including the hand that crosses 2,000), capped at **2,000 hands**, oldest first.

---

## File Structure

| File | Responsibility |
|---|---|
| `db/migrations/002_poker.sql` | Poker tables and indexes |
| `api/_lib/pokerMigration.test.js` | Static checks on the migration (name, tables, integer units) |
| `api/_lib/pokerTesting.js` | Test-only fixtures: session bodies, engine-played HandRecords, decisions |
| `api/_lib/pokerReplay.js` | `replayHandRecord(record)`: engine replay, consistency checks, derived columns |
| `api/_lib/pokerSchemas.js` | Zod request schemas and caps |
| `api/_lib/pokerHttp.js` | `sendSessionNotFound(res, sessionIds)` |
| `api/_lib/pokerBundle.test.js` | Each poker function imports in plain Node (no Vite), as Vercel runs it |
| `api/trainers/poker/sessions.js` | POST open, PATCH close, GET one session, GET open sessions |
| `api/trainers/poker/hands.js` | POST hands batch (idempotent, updates session totals) |
| `api/trainers/poker/realDb.test.js` | Opt-in end-to-end check against a real, migrated database |
| `api/trainers/poker/profile.js` | **Post-merge.** GET adaptive profile via Phase 3 `accumulateProfile` |
| `src/private/trainers/lib/outbox.js` | Modified: `idOf`, ordered `groupOf`, `isPermanent(err, entry)`, `key`, `hasQueued`, `browserStorage` |
| `src/private/trainers/lib/outboxInstance.js` | Modified: imports `browserStorage` from `outbox.js` |
| `src/private/trainers/poker/lib/persistence/api.js` | Fetch wrappers for the poker endpoints |
| `src/private/trainers/poker/lib/persistence/pokerOutbox.js` | Entry builders, dispatcher, retry rule, `createPokerOutbox` |
| `src/private/trainers/poker/lib/persistence/persistence.js` | `createPokerPersistence` → `{ onSessionStart, onHandComplete, onSessionEnd }` |
| `src/private/trainers/poker/lib/persistence/saveStatus.js` | Save status from an outbox snapshot, plus its text |
| `src/private/trainers/poker/lib/persistence/staleSessions.js` | `closeStaleSessions` |
| `src/private/trainers/poker/lib/persistence/profileLoader.js` | `loadPokerProfile` with a timeout, never rejects |
| `src/private/trainers/poker/lib/persistence/pokerOutboxInstance.js` | Browser singletons: `pokerOutbox`, `ensurePokerWorker`, `pokerPersistence` |
| `src/private/trainers/poker/lib/persistence/usePokerSaveStatus.js`, `usePokerProfile.js`, `useCloseStaleSessions.js`, `PokerSaveStatus.jsx`, `withPokerPersistence.jsx`, `PersistedTablePage.jsx` | **Post-merge.** React wiring |
| `api/_lib/pokerRoundTrip.test.js` | **Post-merge.** Phase 2 `buildHandRecord` output passes `handItem` |

---

### Task 1: Migration

**Files:**
- Create: `db/migrations/002_poker.sql`
- Test: `api/_lib/pokerMigration.test.js`

**Interfaces:**
- Consumes: `MIGRATION_NAME`, `pendingMigrations` from `scripts/migrate.js`.
- Produces: the tables `poker_sessions`, `poker_hands` and `poker_decisions`, with exactly the columns below. Later tasks' SQL uses these names.

- [ ] **Step 1: Write the failing test**

```js
// api/_lib/pokerMigration.test.js
import fs from 'node:fs';
import { describe, it, expect } from 'vitest';
import { MIGRATION_NAME, pendingMigrations } from '../../scripts/migrate.js';

const sqlText = fs.readFileSync(new URL('../../db/migrations/002_poker.sql', import.meta.url), 'utf8');

describe('db/migrations/002_poker.sql', () => {
  it('is a valid migration name that runs after 001_trainers', () => {
    expect(MIGRATION_NAME.test('002_poker.sql')).toBe(true);
    expect(pendingMigrations(['002_poker.sql', '001_trainers.sql'], [])).toEqual(['001_trainers.sql', '002_poker.sql']);
  });

  it('creates the three poker tables with cascading children', () => {
    for (const table of ['poker_sessions', 'poker_hands', 'poker_decisions']) {
      expect(sqlText).toContain(`CREATE TABLE ${table} (`);
    }
    expect(sqlText.match(/ON DELETE CASCADE/g)).toHaveLength(2);
    expect(sqlText).toContain('UNIQUE (session_id, hand_no)');
    expect(sqlText).toContain('PRIMARY KEY (hand_id, idx)');
  });

  it('stores chip amounts as integer units, never numeric BB', () => {
    expect(sqlText).not.toMatch(/_bb\b/);
    expect(sqlText).not.toMatch(/numeric\(10,\s*1\)/);
    expect(sqlText).toMatch(/\bnet\s+int NOT NULL DEFAULT 0/);
    expect(sqlText).toMatch(/\bpot\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bhero_net\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bhero_start_stack\s+int NOT NULL/);
    expect(sqlText).toMatch(/\bsize\s+int,/);
    expect(sqlText).toMatch(/\bto_call\s+int NOT NULL/);
  });

  it('indexes open sessions, recent hands and decision spots', () => {
    expect(sqlText).toContain('WHERE ended_at IS NULL');
    expect(sqlText).toContain('ON poker_hands (played_at DESC, id DESC)');
    expect(sqlText).toContain('ON poker_decisions (spot)');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_lib/pokerMigration.test.js`
Expected: FAIL with `ENOENT: no such file or directory` for `002_poker.sql`.

- [ ] **Step 3: Write the migration**

```sql
-- db/migrations/002_poker.sql
-- Poker trainer persistence (spec §6.2, contracts §4).
-- Chip amounts are integer units: 1 unit = 0.5 BB (the table plays sb = 1, bb = 2).
-- Expected values (all-in EV, EV loss) are fractional units.

CREATE TABLE poker_sessions (
  id            uuid PRIMARY KEY,                                  -- generated by the client
  bot_version   text NOT NULL,
  table_mode    text NOT NULL CHECK (table_mode IN ('random', 'custom')),
  lineup        jsonb NOT NULL,                                    -- [{seat, personaId}] bot seats at sit-down
  hero_seat     int NOT NULL CHECK (hero_seat BETWEEN 0 AND 5),
  started_at    timestamptz NOT NULL,
  ended_at      timestamptz,                                       -- NULL while open
  hands         int NOT NULL DEFAULT 0,                            -- kept current by POST hands
  net           int NOT NULL DEFAULT 0,                            -- units, kept current by POST hands
  allin_adj_net numeric(12,2) NOT NULL DEFAULT 0,                  -- units, net with all-in luck removed
  rebuys        int NOT NULL DEFAULT 0,                            -- computed when the session closes
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX poker_sessions_started ON poker_sessions (started_at DESC);
CREATE INDEX poker_sessions_open ON poker_sessions (started_at) WHERE ended_at IS NULL;

CREATE TABLE poker_hands (
  id               uuid PRIMARY KEY,
  session_id       uuid NOT NULL REFERENCES poker_sessions (id) ON DELETE CASCADE,
  hand_no          int NOT NULL CHECK (hand_no >= 1),
  played_at        timestamptz NOT NULL,                           -- hand start
  button_seat      int NOT NULL CHECK (button_seat BETWEEN 0 AND 5),
  hero_seat        int NOT NULL CHECK (hero_seat BETWEEN 0 AND 5),
  hero_start_stack int NOT NULL CHECK (hero_start_stack > 0),      -- units; detects rebuys
  hero_actions     int NOT NULL CHECK (hero_actions >= 0),         -- hero act events; bounds the profile window
  lineup           jsonb NOT NULL,                                 -- [{seat, personaId}] bot seats this hand
  hole_cards       jsonb NOT NULL,                                 -- [{seat, cards: 'AhKs'}] every seat
  board            text NOT NULL,                                  -- e.g. 'AhKs9dTc2h' (may be shorter)
  events           jsonb NOT NULL,                                 -- the full engine event log
  pot              int NOT NULL CHECK (pot >= 0),                  -- units
  hero_net         int NOT NULL,                                   -- units
  hero_allin_ev    numeric(10,2),                                  -- units; NULL unless graded (Phase 5)
  showdown         boolean NOT NULL,
  UNIQUE (session_id, hand_no)
);

CREATE INDEX poker_hands_recent ON poker_hands (played_at DESC, id DESC);

CREATE TABLE poker_decisions (
  hand_id          uuid NOT NULL REFERENCES poker_hands (id) ON DELETE CASCADE,
  idx              int NOT NULL,                                   -- index into the hand's events
  street           text NOT NULL CHECK (street IN ('preflop', 'flop', 'turn', 'river')),
  position         text NOT NULL CHECK (position IN ('UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB')),
  spot             text NOT NULL,                                  -- e.g. 'pf.open', 'river.facing_bet.oop'
  action           text NOT NULL CHECK (action IN ('fold', 'check', 'call', 'bet', 'raise')),
  size             int,                                            -- units, raise-to; NULL for fold/check/call
  pot              int NOT NULL,                                   -- units, before the decision
  to_call          int NOT NULL,                                   -- units
  equity           real,                                           -- NULL preflop
  needed_equity    real,                                           -- NULL when nothing to call
  recommended      jsonb NOT NULL,                                 -- {action, size, evByOption}
  ev_loss          real NOT NULL CHECK (ev_loss >= 0),             -- units
  grade            text NOT NULL CHECK (grade IN ('good', 'inaccuracy', 'mistake', 'blunder')),
  confident        boolean NOT NULL,
  analysis_version int NOT NULL,
  PRIMARY KEY (hand_id, idx)
);

CREATE INDEX poker_decisions_spot ON poker_decisions (spot);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/_lib/pokerMigration.test.js scripts/migrate.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add db/migrations/002_poker.sql api/_lib/pokerMigration.test.js
git commit -m "Add poker persistence migration with integer-unit columns

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Test fixtures and hand replay

**Files:**
- Create: `api/_lib/pokerTesting.js`
- Create: `api/_lib/pokerReplay.js`
- Test: `api/_lib/pokerReplay.test.js`

**Interfaces:**
- Consumes: `playHand`, `randomPolicy` (`engine/simulate.js`), `reduceHand`, `EngineError` (`engine/handState.js`), `cardsToString` (`engine/cards.js`), `mulberry32` (`core/rng.js`).
- Produces:
  - `pokerTesting.js`:
    - `POKER_SESSION_ID: string` and `POKER_STARTED_AT: string`
    - `pokerHandId(n) → uuid string`
    - `pokerSessionBody(overrides?) → session body`
    - `pokerHandRecord({ seed=1, handNo=1, id=pokerHandId(handNo), sessionId=POKER_SESSION_ID, button=0, heroSeat=0, seatIds=[0..5], stack=200 }?) → HandRecord`
    - `findHandRecord(predicate, options?) → HandRecord` (tries seeds 1..2000)
    - `heroActed(record) → boolean`
    - `heroDecision(record, overrides?) → DecisionRecord`
  - `pokerReplay.js`: `replayHandRecord(record) → { error: string } | { facts: { heroStartStack:number, heroActions:number, holeCards:{seat:number, cards:string}[], board:string } }`. Never throws.

- [ ] **Step 1: Write the fixtures (test support, no test of their own)**

```js
// api/_lib/pokerTesting.js
import { playHand, randomPolicy } from '../../src/private/trainers/poker/engine/simulate.js';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';

// Test-only fixtures for the poker API (not a route: lives under api/_lib).

export const POKER_SESSION_ID = '6d0c3a52-3b7e-4f3a-9d8e-1a2b3c4d5e6f';
export const POKER_STARTED_AT = '2026-09-16T18:00:00.000Z';
const PERSONAS = ['moss', 'viper', 'duchess', 'rook', 'ink', 'brick'];
const ALL_SEATS = [0, 1, 2, 3, 4, 5];

export const pokerHandId = (n) => `b2f4e6a8-1c3d-4e5f-8a9b-${String(n).padStart(12, '0')}`;

const botLineup = (seatIds, heroSeat) =>
  seatIds.filter((seat) => seat !== heroSeat).map((seat, i) => ({ seat, personaId: PERSONAS[i] }));

/** A valid POST /api/trainers/poker/sessions body (contracts §4 session shape). */
export function pokerSessionBody(overrides = {}) {
  return {
    id: POKER_SESSION_ID,
    startedAt: POKER_STARTED_AT,
    botVersion: 'placeholder',
    tableMode: 'random',
    lineup: botLineup(ALL_SEATS, 0),
    heroSeat: 0,
    ...overrides,
  };
}

/** A HandRecord (contracts §4) for a hand played by the engine with random legal actions. */
export function pokerHandRecord({
  seed = 1, handNo = 1, id = pokerHandId(handNo), sessionId = POKER_SESSION_ID,
  button = 0, heroSeat = 0, seatIds = ALL_SEATS, stack = 200,
} = {}) {
  const seats = seatIds.map((seat) => ({ seat, stack }));
  const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng: mulberry32(seed), policy: randomPolicy });
  return {
    v: 1,
    id,
    sessionId,
    handNo,
    playedAt: new Date(Date.parse(POKER_STARTED_AT) + handNo * 60000).toISOString(),
    botVersion: 'placeholder',
    heroSeat,
    buttonSeat: button,
    lineup: botLineup(seatIds, heroSeat),
    startStacks: seats.map((s) => ({ seat: s.seat, stack: s.stack })),
    events,
    heroNet: state.result.net[heroSeat] ?? 0,
    pot: state.players.reduce((sum, p) => sum + p.total, 0),
    showdown: state.result.showdown,
  };
}

export function findHandRecord(predicate, options = {}) {
  for (let seed = 1; seed <= 2000; seed += 1) {
    const record = pokerHandRecord({ ...options, seed });
    if (predicate(record)) return record;
  }
  throw new Error('no seed produced a matching hand');
}

export const heroActed = (record) => record.events.some((e) => e.type === 'act' && e.seat === record.heroSeat);

/** A valid DecisionRecord for the hero's first action in `record`. */
export function heroDecision(record, overrides = {}) {
  const idx = record.events.findIndex((e) => e.type === 'act' && e.seat === record.heroSeat);
  if (idx < 0) throw new Error('hero never acted in this hand');
  const event = record.events[idx];
  return {
    idx,
    street: 'preflop',
    position: 'BTN',
    spot: 'pf.open',
    action: event.action,
    size: event.amount ?? null,
    pot: 3,
    toCall: 2,
    equity: null,
    neededEquity: 0.4,
    recommended: { action: 'fold', size: null, evByOption: { fold: 0, call: -1.5 } },
    evLoss: 1.5,
    grade: 'mistake',
    confident: true,
    analysisVersion: 1,
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test**

```js
// api/_lib/pokerReplay.test.js
import { describe, it, expect } from 'vitest';
import { replayHandRecord } from './pokerReplay.js';
import { pokerHandRecord, findHandRecord, heroActed } from './pokerTesting.js';
import { reduceHand } from '../../src/private/trainers/poker/engine/handState.js';
import { cardsToString } from '../../src/private/trainers/poker/engine/cards.js';

describe('replayHandRecord', () => {
  it('derives the stored facts from a valid showdown hand', () => {
    const record = findHandRecord((r) => r.showdown && heroActed(r));
    const state = reduceHand(record.events);
    const result = replayHandRecord(record);
    expect(result.error).toBeUndefined();
    expect(result.facts).toEqual({
      heroStartStack: 200,
      heroActions: record.events.filter((e) => e.type === 'act' && e.seat === 0).length,
      holeCards: state.players.map((p) => ({ seat: p.seat, cards: cardsToString(p.hole) })),
      board: cardsToString(state.board),
    });
    expect(result.facts.board).toHaveLength(10);
    expect(result.facts.holeCards).toHaveLength(6);
  });

  it('accepts a hand that ended without a showdown', () => {
    expect(replayHandRecord(findHandRecord((r) => !r.showdown)).error).toBeUndefined();
  });

  it.each([
    ['heroNet', (r) => { r.heroNet += 1; }, 'heroNet does not match the replayed result'],
    ['pot', (r) => { r.pot += 2; }, 'pot does not match the replayed contributions'],
    ['showdown', (r) => { r.showdown = !r.showdown; }, 'showdown does not match the replayed result'],
    ['buttonSeat', (r) => { r.buttonSeat = 3; }, 'buttonSeat does not match the start event'],
    ['startStacks', (r) => { r.startStacks[1].stack = 150; }, 'startStacks do not match the start event'],
    ['last event', (r) => { r.events.pop(); }, 'events do not describe a complete hand'],
  ])('rejects a record with a wrong %s', (_name, tamper, message) => {
    const record = structuredClone(pokerHandRecord({ seed: 3 }));
    tamper(record);
    expect(replayHandRecord(record)).toEqual({ error: message });
  });

  it('reports engine rule violations with the engine code', () => {
    const record = structuredClone(pokerHandRecord({ seed: 3 }));
    const i = record.events.findIndex((e) => e.type === 'act');
    record.events[i].seat = (record.events[i].seat + 1) % 6;
    expect(replayHandRecord(record).error).toMatch(/^events are not a legal hand \(NOT_YOUR_TURN: /);
  });

  it('rejects a hero seat that is not in the hand', () => {
    const record = pokerHandRecord({ seatIds: [0, 1, 2, 3, 4], heroSeat: 5 });
    expect(replayHandRecord(record)).toEqual({ error: 'heroSeat is not seated in this hand' });
  });

  it('never throws on logs that cannot be replayed', () => {
    const record = pokerHandRecord();
    expect(replayHandRecord({ ...record, events: [] })).toEqual({ error: 'events do not describe a complete hand' });
    expect(replayHandRecord({ ...record, events: [null] }).error).toMatch(/^events are not a legal hand \(BAD_EVENT: /);
    expect(replayHandRecord({ ...record, events: 'nope' })).toEqual({ error: 'events could not be replayed' });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run api/_lib/pokerReplay.test.js`
Expected: FAIL with a module-not-found error for `./pokerReplay.js`.

- [ ] **Step 4: Write the implementation**

```js
// api/_lib/pokerReplay.js
import { reduceHand, EngineError } from '../../src/private/trainers/poker/engine/handState.js';
import { cardsToString } from '../../src/private/trainers/poker/engine/cards.js';

// The stored hand is only trusted after the engine replays it: the log must be a legal,
// complete hand, and the record's summary fields must agree with the replay. The columns
// derived here (board, hole cards, hero stack and action count) are never taken from the client.

const bySeat = (a, b) => a.seat - b.seat;
const seatStacks = (list) => JSON.stringify(list.map(({ seat, stack }) => ({ seat, stack })).sort(bySeat));

/** @returns {{ error: string } | { facts: { heroStartStack:number, heroActions:number, holeCards:{seat:number, cards:string}[], board:string } }} */
export function replayHandRecord(record) {
  let state;
  try {
    state = reduceHand(record.events);
  } catch (err) {
    if (err instanceof EngineError) return { error: `events are not a legal hand (${err.code}: ${err.message})` };
    return { error: 'events could not be replayed' };
  }
  if (!state || state.street !== 'complete') return { error: 'events do not describe a complete hand' };

  const start = record.events[0];
  if (start.button !== record.buttonSeat) return { error: 'buttonSeat does not match the start event' };
  if (seatStacks(start.seats) !== seatStacks(record.startStacks)) return { error: 'startStacks do not match the start event' };
  const hero = state.players.find((p) => p.seat === record.heroSeat);
  if (!hero) return { error: 'heroSeat is not seated in this hand' };
  if (record.heroNet !== state.result.net[record.heroSeat]) return { error: 'heroNet does not match the replayed result' };
  const pot = state.players.reduce((sum, p) => sum + p.total, 0);
  if (record.pot !== pot) return { error: 'pot does not match the replayed contributions' };
  if (record.showdown !== state.result.showdown) return { error: 'showdown does not match the replayed result' };

  return {
    facts: {
      heroStartStack: start.seats.find((s) => s.seat === record.heroSeat).stack,
      heroActions: record.events.filter((e) => e.type === 'act' && e.seat === record.heroSeat).length,
      holeCards: state.players.map((p) => ({ seat: p.seat, cards: cardsToString(p.hole) })),
      board: cardsToString(state.board),
    },
  };
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run api/_lib/pokerReplay.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add api/_lib/pokerTesting.js api/_lib/pokerReplay.js api/_lib/pokerReplay.test.js
git commit -m "Add poker hand replay checks and API test fixtures

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Request schemas

**Files:**
- Create: `api/_lib/pokerSchemas.js`
- Test: `api/_lib/pokerSchemas.test.js`

**Interfaces:**
- Consumes: `replayHandRecord` (Task 2) and the fixtures from `pokerTesting.js` (Task 2).
- Produces (Zod schemas, with ids lowercased in the output):
  - `pokerSessionOpen`: `{ id, startedAt, botVersion, tableMode:'random'|'custom', lineup:{seat,personaId}[1..5], heroSeat }`
  - `pokerSessionClose`: `{ endedAt: string|null }` (other keys stripped)
  - `openSessionsQuery`: `{ status: 'open' }`
  - `handItem`: `{ hand: HandRecord, decisions: DecisionRecord[] (default []), heroAllinEv: number|null (default null) }`
  - `handsBatch`: `{ hands: handItem[1..50] }`
  - Constants: `MAX_HANDS_PER_BATCH = 50`, `MAX_DECISIONS_PER_HAND = 40`, `MAX_HAND_EVENTS = 500`, `MAX_STACK = 1_000_000`, `MAX_POT = 6_000_000`, `MAX_HAND_NO = 100_000`, `MAX_RECOMMENDED_CHARS = 2000`, `TABLE_MODES`, `POKER_ACTIONS`, `STREETS`, `POSITIONS`, `GRADES`.
  - DecisionRecord: `{ idx, street, position, spot /^[a-z0-9_.]{1,64}$/, action, size:int|null, pot:int, toCall:int, equity:[0,1]|null, neededEquity:[0,1]|null, recommended:{action, size:int|null, evByOption:Record<string,number>}, evLoss:number>=0, grade, confident:boolean, analysisVersion:int>=1 }`

- [ ] **Step 1: Write the failing test**

```js
// api/_lib/pokerSchemas.test.js
import { describe, it, expect } from 'vitest';
import {
  pokerSessionOpen, pokerSessionClose, openSessionsQuery, handItem, handsBatch,
  MAX_HANDS_PER_BATCH, MAX_DECISIONS_PER_HAND, MAX_HAND_EVENTS,
} from './pokerSchemas.js';
import {
  POKER_SESSION_ID, pokerSessionBody, pokerHandRecord, pokerHandId, findHandRecord, heroActed, heroDecision,
} from './pokerTesting.js';

function ok(schema, value) {
  const result = schema.safeParse(value);
  expect(result.error?.issues ?? []).toEqual([]);
  return result.data;
}

function messages(schema, value) {
  const result = schema.safeParse(value);
  expect(result.success).toBe(false);
  return result.error.issues.map((i) => i.message);
}

describe('pokerSessionOpen', () => {
  it('accepts the table session shape and strips unknown keys', () => {
    expect(ok(pokerSessionOpen, { ...pokerSessionBody(), extra: 1 })).toEqual(pokerSessionBody());
  });

  it('lowercases the id', () => {
    expect(ok(pokerSessionOpen, pokerSessionBody({ id: POKER_SESSION_ID.toUpperCase() })).id).toBe(POKER_SESSION_ID);
  });

  it('rejects a lineup that includes the hero or repeats a seat', () => {
    expect(messages(pokerSessionOpen, pokerSessionBody({ lineup: [{ seat: 0, personaId: 'moss' }] })))
      .toContain('lineup must not include the hero seat');
    expect(messages(pokerSessionOpen, pokerSessionBody({ lineup: [{ seat: 1, personaId: 'moss' }, { seat: 1, personaId: 'viper' }] })))
      .toContain('lineup seats must be distinct');
  });

  it('rejects bad fields', () => {
    for (const bad of [{ id: 'nope' }, { tableMode: 'league' }, { heroSeat: 6 }, { lineup: [] }, { botVersion: '' }, { startedAt: 'yesterday' }]) {
      expect(pokerSessionOpen.safeParse(pokerSessionBody(bad)).success).toBe(false);
    }
  });
});

describe('pokerSessionClose and openSessionsQuery', () => {
  it('keeps only endedAt, which may be null for a stale close', () => {
    const endedAt = '2026-09-16T19:00:00.000Z';
    expect(ok(pokerSessionClose, { id: POKER_SESSION_ID, endedAt, hands: 3, net: 10, rebuys: 1 })).toEqual({ endedAt });
    expect(ok(pokerSessionClose, { endedAt: null })).toEqual({ endedAt: null });
    expect(pokerSessionClose.safeParse({}).success).toBe(false);
    expect(pokerSessionClose.safeParse({ endedAt: 'later' }).success).toBe(false);
  });

  it('only lists open sessions', () => {
    expect(ok(openSessionsQuery, { status: 'open' })).toEqual({ status: 'open' });
    expect(openSessionsQuery.safeParse({ status: 'closed' }).success).toBe(false);
  });
});

describe('handItem', () => {
  it('accepts a replayable hand after a JSON round trip and applies defaults', () => {
    const hand = pokerHandRecord();
    const data = ok(handItem, JSON.parse(JSON.stringify({ hand })));
    expect(data.decisions).toEqual([]);
    expect(data.heroAllinEv).toBeNull();
    expect(data.hand.events).toEqual(hand.events);
  });

  it('rejects hidden hole cards, other blinds, a bad lineup and summaries that disagree with the replay', () => {
    const hand = pokerHandRecord();
    const hidden = { ...hand, events: hand.events.map((e) => (e.type === 'hole' && e.seat !== 0 ? { ...e, cards: null } : e)) };
    expect(handItem.safeParse({ hand: hidden }).success).toBe(false);
    const blinds = { ...hand, events: [{ ...hand.events[0], sb: 2, bb: 4 }, ...hand.events.slice(1)] };
    expect(handItem.safeParse({ hand: blinds }).success).toBe(false);
    expect(messages(handItem, { hand: { ...hand, heroNet: hand.heroNet + 1 } })).toContain('heroNet does not match the replayed result');
    expect(messages(handItem, { hand: { ...hand, lineup: [{ seat: 0, personaId: 'moss' }] } })).toContain('lineup must not include the hero seat');
  });

  it('rejects more than MAX_HAND_EVENTS events', () => {
    const hand = pokerHandRecord();
    const events = Array.from({ length: MAX_HAND_EVENTS + 1 }, () => hand.events[1]);
    expect(handItem.safeParse({ hand: { ...hand, events } }).success).toBe(false);
  });

  it('accepts decisions that point at hero actions', () => {
    const hand = findHandRecord(heroActed);
    const decision = heroDecision(hand);
    const data = ok(handItem, { hand, decisions: [decision], heroAllinEv: -12.5 });
    expect(data.decisions).toEqual([decision]);
    expect(data.heroAllinEv).toBe(-12.5);
  });

  it('rejects decisions that miss a hero action, repeat an idx or carry bad values', () => {
    const hand = findHandRecord(heroActed);
    const decision = heroDecision(hand);
    const mismatch = 'decision idx must point at a hero action with the same action';
    const otherSeat = hand.events.findIndex((e) => e.type === 'act' && e.seat !== hand.heroSeat);
    expect(messages(handItem, { hand, decisions: [{ ...decision, idx: otherSeat }] })).toContain(mismatch);
    const otherAction = decision.action === 'fold' ? 'call' : 'fold';
    expect(messages(handItem, { hand, decisions: [{ ...decision, action: otherAction }] })).toContain(mismatch);
    expect(messages(handItem, { hand, decisions: [decision, decision] })).toContain('duplicate decision idx');
    const badValues = [
      { evLoss: -1 }, { equity: 1.5 }, { grade: 'great' }, { spot: 'Bad Spot' }, { analysisVersion: 0 },
      { recommended: { action: 'fold', size: null, evByOption: { fold: 'x' } } },
      { recommended: { action: 'fold', size: null, evByOption: Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`option_${i}`, i])) } },
    ];
    for (const bad of badValues) {
      expect(handItem.safeParse({ hand, decisions: [{ ...decision, ...bad }] }).success).toBe(false);
    }
    const tooMany = Array.from({ length: MAX_DECISIONS_PER_HAND + 1 }, () => decision);
    expect(handItem.safeParse({ hand, decisions: tooMany }).success).toBe(false);
  });
});

describe('handsBatch', () => {
  const second = () => pokerHandRecord({ seed: 2, handNo: 2 });

  it('accepts a batch within the caps', () => {
    expect(MAX_HANDS_PER_BATCH).toBe(50);
    expect(MAX_DECISIONS_PER_HAND).toBe(40);
    expect(ok(handsBatch, { hands: [{ hand: pokerHandRecord() }, { hand: second() }] }).hands).toHaveLength(2);
  });

  it('rejects empty and oversized batches', () => {
    expect(handsBatch.safeParse({ hands: [] }).success).toBe(false);
    const many = Array.from({ length: MAX_HANDS_PER_BATCH + 1 }, (_, i) => ({ hand: pokerHandRecord({ seed: i + 1, handNo: i + 1 }) }));
    expect(handsBatch.safeParse({ hands: many }).success).toBe(false);
  });

  it('rejects duplicate hand ids and hand numbers within a batch', () => {
    expect(messages(handsBatch, { hands: [{ hand: pokerHandRecord() }, { hand: { ...second(), id: pokerHandId(1) } }] }))
      .toContain('duplicate hand id in batch');
    expect(messages(handsBatch, { hands: [{ hand: pokerHandRecord() }, { hand: { ...second(), handNo: 1 } }] }))
      .toContain('duplicate handNo for a session in batch');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/_lib/pokerSchemas.test.js`
Expected: FAIL with a module-not-found error for `./pokerSchemas.js`.

- [ ] **Step 3: Write the implementation**

```js
// api/_lib/pokerSchemas.js
import { z } from 'zod';
import { replayHandRecord } from './pokerReplay.js';

// Request shapes for api/trainers/poker/* (spec §6.3, contracts §4). Chip amounts are
// integer units (1 unit = 0.5 BB); expected values are fractional units.

export const TABLE_MODES = ['random', 'custom'];
export const POKER_ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];
export const STREETS = ['preflop', 'flop', 'turn', 'river'];
export const POSITIONS = ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'];
export const GRADES = ['good', 'inaccuracy', 'mistake', 'blunder'];
export const MAX_HANDS_PER_BATCH = 50;
export const MAX_DECISIONS_PER_HAND = 40;
export const MAX_HAND_EVENTS = 500;
export const MAX_STACK = 1_000_000;
export const MAX_POT = 6 * MAX_STACK;
export const MAX_HAND_NO = 100_000;
export const MAX_RECOMMENDED_CHARS = 2000;

const uuid = z.uuid().transform((id) => id.toLowerCase());
const seat = z.int().min(0).max(5);
const name = z.string().min(1).max(64);
const card = z.int().min(0).max(51);
const stack = z.int().min(1).max(MAX_STACK);
const lineup = z.array(z.object({ seat, personaId: name })).min(1).max(5);

const handEvent = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('start'),
    seats: z.array(z.object({ seat, stack })).min(2).max(6),
    button: seat,
    sb: z.literal(1),
    bb: z.literal(2),
  }),
  z.object({ type: z.literal('hole'), seat, cards: z.array(card).length(2) }),
  z.object({ type: z.literal('board'), cards: z.array(card).min(1).max(3) }),
  z.object({ type: z.literal('act'), seat, action: z.enum(POKER_ACTIONS), amount: stack.nullish() }),
]);

const issuesFor = (ctx) => (message, path) => ctx.addIssue({ code: 'custom', message, path });

function checkLineup(entries, heroSeat, issue, path) {
  const seats = entries.map((entry) => entry.seat);
  if (new Set(seats).size !== seats.length) issue('lineup seats must be distinct', path);
  if (seats.includes(heroSeat)) issue('lineup must not include the hero seat', path);
}

export const pokerSessionOpen = z
  .object({
    id: uuid,
    startedAt: z.iso.datetime(),
    botVersion: name,
    tableMode: z.enum(TABLE_MODES),
    lineup,
    heroSeat: seat,
  })
  .superRefine((s, ctx) => checkLineup(s.lineup, s.heroSeat, issuesFor(ctx), ['lineup']));

// Extra summary keys (id, hands, net, rebuys) are stripped: the server owns those totals.
export const pokerSessionClose = z.object({ endedAt: z.iso.datetime().nullable() });

export const openSessionsQuery = z.object({ status: z.literal('open') });

const handRecord = z.object({
  v: z.literal(1),
  id: uuid,
  sessionId: uuid,
  handNo: z.int().min(1).max(MAX_HAND_NO),
  playedAt: z.iso.datetime(),
  botVersion: name,
  heroSeat: seat,
  buttonSeat: seat,
  lineup,
  startStacks: z.array(z.object({ seat, stack })).min(2).max(6),
  events: z.array(handEvent).min(1).max(MAX_HAND_EVENTS),
  heroNet: z.int().min(-MAX_STACK).max(MAX_POT),
  pot: z.int().min(0).max(MAX_POT),
  showdown: z.boolean(),
});

const decision = z.object({
  idx: z.int().min(0).max(MAX_HAND_EVENTS - 1),
  street: z.enum(STREETS),
  position: z.enum(POSITIONS),
  spot: z.string().regex(/^[a-z0-9_.]{1,64}$/),
  action: z.enum(POKER_ACTIONS),
  size: stack.nullable(),
  pot: z.int().min(0).max(MAX_POT),
  toCall: z.int().min(0).max(MAX_STACK),
  equity: z.number().min(0).max(1).nullable(),
  neededEquity: z.number().min(0).max(1).nullable(),
  recommended: z
    .object({
      action: z.enum(POKER_ACTIONS),
      size: stack.nullable(),
      evByOption: z.record(z.string().min(1).max(32), z.number()),
    })
    .refine((r) => JSON.stringify(r).length <= MAX_RECOMMENDED_CHARS, {
      message: `recommended must serialize to at most ${MAX_RECOMMENDED_CHARS} characters`,
    }),
  evLoss: z.number().min(0).max(MAX_POT),
  grade: z.enum(GRADES),
  confident: z.boolean(),
  analysisVersion: z.int().min(1).max(1000),
});

export const handItem = z
  .object({
    hand: handRecord,
    decisions: z.array(decision).max(MAX_DECISIONS_PER_HAND).default([]),
    heroAllinEv: z.number().min(-MAX_POT).max(MAX_POT).nullable().default(null),
  })
  .superRefine(({ hand, decisions }, ctx) => {
    const issue = issuesFor(ctx);
    checkLineup(hand.lineup, hand.heroSeat, issue, ['hand', 'lineup']);
    const replay = replayHandRecord(hand);
    if (replay.error) {
      issue(replay.error, ['hand', 'events']);
      return;
    }
    const seen = new Set();
    decisions.forEach((d, i) => {
      if (seen.has(d.idx)) issue('duplicate decision idx', ['decisions', i, 'idx']);
      seen.add(d.idx);
      const event = hand.events[d.idx];
      if (!event || event.type !== 'act' || event.seat !== hand.heroSeat || event.action !== d.action) {
        issue('decision idx must point at a hero action with the same action', ['decisions', i, 'idx']);
      }
    });
  });

export const handsBatch = z
  .object({ hands: z.array(handItem).min(1).max(MAX_HANDS_PER_BATCH) })
  .superRefine(({ hands }, ctx) => {
    const issue = issuesFor(ctx);
    const ids = new Set();
    const numbers = new Set();
    hands.forEach(({ hand }, i) => {
      if (ids.has(hand.id)) issue('duplicate hand id in batch', ['hands', i, 'hand', 'id']);
      const key = `${hand.sessionId}:${hand.handNo}`;
      if (numbers.has(key)) issue('duplicate handNo for a session in batch', ['hands', i, 'hand', 'handNo']);
      ids.add(hand.id);
      numbers.add(key);
    });
  });
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/_lib/pokerSchemas.test.js`
Expected: PASS. If Zod runs a `superRefine` on an object whose base shape is invalid and it throws a `TypeError`, stop and report it rather than loosening the schema. The existing `trainerSchemas` tests rely on refinements being skipped in that case.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/pokerSchemas.js api/_lib/pokerSchemas.test.js
git commit -m "Add poker session, hand and decision request schemas

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Sessions API

**Files:**
- Create: `api/_lib/pokerHttp.js`
- Create: `api/trainers/poker/sessions.js`
- Test: `api/trainers/poker/sessions.test.js`

**Interfaces:**
- Consumes: `guard`, `sendError` (`api/_lib/http.js`), `getSql` (`api/_lib/db.js`), `authConfig` (`api/_lib/session.js`), `idQuery` (`api/_lib/trainerSchemas.js`), `pokerSessionOpen`, `pokerSessionClose`, `openSessionsQuery` (Task 3), and the fixtures from Task 2.
- Produces:
  - `sendSessionNotFound(res, sessionIds: string[])` → 409 `{ error: 'Session not saved yet', code: 'SESSION_NOT_FOUND', details: { sessionIds } }`
  - `createPokerSessionsHandler({ getSql?, auth? }) → (req, res) => Promise`, default export, methods `GET, POST, PATCH`:
    - `POST` body `pokerSessionOpen` → 200 `{ id, saved: true, duplicate: boolean }`
    - `PATCH ?id=` body `{ endedAt: string|null }` → 200 `{ id, endedAt, hands, net, allinAdjNet, rebuys, closed: true }` or 409 `SESSION_NOT_FOUND`
    - `GET ?id=` → 200 `{ session, hands, decisions }` (camelCase columns) or 404 `NOT_FOUND`
    - `GET ?status=open` → 200 `{ sessions: [{ id, startedAt, hands, lastActivityAt }] }` (newest first, at most `OPEN_SESSIONS_LIMIT = 20`)
  - URL: `/api/trainers/poker/sessions`. `vite.api-dev.js` already serves nested paths.

- [ ] **Step 1: Write the failing test**

```js
// api/trainers/poker/sessions.test.js
import { describe, it, expect } from 'vitest';
import { createPokerSessionsHandler, OPEN_SESSIONS_LIMIT } from './sessions.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { POKER_SESSION_ID as ID, POKER_STARTED_AT, pokerSessionBody } from '../../_lib/pokerTesting.js';

const make = (sql) => createPokerSessionsHandler({ getSql: () => sql, auth: () => TEST_AUTH });

async function call(sql, options) {
  const res = mockRes();
  await make(sql)(authedReq(options), res);
  return res;
}

describe('api/trainers/poker/sessions', () => {
  it('405 for other methods', async () => {
    const res = await call(mockSql(), { method: 'PUT' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET, POST, PATCH');
  });

  it('401 without a session cookie, never cached', async () => {
    const res = await call(mockSql(), { method: 'POST', authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('500 when the database is not configured', async () => {
    const res = mockRes();
    await createPokerSessionsHandler({ getSql: () => null, auth: () => TEST_AUTH })(authedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe('DB_NOT_CONFIGURED');
  });

  describe('POST', () => {
    it('400 with details for an invalid body', async () => {
      const res = await call(mockSql(), { method: 'POST', body: { id: 'x' } });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
      expect(res.body.details).toBeDefined();
    });

    it('inserts the session idempotently on id', async () => {
      const sql = mockSql([[{ id: ID }]]);
      const res = await call(sql, { method: 'POST', body: pokerSessionBody() });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ id: ID, saved: true, duplicate: false });
      expect(sql.queries).toHaveLength(1);
      const [insert] = sql.queries;
      for (const fragment of ['INSERT INTO poker_sessions', 'ON CONFLICT (id) DO NOTHING', 'RETURNING id']) {
        expect(insert.text).toContain(fragment);
      }
      expect(insert.values).toEqual([ID, 'placeholder', 'random', JSON.stringify(pokerSessionBody().lineup), 0, POKER_STARTED_AT]);
    });

    it('reports a duplicate open', async () => {
      const res = await call(mockSql([[]]), { method: 'POST', body: pokerSessionBody() });
      expect(res.body).toEqual({ id: ID, saved: true, duplicate: true });
    });
  });

  describe('PATCH', () => {
    it('400 without a valid id or endedAt', async () => {
      let res = await call(mockSql(), { method: 'PATCH', query: { id: 'x' }, body: { endedAt: null } });
      expect(res.statusCode).toBe(400);
      res = await call(mockSql(), { method: 'PATCH', query: { id: ID }, body: {} });
      expect(res.statusCode).toBe(400);
      expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    it('409 SESSION_NOT_FOUND when the session row does not exist yet', async () => {
      const res = await call(mockSql([[]]), { method: 'PATCH', query: { id: ID }, body: { endedAt: null } });
      expect(res.statusCode).toBe(409);
      expect(res.body).toEqual({ error: 'Session not saved yet', code: 'SESSION_NOT_FOUND', details: { sessionIds: [ID] } });
    });

    it('closes with the given end time, computes rebuys and ignores client totals', async () => {
      const row = { id: ID, endedAt: '2026-09-16T19:00:00.000Z', hands: 12, net: -35, allinAdjNet: -20.5, rebuys: 1 };
      const sql = mockSql([[row]]);
      const body = { id: ID, endedAt: row.endedAt, hands: 99, net: 555, rebuys: 7 };
      const res = await call(sql, { method: 'PATCH', query: { id: ID }, body });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ ...row, closed: true });
      const [update] = sql.queries;
      for (const fragment of ['lag(hero_start_stack + hero_net) OVER (ORDER BY hand_no)', 'max(played_at)', 'UPDATE poker_sessions s', 'COALESCE(']) {
        expect(update.text).toContain(fragment);
      }
      expect(update.values).toContain(row.endedAt);
      expect(update.values).not.toContain(99);
      expect(update.values).not.toContain(555);
      expect(update.values).not.toContain(7);
    });

    it('a stale close passes a null end time', async () => {
      const sql = mockSql([[{ id: ID, endedAt: POKER_STARTED_AT, hands: 0, net: 0, allinAdjNet: 0, rebuys: 0 }]]);
      const res = await call(sql, { method: 'PATCH', query: { id: ID }, body: { endedAt: null } });
      expect(res.statusCode).toBe(200);
      expect(sql.queries[0].values).toContain(null);
    });
  });

  describe('GET', () => {
    it('400 without a valid id, 404 when missing, 200 with hands and decisions', async () => {
      let res = await call(mockSql(), { query: { id: 'x' } });
      expect(res.statusCode).toBe(400);

      res = await call(mockSql([[]]), { query: { id: ID } });
      expect(res.statusCode).toBe(404);
      expect(res.body.code).toBe('NOT_FOUND');

      const session = { id: ID, hands: 2 };
      const hands = [{ id: 'h1', handNo: 1 }, { id: 'h2', handNo: 2 }];
      const decisions = [{ handId: 'h1', idx: 4 }];
      const sql = mockSql((text) => {
        if (text.includes('FROM poker_decisions d')) return decisions;
        if (text.includes('FROM poker_hands WHERE session_id')) return hands;
        if (text.includes('FROM poker_sessions WHERE id')) return [session];
        return [];
      });
      res = await call(sql, { query: { id: ID } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ session, hands, decisions });
      expect(sql.queries.find((q) => q.text.includes('FROM poker_hands WHERE session_id')).text).toContain('ORDER BY hand_no');
      expect(sql.queries.find((q) => q.text.includes('FROM poker_decisions d')).text).toContain('ORDER BY h.hand_no, d.idx');
    });

    it('lists open sessions with their last activity', async () => {
      const sessions = [{ id: ID, startedAt: POKER_STARTED_AT, hands: 3, lastActivityAt: '2026-09-16T18:03:00.000Z' }];
      const sql = mockSql([sessions]);
      const res = await call(sql, { query: { status: 'open' } });
      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ sessions });
      expect(sql.queries[0].text).toContain('WHERE s.ended_at IS NULL');
      expect(sql.queries[0].text).toContain('GREATEST(s.started_at, max(h.played_at))');
      expect(sql.queries[0].values).toEqual([OPEN_SESSIONS_LIMIT]);
      expect(OPEN_SESSIONS_LIMIT).toBe(20);
    });

    it('400 for an unknown status', async () => {
      const res = await call(mockSql(), { query: { status: 'closed' } });
      expect(res.statusCode).toBe(400);
    });
  });

  it('500 INTERNAL when the database throws', async () => {
    const sql = mockSql(() => Promise.reject(new Error('boom')));
    const errors = [];
    const original = console.error;
    console.error = (...args) => errors.push(args);
    try {
      const res = await call(sql, { method: 'POST', body: pokerSessionBody() });
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
      expect(errors[0][0]).toBe('trainers/poker/sessions failed:');
    } finally {
      console.error = original;
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run api/trainers/poker/sessions.test.js`
Expected: FAIL with a module-not-found error for `./sessions.js`.

- [ ] **Step 3: Write the implementation**

```js
// api/_lib/pokerHttp.js
import { sendError } from './http.js';

// 409, not 404: the outbox retries it, because the session row may simply not be saved yet.
export const sendSessionNotFound = (res, sessionIds) =>
  sendError(res, 409, 'SESSION_NOT_FOUND', 'Session not saved yet', { sessionIds });
```

```js
// api/trainers/poker/sessions.js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { idQuery } from '../../_lib/trainerSchemas.js';
import { pokerSessionOpen, pokerSessionClose, openSessionsQuery } from '../../_lib/pokerSchemas.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST  /api/trainers/poker/sessions              open a session (idempotent on id)
// PATCH /api/trainers/poker/sessions?id=          close it: { endedAt } (null = stale close at the last hand)
// GET   /api/trainers/poker/sessions?id=          one session with its hands and decisions (review)
// GET   /api/trainers/poker/sessions?status=open  sessions never closed (stale-session cleanup)
// Amounts are integer units (1 unit = 0.5 BB).

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
  const parsed = idQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'A valid session id is required', parsed.error);
  const { id } = parsed.data;
  const [session] = await sql`
    SELECT id, bot_version AS "botVersion", table_mode AS "tableMode", lineup, hero_seat AS "heroSeat",
           started_at AS "startedAt", ended_at AS "endedAt", hands, net,
           allin_adj_net::float8 AS "allinAdjNet", rebuys
    FROM poker_sessions WHERE id = ${id}`;
  if (!session) return sendError(res, 404, 'NOT_FOUND', 'Session not found');
  const [hands, decisions] = await Promise.all([
    sql`
      SELECT id, hand_no AS "handNo", played_at AS "playedAt", button_seat AS "buttonSeat", hero_seat AS "heroSeat",
             hero_start_stack AS "heroStartStack", lineup, hole_cards AS "holeCards", board, events, pot,
             hero_net AS "heroNet", hero_allin_ev::float8 AS "heroAllinEv", showdown
      FROM poker_hands WHERE session_id = ${id} ORDER BY hand_no`,
    sql`
      SELECT d.hand_id AS "handId", d.idx, d.street, d.position, d.spot, d.action, d.size, d.pot,
             d.to_call AS "toCall", d.equity, d.needed_equity AS "neededEquity", d.recommended,
             d.ev_loss AS "evLoss", d.grade, d.confident, d.analysis_version AS "analysisVersion"
      FROM poker_decisions d JOIN poker_hands h ON h.id = d.hand_id
      WHERE h.session_id = ${id} ORDER BY h.hand_no, d.idx`,
  ]);
  return res.status(200).json({ session, hands, decisions });
}

async function listOpen(sql, req, res) {
  const parsed = openSessionsQuery.safeParse(req.query ?? {});
  if (!parsed.success) return invalid(res, 'status must be open', parsed.error);
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

export function createPokerSessionsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET', 'POST', 'PATCH'], auth, getSql });
    if (!sql) return undefined;
    try {
      if (req.method === 'POST') return await open(sql, req, res);
      if (req.method === 'PATCH') return await close(sql, req, res);
      return req.query?.status !== undefined ? await listOpen(sql, req, res) : await read(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/sessions failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerSessionsHandler();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run api/trainers/poker/sessions.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/pokerHttp.js api/trainers/poker/sessions.js api/trainers/poker/sessions.test.js
git commit -m "Add poker sessions API: open, close, review read and open-session list

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Hands API and plain-Node import check

**Files:**
- Create: `api/trainers/poker/hands.js`
- Test: `api/trainers/poker/hands.test.js`
- Test: `api/_lib/pokerBundle.test.js`

**Interfaces:**
- Consumes: `handsBatch` (Task 3), `replayHandRecord` (Task 2), `sendSessionNotFound` (Task 4), the `guard`/`sendError`/`getSql`/`authConfig` helpers, and the fixtures from Task 2.
- Produces: `createPokerHandsHandler({ getSql?, auth? })`, default export, method `POST` only, URL `/api/trainers/poker/hands`.
  - Body `{ hands: [{ hand, decisions?, heroAllinEv? }] }` → 200 `{ saved: true, inserted: number, duplicate: number }`.
  - 409 `SESSION_NOT_FOUND` with `details.sessionIds` (missing ids, in batch order) before anything is inserted.
  - Inserts are idempotent on hand `id` and on `(session_id, hand_no)`. Decisions are inserted only for newly inserted hands, and `poker_sessions.hands/net/allin_adj_net` are incremented only for newly inserted hands, all in one statement.

- [ ] **Step 1: Write the failing tests**

```js
// api/trainers/poker/hands.test.js
import { describe, it, expect } from 'vitest';
import { createPokerHandsHandler } from './hands.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import {
  POKER_SESSION_ID, pokerHandRecord, pokerHandId, findHandRecord, heroActed, heroDecision,
} from '../../_lib/pokerTesting.js';
import { reduceHand } from '../../../src/private/trainers/poker/engine/handState.js';
import { cardsToString } from '../../../src/private/trainers/poker/engine/cards.js';

const OTHER_SESSION_ID = '7e1d4b63-4c8f-4a4b-8e9f-2b3c4d5e6f70';
const make = (sql) => createPokerHandsHandler({ getSql: () => sql, auth: () => TEST_AUTH });

async function call(sql, options) {
  const res = mockRes();
  await make(sql)(authedReq(options), res);
  return res;
}

function db({ sessions = [{ id: POKER_SESSION_ID }], inserted = 1 } = {}) {
  return mockSql((text) => {
    if (text.includes('jsonb_array_elements_text')) return sessions;
    if (text.includes('WITH ins AS')) return [{ inserted }];
    return [];
  });
}

describe('api/trainers/poker/hands', () => {
  it('405 for GET', async () => {
    const res = await call(db(), { method: 'GET' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('POST');
  });

  it('401 without a session cookie, never cached', async () => {
    const res = await call(db(), { method: 'POST', authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('400 with details for an invalid batch', async () => {
    const res = await call(db(), { method: 'POST', body: { hands: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.details).toBeDefined();
  });

  it('409 SESSION_NOT_FOUND before inserting anything', async () => {
    const sql = db({ sessions: [] });
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(res.statusCode).toBe(409);
    expect(res.body).toEqual({ error: 'Session not saved yet', code: 'SESSION_NOT_FOUND', details: { sessionIds: [POKER_SESSION_ID] } });
    expect(sql.queries).toHaveLength(1);
    expect(JSON.parse(sql.queries[0].values[0])).toEqual([POKER_SESSION_ID]);
  });

  it('looks up each distinct session once and reports only the missing ones', async () => {
    const sql = db({ sessions: [{ id: POKER_SESSION_ID }] });
    const hands = [
      { hand: pokerHandRecord({ handNo: 1 }) },
      { hand: pokerHandRecord({ seed: 2, handNo: 2 }) },
      { hand: pokerHandRecord({ seed: 3, handNo: 1, id: pokerHandId(3), sessionId: OTHER_SESSION_ID }) },
    ];
    const res = await call(sql, { method: 'POST', body: { hands } });
    expect(res.statusCode).toBe(409);
    expect(res.body.details).toEqual({ sessionIds: [OTHER_SESSION_ID] });
    expect(JSON.parse(sql.queries[0].values[0])).toEqual([POKER_SESSION_ID, OTHER_SESSION_ID]);
  });

  it('inserts hands, decisions and session totals in one statement', async () => {
    const hand = findHandRecord(heroActed);
    const decision = heroDecision(hand);
    const sql = db();
    const res = await call(sql, { method: 'POST', body: { hands: [{ hand, decisions: [decision], heroAllinEv: 4.25 }] } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ saved: true, inserted: 1, duplicate: 0 });
    expect(sql.queries).toHaveLength(2);

    const insert = sql.queries[1];
    for (const fragment of [
      'INSERT INTO poker_hands', 'ON CONFLICT DO NOTHING', 'RETURNING id, session_id, hero_net, hero_allin_ev',
      'INSERT INTO poker_decisions', 'JOIN ins ON ins.id = y.hand_id',
      'UPDATE poker_sessions s', 'COALESCE(hero_allin_ev, hero_net)',
    ]) {
      expect(insert.text).toContain(fragment);
    }
    expect(insert.values).toHaveLength(2);
    const [handRows, decisionRows] = insert.values.map((v) => JSON.parse(v));

    const state = reduceHand(hand.events);
    expect(handRows).toEqual([{
      id: hand.id,
      session_id: POKER_SESSION_ID,
      hand_no: 1,
      played_at: hand.playedAt,
      button_seat: 0,
      hero_seat: 0,
      hero_start_stack: 200,
      hero_actions: hand.events.filter((e) => e.type === 'act' && e.seat === 0).length,
      lineup: hand.lineup,
      hole_cards: state.players.map((p) => ({ seat: p.seat, cards: cardsToString(p.hole) })),
      board: cardsToString(state.board),
      events: hand.events,
      pot: hand.pot,
      hero_net: hand.heroNet,
      hero_allin_ev: 4.25,
      showdown: hand.showdown,
    }]);
    expect(decisionRows).toEqual([{
      hand_id: hand.id,
      idx: decision.idx,
      street: 'preflop',
      position: 'BTN',
      spot: 'pf.open',
      action: decision.action,
      size: decision.size,
      pot: 3,
      to_call: 2,
      equity: null,
      needed_equity: 0.4,
      recommended: decision.recommended,
      ev_loss: 1.5,
      grade: 'mistake',
      confident: true,
      analysis_version: 1,
    }]);
  });

  it('reports duplicates on a retry', async () => {
    const res = await call(db({ inserted: 0 }), { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ saved: true, inserted: 0, duplicate: 1 });
  });

  it('500 INTERNAL when the database throws', async () => {
    const sql = mockSql(() => Promise.reject(new Error('boom')));
    const original = console.error;
    console.error = () => {};
    try {
      const res = await call(sql, { method: 'POST', body: { hands: [{ hand: pokerHandRecord() }] } });
      expect(res.statusCode).toBe(500);
      expect(res.body.code).toBe('INTERNAL');
    } finally {
      console.error = original;
    }
  });
});
```

```js
// api/_lib/pokerBundle.test.js
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Vercel traces each function's static imports into its bundle and runs it in plain Node,
// not through Vite. Importing every poker function in a fresh Node process proves each
// import (including the ../../../src engine and bot modules) resolves without Vite.
const ROOT_URL = new URL('../../', import.meta.url);
const POKER_FUNCTIONS = [
  'api/trainers/poker/sessions.js',
  'api/trainers/poker/hands.js',
];

describe('poker API functions load in plain Node', () => {
  it.each(POKER_FUNCTIONS)('%s', (file) => {
    const url = new URL(file, ROOT_URL).href;
    const script = `const m = await import(${JSON.stringify(url)}); console.log(typeof m.default);`;
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: fileURLToPath(ROOT_URL),
      encoding: 'utf8',
    });
    expect(out.trim()).toBe('function');
  }, 20000);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run api/trainers/poker/hands.test.js api/_lib/pokerBundle.test.js`
Expected: FAIL. `hands.test.js` cannot load `./hands.js`. The `hands.js` case in `pokerBundle.test.js` fails with `ERR_MODULE_NOT_FOUND`, and `sessions.js` passes.

- [ ] **Step 3: Write the implementation**

```js
// api/trainers/poker/hands.js
import { z } from 'zod';
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { handsBatch } from '../../_lib/pokerSchemas.js';
import { replayHandRecord } from '../../_lib/pokerReplay.js';
import { sendSessionNotFound } from '../../_lib/pokerHttp.js';

// POST /api/trainers/poker/hands  { hands: [{ hand, decisions?, heroAllinEv? }] }
// At most 50 hands and 40 decisions per hand. Amounts are integer units (1 unit = 0.5 BB).

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
    SELECT id FROM poker_sessions
    WHERE id IN (SELECT value::uuid FROM jsonb_array_elements_text(${JSON.stringify(sessionIds)}::jsonb))`;
  const known = new Set(found.map((r) => r.id));
  const missing = sessionIds.filter((id) => !known.has(id));
  if (missing.length > 0) return sendSessionNotFound(res, missing);

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
      RETURNING id, session_id, hero_net, hero_allin_ev
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
      UPDATE poker_sessions s
      SET hands = s.hands + t.n, net = s.net + t.net, allin_adj_net = s.allin_adj_net + t.adj
      FROM (
        SELECT session_id, count(*)::int AS n, sum(hero_net)::int AS net,
               sum(COALESCE(hero_allin_ev, hero_net)) AS adj
        FROM ins GROUP BY session_id
      ) t
      WHERE s.id = t.session_id
    )
    SELECT count(*)::int AS inserted FROM ins`;

  return res.status(200).json({ saved: true, inserted, duplicate: hands.length - inserted });
}

export function createPokerHandsHandler({ getSql = defaultGetSql, auth = authConfig } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['POST'], auth, getSql });
    if (!sql) return undefined;
    try {
      return await save(sql, req, res);
    } catch (err) {
      console.error('trainers/poker/hands failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerHandsHandler();
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run api/trainers/poker/hands.test.js api/_lib/pokerBundle.test.js`
Expected: PASS (both bundle cases print `function`).

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add api/trainers/poker/hands.js api/trainers/poker/hands.test.js api/_lib/pokerBundle.test.js
git commit -m "Add idempotent poker hands API with session ordering and totals

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Opt-in real-database check

The existing trainers have no real-DB test. This one is new, and it is skipped unless `POKER_DB_IT=1` and `DATABASE_URL` are both set. It proves that the SQL in Tasks 1, 4 and 5 actually runs on Postgres. That matters because the unit tests only inspect SQL text.

**Files:**
- Create: `api/trainers/poker/realDb.test.js`

**Interfaces:**
- Consumes: `createPokerSessionsHandler` (Task 4), `createPokerHandsHandler` (Task 5), `getSql`, `mockRes`, `authedReq`, `TEST_AUTH`, and the fixtures from Task 2.
- Produces: nothing used by later tasks.

- [ ] **Step 1: Write the test**

```js
// api/trainers/poker/realDb.test.js
import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { getSql } from '../../_lib/db.js';
import { mockRes, authedReq, TEST_AUTH } from '../../_lib/testing.js';
import { pokerSessionBody, pokerHandRecord, findHandRecord, heroActed, heroDecision } from '../../_lib/pokerTesting.js';
import { createPokerSessionsHandler } from './sessions.js';
import { createPokerHandsHandler } from './hands.js';

// Opt-in: POKER_DB_IT=1 with DATABASE_URL pointing at a migrated, disposable database
// (a Neon branch, never production). It writes one session and deletes it afterwards.
const RUN = Boolean(process.env.POKER_DB_IT && process.env.DATABASE_URL);
const auth = () => TEST_AUTH;

async function call(handler, options) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

describe.skipIf(!RUN)('poker persistence against a real database', () => {
  const sessionId = randomUUID();
  const sessions = createPokerSessionsHandler({ auth });
  const hands = createPokerHandsHandler({ auth });

  afterAll(async () => {
    await getSql()`DELETE FROM poker_sessions WHERE id = ${sessionId}`;
  });

  it('saves, deduplicates, totals, closes and reads back a session', async () => {
    const first = findHandRecord(heroActed, { id: randomUUID(), sessionId, handNo: 1 });
    const second = pokerHandRecord({ id: randomUUID(), sessionId, handNo: 2, seed: 99, button: 1 });
    const batch = { hands: [{ hand: first, decisions: [heroDecision(first)] }, { hand: second }] };

    let res = await call(hands, { method: 'POST', body: batch });
    expect(res.statusCode).toBe(409);
    expect(res.body.code).toBe('SESSION_NOT_FOUND');

    res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: sessionId }) });
    expect(res.body).toEqual({ id: sessionId, saved: true, duplicate: false });
    res = await call(sessions, { method: 'POST', body: pokerSessionBody({ id: sessionId }) });
    expect(res.body.duplicate).toBe(true);

    res = await call(hands, { method: 'POST', body: batch });
    expect(res.body).toEqual({ saved: true, inserted: 2, duplicate: 0 });
    res = await call(hands, { method: 'POST', body: batch });
    expect(res.body).toEqual({ saved: true, inserted: 0, duplicate: 2 });

    res = await call(sessions, { query: { status: 'open' } });
    expect(res.body.sessions.map((s) => s.id)).toContain(sessionId);

    const endedAt = '2026-09-16T19:00:00.000Z';
    res = await call(sessions, { method: 'PATCH', query: { id: sessionId }, body: { endedAt } });
    expect(res.statusCode).toBe(200);
    const net = first.heroNet + second.heroNet;
    expect(res.body).toMatchObject({ id: sessionId, closed: true, hands: 2, net, allinAdjNet: net, rebuys: 200 > 200 + first.heroNet ? 1 : 0 });
    expect(new Date(res.body.endedAt).toISOString()).toBe(endedAt);

    res = await call(sessions, { query: { status: 'open' } });
    expect(res.body.sessions.map((s) => s.id)).not.toContain(sessionId);

    res = await call(sessions, { query: { id: sessionId } });
    expect(res.statusCode).toBe(200);
    expect(res.body.hands.map((h) => h.handNo)).toEqual([1, 2]);
    expect(res.body.hands[0].events).toEqual(first.events);
    expect(res.body.decisions).toHaveLength(1);
    expect(res.body.session.hands).toBe(2);
  });
});
```

- [ ] **Step 2: Verify it is skipped by default**

Run: `npx vitest run api/trainers/poker/realDb.test.js`
Expected: the file reports 1 test **skipped**, with no failures.

- [ ] **Step 3: (Optional, only with the controller's go-ahead) Run it against a disposable Neon branch**

This writes to a database, so ask the controller first. The controller confirms with the user and supplies a branch `DATABASE_URL`. Then run, in Git Bash:

```bash
DATABASE_URL='<branch url from the controller>' npm run db:migrate
POKER_DB_IT=1 DATABASE_URL='<branch url from the controller>' npx vitest run api/trainers/poker/realDb.test.js
```

Expected: `Applied 002_poker.sql` (or `Database is up to date.`), then 1 test passed. If it fails, report the Postgres error verbatim. Do not change SQL without re-running Tasks 4 and 5's tests.

- [ ] **Step 4: Run the full suite**

Run: `npm test`
Expected: all tests pass (this file skipped).

- [ ] **Step 5: Commit**

```bash
git add api/trainers/poker/realDb.test.js
git commit -m "Add opt-in real-database check for poker persistence

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Outbox ordered groups

**Files:**
- Modify: `src/private/trainers/lib/outbox.js` (full replacement below)
- Modify: `src/private/trainers/lib/outboxInstance.js` (full replacement below)
- Test: `src/private/trainers/lib/outbox.test.js` (append only: update the import line, then add new `describe` blocks at the end. Every existing test stays unchanged.)

**Interfaces:**
- Consumes: `ApiError` (`lib/api.js`).
- Produces (backwards compatible, since every new option has a default that reproduces today's behavior):
  - `createOutbox({ storage, send, now?, key?, idOf?, groupOf?, isPermanent? })`
    - `idOf(payload) → string` (default `payload?.session?.id`): the entry id for `enqueue` and stored-entry validation
    - `groupOf(payload) → string|null` (default `() => null`): an entry is sent only after every earlier **pending** entry of its group. Failed entries do not hold a group back.
    - `isPermanent(err, entry) → boolean` (default `isPermanentError`)
  - The returned object adds `key: string` and `hasQueued(group) → boolean` (true when any pending or failed entry belongs to `group`). `nextDueIn()` now ignores entries that are waiting behind an earlier entry of their group.
  - `startOutboxWorker(outbox, opts)` reacts to `storage` events for `outbox.key ?? OUTBOX_KEY`.
  - `browserStorage(win = globalThis.window) → Storage`: `win.localStorage` when usable, else `memoryStorage()`.

- [ ] **Step 1: Write the failing tests**

In `src/private/trainers/lib/outbox.test.js`, replace only the import block at the top:

```js
import {
  OUTBOX_KEY, MAX_ERROR_CHARS, memoryStorage, backoffMs, isPermanentError, describeError, createOutbox, startOutboxWorker,
} from './outbox.js';
```

with:

```js
import {
  OUTBOX_KEY, MAX_ERROR_CHARS, memoryStorage, browserStorage, backoffMs, isPermanentError, describeError, createOutbox, startOutboxWorker,
} from './outbox.js';
```

Then append at the end of the file:

```js
describe('browserStorage', () => {
  it('uses the window localStorage when it works', () => {
    const storage = memoryStorage();
    expect(browserStorage({ localStorage: storage })).toBe(storage);
  });

  it('falls back to memory when localStorage throws or there is no window', () => {
    const blocked = { get localStorage() { throw new Error('blocked'); } };
    const fallback = browserStorage(blocked);
    fallback.setItem('k', 'v');
    expect(fallback.getItem('k')).toBe('v');
    expect(browserStorage(undefined).getItem('k')).toBeNull();
  });
});

describe('ordered groups and custom ids', () => {
  const item = (id, group) => (group === undefined ? { id } : { id, sessionId: group });

  function grouped({ send = vi.fn(async () => ({})), storage = memoryStorage(), isPermanent } = {}) {
    let t = 1000;
    const clock = { now: () => t, advance: (ms) => { t += ms; } };
    const outbox = createOutbox({
      storage,
      send,
      now: clock.now,
      key: 'test-outbox',
      idOf: (p) => p?.id,
      groupOf: (p) => p?.sessionId ?? null,
      ...(isPermanent ? { isPermanent } : {}),
    });
    return { outbox, send, storage, clock };
  }

  const sentIds = (send) => send.mock.calls.map(([p]) => p.id);

  it('uses idOf for de-duplication and stored-entry validation, under its own key', () => {
    const { outbox, storage } = grouped();
    outbox.enqueue(item('open:s1', 's1'));
    outbox.enqueue(item('open:s1', 's1'));
    expect(outbox.key).toBe('test-outbox');
    expect(outbox.snapshot().pendingIds).toEqual(['open:s1']);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    const stored = JSON.parse(storage.getItem('test-outbox'));
    storage.setItem('test-outbox', JSON.stringify([...stored, { ...stored[0], id: 'mismatch' }]));
    expect(grouped({ storage }).outbox.snapshot().pendingIds).toEqual(['open:s1']);
  });

  it('holds later entries of a group while an earlier one is pending, then sends them in order', async () => {
    let offline = true;
    const send = vi.fn(async () => {
      if (offline) throw new TypeError('offline');
      return {};
    });
    const { outbox, clock } = grouped({ send });
    outbox.enqueue(item('open:s1', 's1'));
    outbox.enqueue(item('hand:h1', 's1'));
    outbox.enqueue(item('close:s1', 's1'));
    await outbox.flush();
    expect(sentIds(send)).toEqual(['open:s1']);
    // The held hand has nextAt 0, but only the group's head decides when to retry.
    expect(outbox.nextDueIn()).toBe(1000);
    offline = false;
    clock.advance(1000);
    await outbox.flush();
    expect(sentIds(send)).toEqual(['open:s1', 'open:s1', 'hand:h1', 'close:s1']);
    expect(outbox.snapshot().pendingIds).toEqual([]);
    expect(outbox.nextDueIn()).toBeNull();
  });

  it('holds a group behind an earlier entry that is not due yet', async () => {
    let openFailures = 1;
    const send = vi.fn(async (p) => {
      if (p.id === 'open:s1' && openFailures > 0) {
        openFailures -= 1;
        throw new TypeError('offline');
      }
      return {};
    });
    const { outbox } = grouped({ send });
    outbox.enqueue(item('open:s1', 's1'));
    await outbox.flush();
    outbox.enqueue(item('hand:h1', 's1'));
    await outbox.flush();
    expect(sentIds(send)).toEqual(['open:s1']);
    expect(outbox.snapshot().pendingIds).toEqual(['open:s1', 'hand:h1']);
  });

  it('does not let a failed entry hold back the rest of its group', async () => {
    const send = vi.fn(async (p) => {
      if (p.id === 'hand:h1') throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid hands payload');
      return {};
    });
    const { outbox } = grouped({ send });
    ['open:s1', 'hand:h1', 'hand:h2', 'close:s1'].forEach((id) => outbox.enqueue(item(id, 's1')));
    await outbox.flush();
    expect(sentIds(send)).toEqual(['open:s1', 'hand:h1', 'hand:h2', 'close:s1']);
    expect(outbox.snapshot()).toEqual({ pendingIds: [], failed: [{ id: 'hand:h1', lastError: 'Invalid hands payload' }], discardedIds: [] });
  });

  it('keeps groups independent and never holds ungrouped entries', async () => {
    const send = vi.fn(async (p) => {
      if (p.sessionId === 's1') throw new TypeError('offline');
      return {};
    });
    const { outbox } = grouped({ send });
    outbox.enqueue(item('open:s1', 's1'));
    outbox.enqueue(item('hand:a', 's1'));
    outbox.enqueue(item('open:s2', 's2'));
    outbox.enqueue(item('solo'));
    await outbox.flush();
    expect(sentIds(send)).toEqual(['open:s1', 'open:s2', 'solo']);
    expect(outbox.snapshot().pendingIds).toEqual(['open:s1', 'hand:a']);
  });

  it('passes the entry to isPermanent', async () => {
    const isPermanent = vi.fn((_err, entry) => entry.attempts >= 1);
    const send = vi.fn(async () => { throw new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet'); });
    const { outbox, clock } = grouped({ send, isPermanent });
    outbox.enqueue(item('hand:h1', 's1'));
    await outbox.flush();
    expect(isPermanent).toHaveBeenCalledWith(expect.any(ApiError), expect.objectContaining({ id: 'hand:h1', attempts: 0 }));
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
    clock.advance(1000);
    await outbox.flush();
    expect(outbox.snapshot().failed).toEqual([{ id: 'hand:h1', lastError: 'Session not saved yet' }]);
  });

  it('hasQueued reports pending and failed entries of a group', async () => {
    const send = vi.fn(async () => { throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid'); });
    const { outbox } = grouped({ send });
    expect(outbox.hasQueued('s1')).toBe(false);
    outbox.enqueue(item('open:s1', 's1'));
    expect(outbox.hasQueued('s1')).toBe(true);
    await outbox.flush();
    expect(outbox.snapshot().failed).toHaveLength(1);
    expect(outbox.hasQueued('s1')).toBe(true);
    expect(outbox.hasQueued('s2')).toBe(false);
    outbox.discard('open:s1');
    expect(outbox.hasQueued('s1')).toBe(false);
  });

  it('startOutboxWorker listens for the outbox\'s own storage key', async () => {
    const send = vi.fn(async () => ({}));
    const storage = memoryStorage();
    const { outbox } = grouped({ send, storage });
    const other = grouped({ storage }).outbox;
    const listeners = {};
    const win = { addEventListener: (e, fn) => { listeners[e] = fn; }, removeEventListener: vi.fn() };
    const worker = startOutboxWorker(outbox, { win, setTimeoutImpl: vi.fn(() => 1), clearTimeoutImpl: vi.fn() });
    await worker.run();

    other.enqueue(item('open:s9', 's9'));
    listeners.storage({ key: OUTBOX_KEY });
    await worker.run();
    expect(send).not.toHaveBeenCalled();

    listeners.storage({ key: 'test-outbox' });
    await worker.run();
    expect(send).toHaveBeenCalledWith(item('open:s9', 's9'));
    worker.stop();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/lib/outbox.test.js`
Expected: FAIL. The new cases fail (`browserStorage is not a function`, `outbox.key` undefined, and entries not held back or not found by `idOf`). All pre-existing cases still pass.

- [ ] **Step 3: Write the implementation**

Replace `src/private/trainers/lib/outbox.js` with:

```js
import { ApiError } from './api.js';

// Durable queue for finished games: a game is never lost to a failed request.
// Entries persist in localStorage (memory fallback) until the server accepts them.
// Several tabs can share one storage key: every mutation re-reads storage and
// applies its change to that fresh list, so tabs never erase each other's games.
// Optional ordered groups (groupOf): an entry is sent only after every earlier
// pending entry of its group was sent, so a poker session row is saved before its
// hands and its close. A failed (rejected) entry does not hold its group back.

export const OUTBOX_KEY = 'trn-outbox-v1';
export const MAX_ERROR_CHARS = 240;
const MAX_ERROR_DETAILS = 3;
const AUTH_RETRY_MS = 60000;
const FLUSH_ERROR_RETRY_MS = 60000;
const STATUSES = ['pending', 'failed'];

// Safely derives a message from anything a rejected promise might carry,
// including undefined/null, so a malformed rejection can never crash a caller.
function errorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

// Messages from a z.flattenError() shape: { formErrors: string[], fieldErrors: { field: string[] } }.
function detailMessages(details) {
  if (!details || typeof details !== 'object') return [];
  const form = Array.isArray(details.formErrors) ? details.formErrors.filter((m) => typeof m === 'string') : [];
  const fieldErrors = details.fieldErrors && typeof details.fieldErrors === 'object' ? details.fieldErrors : {};
  const fields = Object.entries(fieldErrors).flatMap(([field, messages]) =>
    (Array.isArray(messages) ? messages.filter((m) => typeof m === 'string').map((m) => `${field}: ${m}`) : []));
  return [...form, ...fields];
}

/** Concise, bounded description of a send failure, including validation details when present. */
export function describeError(err) {
  const message = errorMessage(err);
  const parts = err instanceof ApiError ? detailMessages(err.details).slice(0, MAX_ERROR_DETAILS) : [];
  const text = parts.length > 0 ? `${message} (${parts.join('; ')})` : message;
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS - 1)}…` : text;
}

export function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** window.localStorage when it is usable (not blocked or missing), otherwise memory storage. */
export function browserStorage(win = globalThis.window) {
  try {
    const s = win.localStorage;
    s.setItem('__trn_probe', '1');
    s.removeItem('__trn_probe');
    return s;
  } catch {
    return memoryStorage();
  }
}

export const backoffMs = (attempts) => Math.min(60000, 1000 * 2 ** Math.max(0, attempts - 1));

export function isPermanentError(err) {
  return err instanceof ApiError && err.status >= 400 && err.status < 500 && ![401, 408, 429].includes(err.status);
}

const isCount = (n) => Number.isFinite(n) && n >= 0;
const sessionPayloadId = (payload) => payload?.session?.id;
const ungrouped = () => null;

function isValidEntry(e, idOf) {
  return (
    e !== null && typeof e === 'object'
    && typeof e.id === 'string'
    && idOf(e.payload) === e.id
    && isCount(e.attempts)
    && isCount(e.nextAt)
    && STATUSES.includes(e.status)
    && (e.lastError === null || typeof e.lastError === 'string')
  );
}

export function createOutbox({
  storage,
  send,
  now = Date.now,
  key = OUTBOX_KEY,
  idOf = sessionPayloadId,
  groupOf = ungrouped,
  isPermanent = isPermanentError,
}) {
  let entries = [];
  // After a failed write (storage full or blocked) storage is stale, so the
  // in-memory list stays authoritative until a write succeeds again.
  let writeFailed = false;
  let inFlight = null;
  const listeners = new Set();
  // Ids discarded during this page's lifetime, kept in memory only (never
  // persisted): a discarded game must keep reading as discarded here even
  // after it's gone from storage, instead of falling back to "saved".
  const discardedIds = new Set();

  // Stored entries, keeping only well-formed ones; null when storage can't be read.
  function readStored() {
    let raw;
    try {
      raw = storage.getItem(key);
    } catch {
      return null;
    }
    try {
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed.filter((e) => isValidEntry(e, idOf)) : [];
    } catch {
      return [];
    }
  }

  function load() {
    const stored = writeFailed ? null : readStored();
    return stored ?? entries;
  }

  function buildSnapshot() {
    return {
      pendingIds: entries.filter((e) => e.status === 'pending').map((e) => e.id),
      failed: entries.filter((e) => e.status === 'failed').map(({ id, lastError }) => ({ id, lastError })),
      discardedIds: [...discardedIds],
    };
  }

  entries = load();
  let snap = buildSnapshot();

  function publish(next) {
    entries = next;
    snap = buildSnapshot();
    listeners.forEach((l) => l());
  }

  // Applies fn to the freshest list, persists it, then updates memory + subscribers.
  function mutate(fn) {
    const next = fn(load());
    try {
      storage.setItem(key, JSON.stringify(next));
      writeFailed = false;
    } catch {
      // storage blocked or full: keep the in-memory queue for this page's lifetime
      writeFailed = true;
    }
    publish(next);
  }

  function refresh() {
    publish(load());
  }

  function update(id, patchFn) {
    mutate((list) => list.map((e) => (e.id === id ? { ...e, ...patchFn(e) } : e)));
  }

  function enqueue(payload) {
    const id = idOf(payload);
    mutate((list) => (list.some((e) => e.id === id)
      ? list
      : [...list, { id, payload, attempts: 0, nextAt: 0, status: 'pending', lastError: null }]));
  }

  function discard(id) {
    mutate((list) => list.filter((e) => {
      const remove = e.id === id && e.status === 'failed';
      if (remove) discardedIds.add(id);
      return !remove;
    }));
  }

  async function runFlush() {
    let sent = 0;
    const startedAt = now();
    // Groups whose earlier entry is still unsent in this pass: their later entries wait.
    const held = new Set();
    for (const entry of entries.filter((e) => e.status === 'pending')) {
      const group = groupOf(entry.payload);
      if (group !== null && held.has(group)) continue;
      if (entry.nextAt > startedAt) {
        if (group !== null) held.add(group);
        continue;
      }
      try {
        await send(entry.payload);
        mutate((list) => list.filter((e) => e.id !== entry.id));
        sent += 1;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return { sent, authRequired: true };
        const lastError = describeError(err);
        if (isPermanent(err, entry)) {
          update(entry.id, () => ({ status: 'failed', lastError }));
        } else {
          if (group !== null) held.add(group);
          update(entry.id, (e) => ({ attempts: e.attempts + 1, nextAt: now() + backoffMs(e.attempts + 1), lastError }));
        }
      }
    }
    return { sent, authRequired: false };
  }

  function flush() {
    inFlight ??= runFlush().finally(() => { inFlight = null; });
    return inFlight;
  }

  function nextDueIn() {
    const due = [];
    const heads = new Set();
    for (const e of entries) {
      if (e.status !== 'pending') continue;
      const group = groupOf(e.payload);
      if (group !== null) {
        if (heads.has(group)) continue; // waits behind an earlier entry of its group
        heads.add(group);
      }
      due.push(e.nextAt);
    }
    if (due.length === 0) return null;
    return Math.max(0, Math.min(...due) - now());
  }

  function hasQueued(group) {
    return entries.some((e) => groupOf(e.payload) === group);
  }

  return {
    key,
    enqueue,
    flush,
    discard,
    refresh,
    nextDueIn,
    hasQueued,
    snapshot: () => snap,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function startOutboxWorker(outbox, { win = window, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const watchedKey = outbox.key ?? OUTBOX_KEY;
  let timer = null;
  let stopped = false;
  // Concurrent run() calls (from online, a due timer, and every submitGame)
  // share this single promise so they can never race each other into
  // scheduling two live timers.
  let inFlightRun = null;

  function clearTimer() {
    clearTimeoutImpl(timer);
    timer = null;
  }

  function scheduleNext(due) {
    clearTimer();
    if (due !== null && !stopped) {
      timer = setTimeoutImpl(onTimerDue, due);
    }
  }

  function onTimerDue() {
    timer = null;
    if (stopped) return;
    run();
  }

  async function runOnce() {
    clearTimer();
    let due;
    try {
      const { authRequired } = await outbox.flush();
      due = authRequired ? AUTH_RETRY_MS : outbox.nextDueIn();
    } catch {
      // Defensive: flush() is documented to always resolve, but if it ever
      // rejects anyway, don't let the worker die - just retry later.
      due = FLUSH_ERROR_RETRY_MS;
    }
    if (stopped) return;
    scheduleNext(due);
  }

  function run() {
    if (stopped) return Promise.resolve();
    if (!inFlightRun) {
      inFlightRun = runOnce().finally(() => {
        inFlightRun = null;
      });
    }
    return inFlightRun;
  }

  // Another tab changed this outbox: show its entries here and send anything
  // due. A null key means the whole storage area was cleared (e.g.
  // localStorage.clear()), which must also trigger a refresh.
  function onStorage(event) {
    if (event.key !== null && event.key !== watchedKey) return;
    outbox.refresh();
    run();
  }

  win.addEventListener('online', run);
  win.addEventListener('storage', onStorage);
  run();

  return {
    run,
    stop() {
      stopped = true;
      win.removeEventListener('online', run);
      win.removeEventListener('storage', onStorage);
      clearTimer();
    },
  };
}
```

Replace `src/private/trainers/lib/outboxInstance.js` with:

```js
import { saveSession } from './api.js';
import { browserStorage, createOutbox, startOutboxWorker } from './outbox.js';

export const outbox = createOutbox({ storage: browserStorage(), send: (payload) => saveSession(payload) });

let worker = null;

export function ensureWorker() {
  worker ??= startOutboxWorker(outbox);
  return worker;
}

export async function submitGame(payload) {
  outbox.enqueue(payload);
  await ensureWorker().run();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/lib/`
Expected: PASS, including every pre-existing outbox and api case.

- [ ] **Step 5: Confirm the existing cases were not edited**

Run: `git diff -U0 src/private/trainers/lib/outbox.test.js | grep '^-' | grep -v '^---'`
Expected: exactly one removed line, the old import-list line `  OUTBOX_KEY, MAX_ERROR_CHARS, memoryStorage, backoffMs, …`.

- [ ] **Step 6: Run the full suite and the build**

Run: `npm test` then `npm run build`
Expected: all tests pass, and the build succeeds (Zetamac/Optiver still import `outboxInstance.js`).

- [ ] **Step 7: Commit**

```bash
git add src/private/trainers/lib/outbox.js src/private/trainers/lib/outboxInstance.js src/private/trainers/lib/outbox.test.js
git commit -m "Add ordered groups, custom ids and retry rules to the shared outbox

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Client API, poker outbox and table handlers

**Files:**
- Create: `src/private/trainers/poker/lib/persistence/api.js`
- Create: `src/private/trainers/poker/lib/persistence/pokerOutbox.js`
- Create: `src/private/trainers/poker/lib/persistence/persistence.js`
- Create: `src/private/trainers/poker/lib/persistence/saveStatus.js`
- Test: `src/private/trainers/poker/lib/persistence/api.test.js`
- Test: `src/private/trainers/poker/lib/persistence/pokerOutbox.test.js`
- Test: `src/private/trainers/poker/lib/persistence/persistence.test.js`
- Test: `src/private/trainers/poker/lib/persistence/saveStatus.test.js`

**Interfaces:**
- Consumes: `request`, `ApiError` (`src/private/trainers/lib/api.js`), and `createOutbox`, `isPermanentError`, `memoryStorage`, `OUTBOX_KEY` (Task 7).
- Produces:
  - `api.js`:
    - `openPokerSession(body, opts?)` → POST `/api/trainers/poker/sessions`
    - `closePokerSession(id, body, opts?)` → PATCH `/api/trainers/poker/sessions?id=`
    - `savePokerHands(body, opts?)` → POST `/api/trainers/poker/hands`
    - `getPokerSession(id, opts?)` → GET `/api/trainers/poker/sessions?id=`
    - `listOpenPokerSessions(opts?)` → GET `/api/trainers/poker/sessions?status=open`
    - `getPokerProfile(opts?)` → GET `/api/trainers/poker/profile`
  - `pokerOutbox.js`:
    - `POKER_OUTBOX_KEY = 'pk-outbox-v1'` and `SESSION_NOT_FOUND_RETRIES = 10`
    - `openEntry(session) → { kind:'open', id:'open:<sessionId>', sessionId, body: session }`
    - `handEntry({ hand, decisions, heroAllinEv }) → { kind:'hand', id:'hand:<handId>', sessionId, body: { hands: [item] } }`
    - `closeEntry({ id, endedAt }) → { kind:'close', id:'close:<sessionId>', sessionId, body: { endedAt } }`
    - `sendPokerPayload(payload, api?) → Promise`
    - `isPokerPermanentError(err, entry) → boolean`
    - `createPokerOutbox({ storage, api?, now? }) → outbox` (Task 7 shape)
  - `persistence.js`: `createPokerPersistence({ outbox, kick? }) → { onSessionStart(session), onHandComplete(record, analysis?), onSessionEnd(summary) }`, where `analysis = { decisions?: DecisionRecord[], heroAllinEv?: number|null }` is reserved for Phase 5.
  - `saveStatus.js`: `pokerSaveStatus(snapshot) → { status:'saved'|'saving'|'failed', pending:number, failed:number, failedId:string|null, lastError:string|null }` and `saveStatusText(status) → string`.

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/lib/persistence/api.test.js
import { describe, it, expect, vi } from 'vitest';
import {
  openPokerSession, closePokerSession, savePokerHands, getPokerSession, listOpenPokerSessions, getPokerProfile,
} from './api.js';

describe('poker persistence api', () => {
  it('calls each poker endpoint with the right method and body', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }));
    await openPokerSession({ id: 's1' }, { fetchImpl });
    await closePokerSession('s 1', { endedAt: null }, { fetchImpl });
    await savePokerHands({ hands: [] }, { fetchImpl });
    await getPokerSession('s1', { fetchImpl });
    await listOpenPokerSessions({ fetchImpl });
    await getPokerProfile({ fetchImpl });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, init.method, init.body])).toEqual([
      ['/api/trainers/poker/sessions', 'POST', '{"id":"s1"}'],
      ['/api/trainers/poker/sessions?id=s%201', 'PATCH', '{"endedAt":null}'],
      ['/api/trainers/poker/hands', 'POST', '{"hands":[]}'],
      ['/api/trainers/poker/sessions?id=s1', 'GET', undefined],
      ['/api/trainers/poker/sessions?status=open', 'GET', undefined],
      ['/api/trainers/poker/profile', 'GET', undefined],
    ]);
  });
});
```

```js
// src/private/trainers/poker/lib/persistence/pokerOutbox.test.js
import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../../../lib/api.js';
import { memoryStorage, OUTBOX_KEY } from '../../../lib/outbox.js';
import {
  POKER_OUTBOX_KEY, SESSION_NOT_FOUND_RETRIES, openEntry, handEntry, closeEntry, sendPokerPayload,
  isPokerPermanentError, createPokerOutbox,
} from './pokerOutbox.js';

const SESSION = {
  id: 's1', startedAt: '2026-09-16T18:00:00.000Z', botVersion: 'placeholder', tableMode: 'random',
  lineup: [{ seat: 1, personaId: 'moss' }], heroSeat: 0,
};
const handItemFor = (n) => ({ hand: { v: 1, id: `h${n}`, sessionId: 's1', handNo: n }, decisions: [], heroAllinEv: null });

function fakeApi() {
  return {
    openPokerSession: vi.fn(async () => ({})),
    savePokerHands: vi.fn(async () => ({})),
    closePokerSession: vi.fn(async () => ({})),
  };
}

describe('entries', () => {
  it('builds one entry per save, grouped by session', () => {
    expect(openEntry(SESSION)).toEqual({ kind: 'open', id: 'open:s1', sessionId: 's1', body: SESSION });
    const item = handItemFor(1);
    expect(handEntry(item)).toEqual({ kind: 'hand', id: 'hand:h1', sessionId: 's1', body: { hands: [item] } });
    const summary = { id: 's1', endedAt: '2026-09-16T19:00:00.000Z', hands: 3, net: 10, rebuys: 0 };
    expect(closeEntry(summary)).toEqual({ kind: 'close', id: 'close:s1', sessionId: 's1', body: { endedAt: summary.endedAt } });
  });
});

describe('sendPokerPayload', () => {
  it('dispatches each kind to its endpoint', async () => {
    const api = fakeApi();
    await sendPokerPayload(openEntry(SESSION), api);
    await sendPokerPayload(handEntry(handItemFor(1)), api);
    await sendPokerPayload(closeEntry({ id: 's1', endedAt: null }), api);
    expect(api.openPokerSession).toHaveBeenCalledWith(SESSION);
    expect(api.savePokerHands).toHaveBeenCalledWith({ hands: [handItemFor(1)] });
    expect(api.closePokerSession).toHaveBeenCalledWith('s1', { endedAt: null });
  });

  it('rejects an unknown kind with a permanent error', async () => {
    const err = await sendPokerPayload({ kind: 'mystery' }, fakeApi()).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'UNKNOWN_ENTRY_KIND' });
  });
});

describe('isPokerPermanentError', () => {
  const notFound = new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet');

  it('retries SESSION_NOT_FOUND until the retry limit', () => {
    expect(SESSION_NOT_FOUND_RETRIES).toBe(10);
    expect(isPokerPermanentError(notFound, { attempts: 0 })).toBe(false);
    expect(isPokerPermanentError(notFound, { attempts: 8 })).toBe(false);
    expect(isPokerPermanentError(notFound, { attempts: 9 })).toBe(true);
  });

  it('otherwise follows the shared rule', () => {
    expect(isPokerPermanentError(new ApiError(400, 'VALIDATION_ERROR', 'x'), { attempts: 0 })).toBe(true);
    expect(isPokerPermanentError(new ApiError(500, 'INTERNAL', 'x'), { attempts: 0 })).toBe(false);
    expect(isPokerPermanentError(new TypeError('Failed to fetch'), { attempts: 0 })).toBe(false);
  });
});

describe('createPokerOutbox', () => {
  it('saves open, hand and close in order under its own storage key', async () => {
    let t = 1000;
    let offline = true;
    const calls = [];
    const api = {
      openPokerSession: vi.fn(async () => {
        calls.push('open');
        if (offline) throw new TypeError('offline');
        return {};
      }),
      savePokerHands: vi.fn(async (body) => { calls.push(`hand:${body.hands[0].hand.id}`); return {}; }),
      closePokerSession: vi.fn(async (id) => { calls.push(`close:${id}`); return {}; }),
    };
    const storage = memoryStorage();
    const outbox = createPokerOutbox({ storage, api, now: () => t });
    outbox.enqueue(openEntry(SESSION));
    outbox.enqueue(handEntry(handItemFor(1)));
    outbox.enqueue(closeEntry({ id: 's1', endedAt: null }));

    await outbox.flush();
    expect(calls).toEqual(['open']);
    expect(outbox.snapshot().pendingIds).toEqual(['open:s1', 'hand:h1', 'close:s1']);
    expect(outbox.key).toBe(POKER_OUTBOX_KEY);
    expect(storage.getItem(OUTBOX_KEY)).toBeNull();
    expect(JSON.parse(storage.getItem(POKER_OUTBOX_KEY))).toHaveLength(3);

    offline = false;
    t += 1000;
    await outbox.flush();
    expect(calls).toEqual(['open', 'open', 'hand:h1', 'close:s1']);
    expect(outbox.snapshot().pendingIds).toEqual([]);
  });

  it('retries a hand whose session is not found, then marks it failed', async () => {
    let t = 1000;
    const api = fakeApi();
    api.savePokerHands.mockImplementation(async () => { throw new ApiError(409, 'SESSION_NOT_FOUND', 'Session not saved yet'); });
    const outbox = createPokerOutbox({ storage: memoryStorage(), api, now: () => t });
    outbox.enqueue(handEntry(handItemFor(1)));
    for (let i = 0; i < SESSION_NOT_FOUND_RETRIES - 1; i += 1) {
      await outbox.flush();
      t += 60000;
    }
    expect(outbox.snapshot().pendingIds).toEqual(['hand:h1']);
    await outbox.flush();
    expect(api.savePokerHands).toHaveBeenCalledTimes(SESSION_NOT_FOUND_RETRIES);
    expect(outbox.snapshot().failed).toEqual([{ id: 'hand:h1', lastError: 'Session not saved yet' }]);
  });
});
```

```js
// src/private/trainers/poker/lib/persistence/persistence.test.js
import { describe, it, expect, vi } from 'vitest';
import { createPokerPersistence } from './persistence.js';
import { openEntry, handEntry, closeEntry } from './pokerOutbox.js';

describe('createPokerPersistence', () => {
  function setup() {
    const outbox = { enqueue: vi.fn() };
    const kick = vi.fn();
    return { outbox, kick, handlers: createPokerPersistence({ outbox, kick }) };
  }

  it('queues the session open and kicks the worker', () => {
    const { outbox, kick, handlers } = setup();
    const session = { id: 's1', startedAt: '2026-09-16T18:00:00.000Z', botVersion: 'placeholder', tableMode: 'random', lineup: [], heroSeat: 0 };
    handlers.onSessionStart(session);
    expect(outbox.enqueue).toHaveBeenCalledWith(openEntry(session));
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('queues each completed hand with empty analysis by default', () => {
    const { outbox, handlers } = setup();
    const record = { v: 1, id: 'h1', sessionId: 's1', handNo: 1 };
    handlers.onHandComplete(record);
    expect(outbox.enqueue).toHaveBeenCalledWith(handEntry({ hand: record, decisions: [], heroAllinEv: null }));
  });

  it('passes Phase 5 analysis through when given', () => {
    const { outbox, handlers } = setup();
    const record = { v: 1, id: 'h2', sessionId: 's1', handNo: 2 };
    const decisions = [{ idx: 9 }];
    handlers.onHandComplete(record, { decisions, heroAllinEv: 3.5 });
    expect(outbox.enqueue).toHaveBeenCalledWith(handEntry({ hand: record, decisions, heroAllinEv: 3.5 }));
  });

  it('queues the session close', () => {
    const { outbox, kick, handlers } = setup();
    const summary = { id: 's1', endedAt: '2026-09-16T19:00:00.000Z', hands: 4, net: -12, rebuys: 0 };
    handlers.onSessionEnd(summary);
    expect(outbox.enqueue).toHaveBeenCalledWith(closeEntry(summary));
    expect(kick).toHaveBeenCalledTimes(1);
  });
});
```

```js
// src/private/trainers/poker/lib/persistence/saveStatus.test.js
import { describe, it, expect } from 'vitest';
import { pokerSaveStatus, saveStatusText } from './saveStatus.js';

describe('pokerSaveStatus', () => {
  it('is saved when nothing is queued', () => {
    const status = pokerSaveStatus({ pendingIds: [], failed: [], discardedIds: ['x'] });
    expect(status).toEqual({ status: 'saved', pending: 0, failed: 0, failedId: null, lastError: null });
    expect(saveStatusText(status)).toBe('All hands saved');
  });

  it('is saving while entries are pending', () => {
    const status = pokerSaveStatus({ pendingIds: ['open:s1', 'hand:h1'], failed: [], discardedIds: [] });
    expect(status).toEqual({ status: 'saving', pending: 2, failed: 0, failedId: null, lastError: null });
    expect(saveStatusText(status)).toBe('Saving… 2 waiting to sync (kept on this device and retried)');
  });

  it('is failed when the server rejected an entry, even with others pending', () => {
    const status = pokerSaveStatus({
      pendingIds: ['hand:h2'],
      failed: [{ id: 'hand:h1', lastError: 'Invalid hands payload' }, { id: 'hand:h3', lastError: 'x' }],
      discardedIds: [],
    });
    expect(status).toEqual({ status: 'failed', pending: 1, failed: 2, failedId: 'hand:h1', lastError: 'Invalid hands payload' });
    expect(saveStatusText(status)).toBe('2 saves rejected by the server: Invalid hands payload');
    expect(saveStatusText({ ...status, failed: 1, lastError: null })).toBe('1 save rejected by the server: unknown error');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/`
Expected: FAIL. Each file cannot load its module (`./api.js`, `./pokerOutbox.js`, `./persistence.js`, `./saveStatus.js`).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/persistence/api.js
import { request } from '../../../lib/api.js';

// Poker endpoints (spec §6.3). Amounts in bodies and responses are integer units.
const BASE = '/api/trainers/poker';

export const openPokerSession = (body, opts) =>
  request(`${BASE}/sessions`, { method: 'POST', body, ...opts });

export const closePokerSession = (id, body, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}`, { method: 'PATCH', body, ...opts });

export const savePokerHands = (body, opts) =>
  request(`${BASE}/hands`, { method: 'POST', body, ...opts });

export const getPokerSession = (id, opts) =>
  request(`${BASE}/sessions?id=${encodeURIComponent(id)}`, opts);

export const listOpenPokerSessions = (opts) => request(`${BASE}/sessions?status=open`, opts);

export const getPokerProfile = (opts) => request(`${BASE}/profile`, opts);
```

```js
// src/private/trainers/poker/lib/persistence/pokerOutbox.js
import { ApiError } from '../../../lib/api.js';
import { createOutbox, isPermanentError } from '../../../lib/outbox.js';
import * as pokerApi from './api.js';

// Poker saves use their own outbox (separate storage key), so the Zetamac/Optiver
// "waiting to sync" banner never counts poker hands. Entries are grouped by session,
// so open → hands → close always reach the server in that order.

export const POKER_OUTBOX_KEY = 'pk-outbox-v1';
// A hand or close can outrun its session row only briefly; after this many attempts
// the entry is marked failed so it can be discarded instead of retrying forever.
export const SESSION_NOT_FOUND_RETRIES = 10;

export const openEntry = (session) => ({ kind: 'open', id: `open:${session.id}`, sessionId: session.id, body: session });

export const handEntry = (item) => ({
  kind: 'hand',
  id: `hand:${item.hand.id}`,
  sessionId: item.hand.sessionId,
  body: { hands: [item] },
});

export const closeEntry = ({ id, endedAt }) => ({ kind: 'close', id: `close:${id}`, sessionId: id, body: { endedAt } });

export function sendPokerPayload(payload, api = pokerApi) {
  switch (payload?.kind) {
    case 'open':
      return api.openPokerSession(payload.body);
    case 'hand':
      return api.savePokerHands(payload.body);
    case 'close':
      return api.closePokerSession(payload.sessionId, payload.body);
    default:
      return Promise.reject(new ApiError(400, 'UNKNOWN_ENTRY_KIND', `Unknown poker save: ${String(payload?.kind)}`));
  }
}

export function isPokerPermanentError(err, entry) {
  if (err instanceof ApiError && err.code === 'SESSION_NOT_FOUND') {
    return entry.attempts + 1 >= SESSION_NOT_FOUND_RETRIES;
  }
  return isPermanentError(err);
}

export function createPokerOutbox({ storage, api = pokerApi, now }) {
  return createOutbox({
    storage,
    now,
    key: POKER_OUTBOX_KEY,
    send: (payload) => sendPokerPayload(payload, api),
    idOf: (payload) => payload?.id,
    groupOf: (payload) => (typeof payload?.sessionId === 'string' ? payload.sessionId : null),
    isPermanent: isPokerPermanentError,
  });
}
```

```js
// src/private/trainers/poker/lib/persistence/persistence.js
import { openEntry, handEntry, closeEntry } from './pokerOutbox.js';

/**
 * The table's lifecycle props (contracts §4). Each handler only queues a save and returns;
 * play never waits on the network.
 * @param {{ outbox: { enqueue:(payload:object) => void }, kick?: () => void }} deps
 */
export function createPokerPersistence({ outbox, kick = () => {} }) {
  const queue = (payload) => {
    outbox.enqueue(payload);
    kick();
  };
  return {
    onSessionStart: (session) => queue(openEntry(session)),
    /** `analysis` ({ decisions, heroAllinEv }) is filled by Phase 5 grading. */
    onHandComplete: (record, analysis = {}) => queue(handEntry({
      hand: record,
      decisions: analysis.decisions ?? [],
      heroAllinEv: analysis.heroAllinEv ?? null,
    })),
    onSessionEnd: (summary) => queue(closeEntry(summary)),
  };
}
```

```js
// src/private/trainers/poker/lib/persistence/saveStatus.js

/** Save state for the table, from a poker outbox snapshot. */
export function pokerSaveStatus({ pendingIds, failed }) {
  if (failed.length > 0) {
    return { status: 'failed', pending: pendingIds.length, failed: failed.length, failedId: failed[0].id, lastError: failed[0].lastError };
  }
  if (pendingIds.length > 0) {
    return { status: 'saving', pending: pendingIds.length, failed: 0, failedId: null, lastError: null };
  }
  return { status: 'saved', pending: 0, failed: 0, failedId: null, lastError: null };
}

export function saveStatusText({ status, pending, failed, lastError }) {
  if (status === 'failed') {
    return `${failed} save${failed === 1 ? '' : 's'} rejected by the server: ${lastError ?? 'unknown error'}`;
  }
  if (status === 'saving') return `Saving… ${pending} waiting to sync (kept on this device and retried)`;
  return 'All hands saved';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/lib/persistence/api.js src/private/trainers/poker/lib/persistence/api.test.js src/private/trainers/poker/lib/persistence/pokerOutbox.js src/private/trainers/poker/lib/persistence/pokerOutbox.test.js src/private/trainers/poker/lib/persistence/persistence.js src/private/trainers/poker/lib/persistence/persistence.test.js src/private/trainers/poker/lib/persistence/saveStatus.js src/private/trainers/poker/lib/persistence/saveStatus.test.js
git commit -m "Add poker client persistence: API calls, ordered outbox and table handlers

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Stale-session close, profile loader and browser instance

**Files:**
- Create: `src/private/trainers/poker/lib/persistence/staleSessions.js`
- Create: `src/private/trainers/poker/lib/persistence/profileLoader.js`
- Create: `src/private/trainers/poker/lib/persistence/pokerOutboxInstance.js`
- Test: `src/private/trainers/poker/lib/persistence/staleSessions.test.js`
- Test: `src/private/trainers/poker/lib/persistence/profileLoader.test.js`
- Test: `src/private/trainers/poker/lib/persistence/pokerOutboxInstance.test.js`

**Interfaces:**
- Consumes: `listOpenPokerSessions`, `getPokerProfile` (Task 8 `api.js`), `closeEntry`, `createPokerOutbox`, `POKER_OUTBOX_KEY` (Task 8), `createPokerPersistence` (Task 8), and `browserStorage`, `startOutboxWorker` (Task 7).
- Produces:
  - `STALE_AFTER_MS = 900000`
  - `closeStaleSessions({ api?, outbox, kick?, now? }) → Promise<string[]>`: the ids it queued a stale close for. It never rejects and returns `[]` on any request failure.
  - `PROFILE_TIMEOUT_MS = 4000`
  - `loadPokerProfile({ getProfile?, timeoutMs?, setTimeoutImpl?, clearTimeoutImpl? }?) → Promise<PlayerProfile|null>`: never rejects, and returns `null` on error, timeout or a malformed body.
  - `pokerOutboxInstance.js`: `pokerOutbox` (singleton), `ensurePokerWorker() → worker`, `pokerPersistence` (`{ onSessionStart, onHandComplete, onSessionEnd }` bound to the singleton, kicking the worker).

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/lib/persistence/staleSessions.test.js
import { describe, it, expect, vi } from 'vitest';
import { closeStaleSessions, STALE_AFTER_MS } from './staleSessions.js';
import { closeEntry } from './pokerOutbox.js';

const NOW = Date.parse('2026-09-16T20:00:00.000Z');
const ago = (ms) => new Date(NOW - ms).toISOString();

function fakes(response) {
  return {
    api: { listOpenPokerSessions: vi.fn(async () => response) },
    outbox: { refresh: vi.fn(), hasQueued: vi.fn((id) => id === 'queued'), enqueue: vi.fn() },
    kick: vi.fn(),
  };
}

describe('closeStaleSessions', () => {
  it('waits 15 minutes of inactivity before a session counts as stale', () => {
    expect(STALE_AFTER_MS).toBe(15 * 60 * 1000);
  });

  it('queues a stale close for idle sessions with nothing queued on this device', async () => {
    const { api, outbox, kick } = fakes({
      sessions: [
        { id: 'idle', startedAt: ago(3600000), hands: 4, lastActivityAt: ago(STALE_AFTER_MS) },
        { id: 'recent', startedAt: ago(3600000), hands: 9, lastActivityAt: ago(STALE_AFTER_MS - 1) },
        { id: 'queued', startedAt: ago(3600000), hands: 1, lastActivityAt: ago(2 * STALE_AFTER_MS) },
      ],
    });
    await expect(closeStaleSessions({ api, outbox, kick, now: () => NOW })).resolves.toEqual(['idle']);
    expect(outbox.refresh).toHaveBeenCalled();
    expect(outbox.enqueue.mock.calls).toEqual([[closeEntry({ id: 'idle', endedAt: null })]]);
    expect(kick).toHaveBeenCalledTimes(1);
  });

  it('does not kick the worker when nothing is stale', async () => {
    const { api, outbox, kick } = fakes({ sessions: [] });
    await expect(closeStaleSessions({ api, outbox, kick, now: () => NOW })).resolves.toEqual([]);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(kick).not.toHaveBeenCalled();
  });

  it('returns [] when the server cannot be reached or answers oddly', async () => {
    const offline = fakes(null);
    offline.api.listOpenPokerSessions.mockImplementation(async () => { throw new TypeError('Failed to fetch'); });
    await expect(closeStaleSessions({ ...offline, now: () => NOW })).resolves.toEqual([]);
    expect(offline.outbox.enqueue).not.toHaveBeenCalled();

    const odd = fakes({ sessions: 'nope' });
    await expect(closeStaleSessions({ ...odd, now: () => NOW })).resolves.toEqual([]);
  });
});
```

```js
// src/private/trainers/poker/lib/persistence/profileLoader.test.js
import { describe, it, expect, vi } from 'vitest';
import { loadPokerProfile, PROFILE_TIMEOUT_MS } from './profileLoader.js';

const PROFILE = { hands: 3, stats: { vpip: { value: 0.5, n: 2 } } };
const idleTimers = () => ({ setTimeoutImpl: vi.fn(() => 7), clearTimeoutImpl: vi.fn() });

describe('loadPokerProfile', () => {
  it('returns the server profile and clears its timer', async () => {
    const timers = idleTimers();
    const getProfile = async () => ({ profile: PROFILE, hands: 3, decisions: 5 });
    await expect(loadPokerProfile({ getProfile, ...timers })).resolves.toEqual(PROFILE);
    expect(PROFILE_TIMEOUT_MS).toBe(4000);
    expect(timers.setTimeoutImpl).toHaveBeenCalledWith(expect.any(Function), PROFILE_TIMEOUT_MS);
    expect(timers.clearTimeoutImpl).toHaveBeenCalledWith(7);
  });

  it('returns null on a request error or a malformed body', async () => {
    await expect(loadPokerProfile({ getProfile: async () => { throw new Error('404'); }, ...idleTimers() })).resolves.toBeNull();
    for (const body of [null, {}, { profile: { hands: 'x', stats: {} } }, { profile: { hands: 1, stats: null } }]) {
      await expect(loadPokerProfile({ getProfile: async () => body, ...idleTimers() })).resolves.toBeNull();
    }
  });

  it('returns null when the server is slower than the timeout', async () => {
    const setTimeoutImpl = vi.fn((fn) => { fn(); return 1; });
    const result = loadPokerProfile({ getProfile: () => new Promise(() => {}), setTimeoutImpl, clearTimeoutImpl: vi.fn() });
    await expect(result).resolves.toBeNull();
  });
});
```

```js
// src/private/trainers/poker/lib/persistence/pokerOutboxInstance.test.js
import { describe, it, expect } from 'vitest';
import { POKER_OUTBOX_KEY } from './pokerOutbox.js';
import { pokerOutbox, pokerPersistence, ensurePokerWorker } from './pokerOutboxInstance.js';

describe('pokerOutboxInstance', () => {
  it('exposes one poker outbox and the table handlers without starting a worker on import', () => {
    expect(pokerOutbox.key).toBe(POKER_OUTBOX_KEY);
    expect(Object.keys(pokerPersistence).sort()).toEqual(['onHandComplete', 'onSessionEnd', 'onSessionStart']);
    expect(typeof ensurePokerWorker).toBe('function');
    expect(pokerOutbox.snapshot()).toEqual({ pendingIds: [], failed: [], discardedIds: [] });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/staleSessions.test.js src/private/trainers/poker/lib/persistence/profileLoader.test.js src/private/trainers/poker/lib/persistence/pokerOutboxInstance.test.js`
Expected: FAIL with module-not-found errors for the three modules.

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/persistence/staleSessions.js
import * as pokerApi from './api.js';
import { closeEntry } from './pokerOutbox.js';

// Spec §6.1: a session left open (tab closed) is closed on a later load of /me/poker at its
// last saved hand time. A session counts as stale only after 15 minutes without a saved hand
// and with nothing queued for it on this device, so a table still open in another tab,
// or a session whose hands are waiting offline, is never closed early.
export const STALE_AFTER_MS = 15 * 60 * 1000;

export async function closeStaleSessions({ api = pokerApi, outbox, kick = () => {}, now = Date.now }) {
  let sessions;
  try {
    ({ sessions } = await api.listOpenPokerSessions());
  } catch {
    return [];
  }
  if (!Array.isArray(sessions)) return [];
  outbox.refresh();
  const stale = sessions.filter((s) => now() - Date.parse(s.lastActivityAt) >= STALE_AFTER_MS && !outbox.hasQueued(s.id));
  stale.forEach((s) => outbox.enqueue(closeEntry({ id: s.id, endedAt: null })));
  if (stale.length > 0) kick();
  return stale.map((s) => s.id);
}
```

```js
// src/private/trainers/poker/lib/persistence/profileLoader.js
import { getPokerProfile } from './api.js';

// Bots get the hero's profile at sit-down (spec §6.1). The table must never wait long for it:
// on any failure or after PROFILE_TIMEOUT_MS the bots simply start without a profile (null).
export const PROFILE_TIMEOUT_MS = 4000;

const isProfile = (p) => p !== null && typeof p === 'object'
  && Number.isInteger(p.hands) && p.stats !== null && typeof p.stats === 'object';

export async function loadPokerProfile({
  getProfile = getPokerProfile,
  timeoutMs = PROFILE_TIMEOUT_MS,
  setTimeoutImpl = setTimeout,
  clearTimeoutImpl = clearTimeout,
} = {}) {
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeoutImpl(() => resolve(null), timeoutMs);
  });
  try {
    const body = await Promise.race([getProfile(), timedOut]);
    return isProfile(body?.profile) ? body.profile : null;
  } catch {
    return null;
  } finally {
    clearTimeoutImpl(timer);
  }
}
```

```js
// src/private/trainers/poker/lib/persistence/pokerOutboxInstance.js
import { browserStorage, startOutboxWorker } from '../../../lib/outbox.js';
import { createPokerOutbox } from './pokerOutbox.js';
import { createPokerPersistence } from './persistence.js';

// Browser singletons. Importing this module never touches the network; the worker starts
// on the first ensurePokerWorker() call (from the table, the lobby or a save).

export const pokerOutbox = createPokerOutbox({ storage: browserStorage() });

let worker = null;

export function ensurePokerWorker() {
  worker ??= startOutboxWorker(pokerOutbox);
  return worker;
}

export const pokerPersistence = createPokerPersistence({
  outbox: pokerOutbox,
  kick: () => { ensurePokerWorker().run(); },
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/persistence/`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/lib/persistence/staleSessions.js src/private/trainers/poker/lib/persistence/staleSessions.test.js src/private/trainers/poker/lib/persistence/profileLoader.js src/private/trainers/poker/lib/persistence/profileLoader.test.js src/private/trainers/poker/lib/persistence/pokerOutboxInstance.js src/private/trainers/poker/lib/persistence/pokerOutboxInstance.test.js
git commit -m "Add stale poker session close, profile loader and poker outbox singleton

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10 (POST-MERGE: after Phase 3 `bots/profileStats.js` is merged into `feat/poker` and this branch): Profile endpoint

**Files:**
- Create: `api/trainers/poker/profile.js`
- Test: `api/trainers/poker/profile.test.js`
- Modify: `api/_lib/pokerBundle.test.js` (add `profile.js` to `POKER_FUNCTIONS`)

**Interfaces:**
- Consumes: `accumulateProfile(profile, heroSeat, events) → PlayerProfile` (Phase 3, `src/private/trainers/poker/bots/profileStats.js`), `emptyProfile()` (Phase 0, `bots/contract.js`), the `poker_hands.hero_actions` and `events` columns (Task 1), the `guard`/`sendError`/`getSql`/`authConfig` helpers, and the fixtures from Task 2.
- Produces: `createPokerProfileHandler({ getSql?, auth?, accumulate? })`, default export, method `GET`, URL `/api/trainers/poker/profile`. Response 200 `{ profile: PlayerProfile, hands: number, decisions: number }`. Also exports `PROFILE_DECISIONS = 2000` and `PROFILE_MAX_HANDS = 2000`.

- [ ] **Step 1: Bring in the merged phases and confirm the Phase 3 export**

Unless the controller has already merged `feat/poker` (with Phase 3) into this branch, run `git merge --no-edit feat/poker` (worktrees share branches, so no fetch is needed). Then run:
```bash
git log --oneline -1 feat/poker
grep -n "export function accumulateProfile" src/private/trainers/poker/bots/profileStats.js
grep -n "export function emptyProfile" src/private/trainers/poker/bots/contract.js
```
Expected: the merge succeeds, and both greps print one line each. If `accumulateProfile` is missing or has a different signature, stop and report to the controller (contracts §3.2 fixes it).

- [ ] **Step 2: Write the failing tests**

```js
// api/trainers/poker/profile.test.js
import { describe, it, expect, vi } from 'vitest';
import { createPokerProfileHandler, PROFILE_DECISIONS, PROFILE_MAX_HANDS } from './profile.js';
import { mockRes, authedReq, mockSql, TEST_AUTH } from '../../_lib/testing.js';
import { pokerHandRecord, findHandRecord, heroActed } from '../../_lib/pokerTesting.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';

const make = (sql, extra = {}) => createPokerProfileHandler({ getSql: () => sql, auth: () => TEST_AUTH, ...extra });

async function call(handler, options = {}) {
  const res = mockRes();
  await handler(authedReq(options), res);
  return res;
}

const row = (record) => ({
  heroSeat: record.heroSeat,
  events: record.events,
  heroActions: record.events.filter((e) => e.type === 'act' && e.seat === record.heroSeat).length,
});

describe('api/trainers/poker/profile', () => {
  it('405 for POST, 401 without a session, never cached', async () => {
    let res = await call(make(mockSql()), { method: 'POST' });
    expect(res.statusCode).toBe(405);
    expect(res.headers.Allow).toBe('GET');
    res = await call(make(mockSql()), { authed: false });
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('no-store');
  });

  it('returns the empty profile when no hands are stored', async () => {
    const res = await call(make(mockSql([[]])));
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ profile: emptyProfile(), hands: 0, decisions: 0 });
  });

  it('folds the stored hands, oldest first, with the bots\' accumulateProfile', async () => {
    const a = findHandRecord(heroActed, { handNo: 1 });
    const b = pokerHandRecord({ seed: 77, handNo: 2 });
    const rows = [row(a), row(b)];
    const sql = mockSql([rows]);
    const res = await call(make(sql));
    expect(res.statusCode).toBe(200);
    const expected = accumulateProfile(accumulateProfile(emptyProfile(), a.heroSeat, a.events), b.heroSeat, b.events);
    expect(res.body).toEqual({ profile: expected, hands: 2, decisions: rows[0].heroActions + rows[1].heroActions });

    const [query] = sql.queries;
    for (const fragment of [
      'sum(hero_actions) OVER (ORDER BY played_at DESC, id DESC ROWS UNBOUNDED PRECEDING)',
      'LIMIT', 'r.running - h.hero_actions <', 'ORDER BY r.played_at, r.id',
    ]) {
      expect(query.text).toContain(fragment);
    }
    expect(query.values).toEqual([PROFILE_MAX_HANDS, PROFILE_DECISIONS]);
    expect(PROFILE_DECISIONS).toBe(2000);
    expect(PROFILE_MAX_HANDS).toBe(2000);
  });

  it('passes rows to the accumulator in query order', async () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const rows = [{ heroSeat: 2, events: ['first'], heroActions: 1 }, { heroSeat: 4, events: ['second'], heroActions: 0 }];
    const res = await call(make(mockSql([rows]), { accumulate }));
    expect(accumulate.mock.calls.map(([, seat, events]) => [seat, events])).toEqual([[2, ['first']], [4, ['second']]]);
    expect(res.body.profile.hands).toBe(2);
  });

  it('500 INTERNAL when folding fails', async () => {
    const original = console.error;
    console.error = () => {};
    try {
      const accumulate = () => { throw new Error('bad log'); };
      const res = await call(make(mockSql([[{ heroSeat: 0, events: [], heroActions: 0 }]]), { accumulate }));
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
];
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run api/trainers/poker/profile.test.js api/_lib/pokerBundle.test.js`
Expected: FAIL. `profile.test.js` cannot load `./profile.js`, and the bundle case for `profile.js` fails with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 4: Write the implementation**

```js
// api/trainers/poker/profile.js
import { getSql as defaultGetSql } from '../../_lib/db.js';
import { authConfig } from '../../_lib/session.js';
import { guard, sendError } from '../../_lib/http.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { accumulateProfile } from '../../../src/private/trainers/poker/bots/profileStats.js';

// GET /api/trainers/poker/profile — the hero's tendency profile (spec §6.4). It uses the same
// accumulateProfile the bots use (contracts §3.2), folded oldest first over the most recent
// hands that hold the latest PROFILE_DECISIONS hero decisions (hero act events; the hand
// that crosses the limit is included), capped at PROFILE_MAX_HANDS hands.
// Vercel bundles the ../../../src imports by tracing them; api/_lib/pokerBundle.test.js
// proves they load in plain Node.

export const PROFILE_DECISIONS = 2000;
export const PROFILE_MAX_HANDS = 2000;

export function createPokerProfileHandler({ getSql = defaultGetSql, auth = authConfig, accumulate = accumulateProfile } = {}) {
  return async function handler(req, res) {
    const sql = guard(req, res, { methods: ['GET'], auth, getSql });
    if (!sql) return undefined;
    try {
      const rows = await sql`
        WITH recent AS (
          SELECT id, played_at,
                 sum(hero_actions) OVER (ORDER BY played_at DESC, id DESC ROWS UNBOUNDED PRECEDING) AS running
          FROM poker_hands
          ORDER BY played_at DESC, id DESC
          LIMIT ${PROFILE_MAX_HANDS}
        )
        SELECT h.hero_seat AS "heroSeat", h.events, h.hero_actions AS "heroActions"
        FROM recent r JOIN poker_hands h ON h.id = r.id
        WHERE r.running - h.hero_actions < ${PROFILE_DECISIONS}
        ORDER BY r.played_at, r.id`;
      const profile = rows.reduce((acc, r) => accumulate(acc, r.heroSeat, r.events), emptyProfile());
      const decisions = rows.reduce((sum, r) => sum + r.heroActions, 0);
      return res.status(200).json({ profile, hands: rows.length, decisions });
    } catch (err) {
      console.error('trainers/poker/profile failed:', err);
      return sendError(res, 500, 'INTERNAL', 'Internal server error');
    }
  };
}

export default createPokerProfileHandler();
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run api/trainers/poker/profile.test.js api/_lib/pokerBundle.test.js`
Expected: PASS. If the `profile.js` bundle case fails, the Phase 3 module (or something it imports) is not plain-Node ESM. Examples are an extensionless import, a Vite alias, `import.meta.glob`, or a JSON import without `with { type: 'json' }`. Report the exact error to the controller: the fix belongs in Phase 3's files, not here.

- [ ] **Step 6: (Optional, with the controller's go-ahead) Extend the real-DB check**

Only if Task 6 Step 3 was run. Append this test inside the `describe.skipIf` block of `api/trainers/poker/realDb.test.js`, and add `import { createPokerProfileHandler } from './profile.js';` to its imports:

```js
  it('computes the profile from stored hands', async () => {
    const res = await call(createPokerProfileHandler({ auth }), {});
    expect(res.statusCode).toBe(200);
    expect(res.body.hands).toBeGreaterThanOrEqual(0);
    expect(typeof res.body.profile.hands).toBe('number');
  });
```

Then run the Task 6 Step 3 command again. Expected: 2 tests passed.

- [ ] **Step 7: Run the full suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add api/trainers/poker/profile.js api/trainers/poker/profile.test.js api/_lib/pokerBundle.test.js
git commit -m "Add poker adaptive profile endpoint using the bots' accumulateProfile

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

If Step 6 was done, also stage `api/trainers/poker/realDb.test.js` in the same commit.

---

### Task 11 (POST-MERGE: after Phase 2 table UI and Task 10 are on this branch): Wire persistence, profile and save status into the table

This is the only task that edits Phase 2 files (contracts §2). Phase 2's file names are not fixed by the contracts, so Step 1 finds them. The code below assumes the spec §9 layout, and **only the import path strings** may change to match what Step 1 finds.

**Files:**
- Create: `src/private/trainers/poker/lib/persistence/usePokerSaveStatus.js`
- Create: `src/private/trainers/poker/lib/persistence/usePokerProfile.js`
- Create: `src/private/trainers/poker/lib/persistence/useCloseStaleSessions.js`
- Create: `src/private/trainers/poker/lib/persistence/PokerSaveStatus.jsx`
- Create: `src/private/trainers/poker/lib/persistence/withPokerPersistence.jsx`
- Create: `src/private/trainers/poker/lib/persistence/PersistedTablePage.jsx`
- Modify: `src/App.jsx` (the lazy import for the `/me/poker/table/:sessionId` route only)
- Modify: the Phase 2 lobby component rendered at `/me/poker` (one hook call)
- Test: `api/_lib/pokerRoundTrip.test.js`

**Interfaces:**
- Consumes:
  - `pokerOutbox`, `ensurePokerWorker`, `pokerPersistence` (Task 9)
  - `pokerSaveStatus`, `saveStatusText` (Task 8), `closeStaleSessions` (Task 9), `loadPokerProfile` (Task 9), `handItem` (Task 3)
  - Phase 2: the table page component (props `onSessionStart`, `onHandComplete`, `onSessionEnd` from contracts §4, plus `profile`, see the contract changes at the end) and `buildHandRecord` (`src/private/trainers/poker/lib/handRecord.js`)
- Produces:
  - `usePokerSaveStatus() → pokerSaveStatus(...)` result
  - `usePokerProfile() → { status: 'loading'|'ready', profile: PlayerProfile|null }`
  - `useCloseStaleSessions() → void`
  - `<PokerSaveStatus save />`
  - `withPokerPersistence(TablePage) → Component`
  - `PersistedTablePage` (default export)

- [ ] **Step 1: Merge and locate the Phase 2 files**

Unless the controller already did, run `git merge --no-edit feat/poker`. Then:

```bash
grep -n "poker" src/App.jsx
grep -rln "onHandComplete" src/private/trainers/poker/ui
grep -n "export function buildHandRecord" src/private/trainers/poker/lib/handRecord.js
grep -rn "profile" src/private/trainers/poker/ui --include=*.jsx | grep -i "prop\|function\|=>" | head -20
```

Write down three things:
- (a) TABLE_MODULE: the module `src/App.jsx` lazy-imports for `/me/poker/table/:sessionId`, whose component takes `onHandComplete`
- (b) LOBBY_MODULE: the component rendered for `/me/poker`
- (c) the `buildHandRecord` parameter object
- (d) whether the table page accepts a `profile` prop

If there is no `onHandComplete` prop, or no `profile` prop, stop and report to the controller. Both are contract items.

- [ ] **Step 2: Write the round-trip test**

This is a verification test for code that already exists on both sides, so it may pass on the first run. It exercises the real Phase 2 builder on engine-played hands, after a localStorage-style JSON round trip. If Step 1 (c) shows a different parameter object, change only the `buildHandRecord({...})` call.

```js
// api/_lib/pokerRoundTrip.test.js
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { handItem } from './pokerSchemas.js';
import { buildHandRecord } from '../../src/private/trainers/poker/lib/handRecord.js';
import { playHand, randomPolicy } from '../../src/private/trainers/poker/engine/simulate.js';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';

// A HandRecord the table builds must always pass the server schema: a rejected hand is
// marked failed in the outbox and is never saved.

const SESSION_ID = randomUUID();
const LINEUP = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: 'moss' }));

describe('Phase 2 HandRecords round-trip through handItem', () => {
  it('accepts 200 random engine hands with rotating buttons and uneven stacks', () => {
    for (let n = 1; n <= 200; n += 1) {
      const seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 40 + ((seat * 37 + n) % 400) }));
      const button = n % 6;
      const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng: mulberry32(n), policy: randomPolicy });
      const record = buildHandRecord({
        id: randomUUID(),
        sessionId: SESSION_ID,
        handNo: n,
        playedAt: new Date(Date.UTC(2026, 8, 16, 18, 0, n)).toISOString(),
        botVersion: 'placeholder',
        heroSeat: 0,
        lineup: LINEUP,
        events,
        state,
      });
      const result = handItem.safeParse(JSON.parse(JSON.stringify({ hand: record })));
      expect(result.error?.issues ?? [], `hand ${n}`).toEqual([]);
    }
  });
});
```

Run: `npx vitest run api/_lib/pokerRoundTrip.test.js`
Expected: PASS if Phase 2 follows contracts §4. **If it fails**, read the issue messages. A disagreement on a contract field (for example `pot` or `heroNet` computed differently) is reported to the controller, not patched in the schema. Only fix the call shape in this test.

- [ ] **Step 3: Write the hooks and components**

```js
// src/private/trainers/poker/lib/persistence/usePokerSaveStatus.js
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { pokerOutbox, ensurePokerWorker } from './pokerOutboxInstance.js';
import { pokerSaveStatus } from './saveStatus.js';

export function usePokerSaveStatus() {
  useEffect(() => { ensurePokerWorker(); }, []);
  const snapshot = useSyncExternalStore(pokerOutbox.subscribe, pokerOutbox.snapshot);
  return useMemo(() => pokerSaveStatus(snapshot), [snapshot]);
}
```

```js
// src/private/trainers/poker/lib/persistence/usePokerProfile.js
import { useEffect, useState } from 'react';
import { loadPokerProfile } from './profileLoader.js';

/** The hero's profile at sit-down. loadPokerProfile never rejects and gives up after 4 s. */
export function usePokerProfile() {
  const [state, setState] = useState({ status: 'loading', profile: null });
  useEffect(() => {
    let live = true;
    loadPokerProfile().then((profile) => {
      if (live) setState({ status: 'ready', profile });
    });
    return () => { live = false; };
  }, []);
  return state;
}
```

```js
// src/private/trainers/poker/lib/persistence/useCloseStaleSessions.js
import { useEffect } from 'react';
import { pokerOutbox, ensurePokerWorker } from './pokerOutboxInstance.js';
import { closeStaleSessions } from './staleSessions.js';

/** Call once in the /me/poker lobby: closes sessions left open by a closed tab (spec §6.1). */
export function useCloseStaleSessions() {
  useEffect(() => {
    ensurePokerWorker();
    closeStaleSessions({ outbox: pokerOutbox, kick: () => { ensurePokerWorker().run(); } });
  }, []);
}
```

```jsx
// src/private/trainers/poker/lib/persistence/PokerSaveStatus.jsx
import { pokerOutbox } from './pokerOutboxInstance.js';
import { saveStatusText } from './saveStatus.js';

const DISCARD_MESSAGE = 'Discard this save? The server rejected it, so it can never be saved.';

export default function PokerSaveStatus({ save }) {
  const text = saveStatusText(save);
  if (save.status !== 'failed') {
    return <p className={`pk-save pk-save--${save.status}`} role="status">{text}</p>;
  }
  const onDiscard = () => {
    if (window.confirm(DISCARD_MESSAGE)) pokerOutbox.discard(save.failedId);
  };
  return (
    <div className="pk-save pk-save--failed">
      <p role="alert">{text}</p>
      <button type="button" className="pk-btn" aria-label="Discard rejected save" onClick={onDiscard}>
        Discard
      </button>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/lib/persistence/withPokerPersistence.jsx
import { pokerPersistence } from './pokerOutboxInstance.js';
import { usePokerSaveStatus } from './usePokerSaveStatus.js';
import { usePokerProfile } from './usePokerProfile.js';
import PokerSaveStatus from './PokerSaveStatus.jsx';

/** Gives the Phase 2 table page its persistence props (contracts §4) and the loaded profile. */
export function withPokerPersistence(TablePage) {
  function PersistedTable(props) {
    const save = usePokerSaveStatus();
    const { status, profile } = usePokerProfile();
    if (status === 'loading') {
      return <p className="pk-muted" role="status">Loading your profile…</p>;
    }
    return (
      <>
        <TablePage
          {...props}
          profile={profile}
          onSessionStart={pokerPersistence.onSessionStart}
          onHandComplete={pokerPersistence.onHandComplete}
          onSessionEnd={pokerPersistence.onSessionEnd}
        />
        <PokerSaveStatus save={save} />
      </>
    );
  }
  PersistedTable.displayName = `withPokerPersistence(${TablePage.displayName || TablePage.name || 'TablePage'})`;
  return PersistedTable;
}
```

```jsx
// src/private/trainers/poker/lib/persistence/PersistedTablePage.jsx
// TABLE_MODULE from Step 1 (a). The path below is the spec §9 default; replace only the string.
import TablePage from '../../ui/table/TablePage.jsx';
import { withPokerPersistence } from './withPokerPersistence.jsx';

export default withPokerPersistence(TablePage);
```

- [ ] **Step 4: Point the table route at the persisted page and close stale sessions in the lobby**

In `src/App.jsx`, change only the lazy import used by the `/me/poker/table/:sessionId` route. For example, if Step 1 showed:

```jsx
const PokerTablePage = lazy(() => import('./private/trainers/poker/ui/table/TablePage'));
```

change it to:

```jsx
const PokerTablePage = lazy(() => import('./private/trainers/poker/lib/persistence/PersistedTablePage'));
```

Keep the variable name and the route element exactly as Phase 2 wrote them.

In LOBBY_MODULE (Step 1 (b)), add the import next to its other imports, with the path relative to that file. From `src/private/trainers/poker/ui/lobby/<Lobby>.jsx` it is:

```jsx
import { useCloseStaleSessions } from '../../lib/persistence/useCloseStaleSessions.js';
```

Then add this as the first line inside the lobby component function body:

```jsx
  useCloseStaleSessions();
```

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test` then `npm run build`
Expected: all tests pass, and the build succeeds with no new warnings. The build is the check for the new `.jsx` files, which the node-environment tests do not import.

- [ ] **Step 6: Manual check in the dev server (requires `DATABASE_URL` in `.env.local` pointing at a migrated branch database, plus a login; skip and say so if unavailable)**

Run `npm run dev`, sign in, open `/me/poker` and sit down. Then:
1. In DevTools → Network, you see `GET /api/trainers/poker/sessions?status=open` and `GET /api/trainers/poker/profile` (200), then `POST …/sessions` (200).
2. After each hand, `POST …/hands` returns 200 `{ saved: true, inserted: 1, duplicate: 0 }`, and the status line reads "All hands saved".
3. In DevTools → Network, go offline, play a hand, and check that the line reads "Saving… 1 waiting to sync". Go back online, and it returns to "All hands saved".
4. Get up. `PATCH …/sessions?id=` returns 200 with `closed: true`.
5. Sit down, play one hand and close the tab. Reopening `/me/poker` right away does not close it (under 15 minutes). This is expected and documented.

Report what you observed for each item.

- [ ] **Step 7: Commit**

Stage the new files, the round-trip test, `src/App.jsx` and the exact lobby file path from Step 1 (b):

```bash
git add api/_lib/pokerRoundTrip.test.js src/private/trainers/poker/lib/persistence/usePokerSaveStatus.js src/private/trainers/poker/lib/persistence/usePokerProfile.js src/private/trainers/poker/lib/persistence/useCloseStaleSessions.js src/private/trainers/poker/lib/persistence/PokerSaveStatus.jsx src/private/trainers/poker/lib/persistence/withPokerPersistence.jsx src/private/trainers/poker/lib/persistence/PersistedTablePage.jsx src/App.jsx <LOBBY_MODULE path from Step 1 (b)>
git commit -m "Wire poker persistence, adaptive profile and save status into the table

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Execution order

- Tasks 1 → 9 run now, in order: 1, 2, 3, 4, 5, 6, 7, 8, 9. Tasks 7–9 do not depend on 1–6 and could run first if needed.
- **Task 10 is post-merge.** It needs Phase 3 (`bots/profileStats.js`) on `feat/poker`, merged into this branch.
- **Task 11 is post-merge.** It needs Phase 2 (table UI, `lib/handRecord.js`, poker routes) and Task 10.
- A deploy needs `npm run db:migrate` against production before these routes serve traffic. That is a controller or user step, not part of any task.

## Spec coverage

| Requirement | Task |
|---|---|
| §6.1 sit down: client UUID, POST session, load profile, offline play keeps queueing | 8, 9, 11 (`onSessionStart`, `loadPokerProfile`, outbox) |
| §6.1 each hand added to the outbox and retried until saved | 7, 8 |
| §6.1 get up: PATCH close with totals | 4, 8 (totals kept server-side) |
| §6.1 stale open session closed on the next load at its last hand time | 4 (`?status=open`, null `endedAt`), 9, 11 |
| §6.2 tables, including `poker_decisions` ready for Phase 5 | 1, 3, 5 |
| §6.3 verifySession, Zod, no-store, `{error, code, details?}` | 4, 5, 10 |
| §6.3 POST sessions idempotent, PATCH close, GET session with hands and decisions | 4 |
| §6.3 POST hands: 50/40 caps, idempotent, decisions only for new hands, SESSION_NOT_FOUND ordering | 3, 5, 7, 8 |
| §6.3 GET profile | 10 |
| §6.3 dev shim for nested routes (no change) | 4 (URL used as-is) |
| §6.4 profile from about the latest 2,000 decisions, via the shared definition | 10 |
| §10 API: payload round trip, idempotent duplicates, SESSION_NOT_FOUND ordering, 401 | 3, 4, 5, 6, 11 |
| §10 outbox tests extended for poker payload shapes | 7, 8 |
| Contracts §4: units, HandRecord, `onSessionStart`/`onHandComplete`/`onSessionEnd` | 1, 3, 8, 11 |

