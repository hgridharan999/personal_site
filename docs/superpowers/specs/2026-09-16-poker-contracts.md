# Poker Trainer: Cross-Phase Contracts

**Date:** 2026-09-16
**Purpose:** Phases 2 (table UI), 3 (bots) and 4 (persistence) are planned and built in parallel on separate branches. This file fixes the interfaces between them. The design spec is `2026-09-16-poker-trainer-design.md`. Phase 1 (engine, `src/private/trainers/poker/engine/`) is complete; read its code as the source of truth for engine APIs.

If a plan needs to change a contract, it must say so explicitly. The controller then updates this file before the other phases rely on the change.

## 1. Engine facts every phase relies on

- **Money:** integer **units, 1 unit = 0.5 BB**. The table plays `sb: 1, bb: 2`, and a 100 BB buy-in is 200 units. The UI shows BB (`units / 2`, one decimal).
- **Cards:** integers `rank*4+suit` (`engine/cards.js`).
- **Hand events:** `start`, `hole`, `board`, `act` (`engine/handState.js` JSDoc).
  - `act.amount` is the street total ("raise to"), and is present only for `bet`/`raise`.
- **API:**
  - `applyEvent`, `reduceHand`, `legalActions` (`minRaiseTo`/`maxRaiseTo` are `null` when `!canRaise`), `seatsFromButton`, `EngineError`.
  - `dealHand` (`engine/dealer.js`), `playHand` and `randomPolicy` (`engine/simulate.js`), `nextButton` and `stacksAfter` (`engine/table.js`).
- **State:** `state.result` is set when `street === 'complete'`: `{showdown, pots, awards, net, shown, scores?}`.

## 2. Ownership (who may create or edit which paths)

| Path | Owner |
|---|---|
| `src/private/trainers/poker/engine/**` | Phase 0 adds `view.js` below. Afterwards, any phase may **add** new engine files. Changes to existing engine files go only through the controller. |
| `src/private/trainers/poker/bots/**`, `src/private/trainers/poker/data/**`, `src/private/trainers/poker/worker/**`, `scripts/poker/train.js`, `scripts/poker/benchmark.js` | Phase 3 (Phase 0 creates the stubs listed below) |
| `src/private/trainers/poker/ui/**`, `src/private/trainers/poker/lib/**` except `lib/persistence/**`, poker routes in `src/App.jsx`, the Poker entry in `src/private/PrivateHome.jsx` | Phase 2 |
| `api/trainers/poker/**`, `api/_lib/poker*`, `db/migrations/*_poker.sql`, `src/private/trainers/poker/lib/persistence/**`, and any changes to the shared outbox (`src/private/trainers/lib/outbox*.js`) | Phase 4 |

Wiring persistence into the table UI happens in Phase 4's last task, after Phase 2 has merged.

## 3. Phase 0 foundation (built before Phases 2–4 start)

### 3.1 `engine/view.js`: what a seat is allowed to see
```js
/** A copy of `state` in which other players' hole cards are null unless shown at showdown. */
export function viewFor(state, seat) -> PlayerView
/** A copy of `events` in which other seats' `hole` events have `cards: null`. */
export function eventsFor(events, seat) -> HandEvent[]
```
Bots and the UI render or decide **only** from `viewFor`/`eventsFor` output for their own seat. The UI uses the hero seat; after a hand completes, the UI may use `viewFor` (which reveals `result.shown` seats).

### 3.2 `bots/contract.js`: JSDoc typedefs and profile helpers
```js
/**
 * @typedef {{ id:string, name:string, tag:string, style:string, brain:string, dials?:Record<string,number> }} Persona
 *   tag: 3 uppercase letters shown on the seat tile. style: hidden label revealed after a session.
 *   brain: key into the brain registry (bots/index.js).
 * @typedef {{ view:object, seat:number, legal:object, events:object[], persona:Persona, profile:PlayerProfile|null, bb:number }} BotContext
 *   view = viewFor(state, seat); events = eventsFor(handEvents, seat); legal = legalActions(state); bb in units (2).
 * @typedef {{ action:'fold'|'check'|'call'|'bet'|'raise', amount?:number }} BotChoice   amount only for bet/raise (units, raise-to)
 * @typedef {{ decide:(ctx:BotContext, rng:() => number) => BotChoice }} Brain            synchronous, pure given rng
 * @typedef {{ value:number|null, n:number }} ProfileStat                                  value in [0,1] or null when n = 0
 * @typedef {{ hands:number, stats:Record<string, ProfileStat> }} PlayerProfile
 */
export const PROFILE_STATS = [
  'vpip', 'pfr', 'threeBet', 'foldTo3Bet', 'cbetFlop', 'cbetTurn', 'foldToCbetFlop', 'foldToCbetTurn',
  'checkRaise', 'wtsd', 'wsd', 'aggFreq', 'foldToRiverBet', 'riverBetFreq',
];
export function emptyProfile() -> { hands: 0, stats: { [key]: { value: null, n: 0 } for each PROFILE_STATS } }
```
Stat definitions (numerator / opportunities) are fixed by **Phase 3** in `bots/profileStats.js`. It exports `accumulateProfile(profile, heroSeat, events) -> PlayerProfile`, a pure function that folds one hand into a profile. Phase 4's `GET profile` computes the same thing server-side from stored hand events by importing that module, so there is one definition.

### 3.3 `bots/baselines.js`, `bots/personas.js`, `bots/index.js`: placeholder bots
- `baselines.js` exports `randomLegal: Brain` (delegates to `engine/simulate.js` `randomPolicy`) and `callingStation: Brain` (check if possible, else call).
- `personas.js` exports `listPersonas() -> Persona[]` and `getPersona(id) -> Persona` (throws on an unknown id). Phase 0 ships 8 placeholder personas with `style: 'placeholder'`:

  | id | name | tag | brain |
  |---|---|---|---|
  | moss | Moss | MOS | callingStation |
  | viper | Viper | VIP | randomLegal |
  | duchess | Duchess | DCH | callingStation |
  | rook | Rook | ROK | randomLegal |
  | ink | Ink | INK | callingStation |
  | brick | Brick | BRK | randomLegal |
  | lark | Lark | LRK | callingStation |
  | sable | Sable | SBL | randomLegal |

- `index.js` exports `createBrain(persona) -> Brain`, which looks up `persona.brain` in a registry `{ randomLegal, callingStation }` and throws on an unknown key, and `BOT_VERSION = 'placeholder'`.
- Phase 3 replaces the implementations and the persona list but **keeps these exports and signatures**. The UI only imports `listPersonas`, `getPersona`, `createBrain`, `BOT_VERSION` and the `bots/runner.js` exports below.

### 3.4 `bots/runner.js`: async decision boundary
```js
/** @typedef {{ decide:(ctx:BotContext) => Promise<BotChoice>, dispose:() => void }} BotRunner */
export function createLocalRunner({ rng }) -> BotRunner   // calls createBrain(ctx.persona).decide(ctx, rng) on the main thread
```
Phase 3 adds `createWorkerRunner()` in `worker/`, with the same `BotRunner` shape. The UI takes a runner as a dependency, so switching is one line.

## 4. Hand record (produced by the table in Phase 2, stored by Phase 4, graded by Phase 5)

Phase 2 builds one `HandRecord` per completed hand in `lib/handRecord.js` (`buildHandRecord(...)`) and passes it to the table's `onHandComplete(record)` prop:
```js
/**
 * @typedef {{
 *   v: 1,
 *   id: string,               // crypto.randomUUID()
 *   sessionId: string,
 *   handNo: number,           // 1-based within the session
 *   playedAt: string,         // ISO timestamp at hand start
 *   botVersion: string,       // BOT_VERSION
 *   heroSeat: number,
 *   buttonSeat: number,
 *   lineup: { seat:number, personaId:string }[],   // bot seats only
 *   startStacks: { seat:number, stack:number }[],  // units, as in the start event
 *   events: object[],         // the full log including every hole card (the stored truth)
 *   heroNet: number,          // units, state.result.net[heroSeat]
 *   pot: number,              // units, sum of all players' total contributions
 *   showdown: boolean,
 * }} HandRecord
 */
```
Session lifecycle props on the table page (Phase 2 defines them and defaults them to no-ops; Phase 4 wires them):
- `onSessionStart(session)`, where `session = { id, startedAt, botVersion, tableMode:'random'|'custom', lineup, heroSeat }`
- `onHandComplete(record: HandRecord)`
- `onSessionEnd(summary)`, where `summary = { id, endedAt, hands, net (units), rebuys }`

Persistence stores amounts as **integer units** (not the spec's `numeric(10,1)` BB). The API and DB use units, and the UI converts to BB for display.

## 5. Branches and worktrees

- The integration branch is `feat/poker`. Phase 0 lands directly on it.
- Each phase runs in its own git worktree and branch cut from `feat/poker` after Phase 0:
  - Phase 2 on `feat/poker-ui`
  - Phase 3 on `feat/poker-bots`
  - Phase 4 on `feat/poker-persist`
- The controller merges each one back into `feat/poker` when its final review is clean.
- Plans live in `docs/superpowers/plans/` on `feat/poker`.
