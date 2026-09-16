# Poker Trainer Phase 2: Table UI and Local Sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable local cash-game session at `/me/poker`: a Midnight Indigo pixel-art 6-max table where you play keyboard-first against five placeholder bots, with rebuys, getting up, busted-bot refills, button rotation, a HandRecord per hand and the contract session callbacks. Nothing is saved yet.

**Architecture:** All game logic lives in pure, node-tested modules under `lib/`. `tableCore.js` is a synchronous session state machine (deal, act, board, settle, rebuy, get up, refill) built on the Phase 1 engine. `tableDriver.js` runs it over time: bot turns go through an injected `BotRunner` with humanized delays behind an injected scheduler, and it emits `onSessionStart`, `onHandComplete` and `onSessionEnd`. `tableView.js`, `actionLog.js`, `sizing.js` and `keys.js` turn the session into display data and turn keys into commands. React components under `ui/` only render that data and forward commands. Pixel art (the superellipse table, 3×5 ranks, 9-wide suits) is ported from the approved mockup into pure bitmap modules plus thin SVG components.

**Tech Stack:** React 18, react-router-dom 7, Vite 6, plain JavaScript/JSX with JSDoc, Vitest 5 (node environment). No new npm dependencies. The per-task bundle check uses the `esbuild` binary that Vite already installs.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-trainer-design.md` §2, §4 (stacks and rebuys), §5.6 (pacing), §8 (UI).
**Contracts:** `docs/superpowers/specs/2026-09-16-poker-contracts.md` §1, §2, §3 and §4 including §4.1.

## Global Constraints

- **Branch and worktree:** work in `C:\Users\hgrid\jp-poker-ui` on branch `feat/poker-ui`, cut from `feat/poker` after Phase 0. If `node_modules` is missing in the worktree, the controller runs `npm ci` once before Task 1.
- **Ownership (contracts §2):** create or edit only `src/private/trainers/poker/ui/**`, `src/private/trainers/poker/lib/**` (never `lib/persistence/**`), the poker routes in `src/App.jsx` and the Poker entry in `src/private/PrivateHome.jsx`. Do not edit `engine/**` or `bots/**`.
- **Imports from other phases:** bots only through `bots/index.js` (`BOT_VERSION`), `bots/personas.js` (`listPersonas`, `getPersona`), `bots/runner.js` (`createLocalRunner`), `bots/contract.js` (`emptyProfile`) and, optionally, `bots/profileStats.js` (`accumulateProfile`, contracts §4.1). Seat visibility only through `engine/view.js` (`viewFor`, `eventsFor`).
- **Language:** plain JavaScript ES modules and JSX with JSDoc. No TypeScript. No new npm dependencies.
- **Money:** integer **units, 1 unit = 0.5 BB**. The table plays `sb: 1, bb: 2`. The UI shows BB as `units / 2` with one decimal.
- **Session rules (spec §2, §4):** 6-max, you and 5 bots. Buy-in **100 BB (200 units)**. Blinds **0.5 / 1 BB**, no ante. Rebuy tops up to 100 BB and is prompted **when below 40 BB (under 80 units)**. At 0 you must rebuy or get up. A busted bot seat is refilled before the next hand. The button rotates every hand.
- **Pacing (spec §5.6):** bot think time **fast: 250–600 ms, normal: 600–1800 ms**, longer for big decisions.
- **Keys (spec §8.2):** `F` fold, `C` check/call, `R` raise (focuses the sizing), `1–5` = ⅓, ½, ⅔, pot, all-in, `↑/↓` adjust by 0.5 BB (Shift = 5 BB), typing a number sets the size, `Enter` confirms, `Esc` cancels sizing.
- **Routes (spec §8.1):** `/me/poker` (lobby, `?tab=stats`) and `/me/poker/table/:sessionId`, both behind `RequireAuth` and `React.lazy`, declared **before** `/me/:trainer` in `src/App.jsx`. The Trainers section on `/me` lists Poker. Review (`/me/poker/session/:id`) and replayer (`/me/poker/hand/:id`) routes are Phase 5.
- **Visual tokens (spec §8.3), exact values, scoped to `.pk`:** `--pk-bg #0a0a14`, `--pk-rail #1a1b2b`, `--pk-rail-hi #26283d`, `--pk-felt #23265a`, `--pk-felt-dk #1d2050`, `--pk-felt-hi #2c3068`, `--pk-line #343a7a`, `--pk-card #eeeae0`, `--pk-red #ff5f6d`, `--pk-black #14142a`, `--pk-accent #f5c451`, `--pk-accent-2 #8fa8ff`, `--pk-text #dcdcf0`, `--pk-muted #6a6c8c`, `--pk-back #3b3f8a`, `--pk-back-2 #2a2d66`.
- **Art (spec §8.3):** Silkscreen for all table text. Table: 120×56 pixel grid, superellipse, stepped rail, inner betting line, checkerboard dithering, SVG with `shape-rendering: crispEdges`, stretched. Cards: notched 3 px corners, hard offset shadow, ranks 3×5 (10 is 5×5) at 3 px on board cards and 4 px on hero cards, 9-wide suits at 2 px (board) and 3 px (hero), the approved redrawn spade. Buttons: fold outlined muted, call outlined accent-2, raise filled accent.
- **Motion and accessibility (spec §8.2):** cards slide in, chips move to the pot, the winner's seat bounces, all disabled under `prefers-reduced-motion`. DOM + CSS + inline SVG only, no canvas. Cards have `aria-label`s ("Ace of hearts"), actions are announced in an `aria-live` region, every control is keyboard reachable.
- **CSS:** every selector is scoped under `.pk` (keyframes are prefixed `pk-`), so nothing leaks into the rest of the site. Components stay under about 150 lines.
- **Session props (contracts §4, §4.1):** the table page takes `profile` (default `null`), `onSessionStart(session)`, `onHandComplete(record, analysis?)` and `onSessionEnd(summary)`, all defaulting to no-ops. Phase 2 always calls `onHandComplete(record)` with no second argument.
- **Tests:** Vitest includes `src/**/*.test.js` in the node environment. There is no jsdom or Testing Library, so `.jsx` files are checked with a bundle check and `npm run build`, and behavior in the browser by the controller in Task 18. Single file: `npx vitest run <path>`. Full suite: `npm test`.
- **Bundle check for `.jsx` tasks:** `npx esbuild <entry> --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`. It must exit 0 with no output. A missing file ("Could not resolve") or a missing export ("No matching export") fails it. It proves that every relative import and export resolves before the files are reachable from a route. The output folder is inside `node_modules`, which git ignores.
- **Build:** `npm run build` must succeed. Its "Some chunks are larger than 500 kB" warning for the main `index` chunk predates this phase and is not a failure.
- **Commits:** stage explicit paths only (`git add <paths>`), never `git add -A` or `git add .`. Never stage `wa.geo.json`. Every commit message ends with exactly this trailer line (copy it verbatim):
  `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`

### Decisions made in this plan (already settled)

- **Hero seat:** the hero is always engine seat `0`, rendered at slot 0 (bottom center). Bots sit in seats 1–5. Slots run clockwise from the hero, which matches the order of play: 1 left, 2 top left, 3 top, 4 top right, 5 right.
- **First button:** chosen at random from the six seats. After that it moves with `nextButton`. Every hand is 6-handed because busted bots are refilled first.
- **Refill:** a busted bot seat gets a random persona from `listPersonas()` that is not currently seated. If every persona is seated, the seat keeps its persona. The new bot has 100 BB.
- **Random table:** 5 distinct personas shuffled from `listPersonas()`. **Custom table:** one persona per seat, each persona at most once, defaulting to the first five personas.
- **Presets:** a fraction `f` means "call, then raise by `f` × the pot after the call": `raiseTo = currentBet + round(f × (pot + toCall))`, where the pot counts every chip in the hand. The result is rounded to a whole unit (the nearest 0.5 BB) and clamped to `[minRaiseTo, maxRaiseTo]`. All-in is `maxRaiseTo`.
- **Keys versus typing:** `1–5` pick a preset only when the size input is not in use. A preset or `R` opens the sizing panel with the input focused and its text selected, so typing digits replaces the size and `Enter` confirms it. While the panel is open, digits go to the input. `↑/↓` open the panel at the minimum raise if it is closed.
- **Fold when checking is free:** the Fold button and `F` are disabled when `canCheck` is true.
- **Big decision:** calling at least 10 BB, or calling all-in. Its think time is multiplied by 1.5. Board cards come 350 ms (fast) or 700 ms (normal) apart, and the pause between hands is 1200 ms or 2500 ms. A bot choice that is illegal, or a runner that rejects, becomes check (if possible) or fold, with a `console.warn`.
- **Rebuy:** the prompt shows while the hero's stack from the last completed hand is under 40 BB. Pressed between hands it tops up to exactly 100 BB at once. Pressed mid-hand it is queued and applied when the hand settles, and it is dropped if the stack is back at 40 BB or more by then. At 0 the table stops and offers Rebuy or Get up.
- **Get up:** between hands the session ends at once. Mid-hand the button changes to "Leaving after this hand" and the session ends when the hand settles (a queued rebuy is dropped). Leaving the page (the Lobby link after a confirm, or unmounting) abandons the session: the hand in progress is discarded and `onSessionEnd` reports completed hands only.
- **Summary net:** `net = hero stack after the last completed hand − total bought in` (units).
- **Lobby to table:** the lobby creates the session id with `crypto.randomUUID()` and navigates with router state `{ tableMode, lineup, speed }`. The table page reads that state once, then replaces the history entry with no state, so a reload shows "Table closed" instead of restarting the same session id (which would reuse hand numbers).
- **React StrictMode:** the driver starts in a `setTimeout(0)` that the effect cleanup cancels, so the development double mount emits `onSessionStart` once.
- **Profile (contracts §4.1):** the driver keeps a running profile, passes it to bots as `BotContext.profile` and folds each settled hand in. `lib/profile.js` loads Phase 3's `bots/profileStats.js` through `import.meta.glob` when that file exists. Until Phase 3 merges, the profile passes through unchanged, and no edit is needed at merge time.
- **Log visibility:** `actionLog.js` replays the full event log to compute call amounts, but reads hole cards only through `viewFor(state, heroSeat)`, so bots' unrevealed cards never reach the screen. A test enforces this.
- **Session end panel:** shows hands, net BB, rebuys and the opponents seated at the end with their hidden `style` labels (spec §7.2 reveals them after a session). There is no review link until Phase 5. The Stats tab and Recent sessions show empty states saying stats and sessions arrive once sessions are saved.
- **Font loading:** poker pages inject the Silkscreen Google Fonts stylesheet on mount (`PokerShell`), so public pages never download it and `index.html` is unchanged.
- **Card sizes:** board 46×64, hero 64×90, face-down "mini" 22×30 on bot seats. Bot cards revealed at showdown use the board size.
- **File naming:** the table bitmap module is `ui/sprites/tableGrid.js`, not `tableArt.js`. On Windows `import TableArt from './TableArt'` would otherwise resolve to `tableArt.js`.

---

## File Structure

All paths are under `src/private/trainers/poker/` unless they start with `src/`.

| File | Responsibility | Task |
|---|---|---|
| `lib/constants.js` | Seat count, hero seat, blinds, buy-in, rebuy threshold (units) | 1 |
| `lib/format.js` | BB formatting and parsing, card labels and short card text | 1 |
| `lib/sizing.js` | Presets, pot-relative raise math, clamping, sizing panel reducer, button labels | 2 |
| `lib/keys.js` | `keyToCommand`: keydown → table command | 3 |
| `lib/lineup.js` | Random, default and custom lineups, refill choice, router-state validation | 4 |
| `lib/handRecord.js` | `buildHandRecord` (contracts §4, §4.1) | 5 |
| `lib/tableCore.js` | Pure session state machine | 6 |
| `lib/tableDriver.js` | Async loop: bot runner, pacing, pauses, callbacks, profile | 7 |
| `lib/profile.js` | Folds a hand into the hero profile via Phase 3 when present | 7 |
| `lib/actionLog.js` | Log lines and announcements from the event log | 8 |
| `lib/tableView.js` | Seat views, pot and board, hero turn, chip sweeps | 9 |
| `ui/sprites/glyphs.js` | Rank, suit and chip bitmaps, run-length rows | 10 |
| `ui/sprites/tableGrid.js` | 120×56 table tone grid and runs | 10 |
| `ui/PokerShell.jsx`, `ui/poker.css` | Page frame, `.pk` tokens, font, buttons, lobby styles | 11 |
| `ui/lobby/PokerLobbyPage.jsx`, `ui/lobby/PlayTab.jsx`, `ui/lobby/StatsTab.jsx` | Lobby with Play and Stats tabs | 11, 12 |
| `ui/lobby/TableBuilder.jsx` | Custom table, one persona per seat | 12 |
| `ui/sprites/PixelBitmap.jsx`, `ui/sprites/Card.jsx`, `ui/sprites/TableArt.jsx`, `ui/sprites/sprites.css` | SVG sprites and card styles | 13 |
| `ui/table/Seat.jsx`, `ui/table/Board.jsx`, `ui/table/TableView.jsx`, `ui/table/table.css` | The table picture and all table page styles | 14 |
| `ui/table/useHeroControls.js`, `ui/table/SizingPanel.jsx`, `ui/table/ActionBar.jsx` | Hero actions, sizing and keyboard | 15 |
| `ui/table/ActionLog.jsx`, `ui/table/RebuyBanner.jsx`, `ui/table/SessionEnd.jsx` | Log and live region, rebuy prompt, end panel | 16 |
| `lib/useTableSession.js`, `ui/table/TableScreen.jsx`, `ui/table/TablePage.jsx` | React binding, page composition, the route component | 17 |
| `src/App.jsx`, `src/private/PrivateHome.jsx` | Poker routes and the Trainers entry | 11, 17 |

---

### Task 1: Table constants and display formatting

**Files:**
- Create: `src/private/trainers/poker/lib/constants.js`
- Create: `src/private/trainers/poker/lib/format.js`
- Test: `src/private/trainers/poker/lib/format.test.js`

**Interfaces:**
- Consumes: `RANKS` from `engine/cards.js`.
- Produces:
  - `constants.js`: `SEAT_COUNT = 6`, `HERO_SEAT = 0`, `BOT_SEATS = [1,2,3,4,5]`, `SB = 1`, `BB = 2`, `BUY_IN = 200`, `REBUY_BELOW = 80`.
  - `format.js`: `formatBb(units) → string` ("12.5"), `formatBbLabel(units) → string` ("12.5 BB"), `formatNetBb(units) → string` ("+12.5", "−3.0", "0.0"), `formatBbInput(units) → string` ("12", "12.5"), `parseBbInput(text) → number|null` (units), `cardLabel(card) → string` ("Ace of hearts"), `cardText(card) → string` ("A♥", "10♣"), `isRedCard(card) → boolean`.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/format.test.js
import { describe, it, expect } from 'vitest';
import { parseCard } from '../engine/cards.js';
import {
  formatBb, formatBbLabel, formatNetBb, formatBbInput, parseBbInput, cardLabel, cardText, isRedCard,
} from './format.js';
import { SEAT_COUNT, HERO_SEAT, BOT_SEATS, SB, BB, BUY_IN, REBUY_BELOW } from './constants.js';

describe('table constants', () => {
  it('match the spec: 6-max, 0.5/1 BB blinds, 100 BB buy-in, rebuy under 40 BB', () => {
    expect(SEAT_COUNT).toBe(6);
    expect(HERO_SEAT).toBe(0);
    expect(BOT_SEATS).toEqual([1, 2, 3, 4, 5]);
    expect([SB, BB, BUY_IN, REBUY_BELOW]).toEqual([1, 2, 200, 80]);
  });
});

describe('BB formatting', () => {
  it('shows units as BB with one decimal', () => {
    expect(formatBb(200)).toBe('100.0');
    expect(formatBb(1)).toBe('0.5');
    expect(formatBb(0)).toBe('0.0');
    expect(formatBbLabel(7)).toBe('3.5 BB');
  });

  it('signs net results', () => {
    expect(formatNetBb(25)).toBe('+12.5');
    expect(formatNetBb(-6)).toBe('−3.0');
    expect(formatNetBb(0)).toBe('0.0');
  });

  it('round-trips the size input', () => {
    expect(formatBbInput(24)).toBe('12');
    expect(formatBbInput(25)).toBe('12.5');
    expect(parseBbInput('12')).toBe(24);
    expect(parseBbInput(' 12.5 ')).toBe(25);
    expect(parseBbInput('.5')).toBe(1);
    expect(parseBbInput('3.')).toBe(6);
    expect(parseBbInput('0.3')).toBe(1);
    expect(parseBbInput('0.2')).toBe(0);
  });

  it('rejects text that is not a plain positive number', () => {
    for (const bad of ['', 'abc', '-2', '1e3', '1.2.3', null, undefined]) expect(parseBbInput(bad)).toBeNull();
  });
});

describe('card text', () => {
  it('names cards for screen readers', () => {
    expect(cardLabel(parseCard('Ah'))).toBe('Ace of hearts');
    expect(cardLabel(parseCard('Tc'))).toBe('Ten of clubs');
    expect(cardLabel(parseCard('2s'))).toBe('Two of spades');
  });

  it('writes short card text with suit symbols', () => {
    expect(cardText(parseCard('Ah'))).toBe('A♥');
    expect(cardText(parseCard('Tc'))).toBe('10♣');
    expect(cardText(parseCard('9d'))).toBe('9♦');
    expect(cardText(parseCard('Ks'))).toBe('K♠');
  });

  it('colors diamonds and hearts red', () => {
    expect(isRedCard(parseCard('Ad'))).toBe(true);
    expect(isRedCard(parseCard('Ah'))).toBe(true);
    expect(isRedCard(parseCard('Ac'))).toBe(false);
    expect(isRedCard(parseCard('As'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/format.test.js`
Expected: FAIL with "Failed to load url ./format.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/constants.js
// Table rules for local sessions. Money is integer units (1 unit = 0.5 BB).

export const SEAT_COUNT = 6;
export const HERO_SEAT = 0;
export const BOT_SEATS = [1, 2, 3, 4, 5];
export const SB = 1;
export const BB = 2;
export const BUY_IN = 200; // 100 BB
export const REBUY_BELOW = 80; // 40 BB
```

```js
// src/private/trainers/poker/lib/format.js
// Display formatting. Money is integer units (1 unit = 0.5 BB); the UI shows BB with one decimal.
import { RANKS } from '../engine/cards.js';

const RANK_NAMES = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const SUIT_NAMES = ['clubs', 'diamonds', 'hearts', 'spades'];
const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const BB_INPUT = /^(\d+(\.\d*)?|\.\d+)$/;

export const formatBb = (units) => (units / 2).toFixed(1);

export const formatBbLabel = (units) => `${formatBb(units)} BB`;

/** "+12.5", "−3.0" (U+2212 minus) or "0.0". */
export function formatNetBb(units) {
  if (units > 0) return `+${formatBb(units)}`;
  if (units < 0) return `−${formatBb(-units)}`;
  return formatBb(0);
}

/** Size-input text: "12" or "12.5" (no trailing ".0"). */
export const formatBbInput = (units) => String(units / 2);

/** Parses typed BB ("12", "12.5", ".5") into units, rounded to the nearest unit. Null if not a number. */
export function parseBbInput(text) {
  const trimmed = String(text ?? '').trim();
  if (!BB_INPUT.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 2);
}

/** "Ace of hearts" */
export const cardLabel = (card) => `${RANK_NAMES[card >> 2]} of ${SUIT_NAMES[card & 3]}`;

/** "A♥", "10♣" */
export function cardText(card) {
  const rank = RANKS[card >> 2];
  return `${rank === 'T' ? '10' : rank}${SUIT_SYMBOLS[card & 3]}`;
}

/** Diamonds and hearts are red. */
export const isRedCard = (card) => (card & 3) === 1 || (card & 3) === 2;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/format.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/constants.js src/private/trainers/poker/lib/format.js src/private/trainers/poker/lib/format.test.js
git commit -m "Add poker table constants and BB and card formatting

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Bet sizing

**Files:**
- Create: `src/private/trainers/poker/lib/sizing.js`
- Test: `src/private/trainers/poker/lib/sizing.test.js`

**Interfaces:**
- Consumes: `formatBb`, `formatBbInput`, `parseBbInput` (Task 1). Tests use `reduceHand`, `legalActions` (`engine/handState.js`) and `parseCards` (`engine/cards.js`).
- Produces:
  - `PRESETS: {key, label, num, den}[]`, keys `third, half, twoThirds, pot, allIn` (`num`/`den` are `null` for all-in).
  - `SIZING_CLOSED` (frozen `{ open:false, amount:null, text:'' }`).
  - `potTotal(view) → number`, the sum of `players[].total`.
  - `clampRaise(legal, amount) → number|null`.
  - `presetRaiseTo(view, legal, index) → number|null`.
  - `sizingReducer(sizing, command, { view, legal }) → sizing`, where `sizing = { open:boolean, amount:number|null, text:string }` and `command` is one of `openSizing`, `preset {index}`, `nudge {units}`, `text {text}` or `cancel` (anything else returns `sizing` unchanged).
  - `resolveRaise(sizing, legal) → { action: legal.raiseKind, amount } | null`.
  - `callLabel(legal, stack) → string`, `raiseLabel(legal, amount) → string`.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/sizing.test.js
import { describe, it, expect } from 'vitest';
import { reduceHand, legalActions } from '../engine/handState.js';
import { parseCards } from '../engine/cards.js';
import {
  PRESETS, SIZING_CLOSED, potTotal, clampRaise, presetRaiseTo, sizingReducer, resolveRaise, callLabel, raiseLabel,
} from './sizing.js';

const deck = parseCards('AhKhQhJhTh9h');
const hole = (seat) => ({ type: 'hole', seat, cards: [deck[seat * 2], deck[seat * 2 + 1]] });

// 3 players: seat 0 button, seat 1 SB, seat 2 BB. Seat 0 acts first preflop.
function preflop(stacks = [200, 200, 200]) {
  return [
    { type: 'start', seats: stacks.map((stack, seat) => ({ seat, stack })), button: 0, sb: 1, bb: 2 },
    hole(0), hole(1), hole(2),
  ];
}

// Everyone calls or checks to the flop: pot 6, seat 1 first to act, nothing bet.
function flop() {
  return [
    ...preflop(),
    { type: 'act', seat: 0, action: 'call' },
    { type: 'act', seat: 1, action: 'call' },
    { type: 'act', seat: 2, action: 'check' },
    { type: 'board', cards: parseCards('2c3c4d') },
  ];
}

const spot = (events) => {
  const view = reduceHand(events);
  return { view, legal: legalActions(view) };
};

describe('presets', () => {
  it('lists third, half, two thirds, pot and all-in', () => {
    expect(PRESETS.map((p) => p.key)).toEqual(['third', 'half', 'twoThirds', 'pot', 'allIn']);
  });

  it('sizes a preflop open as call, then raise by a fraction of the pot', () => {
    const { view, legal } = spot(preflop());
    expect(potTotal(view)).toBe(3);
    // pot after the call = 3 + 2 = 5
    expect(presetRaiseTo(view, legal, 3)).toBe(7); // 2 + 5
    expect(presetRaiseTo(view, legal, 2)).toBe(5); // 2 + round(3.33)
    expect(presetRaiseTo(view, legal, 1)).toBe(5); // 2 + round(2.5)
    expect(presetRaiseTo(view, legal, 0)).toBe(4); // 2 + round(1.67), also the min raise
    expect(presetRaiseTo(view, legal, 4)).toBe(200);
  });

  it('sizes a flop bet as a fraction of the pot', () => {
    const { view, legal } = spot(flop());
    expect(legal.raiseKind).toBe('bet');
    expect(presetRaiseTo(view, legal, 0)).toBe(2);
    expect(presetRaiseTo(view, legal, 1)).toBe(3);
    expect(presetRaiseTo(view, legal, 2)).toBe(4);
    expect(presetRaiseTo(view, legal, 3)).toBe(6);
  });

  it('counts chips the hero already committed when facing a raise', () => {
    // Seat 0 raises to 6. Seat 1 (SB, committed 1) owes 5; pot 9, so the pot after the call is 14.
    const { view, legal } = spot([...preflop(), { type: 'act', seat: 0, action: 'raise', amount: 6 }]);
    expect(legal.seat).toBe(1);
    expect(presetRaiseTo(view, legal, 3)).toBe(20); // 6 + 14
    expect(presetRaiseTo(view, legal, 1)).toBe(13); // 6 + 7
    expect(presetRaiseTo(view, legal, 0)).toBe(11); // 6 + round(4.67), above the min of 10
  });

  it('clamps presets to the legal range', () => {
    const { view, legal } = spot(preflop([6, 200, 200]));
    expect(legal.maxRaiseTo).toBe(6);
    expect(presetRaiseTo(view, legal, 3)).toBe(6);
    expect(presetRaiseTo(view, legal, 0)).toBe(4);
  });

  it('returns null when raising is not allowed or the preset is unknown', () => {
    const { view, legal } = spot(preflop());
    expect(presetRaiseTo(view, { ...legal, canRaise: false, minRaiseTo: null, maxRaiseTo: null }, 3)).toBeNull();
    expect(presetRaiseTo(view, legal, 9)).toBeNull();
  });
});

describe('clampRaise', () => {
  const legal = { canRaise: true, minRaiseTo: 4, maxRaiseTo: 200, raiseKind: 'raise', seat: 0 };
  it('rounds and clamps', () => {
    expect(clampRaise(legal, 1)).toBe(4);
    expect(clampRaise(legal, 9.4)).toBe(9);
    expect(clampRaise(legal, 999)).toBe(200);
    expect(clampRaise({ canRaise: false }, 10)).toBeNull();
  });
});

describe('sizingReducer', () => {
  const { view, legal } = spot(preflop());
  const run = (commands, start = SIZING_CLOSED) => commands.reduce((s, c) => sizingReducer(s, c, { view, legal }), start);

  it('opens at the minimum raise', () => {
    expect(run([{ type: 'openSizing' }])).toEqual({ open: true, amount: 4, text: '2' });
  });

  it('applies a preset', () => {
    expect(run([{ type: 'preset', index: 3 }])).toEqual({ open: true, amount: 7, text: '3.5' });
  });

  it('nudges from the typed or current amount and clamps', () => {
    expect(run([{ type: 'openSizing' }, { type: 'nudge', units: 1 }])).toEqual({ open: true, amount: 5, text: '2.5' });
    expect(run([{ type: 'text', text: '10' }, { type: 'nudge', units: 10 }])).toEqual({ open: true, amount: 30, text: '15' });
    expect(run([{ type: 'openSizing' }, { type: 'nudge', units: -10 }])).toEqual({ open: true, amount: 4, text: '2' });
    expect(run([{ type: 'nudge', units: 1 }])).toEqual({ open: true, amount: 5, text: '2.5' });
  });

  it('keeps typed text unclamped until it is confirmed', () => {
    expect(run([{ type: 'text', text: '1' }])).toEqual({ open: true, amount: 2, text: '1' });
    expect(run([{ type: 'text', text: 'x' }])).toEqual({ open: true, amount: null, text: 'x' });
  });

  it('cancels, and stays closed when raising is not allowed', () => {
    expect(run([{ type: 'openSizing' }, { type: 'cancel' }])).toBe(SIZING_CLOSED);
    const noRaise = { ...legal, canRaise: false, minRaiseTo: null, maxRaiseTo: null };
    expect(sizingReducer(SIZING_CLOSED, { type: 'openSizing' }, { view, legal: noRaise })).toBe(SIZING_CLOSED);
  });

  it('ignores unknown commands and presets', () => {
    const open = run([{ type: 'openSizing' }]);
    expect(sizingReducer(open, { type: 'fold' }, { view, legal })).toBe(open);
    expect(sizingReducer(open, { type: 'preset', index: 7 }, { view, legal })).toBe(open);
  });
});

describe('resolveRaise', () => {
  const { legal } = spot(preflop());
  it('turns the entered size into a legal raise', () => {
    expect(resolveRaise({ open: true, amount: null, text: '1' }, legal)).toEqual({ action: 'raise', amount: 4 });
    expect(resolveRaise({ open: true, amount: 7, text: '3.5' }, legal)).toEqual({ action: 'raise', amount: 7 });
    expect(resolveRaise({ open: true, amount: 9, text: 'x' }, legal)).toEqual({ action: 'raise', amount: 9 });
    expect(resolveRaise({ open: true, amount: null, text: 'x' }, legal)).toBeNull();
    expect(resolveRaise(SIZING_CLOSED, legal)).toBeNull();
  });
});

describe('labels', () => {
  it('labels the check and call button', () => {
    expect(callLabel({ canCheck: true, toCall: 0 }, 200)).toBe('Check');
    expect(callLabel({ canCheck: false, toCall: 4 }, 200)).toBe('Call 2.0');
    expect(callLabel({ canCheck: false, toCall: 25 }, 25)).toBe('Call all-in 12.5');
  });

  it('labels bet, raise and all-in', () => {
    expect(raiseLabel({ raiseKind: 'bet', maxRaiseTo: 200 }, 6)).toBe('Bet 3.0');
    expect(raiseLabel({ raiseKind: 'raise', maxRaiseTo: 200 }, 7)).toBe('Raise to 3.5');
    expect(raiseLabel({ raiseKind: 'raise', maxRaiseTo: 200 }, 200)).toBe('All-in 100.0');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/sizing.test.js`
Expected: FAIL with "Failed to load url ./sizing.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/sizing.js
// Bet sizing for the hero: pot-relative presets, clamping to legal bounds and the sizing panel reducer.
// All amounts are integer units and "raise to" street totals, as in engine act events.
import { formatBb, formatBbInput, parseBbInput } from './format.js';

export const PRESETS = [
  { key: 'third', label: '⅓', num: 1, den: 3 },
  { key: 'half', label: '½', num: 1, den: 2 },
  { key: 'twoThirds', label: '⅔', num: 2, den: 3 },
  { key: 'pot', label: 'Pot', num: 1, den: 1 },
  { key: 'allIn', label: 'All-in', num: null, den: null },
];

export const SIZING_CLOSED = Object.freeze({ open: false, amount: null, text: '' });

/** Every chip put in this hand, including bets on the current street. */
export const potTotal = (view) => view.players.reduce((sum, p) => sum + p.total, 0);

/** Rounds to a whole unit and clamps into [minRaiseTo, maxRaiseTo]. Null when raising is not allowed. */
export function clampRaise(legal, amount) {
  if (!legal?.canRaise) return null;
  return Math.min(Math.max(Math.round(amount), legal.minRaiseTo), legal.maxRaiseTo);
}

/**
 * Raise-to amount for preset `index` (0..4 = 1/3, 1/2, 2/3, pot, all-in).
 * A fraction f means: call first, then raise by f x (pot after the call).
 */
export function presetRaiseTo(view, legal, index) {
  const preset = PRESETS[index];
  if (!legal?.canRaise || !preset) return null;
  if (preset.num === null) return legal.maxRaiseTo;
  const hero = view.players.find((p) => p.seat === legal.seat);
  const toCall = Math.max(view.currentBet - hero.committed, 0);
  const potAfterCall = potTotal(view) + toCall;
  return clampRaise(legal, view.currentBet + Math.round((preset.num * potAfterCall) / preset.den));
}

const openAt = (amount) => ({ open: true, amount, text: formatBbInput(amount) });

/**
 * Sizing panel state machine. `command` comes from keys.js or the panel's buttons:
 * openSizing | preset {index} | nudge {units} | text {text} | cancel. Anything else is ignored.
 */
export function sizingReducer(sizing, command, { view, legal }) {
  if (!legal?.canRaise) return SIZING_CLOSED;
  switch (command.type) {
    case 'openSizing':
      return sizing.open ? sizing : openAt(legal.minRaiseTo);
    case 'preset':
      return PRESETS[command.index] ? openAt(presetRaiseTo(view, legal, command.index)) : sizing;
    case 'nudge': {
      const base = sizing.open ? (parseBbInput(sizing.text) ?? sizing.amount ?? legal.minRaiseTo) : legal.minRaiseTo;
      return openAt(clampRaise(legal, base + command.units));
    }
    case 'text':
      return { open: true, amount: parseBbInput(command.text), text: command.text };
    case 'cancel':
      return SIZING_CLOSED;
    default:
      return sizing;
  }
}

/** The act choice for a confirmed size, clamped to legal bounds. Null if nothing valid is entered. */
export function resolveRaise(sizing, legal) {
  if (!sizing.open || !legal?.canRaise) return null;
  const amount = parseBbInput(sizing.text) ?? sizing.amount;
  if (amount === null) return null;
  return { action: legal.raiseKind, amount: clampRaise(legal, amount) };
}

/** "Check", "Call 2.0", "Call all-in 12.5". `stack` is the hero's stack behind. */
export function callLabel(legal, stack) {
  if (legal.canCheck) return 'Check';
  if (legal.toCall >= stack) return `Call all-in ${formatBb(legal.toCall)}`;
  return `Call ${formatBb(legal.toCall)}`;
}

/** "Bet 3.0", "Raise to 7.0", "All-in 100.0". */
export function raiseLabel(legal, amount) {
  if (amount === legal.maxRaiseTo) return `All-in ${formatBb(amount)}`;
  return `${legal.raiseKind === 'bet' ? 'Bet' : 'Raise to'} ${formatBb(amount)}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/sizing.test.js`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/sizing.js src/private/trainers/poker/lib/sizing.test.js
git commit -m "Add poker bet sizing presets, legal clamping and sizing reducer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Keyboard map

**Files:**
- Create: `src/private/trainers/poker/lib/keys.js`
- Test: `src/private/trainers/poker/lib/keys.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `NUDGE_UNITS = 1`, `NUDGE_SHIFT_UNITS = 10`, and `keyToCommand({ key, shiftKey?, ctrlKey?, metaKey?, altKey? }, { heroTurn, sizing }) → null | {type:'fold'} | {type:'checkCall'} | {type:'openSizing'} | {type:'preset', index} | {type:'nudge', units} | {type:'confirm'} | {type:'cancel'}`. The command objects match `sizingReducer` (Task 2) for `openSizing`, `preset`, `nudge` and `cancel`.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/keys.test.js
import { describe, it, expect } from 'vitest';
import { keyToCommand } from './keys.js';

const idle = { heroTurn: true, sizing: false };
const sizing = { heroTurn: true, sizing: true };

describe('keyToCommand', () => {
  it('maps action keys, ignoring case', () => {
    expect(keyToCommand({ key: 'f' }, idle)).toEqual({ type: 'fold' });
    expect(keyToCommand({ key: 'F', shiftKey: true }, idle)).toEqual({ type: 'fold' });
    expect(keyToCommand({ key: 'c' }, idle)).toEqual({ type: 'checkCall' });
    expect(keyToCommand({ key: 'r' }, idle)).toEqual({ type: 'openSizing' });
  });

  it('maps 1-5 to the presets', () => {
    expect(['1', '2', '3', '4', '5'].map((key) => keyToCommand({ key }, idle))).toEqual(
      [0, 1, 2, 3, 4].map((index) => ({ type: 'preset', index })),
    );
    expect(keyToCommand({ key: '6' }, idle)).toBeNull();
    expect(keyToCommand({ key: '0' }, idle)).toBeNull();
  });

  it('nudges by 0.5 BB, or 5 BB with Shift, in or out of sizing', () => {
    expect(keyToCommand({ key: 'ArrowUp' }, idle)).toEqual({ type: 'nudge', units: 1 });
    expect(keyToCommand({ key: 'ArrowDown' }, sizing)).toEqual({ type: 'nudge', units: -1 });
    expect(keyToCommand({ key: 'ArrowUp', shiftKey: true }, sizing)).toEqual({ type: 'nudge', units: 10 });
    expect(keyToCommand({ key: 'ArrowDown', shiftKey: true }, idle)).toEqual({ type: 'nudge', units: -10 });
  });

  it('confirms and cancels only while sizing', () => {
    expect(keyToCommand({ key: 'Enter' }, sizing)).toEqual({ type: 'confirm' });
    expect(keyToCommand({ key: 'Escape' }, sizing)).toEqual({ type: 'cancel' });
    expect(keyToCommand({ key: 'Enter' }, idle)).toBeNull();
    expect(keyToCommand({ key: 'Escape' }, idle)).toBeNull();
  });

  it('leaves digits and letters to the size input while sizing', () => {
    for (const key of ['1', '5', '.', 'f', 'c', 'r', 'Backspace']) expect(keyToCommand({ key }, sizing)).toBeNull();
  });

  it('does nothing when it is not the hero’s turn or a modifier is held', () => {
    expect(keyToCommand({ key: 'f' }, { heroTurn: false, sizing: false })).toBeNull();
    expect(keyToCommand({ key: 'c', ctrlKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: 'r', metaKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: '1', altKey: true }, idle)).toBeNull();
    expect(keyToCommand({ key: 'x' }, idle)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/keys.test.js`
Expected: FAIL with "Failed to load url ./keys.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/keys.js
// Table keyboard map. Pure: turns a keydown into a command, or null to let the browser handle it.
//
// Outside sizing:  F fold · C check/call · R open sizing · 1-5 presets (1/3, 1/2, 2/3, pot, all-in)
// Always:          ArrowUp/ArrowDown adjust by 0.5 BB (Shift: 5 BB)
// While sizing:    Enter confirm · Escape cancel · digits and "." are typed into the size input

export const NUDGE_UNITS = 1; // 0.5 BB
export const NUDGE_SHIFT_UNITS = 10; // 5 BB

/**
 * @param {{ key:string, shiftKey?:boolean, ctrlKey?:boolean, metaKey?:boolean, altKey?:boolean }} event
 * @param {{ heroTurn:boolean, sizing:boolean }} ctx
 * @returns {null | {type:'fold'} | {type:'checkCall'} | {type:'openSizing'} | {type:'preset', index:number}
 *   | {type:'nudge', units:number} | {type:'confirm'} | {type:'cancel'}}
 */
export function keyToCommand(event, { heroTurn, sizing }) {
  if (!heroTurn || event.ctrlKey || event.metaKey || event.altKey) return null;
  const { key } = event;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const step = event.shiftKey ? NUDGE_SHIFT_UNITS : NUDGE_UNITS;
    return { type: 'nudge', units: key === 'ArrowUp' ? step : -step };
  }
  if (sizing) {
    if (key === 'Enter') return { type: 'confirm' };
    if (key === 'Escape') return { type: 'cancel' };
    return null;
  }
  const lower = key.length === 1 ? key.toLowerCase() : key;
  if (lower === 'f') return { type: 'fold' };
  if (lower === 'c') return { type: 'checkCall' };
  if (lower === 'r') return { type: 'openSizing' };
  if (/^[1-5]$/.test(key)) return { type: 'preset', index: Number(key) - 1 };
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/keys.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/keys.js src/private/trainers/poker/lib/keys.test.js
git commit -m "Add poker table keyboard map

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Lineups and table config

**Files:**
- Create: `src/private/trainers/poker/lib/lineup.js`
- Test: `src/private/trainers/poker/lib/lineup.test.js`

**Interfaces:**
- Consumes: `shuffle` (`engine/cards.js`), `BOT_SEATS` (Task 1), `mulberry32` (`core/rng.js`, tests only).
- Produces (a `LineupEntry` is `{ seat:number, personaId:string }`, and `personas` is any `{id}[]`, normally `listPersonas()`):
  - `randomLineup(personas, rng) → LineupEntry[5]` (throws with fewer than 5 personas)
  - `defaultLineup(personas) → { seat, personaId:string|null }[5]`
  - `validateLineup(lineup, personas) → null | 'Choose a bot for every seat.' | 'Each bot can sit in only one seat.'`
  - `refillPersonaId(seatedIds, personas, rng, fallbackId) → string`
  - `parseTableConfig(state, personas) → { tableMode:'random'|'custom', speed:'fast'|'normal', lineup:LineupEntry[] } | null`

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/lineup.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { randomLineup, defaultLineup, validateLineup, refillPersonaId, parseTableConfig } from './lineup.js';

// Local fixtures keep these tests independent of the shipped persona list.
const personas = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({ id, name: id.toUpperCase(), tag: 'TAG' }));
const lineupOf = (ids) => ids.map((personaId, i) => ({ seat: i + 1, personaId }));

describe('randomLineup', () => {
  it('seats five distinct known personas in seats 1-5', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const lineup = randomLineup(personas, mulberry32(seed));
      expect(lineup.map((x) => x.seat)).toEqual([1, 2, 3, 4, 5]);
      expect(validateLineup(lineup, personas)).toBeNull();
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    expect(randomLineup(personas, mulberry32(3))).toEqual(randomLineup(personas, mulberry32(3)));
    const seen = new Set();
    for (let seed = 1; seed <= 20; seed += 1) seen.add(JSON.stringify(randomLineup(personas, mulberry32(seed))));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('needs at least five personas', () => {
    expect(() => randomLineup(personas.slice(0, 4), mulberry32(1))).toThrow();
  });
});

describe('defaultLineup and validateLineup', () => {
  it('defaults to the first five personas', () => {
    expect(defaultLineup(personas)).toEqual(lineupOf(['a', 'b', 'c', 'd', 'e']));
  });

  it('rejects missing seats, unknown ids and duplicates', () => {
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd']), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', 'zz']), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', null]), personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup(lineupOf(['a', 'b', 'c', 'd', 'a']), personas)).toBe('Each bot can sit in only one seat.');
    expect(validateLineup(lineupOf(['g', 'f', 'e', 'd', 'c']), personas)).toBeNull();
    expect(validateLineup(null, personas)).toBe('Choose a bot for every seat.');
    expect(validateLineup([null, 1, 2, 3, 4], personas)).toBe('Choose a bot for every seat.');
  });
});

describe('refillPersonaId', () => {
  it('picks a persona that is not seated', () => {
    const seated = ['a', 'b', 'c', 'd', 'e'];
    for (let seed = 1; seed <= 30; seed += 1) {
      expect(['f', 'g']).toContain(refillPersonaId(seated, personas, mulberry32(seed), 'a'));
    }
  });

  it('falls back to the given persona when everyone is seated', () => {
    expect(refillPersonaId(personas.map((p) => p.id), personas, mulberry32(1), 'c')).toBe('c');
  });
});

describe('parseTableConfig', () => {
  const lineup = lineupOf(['a', 'b', 'c', 'd', 'e']);

  it('accepts a valid lobby state and copies the lineup', () => {
    const state = { tableMode: 'custom', speed: 'fast', lineup, extra: true };
    const config = parseTableConfig(state, personas);
    expect(config).toEqual({ tableMode: 'custom', speed: 'fast', lineup });
    expect(config.lineup).not.toBe(lineup);
  });

  it('rejects missing or malformed state', () => {
    expect(parseTableConfig(null, personas)).toBeNull();
    expect(parseTableConfig('x', personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'ranked', speed: 'fast', lineup }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'slow', lineup }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'normal', lineup: lineup.slice(1) }, personas)).toBeNull();
    expect(parseTableConfig({ tableMode: 'random', speed: 'normal' }, personas)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/lineup.test.js`
Expected: FAIL with "Failed to load url ./lineup.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/lineup.js
// Choosing which personas sit in the five bot seats. Pure: personas and rng are passed in.
import { shuffle } from '../engine/cards.js';
import { BOT_SEATS } from './constants.js';

/** @typedef {{ seat:number, personaId:string }} LineupEntry */

/** Five distinct random personas, one per bot seat. */
export function randomLineup(personas, rng) {
  if (personas.length < BOT_SEATS.length) throw new Error(`need at least ${BOT_SEATS.length} personas`);
  const ids = shuffle(personas.map((p) => p.id), rng);
  return BOT_SEATS.map((seat, i) => ({ seat, personaId: ids[i] }));
}

/** The first five personas in list order; the starting point of the table builder. */
export function defaultLineup(personas) {
  return BOT_SEATS.map((seat, i) => ({ seat, personaId: personas[i]?.id ?? null }));
}

/** Null when valid, otherwise a message for the table builder. */
export function validateLineup(lineup, personas) {
  if (!Array.isArray(lineup) || lineup.some((x) => !x || typeof x !== 'object')) return 'Choose a bot for every seat.';
  const known = new Set(personas.map((p) => p.id));
  const seats = lineup.map((x) => x.seat);
  if (lineup.length !== BOT_SEATS.length || BOT_SEATS.some((seat) => !seats.includes(seat))) {
    return 'Choose a bot for every seat.';
  }
  if (lineup.some((x) => !known.has(x.personaId))) return 'Choose a bot for every seat.';
  if (new Set(lineup.map((x) => x.personaId)).size !== lineup.length) return 'Each bot can sit in only one seat.';
  return null;
}

/**
 * A persona for a refilled seat: random among personas not currently seated.
 * Falls back to `fallbackId` (the busted seat's persona) when every persona is seated.
 */
export function refillPersonaId(seatedIds, personas, rng, fallbackId) {
  const free = personas.map((p) => p.id).filter((id) => !seatedIds.includes(id));
  if (free.length === 0) return fallbackId;
  return free[Math.floor(rng() * free.length)];
}

/**
 * Validates the router state the lobby passes to the table page.
 * @returns {{ tableMode:'random'|'custom', speed:'fast'|'normal', lineup:LineupEntry[] } | null}
 */
export function parseTableConfig(state, personas) {
  if (!state || typeof state !== 'object') return null;
  const { tableMode, speed, lineup } = state;
  if (tableMode !== 'random' && tableMode !== 'custom') return null;
  if (speed !== 'fast' && speed !== 'normal') return null;
  if (validateLineup(lineup, personas) !== null) return null;
  return { tableMode, speed, lineup: lineup.map(({ seat, personaId }) => ({ seat, personaId })) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/lineup.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/lineup.js src/private/trainers/poker/lib/lineup.test.js
git commit -m "Add poker lineup selection, refill choice and table config validation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: HandRecord builder

**Files:**
- Create: `src/private/trainers/poker/lib/handRecord.js`
- Test: `src/private/trainers/poker/lib/handRecord.test.js`

**Interfaces:**
- Consumes: `reduceHand` (`engine/handState.js`). Tests use `playHand` (`engine/simulate.js`), `parseCards`, `mulberry32`.
- Produces: `buildHandRecord({ id?, sessionId, handNo, playedAt, botVersion, heroSeat, lineup, events, state? }) → HandRecord`, the exact contracts §4 shape `{ v:1, id, sessionId, handNo, playedAt, botVersion, heroSeat, buttonSeat, lineup, startStacks, events, heroNet, pot, showdown }`. `id` defaults to `crypto.randomUUID()`. `state` (contracts §4.1) is the final state and is recomputed when omitted. It throws `'events must begin with a start event'` or `'hand is not complete'`. `pot` is the sum of `players[].total` after uncalled bets are returned. `events` is a deep copy.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/handRecord.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { playHand } from '../engine/simulate.js';
import { buildHandRecord } from './handRecord.js';

const base = {
  id: 'hand-1',
  sessionId: 'session-1',
  handNo: 3,
  playedAt: '2026-09-16T12:00:00.000Z',
  botVersion: 'test-bots',
  heroSeat: 0,
  lineup: [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: `p${seat}` })),
};

const passive = (state, legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

describe('buildHandRecord', () => {
  it('records a showdown hand with the contract fields', () => {
    const seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 200 }));
    const { events, state } = playHand({ seats, button: 4, sb: 1, bb: 2, rng: mulberry32(11), policy: passive });
    const record = buildHandRecord({ ...base, events });
    expect(Object.keys(record).sort()).toEqual([
      'botVersion', 'buttonSeat', 'events', 'handNo', 'heroNet', 'heroSeat', 'id', 'lineup', 'playedAt', 'pot',
      'sessionId', 'showdown', 'startStacks', 'v',
    ]);
    expect(record).toMatchObject({
      v: 1, id: 'hand-1', sessionId: 'session-1', handNo: 3, playedAt: base.playedAt, botVersion: 'test-bots',
      heroSeat: 0, buttonSeat: 4, pot: 12, showdown: true,
    });
    expect(record.lineup).toEqual(base.lineup);
    expect(record.startStacks).toEqual(seats);
    expect(record.heroNet).toBe(state.result.net[0]);
    expect(record.events).toEqual(events);
    expect(record.events).not.toBe(events);
  });

  it('uses the final state when given one, and matches the recomputed record', () => {
    const seats = [0, 1, 2].map((seat) => ({ seat, stack: 200 }));
    const { events, state } = playHand({ seats, button: 1, sb: 1, bb: 2, rng: mulberry32(5), policy: passive });
    expect(buildHandRecord({ ...base, events, state })).toEqual(buildHandRecord({ ...base, events }));
    expect(() => buildHandRecord({ ...base, events, state: { ...state, street: 'river' } })).toThrow('hand is not complete');
  });

  it('records a hand won without a showdown', () => {
    const cards = parseCards('AhAdKhKdQhQd');
    const events = [
      { type: 'start', seats: [0, 1, 2].map((seat) => ({ seat, stack: 200 })), button: 0, sb: 1, bb: 2 },
      { type: 'hole', seat: 0, cards: cards.slice(0, 2) },
      { type: 'hole', seat: 1, cards: cards.slice(2, 4) },
      { type: 'hole', seat: 2, cards: cards.slice(4, 6) },
      { type: 'act', seat: 0, action: 'raise', amount: 6 },
      { type: 'act', seat: 1, action: 'fold' },
      { type: 'act', seat: 2, action: 'fold' },
    ];
    const record = buildHandRecord({ ...base, lineup: base.lineup.slice(0, 2), events });
    // The uncalled 4 units are returned, so the pot is 1 (SB) + 2 (BB) + 2 (hero's called part).
    expect(record).toMatchObject({ buttonSeat: 0, heroNet: 3, pot: 5, showdown: false });
  });

  it('defaults the id to a random UUID', () => {
    const seats = [0, 1].map((seat) => ({ seat, stack: 200 }));
    const { events } = playHand({ seats, button: 0, sb: 1, bb: 2, rng: mulberry32(2), policy: passive });
    const { id, ...rest } = base;
    expect(buildHandRecord({ ...rest, events }).id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects logs that are not a complete hand', () => {
    const seats = [0, 1].map((seat) => ({ seat, stack: 200 }));
    const { events } = playHand({ seats, button: 0, sb: 1, bb: 2, rng: mulberry32(2), policy: passive });
    expect(() => buildHandRecord({ ...base, events: events.slice(0, 3) })).toThrow('hand is not complete');
    expect(() => buildHandRecord({ ...base, events: events.slice(1) })).toThrow('start event');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/handRecord.test.js`
Expected: FAIL with "Failed to load url ./handRecord.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/handRecord.js
// Builds the HandRecord for a completed hand (contracts §4). Pure apart from the default id.
import { reduceHand } from '../engine/handState.js';

/**
 * @typedef {{
 *   v: 1, id: string, sessionId: string, handNo: number, playedAt: string, botVersion: string,
 *   heroSeat: number, buttonSeat: number,
 *   lineup: { seat:number, personaId:string }[],
 *   startStacks: { seat:number, stack:number }[],
 *   events: object[], heroNet: number, pot: number, showdown: boolean,
 * }} HandRecord
 */

/**
 * Signature per contracts §4.1. `state` is the final state for `events`; it is recomputed when omitted.
 * @param {{ id?:string, sessionId:string, handNo:number, playedAt:string, botVersion:string, heroSeat:number,
 *   lineup:{seat:number, personaId:string}[], events:object[], state?:object }} input
 * @returns {HandRecord}
 */
export function buildHandRecord({
  id = crypto.randomUUID(), sessionId, handNo, playedAt, botVersion, heroSeat, lineup, events, state = null,
}) {
  const start = events[0];
  if (!start || start.type !== 'start') throw new Error('events must begin with a start event');
  const final = state ?? reduceHand(events);
  if (final.street !== 'complete') throw new Error('hand is not complete');
  return {
    v: 1,
    id,
    sessionId,
    handNo,
    playedAt,
    botVersion,
    heroSeat,
    buttonSeat: start.button,
    lineup: lineup.map(({ seat, personaId }) => ({ seat, personaId })),
    startStacks: start.seats.map(({ seat, stack }) => ({ seat, stack })),
    events: structuredClone(events),
    heroNet: final.result.net[heroSeat],
    pot: final.players.reduce((sum, p) => sum + p.total, 0),
    showdown: final.result.showdown,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/handRecord.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/handRecord.js src/private/trainers/poker/lib/handRecord.test.js
git commit -m "Add poker HandRecord builder per the cross-phase contract

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Table session state machine

**Files:**
- Create: `src/private/trainers/poker/lib/tableCore.js`
- Test: `src/private/trainers/poker/lib/tableCore.test.js`

**Interfaces:**
- Consumes: `applyEvent`, `legalActions`, `reduceHand` (`engine/handState.js`); `dealHand` (`engine/dealer.js`); `nextButton`, `stacksAfter` (`engine/table.js`); `viewFor`, `eventsFor` (`engine/view.js`); `getPersona` (`bots/personas.js`); `buildHandRecord` (Task 5); `refillPersonaId` (Task 4); constants (Task 1). Tests use `listPersonas` and pick persona ids from it, so they keep working when Phase 3 replaces the persona list.
- Produces (`TableSession` is documented in the JSDoc at the top of the file):
  - `createSession({ id, tableMode, lineup, startedAt }) → TableSession` (phase `'idle'`)
  - `sessionStartInfo(session, botVersion) → { id, startedAt, botVersion, tableMode, lineup, heroSeat }` (the `onSessionStart` payload)
  - `startHand(session, { rng, now, personas }) → TableSession` (phase `'playing'`, `hand.no = handsCompleted + 1`)
  - `nextStep(session) → {type:'idle'} | {type:'board'} | {type:'hero', seat} | {type:'bot', seat} | {type:'complete'}`
  - `dealBoard(session) → TableSession`
  - `applyAction(session, seat, { action, amount? }) → TableSession` (throws `EngineError` for illegal actions)
  - `botContext(session, seat, profile = null) → BotContext` (contracts §3.2)
  - `finishHand(session, { botVersion, createId }) → { session, record }`
  - `canRebuy(session) → boolean`, `requestRebuy(session) → TableSession`, `requestGetUp(session) → TableSession`, `abandonSession(session) → TableSession`
  - `sessionSummary(session, endedAt) → { id, endedAt, hands, net, rebuys }` (the `onSessionEnd` payload)
  - Session fields read by later tasks: `id, tableMode, startedAt, heroSeat, seats[{seat, kind:'hero'|'bot', personaId, stack}], button, hand{no, playedAt, button, lineup, events, state, boardEvent}, handsCompleted, phase:'idle'|'playing'|'between'|'needsRebuy'|'ended', buyIns, rebuys, rebuyPending, getUpPending`

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/tableCore.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { parseCards } from '../engine/cards.js';
import { reduceHand, legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import {
  createSession, sessionStartInfo, startHand, nextStep, dealBoard, applyAction, botContext, finishHand,
  canRebuy, requestRebuy, requestGetUp, abandonSession, sessionSummary,
} from './tableCore.js';

// Persona ids come from the live list so these tests survive Phase 3 replacing the personas.
const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

let ids = 0;
const createId = () => `id-${(ids += 1)}`;

const newSession = () => createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
const setStack = (session, seat, stack) => ({
  ...session,
  seats: session.seats.map((s) => (s.seat === seat ? { ...s, stack } : s)),
});

/** Plays the current hand to completion with passive actions for every seat, then settles it. */
function playOut(session, policy = passive) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === 'board') s = dealBoard(s);
    else if (step.type === 'hero' || step.type === 'bot') s = applyAction(s, step.seat, policy(legalActions(s.hand.state), step));
    else if (step.type === 'complete') return finishHand(s, { botVersion: 'test', createId });
    else throw new Error(`unexpected step ${step.type}`);
  }
  throw new Error('hand did not finish');
}

describe('createSession', () => {
  it('seats the hero in seat 0 and bots in 1-5 with 100 BB each', () => {
    const s = newSession();
    expect(s.seats.map((x) => [x.seat, x.kind, x.stack])).toEqual([
      [0, 'hero', 200], [1, 'bot', 200], [2, 'bot', 200], [3, 'bot', 200], [4, 'bot', 200], [5, 'bot', 200],
    ]);
    expect(s).toMatchObject({ phase: 'idle', heroSeat: 0, buyIns: 200, rebuys: 0, handsCompleted: 0, button: null });
    expect(nextStep(s)).toEqual({ type: 'idle' });
  });

  it('builds the onSessionStart payload', () => {
    expect(sessionStartInfo(newSession(), 'bots-x')).toEqual({
      id: 's1', startedAt: NOW, botVersion: 'bots-x', tableMode: 'random', lineup, heroSeat: 0,
    });
  });

  it('requires a bot for every seat', () => {
    expect(() => createSession({ id: 's', tableMode: 'custom', lineup: lineup.slice(1), startedAt: NOW })).toThrow('seat 1');
  });
});

describe('playing hands', () => {
  it('deals hand 1 with blinds posted and a random button', () => {
    const s = startHand(newSession(), { rng: mulberry32(1), now: NOW, personas });
    expect(s.phase).toBe('playing');
    expect(s.hand.no).toBe(1);
    expect(s.hand.playedAt).toBe(NOW);
    expect(s.hand.lineup).toEqual(lineup);
    expect(s.hand.state.button).toBe(s.button);
    expect(s.hand.events.filter((e) => e.type === 'hole')).toHaveLength(6);
    expect(['hero', 'bot']).toContain(nextStep(s).type);
  });

  it('plays a hand to completion, conserves chips and numbers the record', () => {
    const { session, record } = playOut(startHand(newSession(), { rng: mulberry32(2), now: NOW, personas }));
    expect(session.phase).toBe('between');
    expect(session.handsCompleted).toBe(1);
    expect(session.seats.reduce((sum, x) => sum + x.stack, 0)).toBe(1200);
    expect(record).toMatchObject({ sessionId: 's1', handNo: 1, heroSeat: 0, botVersion: 'test', showdown: true, pot: 12 });
    expect(session.seats[0].stack - 200).toBe(record.heroNet);
  });

  it('rotates the button and numbers hands', () => {
    const rng = mulberry32(3);
    let s = startHand(newSession(), { rng, now: NOW, personas });
    const first = s.button;
    s = playOut(s).session;
    s = startHand(s, { rng, now: NOW, personas });
    expect(s.hand.no).toBe(2);
    expect(s.button).toBe((first + 1) % 6);
  });

  it('rejects actions out of turn and illegal actions', () => {
    const s = startHand(newSession(), { rng: mulberry32(4), now: NOW, personas });
    const { seat } = nextStep(s);
    expect(() => applyAction(s, (seat + 1) % 6, { action: 'fold' })).toThrow('not due to act');
    expect(() => applyAction(s, seat, { action: 'check' })).toThrow();
    expect(() => dealBoard(s)).toThrow('no board card is due');
    expect(() => finishHand(s, { botVersion: 'test', createId })).toThrow('not complete');
  });

  it('only starts hands from idle or between', () => {
    const s = startHand(newSession(), { rng: mulberry32(5), now: NOW, personas });
    expect(() => startHand(s, { rng: mulberry32(5), now: NOW, personas })).toThrow('while playing');
  });
});

describe('botContext', () => {
  it('gives a bot only its own view, legal actions and persona', () => {
    let s = startHand(newSession(), { rng: mulberry32(6), now: NOW, personas });
    // Call until a bot is due to act (the hero is never first to act as the big blind, so calling is legal).
    while (nextStep(s).type !== 'bot') s = applyAction(s, nextStep(s).seat, { action: 'call' });
    const { seat } = nextStep(s);
    const ctx = botContext(s, seat);
    expect(ctx.seat).toBe(seat);
    expect(ctx.bb).toBe(2);
    expect(ctx.profile).toBeNull();
    expect(ctx.persona.id).toBe(lineup.find((x) => x.seat === seat).personaId);
    expect(ctx.legal).toEqual(legalActions(s.hand.state));
    expect(ctx.view.players.find((p) => p.seat === seat).hole).toHaveLength(2);
    for (const p of ctx.view.players.filter((q) => q.seat !== seat)) expect(p.hole).toBeNull();
    for (const e of ctx.events.filter((x) => x.type === 'hole' && x.seat !== seat)) expect(e.cards).toBeNull();
  });
});

// Hero in the SB with 4 units shoves into AA and loses. Seats 2-5 fold.
function heroBustsHand(session) {
  const c = (text) => parseCards(text);
  const events = [
    { type: 'start', seats: session.seats.map(({ seat, stack }) => ({ seat, stack })), button: 5, sb: 1, bb: 2 },
    { type: 'hole', seat: 0, cards: c('2c7d') },
    { type: 'hole', seat: 1, cards: c('AsAh') },
    { type: 'hole', seat: 2, cards: c('3c8d') },
    { type: 'hole', seat: 3, cards: c('4c9d') },
    { type: 'hole', seat: 4, cards: c('5cTd') },
    { type: 'hole', seat: 5, cards: c('6cJd') },
    { type: 'act', seat: 2, action: 'fold' },
    { type: 'act', seat: 3, action: 'fold' },
    { type: 'act', seat: 4, action: 'fold' },
    { type: 'act', seat: 5, action: 'fold' },
    { type: 'act', seat: 0, action: 'raise', amount: 4 },
    { type: 'act', seat: 1, action: 'call' },
    { type: 'board', cards: c('KdQs8c') },
    { type: 'board', cards: c('3h') },
    { type: 'board', cards: c('4s') },
  ];
  const hand = { no: session.handsCompleted + 1, playedAt: NOW, button: 5, lineup, events, state: reduceHand(events), boardEvent: null };
  return { ...session, button: 5, hand, phase: 'playing' };
}

describe('rebuy, bust and get up', () => {
  it('prompts a rebuy under 40 BB and tops up to 100 BB between hands', () => {
    let s = { ...setStack(newSession(), 0, 79), phase: 'between' };
    expect(canRebuy(s)).toBe(true);
    s = requestRebuy(s);
    expect(s.seats[0].stack).toBe(200);
    expect(s).toMatchObject({ buyIns: 321, rebuys: 1, phase: 'between' });
    expect(canRebuy(s)).toBe(false);
    expect(sessionSummary(s, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 0, net: -121, rebuys: 1 });
  });

  it('does not offer a rebuy at 40 BB or more', () => {
    const s = { ...setStack(newSession(), 0, 80), phase: 'between' };
    expect(canRebuy(s)).toBe(false);
    expect(requestRebuy(s)).toBe(s);
  });

  it('forces a rebuy or get up when the hero busts', () => {
    const busted = finishHand(heroBustsHand(setStack(newSession(), 0, 4)), { botVersion: 'test', createId }).session;
    expect(busted.seats[0].stack).toBe(0);
    expect(busted.phase).toBe('needsRebuy');
    expect(nextStep(busted)).toEqual({ type: 'idle' });
    expect(() => startHand(busted, { rng: mulberry32(1), now: NOW, personas })).toThrow();
    const rebought = requestRebuy(busted);
    expect(rebought).toMatchObject({ phase: 'between', rebuys: 1, buyIns: 400 });
    expect(sessionSummary(rebought, NOW).net).toBe(-200);
  });

  it('queues a rebuy requested mid-hand until the hand ends', () => {
    const playing = heroBustsHand(setStack(newSession(), 0, 4));
    const queued = requestRebuy(playing);
    expect(queued.rebuyPending).toBe(true);
    expect(canRebuy(queued)).toBe(false);
    const { session } = finishHand(queued, { botVersion: 'test', createId });
    expect(session).toMatchObject({ phase: 'between', rebuys: 1, rebuyPending: false, buyIns: 400 });
    expect(session.seats[0].stack).toBe(200);
  });

  it.skipIf(personas.length < 6)('refills a busted bot with a persona that is not seated', () => {
    const s = { ...setStack(newSession(), 3, 0), phase: 'between', button: 0 };
    for (let seed = 1; seed <= 10; seed += 1) {
      const next = startHand(s, { rng: mulberry32(seed), now: NOW, personas });
      const seat3 = next.seats[3];
      expect(seat3.stack).toBe(200);
      expect(lineup.map((x) => x.personaId)).not.toContain(seat3.personaId);
      expect(next.hand.lineup.find((x) => x.seat === 3).personaId).toBe(seat3.personaId);
      expect(new Set(next.seats.filter((x) => x.kind === 'bot').map((x) => x.personaId)).size).toBe(5);
    }
  });

  it('gets up immediately between hands', () => {
    const s = requestGetUp({ ...newSession(), phase: 'between' });
    expect(s.phase).toBe('ended');
    expect(requestRebuy(setStack(s, 0, 10))).toEqual(setStack(s, 0, 10));
  });

  it('gets up after the current hand when pressed mid-hand, even if a rebuy was queued', () => {
    const playing = requestRebuy(heroBustsHand(setStack(newSession(), 0, 4)));
    const leaving = requestGetUp(playing);
    expect(leaving).toMatchObject({ phase: 'playing', getUpPending: true });
    const { session } = finishHand(leaving, { botVersion: 'test', createId });
    expect(session).toMatchObject({ phase: 'ended', rebuys: 0, handsCompleted: 1 });
    expect(sessionSummary(session, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 1, net: -200, rebuys: 0 });
  });

  it('abandons a hand in progress without counting it', () => {
    const s = abandonSession(startHand(newSession(), { rng: mulberry32(9), now: NOW, personas }));
    expect(s.phase).toBe('ended');
    expect(sessionSummary(s, NOW)).toEqual({ id: 's1', endedAt: NOW, hands: 0, net: 0, rebuys: 0 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/tableCore.test.js`
Expected: FAIL with "Failed to load url ./tableCore.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/tableCore.js
// The local cash-game session as a pure, synchronous state machine. No timers, no React.
// The async driver (tableDriver.js) decides *when* each step runs; this module decides *what* it does.
import { applyEvent, legalActions, reduceHand } from '../engine/handState.js';
import { dealHand } from '../engine/dealer.js';
import { nextButton, stacksAfter } from '../engine/table.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { getPersona } from '../bots/personas.js';
import { buildHandRecord } from './handRecord.js';
import { refillPersonaId } from './lineup.js';
import { SEAT_COUNT, HERO_SEAT, SB, BB, BUY_IN, REBUY_BELOW } from './constants.js';

/**
 * @typedef {{ seat:number, kind:'hero'|'bot', personaId:string|null, stack:number }} SeatInfo
 *   stack is as of the last completed hand.
 * @typedef {{ no:number, playedAt:string, button:number, lineup:{seat:number, personaId:string}[],
 *   events:object[], state:object, boardEvent:(street:string) => object }} LiveHand
 * @typedef {{
 *   id:string, tableMode:'random'|'custom', startedAt:string, heroSeat:number,
 *   seats:SeatInfo[], button:number|null, hand:LiveHand|null, handsCompleted:number,
 *   phase:'idle'|'playing'|'between'|'needsRebuy'|'ended',
 *   buyIns:number, rebuys:number, rebuyPending:boolean, getUpPending:boolean,
 * }} TableSession
 * @typedef {{type:'idle'} | {type:'board'} | {type:'hero', seat:number} | {type:'bot', seat:number} | {type:'complete'}} Step
 */

const fail = (message) => {
  throw new Error(message);
};

const heroInfo = (session) => session.seats.find((s) => s.seat === session.heroSeat);

const botLineup = (seats) => seats.filter((s) => s.kind === 'bot').map(({ seat, personaId }) => ({ seat, personaId }));

/** A new session: hero in seat 0 and `lineup` in seats 1-5, everyone with 100 BB. */
export function createSession({ id, tableMode, lineup, startedAt }) {
  const seats = Array.from({ length: SEAT_COUNT }, (_, seat) => {
    if (seat === HERO_SEAT) return { seat, kind: 'hero', personaId: null, stack: BUY_IN };
    const entry = lineup.find((x) => x.seat === seat) ?? fail(`lineup has no bot for seat ${seat}`);
    return { seat, kind: 'bot', personaId: entry.personaId, stack: BUY_IN };
  });
  return {
    id, tableMode, startedAt, heroSeat: HERO_SEAT, seats, button: null, hand: null, handsCompleted: 0,
    phase: 'idle', buyIns: BUY_IN, rebuys: 0, rebuyPending: false, getUpPending: false,
  };
}

/** The `onSessionStart` payload (contracts §4). */
export function sessionStartInfo(session, botVersion) {
  const { id, startedAt, tableMode, heroSeat } = session;
  return { id, startedAt, botVersion, tableMode, lineup: botLineup(session.seats), heroSeat };
}

/** Refills busted bots, moves the button and deals. `now` is the ISO hand start time. */
export function startHand(session, { rng, now, personas }) {
  if (session.phase !== 'idle' && session.phase !== 'between') fail(`cannot start a hand while ${session.phase}`);
  if (heroInfo(session).stack <= 0) fail('hero has no chips');
  const seats = session.seats.map((s) => ({ ...s }));
  for (const s of seats) {
    if (s.kind !== 'bot' || s.stack > 0) continue;
    const seated = seats.filter((x) => x.kind === 'bot').map((x) => x.personaId);
    s.personaId = refillPersonaId(seated, personas, rng, s.personaId);
    s.stack = BUY_IN;
  }
  const seatIds = seats.map((s) => s.seat);
  const button = session.button === null ? seatIds[Math.floor(rng() * seatIds.length)] : nextButton(seatIds, session.button);
  const deal = dealHand({ seats: seats.map(({ seat, stack }) => ({ seat, stack })), button, sb: SB, bb: BB, rng });
  const hand = {
    no: session.handsCompleted + 1,
    playedAt: now,
    button,
    lineup: botLineup(seats),
    events: deal.events,
    state: reduceHand(deal.events),
    boardEvent: deal.boardEvent,
  };
  return { ...session, seats, button, hand, phase: 'playing' };
}

/** What has to happen next. Only a `playing` session has steps. */
export function nextStep(session) {
  if (session.phase !== 'playing' || !session.hand) return { type: 'idle' };
  const { state } = session.hand;
  if (state.street === 'complete') return { type: 'complete' };
  if (state.needsBoard) return { type: 'board' };
  if (state.toAct === session.heroSeat) return { type: 'hero', seat: state.toAct };
  return { type: 'bot', seat: state.toAct };
}

const withEvent = (session, event) => ({
  ...session,
  hand: { ...session.hand, events: [...session.hand.events, event], state: applyEvent(session.hand.state, event) },
});

/** Deals the flop, turn or river that the hand is waiting for. */
export function dealBoard(session) {
  if (nextStep(session).type !== 'board') fail('no board card is due');
  return withEvent(session, session.hand.boardEvent(session.hand.state.needsBoard));
}

/** Applies `choice` ({action, amount?}) for `seat`. Throws EngineError when the action is illegal. */
export function applyAction(session, seat, choice) {
  const step = nextStep(session);
  if ((step.type !== 'hero' && step.type !== 'bot') || step.seat !== seat) fail(`seat ${seat} is not due to act`);
  const event = { type: 'act', seat, action: choice.action };
  if ((choice.action === 'bet' || choice.action === 'raise') && choice.amount !== undefined) event.amount = choice.amount;
  return withEvent(session, event);
}

/** The BotContext (contracts §3.2) for a bot seat. Only seat-filtered views go to the bot. */
export function botContext(session, seat, profile = null) {
  const { state, events } = session.hand;
  const info = session.seats.find((s) => s.seat === seat);
  return {
    view: viewFor(state, seat),
    seat,
    legal: legalActions(state),
    events: eventsFor(events, seat),
    persona: getPersona(info.personaId),
    profile,
    bb: BB,
  };
}

function applyRebuy(session) {
  const hero = heroInfo(session);
  if (hero.stack >= REBUY_BELOW) return { ...session, rebuyPending: false };
  const added = BUY_IN - hero.stack;
  return {
    ...session,
    seats: session.seats.map((s) => (s.seat === session.heroSeat ? { ...s, stack: BUY_IN } : s)),
    buyIns: session.buyIns + added,
    rebuys: session.rebuys + 1,
    rebuyPending: false,
  };
}

/** Settles a completed hand: stacks, pending rebuy or get-up, and the HandRecord. */
export function finishHand(session, { botVersion, createId }) {
  if (nextStep(session).type !== 'complete') fail('hand is not complete');
  const { hand } = session;
  const record = buildHandRecord({
    id: createId(), sessionId: session.id, handNo: hand.no, playedAt: hand.playedAt, botVersion,
    heroSeat: session.heroSeat, lineup: hand.lineup, events: hand.events, state: hand.state,
  });
  const stacks = new Map(stacksAfter(hand.state).map((x) => [x.seat, x.stack]));
  let next = {
    ...session,
    seats: session.seats.map((s) => ({ ...s, stack: stacks.get(s.seat) ?? s.stack })),
    handsCompleted: hand.no,
  };
  if (next.getUpPending) return { session: { ...next, phase: 'ended', rebuyPending: false }, record };
  if (next.rebuyPending) next = applyRebuy(next);
  const phase = heroInfo(next).stack <= 0 ? 'needsRebuy' : 'between';
  return { session: { ...next, phase }, record };
}

/** True when the rebuy prompt should show: under 40 BB (as of the last completed hand) and not already queued. */
export function canRebuy(session) {
  return session.phase !== 'ended' && !session.rebuyPending && heroInfo(session).stack < REBUY_BELOW;
}

/** Tops up to 100 BB now, or after the current hand if one is being played. */
export function requestRebuy(session) {
  if (!canRebuy(session)) return session;
  if (session.phase === 'playing') return { ...session, rebuyPending: true };
  return { ...applyRebuy(session), phase: 'between' };
}

/** Ends the session now between hands, or after the current hand. */
export function requestGetUp(session) {
  if (session.phase === 'ended') return session;
  if (session.phase === 'playing') return { ...session, getUpPending: true };
  return { ...session, phase: 'ended', rebuyPending: false };
}

/** Ends immediately, discarding a hand in progress (e.g. the page is closed). */
export const abandonSession = (session) => ({ ...session, phase: 'ended', rebuyPending: false });

/** The `onSessionEnd` payload (contracts §4). Counts completed hands only. */
export function sessionSummary(session, endedAt) {
  return {
    id: session.id,
    endedAt,
    hands: session.handsCompleted,
    net: heroInfo(session).stack - session.buyIns,
    rebuys: session.rebuys,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/tableCore.test.js`
Expected: PASS (17 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/tableCore.js src/private/trainers/poker/lib/tableCore.test.js
git commit -m "Add poker table session state machine with rebuys, get up and bot refills

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Table driver and hero profile

**Files:**
- Create: `src/private/trainers/poker/lib/tableDriver.js`
- Create: `src/private/trainers/poker/lib/profile.js`
- Test: `src/private/trainers/poker/lib/tableDriver.test.js`
- Test: `src/private/trainers/poker/lib/profile.test.js`

**Interfaces:**
- Consumes: `nextStep`, `startHand`, `dealBoard`, `applyAction`, `botContext`, `finishHand`, `sessionStartInfo`, `sessionSummary`, `requestRebuy`, `requestGetUp`, `abandonSession` (Task 6; the tests also use `createSession`); `legalActions` (`engine/handState.js`); `emptyProfile` (`bots/contract.js`); `accumulateProfile` from Phase 3's `bots/profileStats.js` when that file exists. The runner is a contracts §3.4 `BotRunner` (`decide(ctx) → Promise<BotChoice>`, `dispose()`).
- Produces:
  - `PACING = { fast: { botMin:250, botMax:600, board:350, handPause:1200 }, normal: { botMin:600, botMax:1800, board:700, handPause:2500 } }`, `BIG_DECISION_FACTOR = 1.5`, `BIG_CALL_UNITS = 20`
  - `isBigDecision(ctx) → boolean`, `botDelayMs(speed, rng, big) → number`
  - `applyWithFallback(session, seat, choice|null, logger?) → TableSession`
  - `realScheduler = { wait(ms) → Promise<void> }`
  - `createTableDriver({ session, runner, scheduler, rng, personas, botVersion, speed?, createId?, now?, logger?, profile?, accumulateProfile?, onChange?, onSessionStart?, onHandComplete?, onSessionEnd? }) → { getSession(), getProfile(), start() → Promise, act(choice) → Promise, rebuy() → Promise, getUp() → Promise, abandon(), dispose() }`. An option passed as `undefined` keeps its default.
  - `profile.js`: `accumulateProfile(profile, heroSeat, events)` (Phase 3's function when `bots/profileStats.js` exists, otherwise identity) and `foldHandIntoProfile(profile|null, heroSeat, events, accumulate?) → PlayerProfile`

- [ ] **Step 1: Write the failing tests**

```js
// src/private/trainers/poker/lib/tableDriver.test.js
import { describe, it, expect, vi } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createSession, nextStep, startHand } from './tableCore.js';
import {
  PACING, BIG_DECISION_FACTOR, isBigDecision, botDelayMs, applyWithFallback, createTableDriver,
} from './tableDriver.js';

const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });
const quietLogger = { warn: vi.fn(), error: vi.fn() };

const passiveRunner = () => ({ decide: vi.fn(async (ctx) => passive(ctx.legal)), dispose: vi.fn() });
const instantScheduler = () => ({ wait: vi.fn(async () => {}) });

function setup(overrides = {}) {
  let n = 0;
  const callbacks = { onChange: vi.fn(), onSessionStart: vi.fn(), onHandComplete: vi.fn(), onSessionEnd: vi.fn() };
  const { runner = passiveRunner(), scheduler = instantScheduler(), ...rest } = overrides;
  const driver = createTableDriver({
    session: createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW }),
    runner, scheduler, rng: mulberry32(21), personas, botVersion: 'test-bots', speed: 'fast',
    createId: () => `hand-${(n += 1)}`, now: () => NOW, logger: quietLogger, ...callbacks, ...rest,
  });
  return { driver, runner, scheduler, ...callbacks };
}

/** Resolves once the driver is waiting on the hero, paused between hands, or stopped. */
const settle = (driver) => vi.waitFor(() => {
  const s = driver.getSession();
  if (s.phase === 'playing' && nextStep(s).type !== 'hero') throw new Error('driver still running');
});

async function heroPlaysUntil(driver, handsCompleted) {
  for (let guard = 0; guard < 100 && driver.getSession().handsCompleted < handsCompleted; guard += 1) {
    const s = driver.getSession();
    if (nextStep(s).type === 'hero') driver.act(passive(legalActions(s.hand.state)));
    await settle(driver);
  }
}

describe('pacing helpers', () => {
  it('draws bot think time from the speed range, longer for big decisions', () => {
    expect(botDelayMs('fast', () => 0, false)).toBe(250);
    expect(botDelayMs('fast', () => 0.5, false)).toBe(425);
    expect(botDelayMs('normal', () => 0, false)).toBe(600);
    expect(botDelayMs('normal', () => 0.999999, false)).toBe(1800);
    expect(botDelayMs('normal', () => 0, true)).toBe(600 * BIG_DECISION_FACTOR);
  });

  it('treats calls of 10 BB or more, and all-in calls, as big decisions', () => {
    const view = { players: [{ seat: 1, stack: 50 }] };
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: true, toCall: 0 } })).toBe(false);
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: false, toCall: 4 } })).toBe(false);
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: false, toCall: 20 } })).toBe(true);
    expect(isBigDecision({ seat: 1, view: { players: [{ seat: 1, stack: 6 }] }, legal: { canCheck: false, toCall: 6 } })).toBe(true);
  });
});

describe('applyWithFallback', () => {
  it('replaces an illegal or missing bot choice with check or fold', () => {
    const s = startHand(createSession({ id: 's', tableMode: 'random', lineup, startedAt: NOW }), { rng: mulberry32(4), now: NOW, personas });
    const { seat } = nextStep(s);
    const folded = applyWithFallback(s, seat, { action: 'raise', amount: 1 }, quietLogger);
    expect(folded.hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'fold' });
    expect(applyWithFallback(s, seat, null, quietLogger).hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'fold' });
    expect(applyWithFallback(s, seat, { action: 'call' }, quietLogger).hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'call' });
  });
});

describe('createTableDriver', () => {
  it('announces the session, deals and stops on the hero’s turn', async () => {
    const { driver, onSessionStart, onChange, runner } = setup();
    driver.start();
    await settle(driver);
    expect(onSessionStart).toHaveBeenCalledTimes(1);
    expect(onSessionStart).toHaveBeenCalledWith({
      id: 's1', startedAt: NOW, botVersion: 'test-bots', tableMode: 'random', lineup, heroSeat: 0,
    });
    expect(nextStep(driver.getSession()).type).toBe('hero');
    expect(onChange).toHaveBeenCalled();
    for (const [ctx] of runner.decide.mock.calls) {
      expect(ctx.view.players.find((p) => p.seat === 0).hole).toBeNull();
    }
  });

  it('plays hands in a loop, emits a record per hand and pauses between hands', async () => {
    const { driver, onHandComplete, scheduler } = setup();
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 2);
    expect(onHandComplete).toHaveBeenCalledTimes(2);
    expect(onHandComplete.mock.calls.map(([r]) => [r.handNo, r.id, r.sessionId])).toEqual([[1, 'hand-1', 's1'], [2, 'hand-2', 's1']]);
    expect(scheduler.wait).toHaveBeenCalledWith(PACING.fast.handPause);
    expect(scheduler.wait).toHaveBeenCalledWith(PACING.fast.board);
    expect(driver.getSession().hand.no).toBe(3);
  });

  it('gets up after the current hand when asked mid-hand', async () => {
    const { driver, onSessionEnd, onHandComplete } = setup();
    driver.start();
    await settle(driver);
    driver.getUp();
    expect(driver.getSession().getUpPending).toBe(true);
    expect(onSessionEnd).not.toHaveBeenCalled();
    driver.act({ action: 'fold' });
    await vi.waitFor(() => expect(driver.getSession().phase).toBe('ended'));
    expect(onHandComplete).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd.mock.calls[0][0]).toMatchObject({ id: 's1', endedAt: NOW, hands: 1, rebuys: 0 });
  });

  it('gets up at once during the between-hands pause and never deals again', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const scheduler = { wait: vi.fn((ms) => (ms === PACING.fast.handPause ? gate : Promise.resolve())) };
    const { driver, onSessionEnd } = setup({ scheduler });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    expect(driver.getSession().phase).toBe('between');
    driver.getUp();
    expect(driver.getSession().phase).toBe('ended');
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    release();
    await driver.getUp();
    expect(driver.getSession().hand.no).toBe(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });

  it('abandons mid-hand with a summary of completed hands only', async () => {
    const { driver, onSessionEnd, onChange } = setup();
    driver.start();
    await settle(driver);
    driver.abandon();
    expect(onSessionEnd).toHaveBeenCalledWith({ id: 's1', endedAt: NOW, hands: 0, net: 0, rebuys: 0 });
    const changes = onChange.mock.calls.length;
    driver.act({ action: 'fold' });
    expect(onChange.mock.calls.length).toBe(changes);
  });

  it('falls back to check or fold when the runner rejects', async () => {
    const runner = { decide: vi.fn(async () => { throw new Error('worker crashed'); }), dispose: vi.fn() };
    const { driver } = setup({ runner });
    driver.start();
    await settle(driver);
    const acts = driver.getSession().hand.events.filter((e) => e.type === 'act' && e.seat !== 0);
    for (const e of acts) expect(['check', 'fold']).toContain(e.action);
  });

  it('passes the running hero profile to bots and folds each finished hand into it', async () => {
    const accumulateProfile = vi.fn((profile, heroSeat, events) => ({ hands: profile.hands + 1, stats: {}, lastEvents: events.length, heroSeat }));
    const { driver, runner, onHandComplete } = setup({ profile: { hands: 10, stats: {} }, accumulateProfile });
    driver.start();
    await settle(driver);
    expect(runner.decide.mock.calls.every(([ctx]) => ctx.profile.hands === 10)).toBe(true);
    await heroPlaysUntil(driver, 1);
    expect(accumulateProfile).toHaveBeenCalledTimes(1);
    expect(accumulateProfile.mock.calls[0][1]).toBe(0);
    expect(accumulateProfile.mock.calls[0][2]).toEqual(onHandComplete.mock.calls[0][0].events);
    expect(driver.getProfile()).toMatchObject({ hands: 11, heroSeat: 0 });
    await heroPlaysUntil(driver, 2);
    const lastCtx = runner.decide.mock.calls.at(-1)[0];
    expect(lastCtx.profile.hands).toBeGreaterThanOrEqual(11);
  });

  it('keeps playing when the profile accumulator throws', async () => {
    const accumulateProfile = vi.fn(() => { throw new Error('bad stats'); });
    const { driver, onHandComplete } = setup({ accumulateProfile });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    expect(onHandComplete).toHaveBeenCalledTimes(1);
    expect(driver.getProfile()).toBeNull();
  });

  it('ignores hero actions, rebuys and get up before the session starts', async () => {
    const { driver, onSessionEnd, onChange } = setup();
    await driver.act({ action: 'fold' });
    await driver.rebuy();
    await driver.getUp();
    expect(driver.getSession().phase).toBe('idle');
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
```

```js
// src/private/trainers/poker/lib/profile.test.js
import { describe, it, expect, vi } from 'vitest';
import { emptyProfile } from '../bots/contract.js';
import { accumulateProfile, foldHandIntoProfile } from './profile.js';

describe('foldHandIntoProfile', () => {
  it('starts from an empty profile and delegates to the accumulator', () => {
    const accumulate = vi.fn((profile) => ({ ...profile, hands: profile.hands + 1 }));
    const events = [{ type: 'start' }];
    expect(foldHandIntoProfile(null, 0, events, accumulate)).toEqual({ ...emptyProfile(), hands: 1 });
    expect(accumulate).toHaveBeenCalledWith(emptyProfile(), 0, events);
    const existing = { hands: 7, stats: {} };
    expect(foldHandIntoProfile(existing, 2, events, accumulate)).toEqual({ hands: 8, stats: {} });
  });

  it('uses an accumulator that returns a profile', () => {
    const result = accumulateProfile(emptyProfile(), 0, []);
    expect(result).toHaveProperty('hands');
    expect(result).toHaveProperty('stats');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/private/trainers/poker/lib/tableDriver.test.js src/private/trainers/poker/lib/profile.test.js`
Expected: FAIL with "Failed to load url ./tableDriver.js" and "Failed to load url ./profile.js" (or similar module-not-found errors).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/tableDriver.js
// Runs a table session over time: bot turns through an injected BotRunner with humanized delays,
// board deals and between-hand pauses through an injected scheduler, and the session callbacks.
import {
  nextStep, startHand, dealBoard, applyAction, botContext, finishHand, sessionStartInfo, sessionSummary,
  requestRebuy, requestGetUp, abandonSession,
} from './tableCore.js';
import { legalActions } from '../engine/handState.js';

/** Milliseconds. Bot think time is uniform in [botMin, botMax], x1.5 for big decisions. */
export const PACING = {
  fast: { botMin: 250, botMax: 600, board: 350, handPause: 1200 },
  normal: { botMin: 600, botMax: 1800, board: 700, handPause: 2500 },
};
export const BIG_DECISION_FACTOR = 1.5;
export const BIG_CALL_UNITS = 20; // 10 BB

const noop = () => {};

/** A big decision: calling at least 10 BB, or calling all-in. */
export function isBigDecision(ctx) {
  const { legal, view, seat } = ctx;
  if (!legal || legal.canCheck) return false;
  const me = view.players.find((p) => p.seat === seat);
  return legal.toCall >= BIG_CALL_UNITS || legal.toCall >= me.stack;
}

export function botDelayMs(speed, rng, big) {
  const { botMin, botMax } = PACING[speed];
  return Math.round((botMin + rng() * (botMax - botMin)) * (big ? BIG_DECISION_FACTOR : 1));
}

/** Applies a bot's choice; an illegal or missing choice becomes check (if possible) or fold. */
export function applyWithFallback(session, seat, choice, logger = console) {
  if (choice) {
    try {
      return applyAction(session, seat, choice);
    } catch (err) {
      logger.warn(`bot in seat ${seat} chose an illegal action`, choice, err);
    }
  }
  const legal = legalActions(session.hand.state);
  return applyAction(session, seat, { action: legal.canCheck ? 'check' : 'fold' });
}

/** Real-time scheduler for the browser. Tests pass one whose wait resolves immediately. */
export const realScheduler = { wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

// ---- internals: `d` is the driver's mutable state (see createTableDriver) ----

function set(d, next) {
  d.current = next;
  if (!d.disposed) d.opts.onChange(next);
}

function endOnce(d) {
  if (d.ended) return;
  d.ended = true;
  d.opts.onSessionEnd(sessionSummary(d.current, d.opts.now()));
}

async function botTurn(d, seat) {
  const { runner, scheduler, rng, speed, logger } = d.opts;
  const handNo = d.current.hand.no;
  const ctx = botContext(d.current, seat, d.profile);
  const decision = runner.decide(ctx).catch((err) => {
    logger.warn(`bot in seat ${seat} failed to decide`, err);
    return null;
  });
  const [choice] = await Promise.all([decision, scheduler.wait(botDelayMs(speed, rng, isBigDecision(ctx)))]);
  if (d.disposed || d.current.phase !== 'playing' || d.current.hand?.no !== handNo) return;
  set(d, applyWithFallback(d.current, seat, choice, logger));
}

function settleHand(d) {
  const { botVersion, createId, accumulateProfile, onHandComplete, logger } = d.opts;
  const { session, record } = finishHand(d.current, { botVersion, createId });
  set(d, session);
  try {
    d.profile = accumulateProfile(d.profile, session.heroSeat, record.events);
  } catch (err) {
    logger.warn('could not update the hero profile', err);
  }
  // The optional second argument (analysis) arrives with Phase 5.
  onHandComplete(record);
}

const deal = (d) => set(d, startHand(d.current, { rng: d.opts.rng, now: d.opts.now(), personas: d.opts.personas }));

/** Advances until the hero must act, a rebuy decision is needed, or the session ends. */
async function pump(d) {
  const pace = PACING[d.opts.speed];
  while (!d.disposed) {
    const step = nextStep(d.current);
    const { phase } = d.current;
    if (step.type === 'hero') return;
    if (step.type === 'bot') {
      await botTurn(d, step.seat);
    } else if (step.type === 'board') {
      await d.opts.scheduler.wait(pace.board);
      if (!d.disposed && nextStep(d.current).type === 'board') set(d, dealBoard(d.current));
    } else if (step.type === 'complete') {
      settleHand(d);
    } else if (phase === 'ended') {
      endOnce(d);
      return;
    } else if (phase === 'between') {
      await d.opts.scheduler.wait(pace.handPause);
      if (!d.disposed && d.current.phase === 'between') deal(d);
    } else if (phase === 'idle') {
      deal(d);
    } else {
      return; // needsRebuy: wait for rebuy() or getUp()
    }
  }
}

// One pump at a time. A call that arrives while a pump is finishing sets `again`,
// so the loop runs once more instead of dropping the request.
function run(d) {
  if (d.running) {
    d.again = true;
    return d.pumping;
  }
  d.running = true;
  d.pumping = (async () => {
    try {
      do {
        d.again = false;
        await pump(d);
      } while (d.again && !d.disposed);
    } catch (err) {
      d.opts.logger.error('table driver stopped', err);
    } finally {
      d.running = false;
    }
  })();
  return d.pumping;
}

/**
 * @param {{
 *   session: object, runner: {decide:(ctx:object) => Promise<object>}, scheduler: {wait:(ms:number) => Promise<void>},
 *   rng: () => number, personas: object[], botVersion: string, speed?: 'fast'|'normal',
 *   createId?: () => string, now?: () => string, logger?: Pick<Console, 'warn'|'error'>,
 *   profile?: object|null, accumulateProfile?: (profile:object|null, heroSeat:number, events:object[]) => object|null,
 *   onChange?: (session:object) => void, onSessionStart?: (info:object) => void,
 *   onHandComplete?: (record:object) => void, onSessionEnd?: (summary:object) => void,
 * }} options
 */
export function createTableDriver({ session, profile = null, ...options }) {
  const opts = {
    speed: 'normal', createId: () => crypto.randomUUID(), now: () => new Date().toISOString(), logger: console,
    accumulateProfile: (p) => p, onChange: noop, onSessionStart: noop, onHandComplete: noop, onSessionEnd: noop,
    // An option passed as undefined keeps its default.
    ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
  };
  const d = { opts, current: session, profile, started: false, ended: false, disposed: false, running: false, again: false, pumping: null };

  return {
    getSession: () => d.current,
    /** The hero profile bots currently receive. */
    getProfile: () => d.profile,
    /** Emits onSessionStart once and deals the first hand. */
    start() {
      if (!d.started) {
        d.started = true;
        opts.onSessionStart(sessionStartInfo(d.current, opts.botVersion));
      }
      return run(d);
    },
    /** The hero's action. Ignored unless the hero is due to act. */
    act(choice) {
      if (nextStep(d.current).type !== 'hero') return d.pumping ?? Promise.resolve();
      try {
        set(d, applyAction(d.current, d.current.heroSeat, choice));
      } catch (err) {
        opts.logger.warn('illegal hero action', choice, err);
      }
      return run(d);
    },
    rebuy() {
      if (!d.started) return Promise.resolve();
      set(d, requestRebuy(d.current));
      return run(d);
    },
    getUp() {
      if (!d.started) return Promise.resolve();
      set(d, requestGetUp(d.current));
      if (d.current.phase === 'ended') endOnce(d);
      return run(d);
    },
    /** Leaves at once (page closed or navigated away). Emits onSessionEnd if it has not been emitted. */
    abandon() {
      if (d.started && !d.ended) {
        d.current = abandonSession(d.current);
        endOnce(d);
      }
      d.disposed = true;
    },
    dispose() {
      d.disposed = true;
    },
  };
}
```

`import.meta.glob` below matches nothing until Phase 3's `bots/profileStats.js` exists. Vite and Vitest both handle an empty match.

```js
// src/private/trainers/poker/lib/profile.js
// Folds each finished hand into the hero's running profile (contracts §4.1).
// Phase 3 owns the stat definitions in bots/profileStats.js. The optional glob picks that module up
// once it is merged, and until then the profile passes through unchanged.
import { emptyProfile } from '../bots/contract.js';

const phase3 = Object.values(import.meta.glob('../bots/profileStats.js', { eager: true }))[0];

/** Phase 3's accumulateProfile when present, otherwise identity. */
export const accumulateProfile = phase3?.accumulateProfile ?? ((profile) => profile);

/** @returns {import('../bots/contract.js').PlayerProfile} */
export function foldHandIntoProfile(profile, heroSeat, events, accumulate = accumulateProfile) {
  return accumulate(profile ?? emptyProfile(), heroSeat, events);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/private/trainers/poker/lib/tableDriver.test.js src/private/trainers/poker/lib/profile.test.js`
Expected: PASS (12 tests and 2 tests). Run it twice more to make sure the async tests are stable.

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/tableDriver.js src/private/trainers/poker/lib/tableDriver.test.js src/private/trainers/poker/lib/profile.js src/private/trainers/poker/lib/profile.test.js
git commit -m "Add poker table driver with paced bot turns, session callbacks and running hero profile

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Action log lines

**Files:**
- Create: `src/private/trainers/poker/lib/actionLog.js`
- Test: `src/private/trainers/poker/lib/actionLog.test.js`

**Interfaces:**
- Consumes: `applyEvent`, `legalActions` (`engine/handState.js`); `categoryOf`, `CATEGORY_NAMES` (`engine/evaluator.js`); `viewFor` (`engine/view.js`); `cardText`, `formatBbLabel` (Task 1).
- Produces: `logLines(events, { nameOf, heroSeat }) → string[]` and `resultLines(state|null, { nameOf, heroSeat }) → string[]`. `nameOf(seat)` returns `'You'` for the hero, which switches verbs to the second person ("You call" versus "Moss calls").

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/actionLog.test.js
import { describe, it, expect } from 'vitest';
import { parseCards } from '../engine/cards.js';
import { reduceHand } from '../engine/handState.js';
import { logLines, resultLines } from './actionLog.js';

const names = ['You', 'Moss', 'Viper'];
const opts = { nameOf: (seat) => names[seat], heroSeat: 0 };
const c = (text) => parseCards(text);

// Seat 0 (hero) is the button, seat 1 SB, seat 2 BB.
const showdownHand = [
  { type: 'start', seats: [0, 1, 2].map((seat) => ({ seat, stack: 200 })), button: 0, sb: 1, bb: 2 },
  { type: 'hole', seat: 0, cards: c('AhAd') },
  { type: 'hole', seat: 1, cards: c('KhKd') },
  { type: 'hole', seat: 2, cards: c('2c7s') },
  { type: 'act', seat: 0, action: 'raise', amount: 6 },
  { type: 'act', seat: 1, action: 'call' },
  { type: 'act', seat: 2, action: 'fold' },
  { type: 'board', cards: c('AsKc3d') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'bet', amount: 10 },
  { type: 'act', seat: 1, action: 'call' },
  { type: 'board', cards: c('4h') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'check' },
  { type: 'board', cards: c('9c') },
  { type: 'act', seat: 1, action: 'check' },
  { type: 'act', seat: 0, action: 'check' },
];

describe('logLines', () => {
  it('narrates a hand from blinds to showdown', () => {
    expect(logLines(showdownHand, opts)).toEqual([
      'Moss posts 0.5 BB',
      'Viper posts 1.0 BB',
      'You are dealt A♥ A♦',
      'You raise to 3.0 BB',
      'Moss calls 2.5 BB',
      'Viper folds',
      'Flop: A♠ K♣ 3♦',
      'Moss checks',
      'You bet 5.0 BB',
      'Moss calls 5.0 BB',
      'Turn: A♠ K♣ 3♦ 4♥',
      'Moss checks',
      'You check',
      'River: A♠ K♣ 3♦ 4♥ 9♣',
      'Moss checks',
      'You check',
      'You show A♥ A♦',
      'Moss shows K♥ K♦',
      'You win 17.0 BB with three of a kind',
    ]);
  });

  it('never mentions a bot’s hole cards before they are shown', () => {
    const lines = logLines(showdownHand.slice(0, -1), opts).join('\n');
    expect(lines).not.toContain('K♥');
    expect(lines).not.toContain('7♠');
  });

  it('marks all-in calls and describes a hand won without a showdown', () => {
    const events = [
      { type: 'start', seats: [{ seat: 0, stack: 200 }, { seat: 1, stack: 5 }], button: 0, sb: 1, bb: 2 },
      { type: 'hole', seat: 0, cards: c('AhAd') },
      { type: 'hole', seat: 1, cards: c('KhKd') },
      { type: 'act', seat: 0, action: 'raise', amount: 20 },
      { type: 'act', seat: 1, action: 'call' },
    ];
    expect(logLines(events, opts)).toContain('Moss calls 1.5 BB (all-in)');

    const folded = [
      ...showdownHand.slice(0, 4),
      { type: 'act', seat: 0, action: 'raise', amount: 6 },
      { type: 'act', seat: 1, action: 'fold' },
      { type: 'act', seat: 2, action: 'fold' },
    ];
    expect(logLines(folded, opts).slice(-3)).toEqual(['Moss folds', 'Viper folds', 'You win 2.5 BB']);
  });
});

describe('resultLines', () => {
  it('is empty until the hand completes', () => {
    expect(resultLines(reduceHand(showdownHand.slice(0, 6)), opts)).toEqual([]);
    expect(resultLines(null, opts)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/actionLog.test.js`
Expected: FAIL with "Failed to load url ./actionLog.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/actionLog.js
// Human-readable lines for the action log and the aria-live announcer.
// Hole cards are read only through viewFor(state, heroSeat), so bots' unrevealed cards never appear.
import { applyEvent, legalActions } from '../engine/handState.js';
import { categoryOf, CATEGORY_NAMES } from '../engine/evaluator.js';
import { viewFor } from '../engine/view.js';
import { cardText, formatBbLabel } from './format.js';

const STREET_BY_BOARD_SIZE = { 3: 'Flop', 4: 'Turn', 5: 'River' };

/** "You fold" / "Moss folds". */
const says = (name, verb) => (name === 'You' ? `You ${verb}` : `${name} ${verb}s`);

const cardsText = (cards) => cards.map(cardText).join(' ');

function describeAct(event, before, after, nameOf) {
  const name = nameOf(event.seat);
  const player = after.players.find((p) => p.seat === event.seat);
  const allIn = player.stack === 0 ? ' (all-in)' : '';
  if (event.action === 'fold') return says(name, 'fold');
  if (event.action === 'check') return says(name, 'check');
  if (event.action === 'call') return `${says(name, 'call')} ${formatBbLabel(legalActions(before).toCall)}${allIn}`;
  if (event.action === 'bet') return `${says(name, 'bet')} ${formatBbLabel(event.amount)}${allIn}`;
  return `${says(name, 'raise')} to ${formatBbLabel(event.amount)}${allIn}`;
}

function describe(event, before, after, { nameOf, heroSeat }) {
  if (event.type === 'start') {
    const blind = (seat) => after.players.find((p) => p.seat === seat).committed;
    return [
      `${says(nameOf(after.sbSeat), 'post')} ${formatBbLabel(blind(after.sbSeat))}`,
      `${says(nameOf(after.bbSeat), 'post')} ${formatBbLabel(blind(after.bbSeat))}`,
    ];
  }
  if (event.type === 'hole') {
    if (event.seat !== heroSeat) return [];
    return [`You are dealt ${cardsText(viewFor(after, heroSeat).players.find((p) => p.seat === heroSeat).hole)}`];
  }
  if (event.type === 'board') return [`${STREET_BY_BOARD_SIZE[after.board.length]}: ${cardsText(after.board)}`];
  if (event.type === 'act') return [describeAct(event, before, after, nameOf)];
  return [];
}

/** Showdown reveals and winners for a completed hand. */
export function resultLines(state, { nameOf, heroSeat }) {
  if (!state?.result) return [];
  const { awards, showdown, scores, shown } = state.result;
  const view = viewFor(state, heroSeat);
  const lines = shown.map((seat) => `${says(nameOf(seat), 'show')} ${cardsText(view.players.find((p) => p.seat === seat).hole)}`);
  const winners = Object.keys(awards).map(Number).filter((seat) => awards[seat] > 0).sort((a, b) => a - b);
  for (const seat of winners) {
    const made = showdown && scores?.[seat] !== undefined ? ` with ${CATEGORY_NAMES[categoryOf(scores[seat])].toLowerCase()}` : '';
    lines.push(`${says(nameOf(seat), 'win')} ${formatBbLabel(awards[seat])}${made}`);
  }
  return lines;
}

/**
 * Every line for a hand so far. `events` is the full hand log; `nameOf(seat)` returns "You" for the hero.
 * @returns {string[]}
 */
export function logLines(events, { nameOf, heroSeat }) {
  const lines = [];
  let state = null;
  for (const event of events) {
    const before = state;
    state = applyEvent(state, event);
    lines.push(...describe(event, before, state, { nameOf, heroSeat }));
  }
  return [...lines, ...resultLines(state, { nameOf, heroSeat })];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/actionLog.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/actionLog.js src/private/trainers/poker/lib/actionLog.test.js
git commit -m "Add poker action log lines that never reveal hidden hole cards

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Table view model

**Files:**
- Create: `src/private/trainers/poker/lib/tableView.js`
- Test: `src/private/trainers/poker/lib/tableView.test.js`

**Interfaces:**
- Consumes: `legalActions` (`engine/handState.js`), `viewFor` (`engine/view.js`), `getPersona` (`bots/personas.js`), `SEAT_COUNT` (Task 1). Tests use `tableCore.js` (Task 6).
- Produces:
  - `slotOf(seat, heroSeat) → 0..5`
  - `heroView(session) → PlayerView|null`
  - `seatName(session, seat) → string` (`'You'` for the hero)
  - `seatViews(session) → SeatView[]` sorted by slot, where `SeatView = { seat, slot, isHero, name, tag, stack, bet, isButton, isActive, folded, allIn, cards:(number|null)[]|null, won }`
  - `tableCenter(session) → { board:number[], pot:number, handNo:number, street:string|null }`
  - `heroTurn(session) → { view, legal, stack } | null`
  - `streetKey(session) → string` (`'none'` or `'<handNo>:<street>'`)
  - `chipsToCollect(prev|null, next) → { slot, amount }[]`, where `prev`/`next` are `{ key, seats: SeatView[] }`

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/lib/tableView.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createSession, startHand, nextStep, applyAction, dealBoard, finishHand } from './tableCore.js';
import { slotOf, heroView, seatName, seatViews, tableCenter, heroTurn, streetKey, chipsToCollect } from './tableView.js';

const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });

const fresh = () => createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
const dealt = (seed = 1) => startHand(fresh(), { rng: mulberry32(seed), now: NOW, personas });

function advance(session, untilType) {
  let s = session;
  for (let guard = 0; guard < 200; guard += 1) {
    const step = nextStep(s);
    if (step.type === untilType) return s;
    if (step.type === 'board') s = dealBoard(s);
    else if (step.type === 'hero' || step.type === 'bot') s = applyAction(s, step.seat, passive(legalActions(s.hand.state)));
    else return s;
  }
  throw new Error('did not reach step');
}

describe('slots and names', () => {
  it('puts the hero at slot 0 and the rest clockwise', () => {
    expect([0, 1, 2, 3, 4, 5].map((seat) => slotOf(seat, 0))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([0, 1, 2, 3, 4, 5].map((seat) => slotOf(seat, 2))).toEqual([4, 5, 0, 1, 2, 3]);
  });

  it('names the hero You and bots by persona', () => {
    expect(seatName(fresh(), 0)).toBe('You');
    expect(seatName(fresh(), 3)).toBe(personas[2].name);
  });
});

describe('seatViews', () => {
  it('shows stacks and the button before the first hand', () => {
    const seats = seatViews(fresh());
    expect(seats.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(seats[0]).toMatchObject({ isHero: true, name: 'You', tag: 'YOU', stack: 200, bet: 0, cards: null, isButton: false });
    expect(seats[1]).toMatchObject({ isHero: false, name: personas[0].name, tag: personas[0].tag, stack: 200 });
    expect(heroView(fresh())).toBeNull();
  });

  it('shows blinds as bets, the hero’s cards and hidden bot cards during a hand', () => {
    const s = dealt(1);
    const seats = seatViews(s);
    const { sbSeat, bbSeat, button, toAct } = s.hand.state;
    expect(seats.find((x) => x.seat === sbSeat).bet).toBe(1);
    expect(seats.find((x) => x.seat === bbSeat).bet).toBe(2);
    expect(seats.find((x) => x.seat === sbSeat).stack).toBe(199);
    expect(seats.filter((x) => x.isButton).map((x) => x.seat)).toEqual([button]);
    expect(seats.filter((x) => x.isActive).map((x) => x.seat)).toEqual([toAct]);
    expect(seats[0].cards).toEqual(s.hand.state.players[0].hole);
    for (const bot of seats.slice(1)) expect(bot.cards).toEqual([null, null]);
  });

  it('hides folded players’ cards and reveals shown cards and winners at the end', () => {
    let s = dealt(2);
    const first = nextStep(s);
    s = applyAction(s, first.seat, { action: 'fold' });
    expect(seatViews(s).find((x) => x.seat === first.seat)).toMatchObject({ folded: true, cards: null });
    s = advance(s, 'complete');
    const seats = seatViews(s);
    expect(seats.every((x) => x.bet === 0)).toBe(true);
    const { shown, awards } = s.hand.state.result;
    for (const seat of shown) expect(seats.find((x) => x.seat === seat).cards.every(Number.isInteger)).toBe(true);
    expect(seats.reduce((sum, x) => sum + x.won, 0)).toBe(Object.values(awards).reduce((a, b) => a + b, 0));
  });

  it('shows the settled seat stacks once the hand is complete (a queued rebuy lands there)', () => {
    const playing = advance(dealt(6), 'complete');
    const settled = finishHand({ ...playing, rebuyPending: true, seats: playing.seats.map((x) => (x.seat === 0 ? { ...x, stack: 50 } : x)) }, { botVersion: 't', createId: () => 'h' }).session;
    expect(seatViews(settled).find((x) => x.isHero).stack).toBe(settled.seats[0].stack);
    expect(seatViews(settled).map((x) => x.stack)).toEqual(settled.seats.map((x) => x.stack));
  });
});

describe('tableCenter and heroTurn', () => {
  it('separates the collected pot from bets on the street', () => {
    expect(tableCenter(fresh())).toEqual({ board: [], pot: 0, handNo: 0, street: null });
    const s = dealt(3);
    expect(tableCenter(s)).toEqual({ board: [], pot: 0, handNo: 1, street: 'preflop' });
    const flop = advance(s, 'board');
    const onFlop = dealBoard(flop);
    expect(tableCenter(onFlop)).toMatchObject({ pot: 12, street: 'flop' });
    expect(tableCenter(onFlop).board).toHaveLength(3);
    const done = finishHand(advance(onFlop, 'complete'), { botVersion: 't', createId: () => 'h' }).session;
    expect(tableCenter(done)).toMatchObject({ pot: 12, street: 'complete', handNo: 1 });
  });

  it('returns the hero’s legal actions only on the hero’s turn', () => {
    const s = advance(dealt(4), 'hero');
    const turn = heroTurn(s);
    expect(turn.legal).toEqual(legalActions(s.hand.state));
    expect(turn.stack).toBe(s.hand.state.players[0].stack);
    expect(turn.view.players[1].hole).toBeNull();
    const after = applyAction(s, 0, passive(turn.legal));
    expect(heroTurn(after)).toBeNull();
    expect(heroTurn(fresh())).toBeNull();
  });
});

describe('chipsToCollect', () => {
  it('sweeps bets into the pot when the street closes, not when the board is dealt', () => {
    const preflop = dealt(5);
    const flopDue = advance(preflop, 'board');
    expect(streetKey(preflop)).toBe('1:preflop');
    expect(streetKey(flopDue)).toBe('1:flop');
    const snap = (s) => ({ key: streetKey(s), seats: seatViews(s) });
    // Blinds (1 and 2) are the bets on the table in the preflop snapshot.
    expect(chipsToCollect(snap(preflop), snap(flopDue)).map((x) => x.amount).sort()).toEqual([1, 2]);
    expect(chipsToCollect(snap(flopDue), snap(dealBoard(flopDue)))).toEqual([]);
    expect(chipsToCollect(snap(preflop), snap(preflop))).toEqual([]);
    expect(chipsToCollect(null, snap(preflop))).toEqual([]);
    expect(streetKey(fresh())).toBe('none');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/lib/tableView.test.js`
Expected: FAIL with "Failed to load url ./tableView.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/lib/tableView.js
// Display data for the table components, derived only from viewFor(state, heroSeat).
import { legalActions } from '../engine/handState.js';
import { viewFor } from '../engine/view.js';
import { getPersona } from '../bots/personas.js';
import { SEAT_COUNT } from './constants.js';

/**
 * @typedef {{ seat:number, slot:number, isHero:boolean, name:string, tag:string, stack:number, bet:number,
 *   isButton:boolean, isActive:boolean, folded:boolean, allIn:boolean, cards:(number|null)[]|null, won:number }} SeatView
 *   slot 0 is bottom center (hero); slots 1-5 run clockwise: left, top-left, top, top-right, right.
 */

export const slotOf = (seat, heroSeat) => (seat - heroSeat + SEAT_COUNT) % SEAT_COUNT;

/** The hero's view of the current or just-finished hand, or null before the first deal. */
export const heroView = (session) => (session.hand ? viewFor(session.hand.state, session.heroSeat) : null);

/** "You" for the hero, otherwise the persona name. */
export function seatName(session, seat) {
  const info = session.seats.find((s) => s.seat === seat);
  return info.kind === 'hero' ? 'You' : getPersona(info.personaId).name;
}

/** @returns {SeatView[]} ordered by slot */
export function seatViews(session) {
  const view = heroView(session);
  const complete = view?.street === 'complete';
  return session.seats
    .map((info) => {
      const persona = info.kind === 'bot' ? getPersona(info.personaId) : null;
      const p = view?.players.find((q) => q.seat === info.seat) ?? null;
      return {
        seat: info.seat,
        slot: slotOf(info.seat, session.heroSeat),
        isHero: info.kind === 'hero',
        name: persona ? persona.name : 'You',
        tag: persona ? persona.tag : 'YOU',
        // Once a hand is complete the seat's settled stack (including a queued rebuy) is the truth.
        stack: p && !complete ? p.stack : info.stack,
        bet: p && !complete ? p.committed : 0,
        isButton: (view ? view.button : session.button) === info.seat,
        isActive: Boolean(view && view.toAct === info.seat),
        folded: Boolean(p?.folded),
        allIn: Boolean(p && !complete && p.stack === 0 && !p.folded),
        cards: p && !p.folded ? (p.hole ?? [null, null]) : null,
        won: complete ? (view.result.awards[info.seat] ?? 0) : 0,
      };
    })
    .sort((a, b) => a.slot - b.slot);
}

/** Board, pot (chips already collected from earlier streets; the whole pot once complete) and hand number. */
export function tableCenter(session) {
  const view = heroView(session);
  if (!view) return { board: [], pot: 0, handNo: 0, street: null };
  const total = view.players.reduce((sum, p) => sum + p.total, 0);
  const onStreet = view.street === 'complete' ? 0 : view.players.reduce((sum, p) => sum + p.committed, 0);
  return { board: view.board, pot: total - onStreet, handNo: session.hand.no, street: view.street };
}

/** `{ view, legal, stack }` when the hero must act now, else null. */
export function heroTurn(session) {
  const view = heroView(session);
  if (session.phase !== 'playing' || !view || view.needsBoard || view.toAct !== session.heroSeat) return null;
  const me = view.players.find((p) => p.seat === session.heroSeat);
  return { view, legal: legalActions(view), stack: me.stack };
}

/** Changes whenever bets are swept into the pot: a new street, the end of a hand or a new hand. */
export const streetKey = (session) => (session.hand ? `${session.hand.no}:${session.hand.state.street}` : 'none');

/**
 * Bets to animate into the pot when the street key changes.
 * @param {{ key:string, seats:SeatView[] }} prev
 * @param {{ key:string, seats:SeatView[] }} next
 * @returns {{ slot:number, amount:number }[]}
 */
export function chipsToCollect(prev, next) {
  if (!prev || prev.key === next.key) return [];
  return prev.seats.filter((s) => s.bet > 0).map(({ slot, bet }) => ({ slot, amount: bet }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/lib/tableView.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/lib/tableView.js src/private/trainers/poker/lib/tableView.test.js
git commit -m "Add poker table view model: seats, pot, hero turn and chip sweeps

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Pixel sprite data

**Files:**
- Create: `src/private/trainers/poker/ui/sprites/glyphs.js`
- Create: `src/private/trainers/poker/ui/sprites/tableGrid.js`
- Test: `src/private/trainers/poker/ui/sprites/sprites.test.js`

**Interfaces:**
- Consumes: `RANKS` (`engine/cards.js`).
- Produces:
  - `glyphs.js`: `RANK_GLYPHS` (keyed `'2'..'9','T','J','Q','K','A'`), `SUIT_GLYPHS` (indexed by suit 0..3 = c, d, h, s), `CHIP_GLYPH`, `rankGlyph(card)`, `suitGlyph(card)`, `bitmapRuns(rows) → { x, y, w }[]`
  - `tableGrid.js`: `TABLE_W = 120`, `TABLE_H = 56`, `tableTone(x, y) → 'rail'|'railHi'|'line'|'felt'|'feltDk'|'feltHi'|null`, `tableRuns() → { x, y, w, tone }[]`

The suit bitmaps, the A/K/Q/J/9/10/7 rank bitmaps and the table algorithm are copied from the approved mockup generator (`gen2.mjs` from brainstorming). The test keeps a verbatim copy of the mockup's table loop and checks the port pixel for pixel. Ranks 2–6 and 8 are new 3×5 glyphs in the same style.

- [ ] **Step 1: Write the failing test**

```js
// src/private/trainers/poker/ui/sprites/sprites.test.js
import { describe, it, expect } from 'vitest';
import { parseCard, RANKS } from '../../engine/cards.js';
import { RANK_GLYPHS, SUIT_GLYPHS, CHIP_GLYPH, rankGlyph, suitGlyph, bitmapRuns } from './glyphs.js';
import { TABLE_W, TABLE_H, tableTone, tableRuns } from './tableGrid.js';

const isRect = (rows, width, height) => rows.length === height && rows.every((r) => r.length === width && /^[X.]+$/.test(r));

describe('glyphs', () => {
  it('has a 3x5 glyph for every rank and a 5x5 ten', () => {
    for (const r of RANKS) expect(isRect(RANK_GLYPHS[r], r === 'T' ? 5 : 3, 5), r).toBe(true);
  });

  it('has 9-wide suit glyphs, including the approved 9-row spade', () => {
    expect(SUIT_GLYPHS).toHaveLength(4);
    for (const rows of SUIT_GLYPHS) expect(rows.every((r) => r.length === 9 && /^[X.]+$/.test(r))).toBe(true);
    expect(SUIT_GLYPHS[3]).toEqual([
      '....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..',
    ]);
    expect(isRect(CHIP_GLYPH, 7, 7)).toBe(true);
  });

  it('looks glyphs up by card', () => {
    expect(rankGlyph(parseCard('Th'))).toBe(RANK_GLYPHS.T);
    expect(suitGlyph(parseCard('Th'))).toBe(SUIT_GLYPHS[2]);
    expect(rankGlyph(parseCard('2c'))).toBe(RANK_GLYPHS[2]);
  });

  it('compresses rows into horizontal runs', () => {
    expect(bitmapRuns(['X.XX', '....', 'XXXX'])).toEqual([
      { x: 0, y: 0, w: 1 }, { x: 2, y: 0, w: 2 }, { x: 0, y: 2, w: 4 },
    ]);
    const filled = SUIT_GLYPHS[3].join('').split('').filter((ch) => ch === 'X').length;
    expect(bitmapRuns(SUIT_GLYPHS[3]).reduce((sum, run) => sum + run.w, 0)).toBe(filled);
  });
});

// Reference: the mockup generator's table() loop, with palette colors replaced by tone names.
function mockupTone(x, y) {
  const W = 120, H = 56, cx = W / 2, cy = H / 2, a = W / 2 - 1, b = H / 2 - 1;
  const dx = (x + 0.5 - cx) / a, dy = (y + 0.5 - cy) / b;
  const d = Math.abs(dx) ** 5 + dy * dy;
  const di = Math.abs((x + 0.5 - cx) / (a - 5)) ** 5 + ((y + 0.5 - cy) / (b - 5)) ** 2;
  const dl = Math.abs((x + 0.5 - cx) / (a - 9)) ** 5 + ((y + 0.5 - cy) / (b - 9)) ** 2;
  let c = null;
  if (d <= 1) {
    if (di > 1) c = (y < cy - b + 3 || (di > 1.35 && y < cy)) ? 'railHi' : 'rail';
    else if (dl > 0.93 && dl < 1.07) c = 'line';
    else {
      const v = dx * dx + dy * dy;
      c = ((x + y) % 2 === 0 && v > 0.55) ? 'feltDk' : 'felt';
      if (((x * 7 + y * 13) % 23) === 0) c = 'feltHi';
    }
  }
  return c;
}

describe('table art', () => {
  it('matches the approved mockup pixel for pixel', () => {
    expect([TABLE_W, TABLE_H]).toEqual([120, 56]);
    for (let y = 0; y < TABLE_H; y += 1) {
      for (let x = 0; x < TABLE_W; x += 1) expect(tableTone(x, y), `${x},${y}`).toBe(mockupTone(x, y));
    }
  });

  it('has empty corners, a highlighted top rail, a betting line and felt in the middle', () => {
    expect(tableTone(0, 0)).toBeNull();
    expect(tableTone(119, 55)).toBeNull();
    expect(tableTone(60, 1)).toBe('railHi');
    expect(tableTone(109, 28)).toBe('line');
    expect(tableTone(60, 28)).toBe('felt');
  });

  it('covers every table pixel exactly once with same-tone runs', () => {
    const runs = tableRuns();
    let pixels = 0;
    for (let y = 0; y < TABLE_H; y += 1) for (let x = 0; x < TABLE_W; x += 1) if (tableTone(x, y)) pixels += 1;
    expect(runs.reduce((sum, r) => sum + r.w, 0)).toBe(pixels);
    for (const r of runs) {
      for (let x = r.x; x < r.x + r.w; x += 1) expect(tableTone(x, r.y)).toBe(r.tone);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/private/trainers/poker/ui/sprites/sprites.test.js`
Expected: FAIL with "Failed to load url ./glyphs.js" (or a similar module-not-found error).

- [ ] **Step 3: Write the implementation**

```js
// src/private/trainers/poker/ui/sprites/glyphs.js
// Hand-drawn pixel bitmaps: 'X' = filled pixel, '.' = empty. Ported from the approved Midnight Indigo mockup.
import { RANKS } from '../../engine/cards.js';

/** 3x5 rank glyphs keyed by RANKS character; T (10) is 5x5. */
export const RANK_GLYPHS = {
  2: ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  3: ['XXX', '..X', '.XX', '..X', 'XXX'],
  4: ['X.X', 'X.X', 'XXX', '..X', '..X'],
  5: ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  7: ['XXX', '..X', '.X.', '.X.', '.X.'],
  8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  T: ['X.XXX', 'X.X.X', 'X.X.X', 'X.X.X', 'X.XXX'],
  J: ['..X', '..X', '..X', 'X.X', '.X.'],
  Q: ['.X.', 'X.X', 'X.X', 'XX.', '.XX'],
  K: ['X.X', 'XX.', 'X..', 'XX.', 'X.X'],
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
};

/** 9-wide suit glyphs indexed by suit (0..3 = c, d, h, s). The spade is the redrawn, approved version. */
export const SUIT_GLYPHS = [
  ['...XXX...', '...XXX...', '.XX.X.XX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '...XXX...'],
  ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
  ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
  ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..'],
];

/** 7x7 chip for bets and stacks. */
export const CHIP_GLYPH = ['..XXX..', '.X...X.', 'X.XXX.X', 'X.X.X.X', 'X.XXX.X', '.X...X.', '..XXX..'];

export const rankGlyph = (card) => RANK_GLYPHS[RANKS[card >> 2]];
export const suitGlyph = (card) => SUIT_GLYPHS[card & 3];

/** Horizontal runs of filled pixels, so an SVG needs one <rect> per run. */
export function bitmapRuns(rows) {
  const runs = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== 'X') {
        x += 1;
      } else {
        let end = x;
        while (row[end] === 'X') end += 1;
        runs.push({ x, y, w: end - x });
        x = end;
      }
    }
  });
  return runs;
}
```

```js
// src/private/trainers/poker/ui/sprites/tableGrid.js
// The pixel table: a superellipse on a 120x56 grid with a stepped rail, an inner betting line and
// checkerboard dithering toward the edges. Ported from the approved mockup; tones map to --pk-* tokens in CSS.

export const TABLE_W = 120;
export const TABLE_H = 56;

/** @typedef {'rail'|'railHi'|'line'|'felt'|'feltDk'|'feltHi'} Tone */

/** The tone of pixel (x, y), or null outside the table. */
export function tableTone(x, y) {
  const cx = TABLE_W / 2;
  const cy = TABLE_H / 2;
  const a = TABLE_W / 2 - 1;
  const b = TABLE_H / 2 - 1;
  const px = x + 0.5 - cx;
  const py = y + 0.5 - cy;
  const dx = px / a;
  const dy = py / b;
  const outer = Math.abs(dx) ** 5 + dy * dy;
  if (outer > 1) return null;
  const inner = Math.abs(px / (a - 5)) ** 5 + (py / (b - 5)) ** 2;
  if (inner > 1) return y < cy - b + 3 || (inner > 1.35 && y < cy) ? 'railHi' : 'rail';
  const line = Math.abs(px / (a - 9)) ** 5 + (py / (b - 9)) ** 2;
  if (line > 0.93 && line < 1.07) return 'line';
  if ((x * 7 + y * 13) % 23 === 0) return 'feltHi';
  return (x + y) % 2 === 0 && dx * dx + dy * dy > 0.55 ? 'feltDk' : 'felt';
}

/** Same-tone horizontal runs, one <rect> each. */
export function tableRuns() {
  const runs = [];
  for (let y = 0; y < TABLE_H; y += 1) {
    let x = 0;
    while (x < TABLE_W) {
      const tone = tableTone(x, y);
      let end = x + 1;
      while (end < TABLE_W && tableTone(end, y) === tone) end += 1;
      if (tone) runs.push({ x, y, w: end - x, tone });
      x = end;
    }
  }
  return runs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/private/trainers/poker/ui/sprites/sprites.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/private/trainers/poker/ui/sprites/glyphs.js src/private/trainers/poker/ui/sprites/tableGrid.js src/private/trainers/poker/ui/sprites/sprites.test.js
git commit -m "Add poker pixel glyphs and table grid ported from the approved mockup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Poker shell, lobby and routes

**Files:**
- Create: `src/private/trainers/poker/ui/PokerShell.jsx`
- Create: `src/private/trainers/poker/ui/poker.css`
- Create: `src/private/trainers/poker/ui/lobby/PokerLobbyPage.jsx`
- Create: `src/private/trainers/poker/ui/lobby/PlayTab.jsx` (random table only; Task 12 adds the builder)
- Create: `src/private/trainers/poker/ui/lobby/StatsTab.jsx`
- Modify: `src/App.jsx` (lobby lazy import and route)
- Modify: `src/private/PrivateHome.jsx` (Trainers entry)

**Interfaces:**
- Consumes: `PrivateShell` (`src/private/PrivateShell.jsx`), `listPersonas` (`bots/personas.js`), `randomLineup` (Task 4).
- Produces:
  - `<PokerShell back?={ to, label } onBack?={(event) => void}>`: wraps `PrivateShell` with `className="pk"`, loads Silkscreen, renders a back link and `<main className="pk-main">`. It imports `poker.css`, which defines the `.pk` tokens and the shared classes `pk-btn`, `pk-btn--fold|call|raise`, `pk-title`, `pk-h2`, `pk-h3`, `pk-muted`, `pk-error`, `pk-sr-only`, `pk-box`, `pk-select` and the lobby and builder layout.
  - `PokerLobbyPage` (default export) at `/me/poker`.
  - Lobby navigation contract: `navigate('/me/poker/table/<uuid>', { state: { tableMode, lineup, speed } })`.

This task has no unit test: it adds `.jsx` and CSS only. The checks are the bundle check, the full suite and the build.

- [ ] **Step 1: Write the shell and styles**

```jsx
// src/private/trainers/poker/ui/PokerShell.jsx
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import PrivateShell from '../../../PrivateShell';
import './poker.css';

const FONT_ID = 'pk-font-silkscreen';
const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Silkscreen&display=swap';

// Silkscreen loads only when a poker page mounts, so public pages never fetch it.
function usePixelFont() {
  useEffect(() => {
    if (document.getElementById(FONT_ID)) return;
    const link = Object.assign(document.createElement('link'), { id: FONT_ID, rel: 'stylesheet', href: FONT_HREF });
    document.head.appendChild(link);
  }, []);
}

const LOBBY_BACK = { to: '/me', label: 'Base Camp' };

/** Private-area frame for every poker page. `.pk` scopes the Midnight Indigo tokens. */
export default function PokerShell({ back = LOBBY_BACK, onBack, children }) {
  usePixelFont();
  return (
    <PrivateShell className="pk">
      <div className="asc-topbar">
        <Link to={back.to} onClick={onBack} data-hot className="asc-back asc-mono">
          <ArrowLeft size={14} /> <span className="b-name">{back.label}</span>
        </Link>
      </div>
      <main className="pk-main">{children}</main>
    </PrivateShell>
  );
}
```

```css
/* src/private/trainers/poker/ui/poker.css */
/* ============================================================
   POKER: Midnight Indigo. Every rule is scoped under .pk so
   nothing leaks into the rest of the site.
   ============================================================ */
.pk {
  --pk-bg: #0a0a14;
  --pk-rail: #1a1b2b;
  --pk-rail-hi: #26283d;
  --pk-felt: #23265a;
  --pk-felt-dk: #1d2050;
  --pk-felt-hi: #2c3068;
  --pk-line: #343a7a;
  --pk-card: #eeeae0;
  --pk-red: #ff5f6d;
  --pk-black: #14142a;
  --pk-accent: #f5c451;
  --pk-accent-2: #8fa8ff;
  --pk-text: #dcdcf0;
  --pk-muted: #6a6c8c;
  --pk-back: #3b3f8a;
  --pk-back-2: #2a2d66;
  --pk-font: 'Silkscreen', ui-monospace, monospace;
  background: var(--pk-bg);
  color: var(--pk-text);
}

.pk .pk-main { width: min(100% - 32px, 1320px); margin: 0 auto; padding: 8px 0 64px; font-family: var(--pk-font); }
.pk .pk-title { font-family: var(--pk-font); font-weight: 400; font-size: clamp(32px, 5vw, 56px); line-height: 1; margin: 0; text-transform: uppercase; }
.pk .pk-h2 { font-family: var(--pk-font); font-weight: 400; font-size: 18px; margin: 0 0 12px; text-transform: uppercase; }
.pk .pk-h3 { font-family: var(--pk-font); font-weight: 400; font-size: 14px; margin: 16px 0 8px; text-transform: uppercase; color: var(--pk-muted); }
.pk .pk-muted { color: var(--pk-muted); font-size: 12px; line-height: 1.6; margin: 0; }
.pk .pk-error { color: var(--pk-red); font-size: 12px; margin: 0; }
.pk .pk-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.pk kbd { font-family: var(--pk-font); font-size: 9px; opacity: 0.7; margin-left: 6px; }

/* ---- buttons -------------------------------------------- */
.pk .pk-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 4px;
  font-family: var(--pk-font); font-size: 12px; text-transform: uppercase; text-decoration: none; line-height: 1;
  background: none; color: var(--pk-text); border: 3px solid var(--pk-muted); padding: 9px 16px; cursor: pointer;
}
.pk .pk-btn:hover:not(:disabled) { transform: translate(-1px, -1px); box-shadow: 2px 2px 0 #000; }
.pk .pk-btn:focus-visible, .pk .pk-tab:focus-visible, .pk .pk-select:focus-visible, .pk input:focus-visible {
  outline: 2px solid var(--pk-text); outline-offset: 3px;
}
.pk .pk-btn:disabled { opacity: 0.4; cursor: default; }
.pk .pk-btn--fold { border-color: var(--pk-muted); color: var(--pk-muted); }
.pk .pk-btn--call { border-color: var(--pk-accent-2); color: var(--pk-accent-2); }
.pk .pk-btn--raise { background: var(--pk-accent); border-color: var(--pk-accent); color: var(--pk-bg); }

/* ---- lobby ---------------------------------------------- */
.pk .pk-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 16px 24px;
  padding: 16px 0 20px; border-bottom: 3px solid var(--pk-rail-hi); }
.pk .pk-head .pk-muted { flex-basis: 100%; order: 2; }
.pk .pk-tabs { display: flex; gap: 8px; }
.pk .pk-tab { font-family: var(--pk-font); font-size: 12px; text-transform: uppercase; background: none; color: var(--pk-muted);
  border: 3px solid var(--pk-rail-hi); padding: 8px 14px; cursor: pointer; }
.pk .pk-tab[aria-selected="true"] { color: var(--pk-accent); border-color: var(--pk-accent); }
.pk .pk-panel { padding-top: 28px; }
.pk .pk-lobby { display: grid; gap: 24px; }
@media (min-width: 1024px) { .pk .pk-lobby { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.pk .pk-box { background: var(--pk-rail); border: 3px solid var(--pk-rail-hi); padding: 20px; display: flex; flex-direction: column; align-items: flex-start; gap: 14px; }
.pk .pk-speed { border: 0; margin: 0; padding: 0; display: flex; gap: 16px; font-size: 12px; }
.pk .pk-speed legend { color: var(--pk-muted); margin-bottom: 8px; padding: 0; }
.pk .pk-radio { display: inline-flex; align-items: center; gap: 6px; cursor: pointer; }
.pk .pk-radio input { accent-color: var(--pk-accent); }
.pk .pk-empty-state { max-width: 60ch; display: flex; flex-direction: column; gap: 10px; }

/* ---- table builder -------------------------------------- */
.pk .pk-builder { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
.pk .pk-builder__seats { list-style: none; margin: 0; padding: 0; width: 100%; display: grid; gap: 8px; }
.pk .pk-builder__seat { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); align-items: center; gap: 12px; font-size: 12px; }
.pk .pk-select { font-family: var(--pk-font); font-size: 12px; color: var(--pk-text); background: var(--pk-bg);
  border: 3px solid var(--pk-rail-hi); padding: 6px 8px; }

/* ---- motion --------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .pk *, .pk *::before, .pk *::after { animation: none !important; transition: none !important; }
  .pk .pk-btn:hover:not(:disabled) { transform: none; }
}
```

- [ ] **Step 2: Write the lobby**

```jsx
// src/private/trainers/poker/ui/lobby/PokerLobbyPage.jsx
import { useSearchParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import PlayTab from './PlayTab';
import StatsTab from './StatsTab';

const TABS = [
  { key: 'play', label: 'Play' },
  { key: 'stats', label: 'Stats' },
];

/** Route: /me/poker (Play) and /me/poker?tab=stats (Stats). */
export default function PokerLobbyPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'stats' ? 'stats' : 'play';
  const select = (key) => setParams(key === 'play' ? {} : { tab: key }, { replace: true });

  return (
    <PokerShell>
      <header className="pk-head">
        <h1 className="pk-title">Poker</h1>
        <p className="pk-muted">6-max No-Limit Hold&apos;em &middot; you and 5 bots</p>
        <div className="pk-tabs" role="tablist" aria-label="Poker views">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`pk-tab-${key}`}
              aria-selected={tab === key}
              aria-controls="pk-panel"
              data-hot
              className="pk-tab"
              onClick={() => select(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      <section id="pk-panel" role="tabpanel" aria-labelledby={`pk-tab-${tab}`} className="pk-panel">
        {tab === 'play' ? <PlayTab /> : <StatsTab />}
      </section>
    </PokerShell>
  );
}
```

```jsx
// src/private/trainers/poker/ui/lobby/StatsTab.jsx
/** Leak tracker placeholder until sessions are saved (Phases 4 and 6). */
export default function StatsTab() {
  return (
    <div className="pk-empty-state">
      <h2 className="pk-h2">No stats yet</h2>
      <p className="pk-muted">
        Stats arrive after sessions are saved. Your tendencies, biggest leaks and results over time will show up here.
      </p>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/lobby/PlayTab.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPersonas } from '../../bots/personas.js';
import { randomLineup } from '../../lib/lineup.js';

const SPEEDS = [
  { key: 'normal', label: 'Normal' },
  { key: 'fast', label: 'Fast' },
];

export default function PlayTab() {
  const navigate = useNavigate();
  const personas = useMemo(() => listPersonas(), []);
  const [speed, setSpeed] = useState('normal');

  const sitDown = (tableMode, lineup) => {
    navigate(`/me/poker/table/${crypto.randomUUID()}`, { state: { tableMode, lineup, speed } });
  };

  return (
    <div className="pk-lobby">
      <section className="pk-box" aria-labelledby="pk-random-title">
        <h2 id="pk-random-title" className="pk-h2">Sit down</h2>
        <p className="pk-muted">Five random bots. 100 BB buy-in, blinds 0.5/1 BB, rebuy any time you drop under 40 BB.</p>
        <fieldset className="pk-speed">
          <legend>Bot speed</legend>
          {SPEEDS.map(({ key, label }) => (
            <label key={key} className="pk-radio">
              <input type="radio" name="pk-speed" value={key} checked={speed === key} onChange={() => setSpeed(key)} />
              {label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="pk-btn pk-btn--raise"
          data-hot
          onClick={() => sitDown('random', randomLineup(personas, Math.random))}
        >
          Sit down
        </button>
      </section>

      <section className="pk-box" aria-labelledby="pk-recent-title">
        <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
        <p className="pk-muted">Sessions are not saved yet. Your recent sessions and their reviews will be listed here.</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Bundle-check the lobby**

Run: `npx esbuild src/private/trainers/poker/ui/lobby/PokerLobbyPage.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

- [ ] **Step 4: Add the route and the Trainers entry**

In `src/App.jsx`, add the lazy import directly below the `GameDetail` lazy import:

```jsx
const PokerLobbyPage = lazy(() => import('./private/trainers/poker/ui/lobby/PokerLobbyPage'));
```

Then, in `AnimatedRoutes`, insert this route directly after the `/me` route and **before** the `/me/:trainer` route:

```jsx
      {/* Poker has its own pages; these must come before the generic /me/:trainer route. */}
      <Route
        path="/me/poker"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerLobbyPage /></Suspense>}</RequireAuth>}
      />
```

In `src/private/PrivateHome.jsx`, add Poker as the last item of the `trainers` section, after the Optiver entry:

```jsx
      { name: 'Poker', desc: 'No-Limit Hold’em · 6-max · you vs. 5 bots', to: '/me/poker' },
```

(The apostrophe in "Hold’em" is the typographic U+2019, so the single-quoted string stays valid.)

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test`
Expected: PASS, with every existing test and the Task 1–10 tests passing.

Run: `npm run build`
Expected: `✓ built`, and the output lists a `PokerLobbyPage-*.js` chunk. The only warning is the existing 500 kB chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/ui/PokerShell.jsx src/private/trainers/poker/ui/poker.css src/private/trainers/poker/ui/lobby/PokerLobbyPage.jsx src/private/trainers/poker/ui/lobby/PlayTab.jsx src/private/trainers/poker/ui/lobby/StatsTab.jsx src/App.jsx src/private/PrivateHome.jsx
git commit -m "Add poker lobby with Midnight Indigo shell, stats empty state and /me/poker route

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 12: Custom table builder

**Files:**
- Create: `src/private/trainers/poker/ui/lobby/TableBuilder.jsx`
- Modify: `src/private/trainers/poker/ui/lobby/PlayTab.jsx` (full replacement below)

**Interfaces:**
- Consumes: `defaultLineup`, `validateLineup` (Task 4); `listPersonas` (`bots/personas.js`); the `.pk-builder*` and `.pk-select` styles already in `poker.css` (Task 11).
- Produces: `<TableBuilder personas={Persona[]} onSitDown={(lineup: LineupEntry[]) => void} />`. `PlayTab` sits down with `tableMode: 'custom'` from the builder.

- [ ] **Step 1: Write the builder**

```jsx
// src/private/trainers/poker/ui/lobby/TableBuilder.jsx
import { useState } from 'react';
import { defaultLineup, validateLineup } from '../../lib/lineup.js';

// Where each bot seat sits relative to the hero at the bottom of the table.
const SEAT_PLACES = { 1: 'left', 2: 'top left', 3: 'top', 4: 'top right', 5: 'right' };

/** One persona per bot seat; a persona can only sit once. */
export default function TableBuilder({ personas, onSitDown }) {
  const [lineup, setLineup] = useState(() => defaultLineup(personas));
  const error = validateLineup(lineup, personas);

  const choose = (seat, personaId) => {
    setLineup((current) => current.map((x) => (x.seat === seat ? { seat, personaId } : x)));
  };

  const submit = (e) => {
    e.preventDefault();
    if (!error) onSitDown(lineup);
  };

  return (
    <form className="pk-builder" onSubmit={submit}>
      <ol className="pk-builder__seats">
        {lineup.map(({ seat, personaId }) => {
          const takenElsewhere = new Set(lineup.filter((x) => x.seat !== seat).map((x) => x.personaId));
          return (
            <li key={seat} className="pk-builder__seat">
              <label htmlFor={`pk-seat-${seat}`}>Seat {seat} <span className="pk-muted">({SEAT_PLACES[seat]})</span></label>
              <select
                id={`pk-seat-${seat}`}
                className="pk-select"
                value={personaId ?? ''}
                onChange={(e) => choose(seat, e.target.value)}
              >
                {personaId === null && <option value="">Choose a bot</option>}
                {personas.map((p) => (
                  <option key={p.id} value={p.id} disabled={takenElsewhere.has(p.id)}>
                    {p.tag} &middot; {p.name}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ol>
      {error && <p className="pk-error" role="alert">{error}</p>}
      <button type="submit" className="pk-btn pk-btn--raise" data-hot disabled={Boolean(error)}>
        Sit down at this table
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Replace `PlayTab.jsx`**

```jsx
// src/private/trainers/poker/ui/lobby/PlayTab.jsx
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { listPersonas } from '../../bots/personas.js';
import { randomLineup } from '../../lib/lineup.js';
import TableBuilder from './TableBuilder';

const SPEEDS = [
  { key: 'normal', label: 'Normal' },
  { key: 'fast', label: 'Fast' },
];

export default function PlayTab() {
  const navigate = useNavigate();
  const personas = useMemo(() => listPersonas(), []);
  const [speed, setSpeed] = useState('normal');

  const sitDown = (tableMode, lineup) => {
    navigate(`/me/poker/table/${crypto.randomUUID()}`, { state: { tableMode, lineup, speed } });
  };

  return (
    <div className="pk-lobby">
      <section className="pk-box" aria-labelledby="pk-random-title">
        <h2 id="pk-random-title" className="pk-h2">Sit down</h2>
        <p className="pk-muted">Five random bots. 100 BB buy-in, blinds 0.5/1 BB, rebuy any time you drop under 40 BB.</p>
        <fieldset className="pk-speed">
          <legend>Bot speed</legend>
          {SPEEDS.map(({ key, label }) => (
            <label key={key} className="pk-radio">
              <input type="radio" name="pk-speed" value={key} checked={speed === key} onChange={() => setSpeed(key)} />
              {label}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          className="pk-btn pk-btn--raise"
          data-hot
          onClick={() => sitDown('random', randomLineup(personas, Math.random))}
        >
          Sit down
        </button>
      </section>

      <section className="pk-box" aria-labelledby="pk-build-title">
        <h2 id="pk-build-title" className="pk-h2">Build a table</h2>
        <p className="pk-muted">Choose the bot in each seat. Uses the bot speed above.</p>
        <TableBuilder personas={personas} onSitDown={(lineup) => sitDown('custom', lineup)} />
      </section>

      <section className="pk-box" aria-labelledby="pk-recent-title">
        <h2 id="pk-recent-title" className="pk-h2">Recent sessions</h2>
        <p className="pk-muted">Sessions are not saved yet. Your recent sessions and their reviews will be listed here.</p>
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Bundle-check, test and build**

Run: `npx esbuild src/private/trainers/poker/ui/lobby/PokerLobbyPage.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test` then `npm run build`
Expected: all tests pass, and the build succeeds with only the existing chunk-size warning.

- [ ] **Step 4: Commit**

```bash
git add src/private/trainers/poker/ui/lobby/TableBuilder.jsx src/private/trainers/poker/ui/lobby/PlayTab.jsx
git commit -m "Add poker custom table builder to the lobby

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 13: Pixel sprite components

**Files:**
- Create: `src/private/trainers/poker/ui/sprites/PixelBitmap.jsx`
- Create: `src/private/trainers/poker/ui/sprites/Card.jsx`
- Create: `src/private/trainers/poker/ui/sprites/TableArt.jsx`
- Create: `src/private/trainers/poker/ui/sprites/sprites.css`

**Interfaces:**
- Consumes: `bitmapRuns`, `rankGlyph`, `suitGlyph` (Task 10); `TABLE_W`, `TABLE_H`, `tableRuns` (Task 10); `cardLabel`, `isRedCard` (Task 1).
- Produces:
  - `<PixelBitmap rows={string[]} px={number} className? />`: an `aria-hidden` SVG filled with `currentColor`.
  - `<Card card={number|null} size?={'board'|'hero'|'mini'} className? />`: `role="img"` with `aria-label` "Ace of hearts", or "Face-down card" when `card` is null. Passing `className="pk-card--deal"` plays the deal animation.
  - `<TableArt className? />`: memoized, decorative.
  - CSS classes: `pk-card`, `pk-card--board|hero|mini|back|deal`, `pk-bitmap`, `pk-ink-red|black`, `pk-table-art`, `pk-t-*` tones.

- [ ] **Step 1: Write the components and styles**

```jsx
// src/private/trainers/poker/ui/sprites/PixelBitmap.jsx
import { bitmapRuns } from './glyphs.js';

/** Renders a glyph bitmap as crisp SVG rects, `px` screen pixels per bitmap pixel. Fill is currentColor. */
export default function PixelBitmap({ rows, px, className = '' }) {
  const width = rows[0].length;
  const height = rows.length;
  return (
    <svg
      className={`pk-bitmap ${className}`.trim()}
      width={width * px}
      height={height * px}
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {bitmapRuns(rows).map(({ x, y, w }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={w} height={1} />
      ))}
    </svg>
  );
}
```

```jsx
// src/private/trainers/poker/ui/sprites/Card.jsx
import PixelBitmap from './PixelBitmap';
import { rankGlyph, suitGlyph } from './glyphs.js';
import { cardLabel, isRedCard } from '../../lib/format.js';
import './sprites.css';

// Pixel scale per size: ranks at 3 px on the board and 4 px in the hero's hand, suits at 2 px and 3 px.
const SCALE = {
  board: { rankPx: 3, suitPx: 2 },
  hero: { rankPx: 4, suitPx: 3 },
};

/**
 * A face-up card, or a face-down back when `card` is null.
 * size: 'board' (46x64), 'hero' (64x90) or 'mini' (22x30, backs only).
 */
export default function Card({ card, size = 'board', className = '' }) {
  const classes = `pk-card pk-card--${size} ${className}`.trim();
  if (card === null || card === undefined) {
    return (
      <div className={`${classes} pk-card--back`} role="img" aria-label="Face-down card">
        <div className="pk-card__face" />
      </div>
    );
  }
  const { rankPx, suitPx } = SCALE[size] ?? SCALE.board;
  const suit = suitGlyph(card);
  return (
    <div className={classes} role="img" aria-label={cardLabel(card)}>
      <div className={`pk-card__face ${isRedCard(card) ? 'pk-ink-red' : 'pk-ink-black'}`}>
        <span className="pk-card__corner">
          <PixelBitmap rows={rankGlyph(card)} px={rankPx} />
          <PixelBitmap rows={suit} px={suitPx} />
        </span>
        <span className="pk-card__pip">
          <PixelBitmap rows={suit} px={suitPx} />
        </span>
      </div>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/sprites/TableArt.jsx
import { memo } from 'react';
import { TABLE_W, TABLE_H, tableRuns } from './tableGrid.js';
import './sprites.css';

const RUNS = tableRuns();
const TONE_CLASS = {
  rail: 'pk-t-rail',
  railHi: 'pk-t-rail-hi',
  line: 'pk-t-line',
  felt: 'pk-t-felt',
  feltDk: 'pk-t-felt-dk',
  feltHi: 'pk-t-felt-hi',
};

/** The 120x56 pixel table, stretched to its container. Decorative. */
function TableArt({ className = '' }) {
  return (
    <svg
      className={`pk-table-art ${className}`.trim()}
      viewBox={`0 0 ${TABLE_W} ${TABLE_H}`}
      preserveAspectRatio="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      {RUNS.map(({ x, y, w, tone }) => (
        // The 0.02 overlap hides hairline seams between runs when the SVG is stretched.
        <rect key={`${x}-${y}`} x={x} y={y} width={w + 0.02} height={1.02} className={TONE_CLASS[tone]} />
      ))}
    </svg>
  );
}

export default memo(TableArt);
```

```css
/* src/private/trainers/poker/ui/sprites/sprites.css */
/* Pixel sprites: bitmaps, cards and the table art. Scoped under .pk. */
.pk .pk-bitmap { display: block; fill: currentColor; }
.pk .pk-ink-red { color: var(--pk-red); }
.pk .pk-ink-black { color: var(--pk-black); }

/* The drop-shadow sits on the wrapper because clip-path on the face would clip a box-shadow. */
.pk .pk-card { --pk-notch: 3px; position: relative; flex: none; filter: drop-shadow(3px 3px 0 rgba(0, 0, 0, 0.6)); }
.pk .pk-card--board { width: 46px; height: 64px; }
.pk .pk-card--hero { width: 64px; height: 90px; }
.pk .pk-card--mini { --pk-notch: 2px; width: 22px; height: 30px; filter: drop-shadow(2px 2px 0 rgba(0, 0, 0, 0.6)); }
.pk .pk-card__face {
  position: absolute; inset: 0; background: var(--pk-card);
  clip-path: polygon(
    0 var(--pk-notch), var(--pk-notch) var(--pk-notch), var(--pk-notch) 0,
    calc(100% - var(--pk-notch)) 0, calc(100% - var(--pk-notch)) var(--pk-notch), 100% var(--pk-notch),
    100% calc(100% - var(--pk-notch)), calc(100% - var(--pk-notch)) calc(100% - var(--pk-notch)), calc(100% - var(--pk-notch)) 100%,
    var(--pk-notch) 100%, var(--pk-notch) calc(100% - var(--pk-notch)), 0 calc(100% - var(--pk-notch))
  );
}
.pk .pk-card__corner { position: absolute; left: 5px; top: 5px; display: flex; flex-direction: column; align-items: center; gap: 2px; }
.pk .pk-card__pip { position: absolute; right: 5px; bottom: 6px; }
.pk .pk-card--hero .pk-card__corner { left: 6px; top: 6px; gap: 3px; }
.pk .pk-card--hero .pk-card__pip { right: 6px; bottom: 7px; }
.pk .pk-card--back .pk-card__face::after {
  content: ''; position: absolute; inset: 4px;
  background: repeating-conic-gradient(var(--pk-back) 0 25%, var(--pk-back-2) 0 50%) 0 0 / 8px 8px;
  outline: 2px solid var(--pk-accent-2); outline-offset: -4px;
}
.pk .pk-card--mini.pk-card--back .pk-card__face::after { inset: 2px; background-size: 4px 4px; outline-width: 1px; outline-offset: -2px; }
.pk .pk-card--deal { animation: pk-deal 240ms steps(4, end) both; }
@keyframes pk-deal { from { transform: translateY(-14px); opacity: 0; } to { transform: none; opacity: 1; } }

/* Table art tones */
.pk .pk-table-art { display: block; }
.pk .pk-t-rail { fill: var(--pk-rail); }
.pk .pk-t-rail-hi { fill: var(--pk-rail-hi); }
.pk .pk-t-line { fill: var(--pk-line); }
.pk .pk-t-felt { fill: var(--pk-felt); }
.pk .pk-t-felt-dk { fill: var(--pk-felt-dk); }
.pk .pk-t-felt-hi { fill: var(--pk-felt-hi); }
```

- [ ] **Step 2: Bundle-check both entry components**

Run: `npx esbuild src/private/trainers/poker/ui/sprites/Card.jsx src/private/trainers/poker/ui/sprites/TableArt.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

- [ ] **Step 3: Run the full suite**

Run: `npm test`
Expected: PASS (these files are not imported by any test, so this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/private/trainers/poker/ui/sprites/PixelBitmap.jsx src/private/trainers/poker/ui/sprites/Card.jsx src/private/trainers/poker/ui/sprites/TableArt.jsx src/private/trainers/poker/ui/sprites/sprites.css
git commit -m "Add poker pixel card and table SVG components

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 14: Table picture: seats, board and pot

**Files:**
- Create: `src/private/trainers/poker/ui/table/Seat.jsx`
- Create: `src/private/trainers/poker/ui/table/Board.jsx`
- Create: `src/private/trainers/poker/ui/table/TableView.jsx`
- Create: `src/private/trainers/poker/ui/table/table.css` (all table page styles, including those used by Tasks 15–17)

**Interfaces:**
- Consumes: `Card`, `PixelBitmap`, `TableArt` (Task 13); `CHIP_GLYPH` (Task 10); `formatBb` (Task 1); `seatViews`, `tableCenter`, `streetKey`, `chipsToCollect` (Task 9).
- Produces:
  - `<TableView session={TableSession} />`: the table picture. It sweeps bets to the pot with `pk-fly` chips and removes each when its animation ends. Under reduced motion the flying chips are hidden.
  - `<Seat seat={SeatView} handNo={number} />` and the named export `<BetChips amount slot className? onAnimationEnd? />`.
  - `<Board board={number[]} pot={number} handNo={number} />`.
  - Styles for later tasks in `table.css`: `pk-tablepage*`, `pk-closed`, `pk-actions*`, `pk-sizing*`, `pk-btn--preset`, `pk-size-input`, `pk-banner*`, `pk-log*`, `pk-end*`.

Seat and bet positions are percentages of the table box (16:10, max 1080 px wide). The controller checks them in Task 18 and may nudge those numbers only.

- [ ] **Step 1: Write the components**

```jsx
// src/private/trainers/poker/ui/table/Seat.jsx
import Card from '../sprites/Card';
import PixelBitmap from '../sprites/PixelBitmap';
import { CHIP_GLYPH } from '../sprites/glyphs.js';
import { formatBb } from '../../lib/format.js';

/** Chips in front of a seat (or flying to the pot when `className` is pk-fly). */
export function BetChips({ amount, slot, className = '', onAnimationEnd }) {
  return (
    <div className={`pk-bet pk-bet--slot${slot} ${className}`.trim()} onAnimationEnd={onAnimationEnd}>
      <PixelBitmap rows={CHIP_GLYPH} px={2} className="pk-chip" />
      <span>{formatBb(amount)}</span>
    </div>
  );
}

function cardSize(isHero, card) {
  if (isHero) return 'hero';
  return card === null ? 'mini' : 'board';
}

function seatLabel({ name, stack, allIn, folded, isButton }) {
  const parts = [name, `${formatBb(stack)} BB`];
  if (allIn) parts.push('all-in');
  if (folded) parts.push('folded');
  if (isButton) parts.push('dealer');
  return parts.join(', ');
}

/** One seat tile from a SeatView (lib/tableView.js). */
export default function Seat({ seat, handNo }) {
  const { slot, isHero, tag, name, stack, bet, isButton, isActive, folded, allIn, cards, won } = seat;
  const classes = [
    'pk-seat',
    `pk-seat--slot${slot}`,
    isHero && 'pk-seat--hero',
    isActive && 'pk-seat--active',
    folded && 'pk-seat--folded',
    won > 0 && 'pk-seat--won',
  ].filter(Boolean).join(' ');

  return (
    <>
      <div className={classes} role="group" aria-label={seatLabel(seat)}>
        {cards && (
          <div className="pk-seat__cards">
            {cards.map((card, i) => (
              <Card key={`${handNo}-${i}-${card ?? 'back'}`} card={card} size={cardSize(isHero, card)} className="pk-card--deal" />
            ))}
          </div>
        )}
        <div className="pk-seat__tile" aria-hidden="true">
          {tag}
          {isButton && <span className="pk-dealer">D</span>}
        </div>
        <div className="pk-seat__name" aria-hidden="true">{name}</div>
        <div className="pk-seat__stack" aria-hidden="true">{allIn ? 'ALL-IN' : formatBb(stack)}</div>
        {won > 0 && <div className="pk-seat__won">+{formatBb(won)}</div>}
      </div>
      {bet > 0 && <BetChips amount={bet} slot={slot} />}
    </>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/Board.jsx
import Card from '../sprites/Card';
import { formatBb } from '../../lib/format.js';

const BOARD_SLOTS = [0, 1, 2, 3, 4];

/** Community cards (empty outlines for undealt ones) and the pot. */
export default function Board({ board, pot, handNo }) {
  return (
    <div className="pk-board">
      <div className="pk-board__cards" role="group" aria-label={board.length ? 'Board' : 'Board, no cards yet'}>
        {BOARD_SLOTS.map((i) => (i < board.length
          ? <Card key={`${handNo}-${board[i]}`} card={board[i]} className="pk-card--deal" />
          : <div key={`slot-${i}`} className="pk-card-slot" aria-hidden="true" />))}
      </div>
      {pot > 0 && <div key={`${handNo}-${pot}`} className="pk-pot">Pot {formatBb(pot)} BB</div>}
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/TableView.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableArt from '../sprites/TableArt';
import Seat, { BetChips } from './Seat';
import Board from './Board';
import { seatViews, tableCenter, streetKey, chipsToCollect } from '../../lib/tableView.js';
import './table.css';

// Bets swept off the table when a street closes; each flies to the pot and is removed when its animation ends.
function useFlyingChips(key, seats) {
  const prev = useRef(null);
  const [flying, setFlying] = useState([]);
  useEffect(() => {
    const swept = chipsToCollect(prev.current, { key, seats });
    prev.current = { key, seats };
    if (swept.length > 0) setFlying(swept.map((chip) => ({ ...chip, id: `${key}-${chip.slot}` })));
  }, [key, seats]);
  const landed = useCallback((id) => setFlying((list) => list.filter((chip) => chip.id !== id)), []);
  return [flying, landed];
}

/** The pixel table with seats, bets, board and pot. Pure rendering of a TableSession. */
export default function TableView({ session }) {
  const seats = useMemo(() => seatViews(session), [session]);
  const center = useMemo(() => tableCenter(session), [session]);
  const [flying, landed] = useFlyingChips(streetKey(session), seats);

  return (
    <div className="pk-table">
      <TableArt />
      {seats.map((seat) => <Seat key={seat.seat} seat={seat} handNo={center.handNo} />)}
      <Board board={center.board} pot={center.pot} handNo={center.handNo} />
      {flying.map((chip) => (
        <BetChips key={chip.id} amount={chip.amount} slot={chip.slot} className="pk-fly" onAnimationEnd={() => landed(chip.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Write the table page styles**

```css
/* src/private/trainers/poker/ui/table/table.css */
/* Table page: pixel table, seats, bets, board, action bar, log. Scoped under .pk. */

/* ---- table ---------------------------------------------- */
.pk .pk-table { position: relative; width: 100%; max-width: 1080px; aspect-ratio: 16 / 10; margin: 0 auto; font-size: 11px; }
.pk .pk-table .pk-table-art { position: absolute; left: 7%; top: 16%; width: 86%; height: 58%; }

/* Seats: anchored at the top center of each seat block. Slot 0 is the hero; 1-5 run clockwise. */
.pk .pk-seat { position: absolute; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center;
  gap: 3px; text-align: center; white-space: nowrap; }
.pk .pk-seat--slot0 { left: 50%; top: 62%; }
.pk .pk-seat--slot1 { left: 7%; top: 30%; }
.pk .pk-seat--slot2 { left: 24%; top: 0; }
.pk .pk-seat--slot3 { left: 50%; top: 0; }
.pk .pk-seat--slot4 { left: 76%; top: 0; }
.pk .pk-seat--slot5 { left: 93%; top: 30%; }
.pk .pk-seat__cards { display: flex; gap: 3px; min-height: 30px; align-items: flex-end; }
.pk .pk-seat--hero .pk-seat__cards { gap: 8px; }
.pk .pk-seat__tile { position: relative; width: 44px; height: 32px; background: var(--pk-rail-hi); display: flex;
  align-items: center; justify-content: center; font-size: 11px; }
.pk .pk-seat__name { font-size: 9px; color: var(--pk-muted); }
.pk .pk-seat__stack { font-size: 12px; color: var(--pk-accent); }
.pk .pk-seat__won { font-size: 12px; color: var(--pk-accent); }
.pk .pk-seat--active .pk-seat__tile { box-shadow: inset 0 0 0 3px var(--pk-accent); }
.pk .pk-seat--folded { opacity: 0.45; }
.pk .pk-seat--won .pk-seat__tile { animation: pk-bounce 600ms steps(3, end) 2; }
.pk .pk-dealer { position: absolute; right: -10px; top: -8px; width: 16px; height: 16px; display: flex; align-items: center;
  justify-content: center; background: var(--pk-card); color: var(--pk-black); font-size: 9px; }
@keyframes pk-bounce { 50% { transform: translateY(-6px); } }

/* Bets: centered on their point, between each seat and the board. */
.pk .pk-bet { position: absolute; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 4px; font-size: 11px; }
.pk .pk-chip { color: var(--pk-accent); }
.pk .pk-bet--slot0 { left: 50%; top: 57%; }
.pk .pk-bet--slot1 { left: 19%; top: 47%; }
.pk .pk-bet--slot2 { left: 31%; top: 27%; }
.pk .pk-bet--slot3 { left: 50%; top: 23%; }
.pk .pk-bet--slot4 { left: 69%; top: 27%; }
.pk .pk-bet--slot5 { left: 81%; top: 47%; }
.pk .pk-fly { animation: pk-fly 420ms steps(6, end) forwards; }
@keyframes pk-fly { to { left: 50%; top: 48%; opacity: 0; } }

/* Board and pot */
.pk .pk-board { position: absolute; left: 50%; top: 38%; transform: translate(-50%, -50%); display: flex; flex-direction: column;
  align-items: center; gap: 10px; }
.pk .pk-board__cards { display: flex; gap: 6px; }
.pk .pk-card-slot { width: 46px; height: 64px; outline: 2px dashed var(--pk-line); outline-offset: -2px; }
.pk .pk-pot { color: var(--pk-accent); font-size: 13px; animation: pk-bump 200ms steps(2, end); }
@keyframes pk-bump { 50% { transform: scale(1.15); } }

/* ---- page layout ---------------------------------------- */
.pk .pk-tablepage { display: grid; gap: 20px; padding-top: 12px; }
@media (min-width: 1200px) { .pk .pk-tablepage { grid-template-columns: minmax(0, 1fr) 280px; align-items: start; } }
.pk .pk-tablepage__main { display: flex; flex-direction: column; align-items: center; gap: 16px; min-width: 0; }
.pk .pk-tablepage__meta { width: 100%; max-width: 1080px; display: flex; justify-content: flex-end; }
.pk .pk-closed { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding-top: 32px; max-width: 60ch; }

/* ---- action bar ----------------------------------------- */
.pk .pk-actions { width: 100%; max-width: 1080px; min-height: 104px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.pk .pk-actions--waiting { justify-content: center; }
.pk .pk-actions__buttons { display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; }
.pk .pk-actions__buttons .pk-btn { min-width: 148px; padding: 12px 18px; font-size: 13px; }
.pk .pk-sizing { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 10px; }
.pk .pk-sizing__presets { display: flex; gap: 6px; }
.pk .pk-btn--preset { padding: 7px 10px; border-color: var(--pk-rail-hi); }
.pk .pk-sizing__field { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; }
.pk .pk-size-input { width: 6ch; font-family: var(--pk-font); font-size: 14px; text-align: right; color: var(--pk-text);
  background: var(--pk-bg); border: 3px solid var(--pk-accent); padding: 6px 8px; }

/* ---- banner, log, session end --------------------------- */
.pk .pk-banner { width: 100%; max-width: 1080px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
  gap: 12px; padding: 10px 14px; border: 3px solid var(--pk-accent); font-size: 12px; }
.pk .pk-banner p { margin: 0; }
.pk .pk-banner__actions { display: flex; gap: 8px; }
.pk .pk-log { background: var(--pk-rail); border: 3px solid var(--pk-rail-hi); font-size: 11px; }
.pk .pk-log__toggle { width: 100%; text-align: left; font-family: var(--pk-font); font-size: 12px; text-transform: uppercase;
  color: var(--pk-muted); background: none; border: 0; padding: 10px 12px; cursor: pointer; }
.pk .pk-log__toggle:focus-visible { outline: 2px solid var(--pk-text); outline-offset: -4px; }
.pk .pk-log__list { list-style: none; margin: 0; padding: 0 12px 12px; max-height: 420px; overflow-y: auto; display: flex;
  flex-direction: column; gap: 6px; line-height: 1.4; }
.pk .pk-log__hand { color: var(--pk-accent); }
.pk .pk-end { width: 100%; max-width: 1080px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px;
  padding: 20px; background: var(--pk-rail); border: 3px solid var(--pk-rail-hi); }
.pk .pk-end__stats { display: flex; gap: 32px; margin: 0; }
.pk .pk-end__stats dt { color: var(--pk-muted); font-size: 11px; }
.pk .pk-end__stats dd { margin: 4px 0 0; font-size: 20px; color: var(--pk-accent); }
.pk .pk-end__bots { margin: 0; padding-left: 18px; font-size: 12px; line-height: 1.8; }

@media (prefers-reduced-motion: reduce) {
  .pk .pk-fly { display: none; }
}
```

- [ ] **Step 3: Bundle-check and test**

Run: `npx esbuild src/private/trainers/poker/ui/table/TableView.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/private/trainers/poker/ui/table/Seat.jsx src/private/trainers/poker/ui/table/Board.jsx src/private/trainers/poker/ui/table/TableView.jsx src/private/trainers/poker/ui/table/table.css
git commit -m "Add poker table view with seats, bets, board, pot and chip sweep animation

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 15: Hero controls: action bar, sizing and keys

**Files:**
- Create: `src/private/trainers/poker/ui/table/useHeroControls.js`
- Create: `src/private/trainers/poker/ui/table/SizingPanel.jsx`
- Create: `src/private/trainers/poker/ui/table/ActionBar.jsx`

**Interfaces:**
- Consumes: `keyToCommand` (Task 3); `SIZING_CLOSED`, `sizingReducer`, `resolveRaise`, `PRESETS`, `callLabel`, `raiseLabel` (Task 2); `formatBb` (Task 1); the `heroTurn(session)` shape `{ view, legal, stack }` (Task 9); styles from `table.css` (Task 14).
- Produces:
  - `useHeroControls({ turn, turnKey, onAct }) → { sizing, dispatch }`. It registers the window `keydown` listener. Keys typed in any form field other than `.pk-size-input` are ignored. `turnKey` resets sizing whenever it changes. `dispatch(command)` takes the `keys.js` command objects. `fold` is ignored when checking is free.
  - `<ActionBar turn={...|null} sizing dispatch />` and `<SizingPanel sizing legal dispatch />`.

- [ ] **Step 1: Write the hook and components**

```js
// src/private/trainers/poker/ui/table/useHeroControls.js
import { useCallback, useEffect, useRef, useState } from 'react';
import { keyToCommand } from '../../lib/keys.js';
import { SIZING_CLOSED, sizingReducer, resolveRaise } from '../../lib/sizing.js';

const FIELD = 'input, textarea, select, [contenteditable="true"]';

/**
 * Sizing state, command dispatch and the table's keyboard shortcuts.
 * @param {{ turn: {view:object, legal:object, stack:number}|null, turnKey:string, onAct:(choice:object) => void }} args
 *   turnKey changes whenever a new decision starts, which closes the sizing panel.
 */
export function useHeroControls({ turn, turnKey, onAct }) {
  const [sizing, setSizing] = useState(SIZING_CLOSED);

  useEffect(() => {
    setSizing(SIZING_CLOSED);
  }, [turnKey]);

  const dispatch = useCallback((command) => {
    if (!turn) return;
    const { legal } = turn;
    if (command.type === 'fold') {
      // Folding when a free check is available is disabled.
      if (!legal.canCheck) onAct({ action: 'fold' });
    } else if (command.type === 'checkCall') {
      onAct({ action: legal.canCheck ? 'check' : 'call' });
    } else if (command.type === 'confirm') {
      const choice = resolveRaise(sizing, legal);
      if (choice) onAct(choice);
    } else {
      setSizing((current) => sizingReducer(current, command, turn));
    }
  }, [turn, sizing, onAct]);

  const latest = useRef(dispatch);
  latest.current = dispatch;

  useEffect(() => {
    const onKeyDown = (event) => {
      const { target } = event;
      const field = target instanceof Element ? target.closest(FIELD) : null;
      if (field && !field.classList.contains('pk-size-input')) return;
      const command = keyToCommand(event, { heroTurn: Boolean(turn), sizing: sizing.open });
      if (!command) return;
      event.preventDefault();
      latest.current(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [turn, sizing.open]);

  return { sizing, dispatch };
}
```

```jsx
// src/private/trainers/poker/ui/table/SizingPanel.jsx
import { useEffect, useRef } from 'react';
import { PRESETS } from '../../lib/sizing.js';
import { formatBb } from '../../lib/format.js';

/** Presets, the raise-to input (in BB) and cancel. Mounted only while sizing is open. */
export default function SizingPanel({ sizing, legal, dispatch }) {
  const input = useRef(null);

  // Focus and select on open, so typing a number replaces the suggested size.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const applyPreset = (index) => {
    dispatch({ type: 'preset', index });
    input.current?.focus();
  };

  return (
    <div className="pk-sizing">
      <div className="pk-sizing__presets">
        {PRESETS.map((preset, index) => (
          <button
            key={preset.key}
            type="button"
            className="pk-btn pk-btn--preset"
            data-hot
            aria-keyshortcuts={String(index + 1)}
            onClick={() => applyPreset(index)}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <label className="pk-sizing__field">
        <span className="pk-sr-only">{legal.raiseKind === 'bet' ? 'Bet' : 'Raise to'}, in big blinds</span>
        <input
          ref={input}
          className="pk-size-input"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={sizing.text}
          aria-describedby="pk-sizing-range"
          onChange={(e) => dispatch({ type: 'text', text: e.target.value })}
        />
        <span aria-hidden="true">BB</span>
      </label>
      <span id="pk-sizing-range" className="pk-muted">
        {formatBb(legal.minRaiseTo)} to {formatBb(legal.maxRaiseTo)} BB
      </span>
      <button type="button" className="pk-btn pk-btn--fold" data-hot aria-keyshortcuts="Escape" onClick={() => dispatch({ type: 'cancel' })}>
        Cancel <kbd>Esc</kbd>
      </button>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/ActionBar.jsx
import SizingPanel from './SizingPanel';
import { callLabel, raiseLabel, resolveRaise } from '../../lib/sizing.js';

/** Fold / check-call / bet-raise buttons for the hero. Keys are handled by useHeroControls. */
export default function ActionBar({ turn, sizing, dispatch }) {
  if (!turn) {
    return (
      <div className="pk-actions pk-actions--waiting">
        <p className="pk-muted">Waiting for the other players</p>
      </div>
    );
  }

  const { legal, stack } = turn;
  const pending = resolveRaise(sizing, legal);
  const raiseText = pending ? raiseLabel(legal, pending.amount) : (legal.raiseKind === 'bet' ? 'Bet' : 'Raise');

  return (
    <div className="pk-actions" role="group" aria-label="Your action">
      {sizing.open && legal.canRaise && <SizingPanel sizing={sizing} legal={legal} dispatch={dispatch} />}
      <div className="pk-actions__buttons">
        <button
          type="button"
          className="pk-btn pk-btn--fold"
          data-hot
          disabled={legal.canCheck}
          aria-keyshortcuts="F"
          onClick={() => dispatch({ type: 'fold' })}
        >
          Fold <kbd>F</kbd>
        </button>
        <button type="button" className="pk-btn pk-btn--call" data-hot aria-keyshortcuts="C" onClick={() => dispatch({ type: 'checkCall' })}>
          {callLabel(legal, stack)} <kbd>C</kbd>
        </button>
        {legal.canRaise && (
          <button
            type="button"
            className="pk-btn pk-btn--raise"
            data-hot
            aria-keyshortcuts={sizing.open ? 'Enter' : 'R'}
            onClick={() => dispatch(sizing.open ? { type: 'confirm' } : { type: 'openSizing' })}
          >
            {raiseText} <kbd>{sizing.open ? 'Enter' : 'R'}</kbd>
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Bundle-check and test**

Run: `npx esbuild src/private/trainers/poker/ui/table/ActionBar.jsx src/private/trainers/poker/ui/table/useHeroControls.js --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/private/trainers/poker/ui/table/useHeroControls.js src/private/trainers/poker/ui/table/SizingPanel.jsx src/private/trainers/poker/ui/table/ActionBar.jsx
git commit -m "Add poker hero action bar, sizing panel and keyboard controls

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 16: Action log, rebuy prompt and session end

**Files:**
- Create: `src/private/trainers/poker/ui/table/ActionLog.jsx`
- Create: `src/private/trainers/poker/ui/table/RebuyBanner.jsx`
- Create: `src/private/trainers/poker/ui/table/SessionEnd.jsx`

**Interfaces:**
- Consumes: `logLines` (Task 8); `seatName` (Task 9); `canRebuy`, `sessionSummary` (Task 6); `formatBb`, `formatNetBb` (Task 1); `BUY_IN` (Task 1); `getPersona` (`bots/personas.js`); styles from `table.css` (Task 14).
- Produces:
  - `<ActionLog session yourTurn={boolean} />`: a collapsible log of the current hand plus a polite `aria-live` region announcing the newest line and "Your turn".
  - `<RebuyBanner session onRebuy onGetUp />`: renders nothing when no prompt applies.
  - `<SessionEnd session />`: totals, opponents with style labels and a link back to the lobby.

- [ ] **Step 1: Write the components**

```jsx
// src/private/trainers/poker/ui/table/ActionLog.jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { logLines } from '../../lib/actionLog.js';
import { seatName } from '../../lib/tableView.js';

/** Collapsible log of the current hand, plus the aria-live region that announces each new line. */
export default function ActionLog({ session, yourTurn }) {
  const [open, setOpen] = useState(true);
  const list = useRef(null);
  const { hand } = session;

  const lines = useMemo(() => {
    if (!hand) return [];
    return logLines(hand.events, { nameOf: (seat) => seatName(session, seat), heroSeat: session.heroSeat });
  }, [session, hand]);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [lines, open]);

  const announcement = [lines.at(-1), yourTurn && 'Your turn'].filter(Boolean).join('. ');

  return (
    <aside className="pk-log" aria-label="Action log">
      <button
        type="button"
        className="pk-log__toggle"
        data-hot
        aria-expanded={open}
        aria-controls="pk-log-list"
        onClick={() => setOpen((value) => !value)}
      >
        Log {open ? '−' : '+'}
      </button>
      {open && (
        <ol id="pk-log-list" ref={list} className="pk-log__list">
          {hand && <li className="pk-log__hand">Hand #{hand.no}</li>}
          {lines.map((line, i) => <li key={`${hand.no}-${i}`}>{line}</li>)}
        </ol>
      )}
      <p className="pk-sr-only" aria-live="polite">{announcement}</p>
    </aside>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/RebuyBanner.jsx
import { canRebuy } from '../../lib/tableCore.js';
import { formatBb } from '../../lib/format.js';
import { BUY_IN } from '../../lib/constants.js';

/** Rebuy prompt: forced at 0 chips, offered under 40 BB, and a note while a rebuy is queued. */
export default function RebuyBanner({ session, onRebuy, onGetUp }) {
  const stack = session.seats.find((s) => s.seat === session.heroSeat).stack;
  const topUp = `${formatBb(BUY_IN)} BB`;

  if (session.phase === 'needsRebuy') {
    return (
      <div className="pk-banner" role="alert">
        <p>You&apos;re out of chips. Rebuy to {topUp} or get up.</p>
        <div className="pk-banner__actions">
          <button type="button" className="pk-btn pk-btn--raise" data-hot onClick={onRebuy}>Rebuy</button>
          <button type="button" className="pk-btn pk-btn--fold" data-hot onClick={onGetUp}>Get up</button>
        </div>
      </div>
    );
  }
  if (session.rebuyPending) {
    return <div className="pk-banner" role="status"><p>Rebuy queued: you top up to {topUp} after this hand.</p></div>;
  }
  if (!canRebuy(session)) return null;
  const when = session.phase === 'playing' ? 'after this hand' : 'now';
  return (
    <div className="pk-banner" role="status">
      <p>You&apos;re under 40 BB ({formatBb(stack)} BB). Rebuy to {topUp} {when}?</p>
      <div className="pk-banner__actions">
        <button type="button" className="pk-btn pk-btn--raise" data-hot onClick={onRebuy}>Rebuy</button>
      </div>
    </div>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/SessionEnd.jsx
import { Link } from 'react-router-dom';
import { getPersona } from '../../bots/personas.js';
import { sessionSummary } from '../../lib/tableCore.js';
import { formatNetBb } from '../../lib/format.js';

/** Shown after getting up: totals and the opponents' hidden style labels. */
export default function SessionEnd({ session }) {
  const { hands, net, rebuys } = sessionSummary(session, session.startedAt);
  const bots = session.seats.filter((s) => s.kind === 'bot').map((s) => getPersona(s.personaId));

  return (
    <section className="pk-end" aria-labelledby="pk-end-title">
      <h2 id="pk-end-title" className="pk-h2">Session over</h2>
      <dl className="pk-end__stats">
        <div><dt>Hands</dt><dd>{hands}</dd></div>
        <div><dt>Net</dt><dd>{formatNetBb(net)} BB</dd></div>
        <div><dt>Rebuys</dt><dd>{rebuys}</dd></div>
      </dl>
      <h3 className="pk-h3">Opponents at the table</h3>
      <ul className="pk-end__bots">
        {bots.map((p) => <li key={p.id}>{p.tag} &middot; {p.name} &middot; {p.style}</li>)}
      </ul>
      <p className="pk-muted">Sessions are not saved yet, so this session has no review.</p>
      <Link to="/me/poker" className="pk-btn pk-btn--raise" data-hot>Back to the lobby</Link>
    </section>
  );
}
```

- [ ] **Step 2: Bundle-check and test**

Run: `npx esbuild src/private/trainers/poker/ui/table/ActionLog.jsx src/private/trainers/poker/ui/table/RebuyBanner.jsx src/private/trainers/poker/ui/table/SessionEnd.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output.

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/private/trainers/poker/ui/table/ActionLog.jsx src/private/trainers/poker/ui/table/RebuyBanner.jsx src/private/trainers/poker/ui/table/SessionEnd.jsx
git commit -m "Add poker action log with live announcements, rebuy prompt and session end panel

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 17: Table page, session hook and route

**Files:**
- Create: `src/private/trainers/poker/lib/useTableSession.js`
- Create: `src/private/trainers/poker/ui/table/TableScreen.jsx`
- Create: `src/private/trainers/poker/ui/table/TablePage.jsx`
- Modify: `src/App.jsx` (table lazy import and route)

**Interfaces:**
- Consumes: `createLocalRunner` (`bots/runner.js`), `BOT_VERSION` (`bots/index.js`), `listPersonas` (`bots/personas.js`); `createSession` (Task 6); `createTableDriver`, `realScheduler` (Task 7); `foldHandIntoProfile` (Task 7); `parseTableConfig` (Task 4); `heroTurn` (Task 9); `PokerShell` (Task 11); `TableView` (Task 14); `ActionBar`, `useHeroControls` (Task 15); `ActionLog`, `RebuyBanner`, `SessionEnd` (Task 16).
- Produces:
  - `useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd }) → { session, act(choice), rebuy(), getUp() }`
  - `TablePage` (default export, `ui/table/TablePage.jsx`) with props `profile = null`, `onSessionStart = noop`, `onHandComplete = noop`, `onSessionEnd = noop` (contracts §4 and §4.1). Phase 4 Task 11 wraps this exact module path.
  - Route `/me/poker/table/:sessionId`.

- [ ] **Step 1: Write the session hook**

```js
// src/private/trainers/poker/lib/useTableSession.js
// React binding for the table driver: owns the BotRunner and driver for one mounted table.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalRunner } from '../bots/runner.js';
import { BOT_VERSION } from '../bots/index.js';
import { listPersonas } from '../bots/personas.js';
import { createSession } from './tableCore.js';
import { createTableDriver, realScheduler } from './tableDriver.js';
import { foldHandIntoProfile } from './profile.js';

/**
 * @param {{ id:string, config:{tableMode:'random'|'custom', speed:'fast'|'normal', lineup:object[]},
 *   profile:object|null, onSessionStart:(info:object) => void, onHandComplete:(record:object) => void, onSessionEnd:(summary:object) => void }} args
 * @returns {{ session:object|null, act:(choice:object) => void, rebuy:() => void, getUp:() => void }}
 */
export function useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd }) {
  const [session, setSession] = useState(null);
  const driverRef = useRef(null);
  const callbacks = useRef({ onSessionStart, onHandComplete, onSessionEnd });
  callbacks.current = { onSessionStart, onHandComplete, onSessionEnd };

  useEffect(() => {
    const runner = createLocalRunner({ rng: Math.random });
    const initial = createSession({
      id, tableMode: config.tableMode, lineup: config.lineup, startedAt: new Date().toISOString(),
    });
    const driver = createTableDriver({
      session: initial,
      runner,
      scheduler: realScheduler,
      rng: Math.random,
      personas: listPersonas(),
      botVersion: BOT_VERSION,
      speed: config.speed,
      profile,
      accumulateProfile: foldHandIntoProfile,
      onChange: setSession,
      onSessionStart: (info) => callbacks.current.onSessionStart(info),
      onHandComplete: (record) => callbacks.current.onHandComplete(record),
      onSessionEnd: (summary) => callbacks.current.onSessionEnd(summary),
    });
    driverRef.current = driver;
    setSession(initial);
    // Deferred so React StrictMode's development mount, unmount and remount starts only one session.
    const timer = setTimeout(() => driver.start(), 0);
    return () => {
      clearTimeout(timer);
      driver.abandon();
      runner.dispose();
      driverRef.current = null;
    };
    // One table per mount: TablePage keys this component by session id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const act = useCallback((choice) => {
    driverRef.current?.act(choice);
  }, []);
  const rebuy = useCallback(() => {
    driverRef.current?.rebuy();
  }, []);
  const getUp = useCallback(() => {
    driverRef.current?.getUp();
  }, []);

  return { session, act, rebuy, getUp };
}
```

- [ ] **Step 2: Write the screen and the page**

```jsx
// src/private/trainers/poker/ui/table/TableScreen.jsx
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import PokerShell from '../PokerShell';
import TableView from './TableView';
import ActionBar from './ActionBar';
import ActionLog from './ActionLog';
import RebuyBanner from './RebuyBanner';
import SessionEnd from './SessionEnd';
import { useHeroControls } from './useHeroControls';
import { useTableSession } from '../../lib/useTableSession.js';
import { heroTurn } from '../../lib/tableView.js';

const LOBBY = { to: '/me/poker', label: 'Lobby' };
const LEAVE_MESSAGE = 'Leave the table? The session ends now and the hand in progress is discarded.';

/** A running table session: the table, the hero's controls, the log and the end-of-session panel. */
export default function TableScreen({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd }) {
  const navigate = useNavigate();
  const { session, act, rebuy, getUp } = useTableSession({ id, config, profile, onSessionStart, onHandComplete, onSessionEnd });
  const turn = useMemo(() => (session ? heroTurn(session) : null), [session]);
  const turnKey = session?.hand ? `${session.hand.no}:${session.hand.events.length}` : '';
  const { sizing, dispatch } = useHeroControls({ turn, turnKey, onAct: act });
  const live = Boolean(session) && session.phase !== 'ended';

  useEffect(() => {
    if (!live) return undefined;
    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [live]);

  const onBack = (e) => {
    e.preventDefault();
    if (live && !window.confirm(LEAVE_MESSAGE)) return;
    navigate(LOBBY.to);
  };

  if (!session) {
    return (
      <PokerShell back={LOBBY} onBack={onBack}>
        <p className="pk-muted" role="status">Shuffling up</p>
      </PokerShell>
    );
  }

  const midHand = session.phase === 'playing';
  const getUpText = midHand ? 'Get up after this hand' : 'Get up';

  return (
    <PokerShell back={LOBBY} onBack={onBack}>
      <div className="pk-tablepage">
        <div className="pk-tablepage__main">
          <TableView session={session} />
          {session.phase === 'ended' ? (
            <SessionEnd session={session} />
          ) : (
            <>
              <RebuyBanner session={session} onRebuy={rebuy} onGetUp={getUp} />
              <ActionBar turn={turn} sizing={sizing} dispatch={dispatch} />
              <div className="pk-tablepage__meta">
                <button type="button" className="pk-btn pk-btn--fold" data-hot disabled={session.getUpPending} onClick={getUp}>
                  {session.getUpPending ? 'Leaving after this hand' : getUpText}
                </button>
              </div>
            </>
          )}
        </div>
        <ActionLog session={session} yourTurn={Boolean(turn)} />
      </div>
    </PokerShell>
  );
}
```

```jsx
// src/private/trainers/poker/ui/table/TablePage.jsx
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import PokerShell from '../PokerShell';
import TableScreen from './TableScreen';
import { listPersonas } from '../../bots/personas.js';
import { parseTableConfig } from '../../lib/lineup.js';

const noop = () => {};

/**
 * Route: /me/poker/table/:sessionId. The lobby passes { tableMode, lineup, speed } as router state.
 * Session callbacks (contracts §4) default to no-ops and `profile` (contracts §4.1) to null;
 * Phase 4 wires persistence and the loaded profile through them.
 */
export default function TablePage({ profile = null, onSessionStart = noop, onHandComplete = noop, onSessionEnd = noop }) {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  // Read once: the router state is cleared below so a reload cannot restart the same session id.
  const [config] = useState(() => parseTableConfig(location.state, listPersonas()));

  useEffect(() => {
    if (location.state) navigate(location.pathname, { replace: true, state: null });
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!config) {
    return (
      <PokerShell back={{ to: '/me/poker', label: 'Lobby' }}>
        <div className="pk-closed">
          <h1 className="pk-title">Table closed</h1>
          <p className="pk-muted">This table is no longer running. Sessions are not saved yet, so a reloaded table cannot be resumed.</p>
          <Link to="/me/poker" className="pk-btn pk-btn--raise" data-hot>Back to the lobby</Link>
        </div>
      </PokerShell>
    );
  }

  return (
    <TableScreen
      key={sessionId}
      id={sessionId}
      config={config}
      profile={profile}
      onSessionStart={onSessionStart}
      onHandComplete={onHandComplete}
      onSessionEnd={onSessionEnd}
    />
  );
}
```

- [ ] **Step 3: Bundle-check the page**

Run: `npx esbuild src/private/trainers/poker/ui/table/TablePage.jsx --bundle --format=esm --jsx=automatic --packages=external --outdir=node_modules/.cache/pk-check --log-level=warning`
Expected: exits 0 with no output. (`lib/profile.js` uses `import.meta.glob`, which only Vite implements. esbuild leaves it alone in ESM output, and the build in Step 5 checks it for real.)

- [ ] **Step 4: Add the table route**

In `src/App.jsx`, add the lazy import directly below the `PokerLobbyPage` import from Task 11:

```jsx
const PokerTablePage = lazy(() => import('./private/trainers/poker/ui/table/TablePage'));
```

Then insert this route directly after the `/me/poker` route and still before `/me/:trainer`:

```jsx
      <Route
        path="/me/poker/table/:sessionId"
        element={<RequireAuth>{() => <Suspense fallback={privateFallback}><PokerTablePage /></Suspense>}</RequireAuth>}
      />
```

- [ ] **Step 5: Run the full suite and the build**

Run: `npm test`
Expected: PASS.

Run: `npm run build`
Expected: `✓ built`, with `TablePage-*.js` and `TablePage-*.css` chunks in the output and only the existing chunk-size warning.

- [ ] **Step 6: Commit**

```bash
git add src/private/trainers/poker/lib/useTableSession.js src/private/trainers/poker/ui/table/TableScreen.jsx src/private/trainers/poker/ui/table/TablePage.jsx src/App.jsx
git commit -m "Add playable poker table page with session hook and /me/poker/table route

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 18: Final verification (controller)

**Files:** none are created. Fixes found here go through a new implementer task with the failing check quoted.

- [ ] **Step 1: Full suite and build**

Run: `npm test`
Expected: PASS, including the 95 new tests from Tasks 1–10 (format 8, sizing 16, keys 6, lineup 9, handRecord 5, tableCore 17, tableDriver 12, profile 2, actionLog 4, tableView 9, sprites 7).

Run: `npm run build`
Expected: success with only the existing 500 kB chunk-size warning.

- [ ] **Step 2: Check the scope of the branch**

Run: `git diff --name-only feat/poker...HEAD`
Expected: only paths under `src/private/trainers/poker/lib/` (none under `lib/persistence/`), `src/private/trainers/poker/ui/`, plus `src/App.jsx` and `src/private/PrivateHome.jsx`. No `wa.geo.json`, `engine/` or `bots/` paths.

Run: `git grep -n -e "--pk-" -- src ":!src/private/trainers/poker/ui"`
Expected: no matches (the tokens exist only in poker stylesheets).

- [ ] **Step 3: Manual browser checks**

Run `npm run dev`, sign in and work through the list. Record pass or fail for each item.

1. **Entry and routes.** `/me` lists Poker under Trainers, and it opens `/me/poker`. `/me/zetamac` and `/me/optiver` still work. `/me/poker?tab=stats` shows "No stats yet" with the sentence that stats arrive after sessions are saved.
2. **Isolation.** On `/me/poker` the Network panel shows the Silkscreen stylesheet. On `/` it does not, and the public pages look unchanged.
3. **Lobby.** Sit down (random) opens `/me/poker/table/<uuid>` with 5 distinct bots. The table builder refuses a duplicate persona (the option is disabled) and sits down a custom table with the chosen names in the chosen seats (seat 1 on the left, then clockwise). The speed radio changes bot pacing.
4. **Look (spec §8.3).** Midnight Indigo colors, a pixel superellipse table with a stepped rail, a betting line and dithering, Silkscreen text, notched cards with a hard shadow, the redrawn spade, a 10 drawn 5 wide, bigger hero cards, card backs as an indigo checker with a light-blue border. Fold is outlined in muted, call in light blue, raise filled gold. The active seat has a gold outline and the dealer button shows "D".
5. **Keyboard.** On your turn: `C` checks or calls. `F` folds, and it is disabled when checking is free. `R` opens sizing at the minimum raise with the number selected. Type `12` and press `Enter` to raise to 12 BB. `3` opens sizing at ⅔ pot, `4` at pot, `5` all-in. `↑`/`↓` move by 0.5 BB, and with Shift by 5 BB, clamped to the shown range. `Esc` closes sizing. Keys do nothing while bots act. Tab reaches every button.
6. **Sizing math.** First to act preflop with 100 BB: pot (`4`) shows 3.5, ⅓ (`1`) shows 2.0.
7. **Motion.** Cards slide in on the deal, bets fly to the pot when a street ends, and the winner's tile bounces. With DevTools → Rendering → "prefers-reduced-motion: reduce", none of these animate and no chips stay stuck on the felt.
8. **Accessibility.** The accessibility tree shows board and hero cards labelled like "Ace of hearts" and seats labelled with name, stack and status. A screen reader (or the live region's text in DevTools) announces each action and "Your turn".
9. **Session loop.** Hands continue on their own. The button moves one seat clockwise each hand. The log restarts with "Hand #n" and shows blinds, your cards, actions, board, showdown reveals and winners. A folded bot's cards disappear, and bot cards appear only at showdown.
10. **Rebuy.** Below 40 BB a gold banner offers a rebuy (between hands: "Rebuy to 100.0 BB now?"; mid-hand: "after this hand?", which then shows "Rebuy queued"). Rebuying sets your stack to exactly 100.0 BB. Losing everything stops the table with "You're out of chips" and Rebuy / Get up.
11. **Bust refill.** When a bot busts, its seat shows a different persona with 100.0 BB at the next hand (this may take a few hands with the placeholder random bots).
12. **Get up.** Pressed mid-hand, the button reads "Leaving after this hand" and the session-over panel appears when the hand ends. Pressed between hands, the panel appears at once, showing hands, net BB, rebuys and the five opponents with their style labels.
13. **Leaving.** Mid-session, the Lobby link asks for confirmation, and closing or reloading the tab triggers the browser's leave prompt. After a reload the page shows "Table closed" with a link back to the lobby.
14. **Callbacks (temporary check, do not commit).** In `src/App.jsx`, temporarily render `<PokerTablePage onSessionStart={console.log} onHandComplete={console.log} onSessionEnd={console.log} />`. Play two hands and get up. The console shows one session start `{ id, startedAt, botVersion: 'placeholder', tableMode, lineup (seats 1–5), heroSeat: 0 }`, one HandRecord per hand with `v: 1`, `handNo` 1 and 2, the same `sessionId`, `lineup` without seat 0 and integer `heroNet`/`pot`, and one end `{ id, endedAt, hands: 2, net, rebuys }`. In development (StrictMode) there is still exactly one session start. Revert the temporary change with `git checkout src/App.jsx`.
15. **Console.** No React key warnings or errors while playing, apart from `console.warn` lines about bot fallbacks, which should not appear with the placeholder bots.
