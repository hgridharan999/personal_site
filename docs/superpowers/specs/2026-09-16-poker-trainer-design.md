# Poker Trainer: 6-max No-Limit Hold'em vs. Trained Bots — Design

**Date:** 2026-09-16
**Status:** Approved in brainstorming, pending spec review
**Scope:** A private poker trainer under `/me/poker`. You play cash-game sessions against five adaptive bots, every hand is stored, and every one of your decisions is graded to power a session review and a long-term leak tracker.

## 1. Goals and non-goals

**Goals**
- Play 6-max No-Limit Hold'em cash sessions against bots that are genuinely strong, measured by a benchmark gate rather than asserted.
- Bots that adapt to your tendencies across hands and sessions.
- A session review that grades each decision on the information available at the time, with a step-by-step hand replayer.
- A leak tracker across all sessions: tendencies against winning ranges, top leaks ranked by BB lost, and skill trends that are not dominated by luck.
- A pixel-art, Balatro-inspired look in a dark "Midnight Indigo" palette.
- An engine designed so a real-time multiplayer server (friends at the same table) can reuse it later without a rewrite.

**Non-goals (v1)**
- Live hints or a coach panel during play.
- Multiplayer with other humans (designed for, built later).
- Mobile layout or touch controls. Desktop and keyboard-first only.
- Tournaments, bankroll carried between sessions, or stake levels.
- Drill modes for specific spots, and LLM-written explanations.
- Limit, Omaha, or any variant other than No-Limit Hold'em.

## 2. Decisions

| Topic | Decision |
|---|---|
| Format | 6-max No-Limit Hold'em, you and 5 bots |
| Session | Cash game: sit down with 100 BB, play any number of hands, rebuy to 100 BB when below 40 BB (prompted), leave any time. Result is net BB |
| Blinds | 0.5 / 1 BB, no ante. All amounts are tracked in BB with 0.5 BB as the smallest unit. Fractional sizes (e.g., ⅓ pot) round to the nearest legal 0.5 BB |
| Opponents | Random lineup by default; optional custom table built seat by seat |
| Bot behavior | Adaptive: bots exploit your tracked tendencies |
| Coaching | Post-session review plus long-term leak tracker. No live hints |
| Platform | Laptop/desktop, keyboard-first, mouse supported |
| Architecture | Everything runs in the browser (engine, bots and analysis in a Web Worker). Training runs offline in Node. The server only stores data |
| Language | JavaScript + JSX with JSDoc types, matching the existing trainers |
| Visual style | Midnight Indigo palette, pixel-art table, hand-drawn pixel suits and ranks, Silkscreen font |

## 3. Architecture

```
Browser (lazy /me/poker chunk)                                Vercel functions                   Neon Postgres
┌──────────────────────────────────────────┐                ┌───────────────────────────────┐   ┌─────────────────┐
│ UI (table, review, replayer, stats)      │  POST hands ─► │ api/trainers/poker/sessions.js│ ─►│ poker_sessions  │
│   │ postMessage                          │  via outbox    │ api/trainers/poker/hands.js   │ ─►│ poker_hands     │
│   ▼                                      │                │ api/trainers/poker/profile.js │ ◄─│ poker_decisions │
│ pokerWorker: bot decide() + hand grading │ ◄─ GET ─────── │ api/trainers/poker/stats.js   │   └─────────────────┘
│ engine (pure, seeded)                    │                └───────────────────────────────┘
└──────────────────────────────────────────┘                  every handler: verifySession() + Zod
Offline (Node): scripts/poker/train.js → data/bots-vN.json ; scripts/poker/benchmark.js (ship gate)
```

The engine is pure, with no DOM, network or clock, and deterministic given a seed. A later multiplayer server runs the same engine authoritatively and sends the same action events.

## 4. Engine (`src/private/trainers/poker/engine/`)

- **Deck and RNG:** 52-card deck, shuffled with the existing injectable RNG (`core/rng.js`). The hand seed is stored, so any hand can be re-dealt exactly.
- **Hand state as an event log:** a hand is the sequence `deal → post_sb → post_bb → (fold | check | call | bet | raise | all_in)* per street → showdown → award`. `handState(events)` reduces the log into the current state: stacks, committed chips, pots, whose turn it is, legal actions and minimum/maximum raise sizes. The same log is what gets stored, replayed and, later, sent over the network.
- **Rules:**
  - The button rotates each hand. The small and big blind post automatically.
  - A minimum raise must be at least the size of the last full bet or raise. An all-in for less than a full raise does not reopen the betting to players who have already acted.
  - Side pots are built from each player's committed chips. Split pots divide evenly, and any odd 0.5 BB goes to the first winner left of the button.
  - Uncalled bets are returned. Hands that end without a showdown do not reveal cards.
- **Evaluator:** a compact 7-card evaluator (perfect-hash tables of a few hundred KB at most, generated or imported at module load), fast enough for about 10M evaluations per second in V8. No 100 MB lookup tables.
- **Stacks and rebuys:** players who bust are removed before the next hand. A bot seat that busts is refilled with a fresh bot from the same lineup rules. You are prompted to rebuy when under 40 BB and must rebuy (or leave) at 0.

## 5. Bots (`src/private/trainers/poker/bots/`)

**Interface:** `decide(state, seat, ctx) → { action, sizeBb }`, where `ctx` carries the bot's persona dials, the hand history so far and your adaptive profile. Each "brain" implements this one interface, so a stronger brain (e.g., a CFR blueprint shipped as data) can replace the heuristic brain without touching anything else.

**Heuristic brain (v1)**
1. **Preflop:** position-based charts from published solver outputs (open, facing an open, facing a 3-bet, facing a 4-bet, squeeze, blind defense), stored as frequency tables in `data/preflop/`. Persona dials widen or tighten these ranges and shift mixed frequencies.
2. **Range tracking:** each opponent starts from their positional preflop range. Every action reweights the range using the likelihood that a player of their observed type takes that action with each hand class.
3. **Postflop:** Monte Carlo equity of the bot's hand against the weighted ranges of the live opponents (time-boxed, with a ~300 ms budget), combined with pot odds, estimated fold equity, board texture (wetness, paired, monotone), stack-to-pot ratio and the number of opponents. Bet sizes come from a small menu (⅓, ½, ¾, pot, all-in). The bluff-to-value ratio at each size follows `bluff share = bet / (pot + 2·bet)`, and calling frequency respects minimum defense frequency, adjusted by persona.
4. **Personas:** 20–40 numeric dials (preflop looseness per position, aggression, c-bet frequency, bluff multiplier, call thresholds, sizing preferences, trap frequency). Each shipped persona is a trained dial set with a name, a three-letter tag and a hidden style label shown after the session (e.g., `DCH · Duchess · tight-aggressive`).
5. **Adaptation:** when you sit down, the bots receive your profile (section 6.4). During play the profile updates hand by hand. Once a stat has at least 30 relevant observations, bots shift dials toward the exploit. Examples: fold-to-c-bet above range → c-bet bluff more; fold to river bet below range → value bet thinner and bluff less; VPIP far above range → isolate wider for value. Shifts are capped so bots never become trivially exploitable themselves.
6. **Pacing:** decisions run in the worker, followed by a humanized delay (fast: 250–600 ms, normal: 600–1800 ms, longer for big decisions).

**Training (`scripts/poker/train.js`, Node)**
- Evolutionary search over the dial vectors: a population of 50 plays 6-max tables with rotated seats and duplicate deals (the same cards replayed with the seats permuted, to cancel luck). The top performers by BB/100 are kept, mutated and recombined, and the loop runs until improvement stalls.
- Diversity is preserved by keeping the best dial set within each style niche (tight/loose × passive/aggressive), so the shipped personas are all strong but play differently.
- Output: `src/private/trainers/poker/data/bots-vN.json` with the persona dial sets, the training date, the number of hands and benchmark results.

**Benchmark gate (`scripts/poker/benchmark.js`, `npm run poker:benchmark`)**
A new `bots-vN` ships only if all of these hold, using duplicate deals and at least 200,000 hands per matchup:
- Every persona beats each baseline bot (calling station, raw-equity bot, tight-passive, random-legal) with the lower bound of the 95% confidence interval for BB/100 above 0.
- The new version as a group beats the previous shipped version, with the lower bound of the 95% confidence interval above 0 (skipped for v1).
- No persona loses to a fixed exploit probe (always 3-bet, always c-bet, always overbet river), again judged by the 95% confidence interval.
- A manual playtest of at least 300 hands by the user finds no obvious exploit.

## 6. Sessions and storage

### 6.1 Lifecycle
1. **Sit down.** The client generates a session UUID and sends `POST /api/trainers/poker/sessions` with the bot version, lineup and table mode. It loads `GET /api/trainers/poker/profile`. If the network is down, play continues and the session row is queued in the outbox.
2. **Each hand.** When a hand ends, the worker grades your decisions. `{hand, decisions[]}` is added to the existing outbox (`lib/outbox.js`), which retries until saved.
3. **Get up.** `PATCH /api/trainers/poker/sessions?id=` closes the session with totals, then the review opens. A session left open (tab closed) is closed on the next load of `/me/poker`, using its last saved hand time and totals recomputed from saved hands.

### 6.2 Tables (`db/migrations/NNN_poker.sql`)

```sql
CREATE TABLE poker_sessions (
  id           uuid PRIMARY KEY,                 -- generated by the client
  bot_version  text NOT NULL,                    -- e.g. 'bots-v1'
  table_mode   text NOT NULL CHECK (table_mode IN ('random','custom')),
  lineup       jsonb NOT NULL,                   -- [{seat, personaId}]
  started_at   timestamptz NOT NULL,
  ended_at     timestamptz,                      -- NULL while open
  hands        int NOT NULL DEFAULT 0,
  net_bb       numeric(10,1) NOT NULL DEFAULT 0,
  allin_adj_bb numeric(10,1) NOT NULL DEFAULT 0, -- net with all-in luck removed
  rebuys       int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE poker_hands (
  id             uuid PRIMARY KEY,
  session_id     uuid NOT NULL REFERENCES poker_sessions(id) ON DELETE CASCADE,
  hand_no        int NOT NULL,
  seed           text NOT NULL,
  played_at      timestamptz NOT NULL,
  button_seat    int NOT NULL,
  hero_seat      int NOT NULL,
  hole_cards     jsonb NOT NULL,                 -- all seats, including unrevealed bot cards
  board          text NOT NULL,                  -- e.g. 'AhKs9dTc2h' (may be shorter)
  actions        jsonb NOT NULL,                 -- the full event log
  pot_bb         numeric(10,1) NOT NULL,
  hero_net_bb    numeric(10,1) NOT NULL,
  hero_allin_ev_bb numeric(10,1),                -- NULL unless hero was all-in before the river with a call
  showdown       boolean NOT NULL,
  UNIQUE (session_id, hand_no)
);
CREATE INDEX poker_hands_session ON poker_hands (session_id, hand_no);

CREATE TABLE poker_decisions (
  hand_id          uuid NOT NULL REFERENCES poker_hands(id) ON DELETE CASCADE,
  idx              int NOT NULL,                 -- index into the hand's action log
  street           text NOT NULL CHECK (street IN ('preflop','flop','turn','river')),
  position         text NOT NULL CHECK (position IN ('UTG','HJ','CO','BTN','SB','BB')),
  spot             text NOT NULL,                -- e.g. 'pf.open', 'pf.vs_3bet', 'river.facing_bet.oop'
  action           text NOT NULL,
  size_bb          numeric(10,1),
  pot_bb           numeric(10,1) NOT NULL,
  to_call_bb       numeric(10,1) NOT NULL,
  equity           real,                         -- vs weighted ranges; NULL preflop
  needed_equity    real,                         -- pot odds; NULL when nothing to call
  recommended      jsonb NOT NULL,               -- {action, sizeBb, evByOption: {...}}
  ev_loss_bb       real NOT NULL,
  grade            text NOT NULL CHECK (grade IN ('good','inaccuracy','mistake','blunder')),
  confident        boolean NOT NULL,
  analysis_version int NOT NULL,
  PRIMARY KEY (hand_id, idx)
);
CREATE INDEX poker_decisions_spot ON poker_decisions (spot);
```

- All hole cards are stored. The review hides unrevealed cards by default, with a "reveal all" toggle.
- `seed` plus `actions` make every hand exactly reproducible. `analysis_version` allows later re-grading of old hands.

### 6.3 API (`api/trainers/poker/`, Vercel Node functions, ESM)
Every handler calls `verifySession()` (401 otherwise), validates with Zod, sets `Cache-Control: no-store`, and returns errors as `{ error, code, details? }`.
- `POST sessions`: creates a session, idempotent on `id`.
- `PATCH sessions?id=`: closes a session with `{endedAt, hands, netBb, allinAdjBb, rebuys}`.
- `POST hands`: body `{ hands: [{hand, decisions[]}] }`, max 50 hands per batch and 40 decisions per hand. Inserts are idempotent on hand `id` (`ON CONFLICT DO NOTHING`, and decisions are inserted only for newly inserted hands, as in the existing sessions endpoint). A hand whose session row does not exist yet is rejected with `SESSION_NOT_FOUND`, and the outbox retries it after the session row is flushed.
- `GET sessions?id=`: session plus its hands and decisions, for the review.
- `GET profile`: your tendency stats (6.4).
- `GET stats`: leak tracker data (7.3).
- `vite.api-dev.js` already supports nested paths. No change is needed beyond the new files.

### 6.4 Adaptive profile
Computed on request from your most recent 2,000 decisions (no separate table). Per stat it returns a value and the number of opportunities:
VPIP, PFR, 3-bet, fold to 3-bet, c-bet (flop, turn), fold to c-bet (flop, turn), check-raise, WTSD, W$SD, aggression frequency, fold to river bet, river bet frequency, split by in/out of position where it is meaningful.

## 7. Analysis and coaching

### 7.1 Grading (`analysis/`, runs in the worker after each hand)
Grades use only the information available to you at the time of the decision.
- **Preflop:** the decision's spot is looked up in the preflop charts. An action the chart takes at least 20% of the time is `good`. Otherwise the EV loss is estimated from the chart's EV table where available, falling back to the postflop method with rollouts.
- **Postflop:** for each legal option (fold, check/call, bet/raise at ⅓, ½, ¾, pot, all-in), the EV is estimated with Monte Carlo rollouts: opponents' weighted ranges, and their responses drawn from their persona model, with a budget of up to about 2 s per hand in the worker. The best option becomes `recommended`, and `ev_loss_bb = EV(best) − EV(chosen)`.
- **Grade by EV loss as a share of the pot before the decision:** good < 3%, inaccuracy 3–10%, mistake 10–25%, blunder > 25%.
- **Confidence:** `confident = false` when the top two options differ by less than the Monte Carlo standard error, or when the dominant opponent's range has more than 60% of combos live with near-uniform weight. Non-confident grades show as "debatable" and are excluded from leak aggregation.
- **Explanations** (`analysis/explain.js`) are template-based with real numbers, keyed by spot and error type. For example: "You called 24 into 30. You needed 34% equity and had about 21% against a range of top pair or better. Folding loses nothing; calling cost about 5.1 BB."
- **All-in adjustment:** when you are all-in before the river with a call, the hand also stores your equity-share EV (`hero_allin_ev_bb`), which is used for the all-in-adjusted BB.

### 7.2 Session review (`/me/poker/session/:id`)
- **Summary:** hands, net BB, all-in-adjusted net BB, EV lost per 100 decisions, count by grade.
- **Costliest 5 decisions,** each linking to its hand.
- **Hand list** with filters: mistakes only, big pots (> 30 BB), showdowns, position.
- **Opponents:** each seat's persona name and style label, revealed after the session.

### 7.3 Hand replayer (`/me/poker/hand/:id`)
The pixel table replays the event log step by step (←/→ keys, play/pause). Your decisions show the grade, recommended action, EV by option and the explanation. A "reveal all" toggle shows unrevealed hole cards.

### 7.4 Leak tracker (Stats tab on `/me/poker`)
`GET stats` returns:
- `tendencies`: each profile stat overall and by position, with a target range for winning 6-max play (stored in `data/targets.js`) and a flag for below, in or above range.
- `leaks`: EV loss from confident decisions grouped by `spot`, ranked by BB lost per 100 hands, shown only for spots with at least 15 decisions, each with up to 5 example hand IDs.
- `trend`: per session, net BB/100, all-in-adjusted BB/100 and EV lost per 100 decisions.
- `focus`: the top leak with a plain-language description, linking to the hand list filtered to that spot.
Every panel has loading, empty ("play about 200 hands to unlock leaks") and error states, and reuses the existing SVG charts and `Kpi` tiles.

## 8. UI

### 8.1 Routes (all behind `RequireAuth`, all `React.lazy`)
- `/me/poker`: lobby with **Play** and **Stats** tabs (`?tab=stats`).
- `/me/poker/table/:sessionId`: the table.
- `/me/poker/session/:id`: session review.
- `/me/poker/hand/:id`: hand replayer.

`/me/poker` must take precedence over the generic `/me/:trainer` route in `src/App.jsx`. The Trainers section on `/me` lists Poker.

### 8.2 Screens
- **Lobby:** **Sit down** (random table), **Build a table** (choose a persona per seat), bot speed (fast/normal), recent sessions with net BB and review links.
- **Table:** 6 seats around the pixel table (hero at bottom center). Each seat shows its tag, name, stack, bet chips and the dealer button. The board and pot sit in the middle, with a collapsible action log on the side and action buttons below.
  - Keys: `F` fold, `C` check/call, `R` raise (focuses the sizing), `1–5` = ⅓, ½, ⅔, pot, all-in, `↑/↓` adjust by 0.5 BB (Shift = 5 BB), typing a number sets the size, `Enter` confirms, `Esc` cancels sizing.
  - A rebuy prompt when under 40 BB. **Get up** is available between hands (and ends the session after the current hand if pressed mid-hand).
- **Motion:** cards slide in on the deal, chips move to the pot, the winner's seat bounces. Everything is disabled under `prefers-reduced-motion`.
- **Accessibility:** DOM + CSS + inline SVG (no canvas). Cards have `aria-label`s (e.g., "Ace of hearts"), actions are announced via an `aria-live` region, and all controls are reachable by keyboard.

### 8.3 Visual tokens (Midnight Indigo)
Defined as CSS custom properties scoped to the poker pages:

| Token | Value | Use |
|---|---|---|
| `--pk-bg` | `#0a0a14` | page background |
| `--pk-rail` / `--pk-rail-hi` | `#1a1b2b` / `#26283d` | table rail, seat tiles |
| `--pk-felt` / `--pk-felt-dk` / `--pk-felt-hi` | `#23265a` / `#1d2050` / `#2c3068` | felt and dithering |
| `--pk-line` | `#343a7a` | betting line |
| `--pk-card` | `#eeeae0` | card face |
| `--pk-red` / `--pk-black` | `#ff5f6d` / `#14142a` | suits and ranks |
| `--pk-accent` | `#f5c451` | pot, stacks, primary (raise) button, active seat |
| `--pk-accent-2` | `#8fa8ff` | call button, card-back border |
| `--pk-text` / `--pk-muted` | `#dcdcf0` / `#6a6c8c` | text |
| `--pk-back` / `--pk-back-2` | `#3b3f8a` / `#2a2d66` | card-back checker |

- **Font:** Silkscreen (pixel) for all table text.
- **Table:** pixel art on a 120×56 grid (superellipse shape, stepped rail, inner betting line, checkerboard dithering toward the edges), rendered as SVG with `shape-rendering: crispEdges` and stretched to the table area.
- **Cards:** notched 3 px pixel corners with a hard offset shadow. Ranks are 3×5 bitmap glyphs (10 is 5×5) at 3 px per pixel on board cards and 4 px on hero cards. Suits are 9-wide bitmaps. The corner suit and the lower-right suit are drawn at 2 px (board) or 3 px (hero). The final spade is the redrawn version (pointed top, rounded lobes with a notch, flared stem) approved in brainstorming.
- **Buttons:** fold is outlined in muted, call is outlined in accent-2, raise is filled with the accent.

## 9. File layout

```
src/private/trainers/poker/
  engine/     deck.js, rules.js, pots.js, handState.js, evaluator.js (+ .test.js each)
  bots/       brain.js, preflop.js, ranges.js, equity.js, personas.js, adapt.js, baselines.js
  analysis/   spots.js, evOptions.js, grade.js, explain.js, allinEv.js
  worker/     pokerWorker.js, workerClient.js (typed message protocol)
  data/       preflop/*.json, bots-v1.json, targets.js
  ui/         table/, review/, replayer/, stats/, sprites/ (suits, ranks, table SVG), poker.css
  lib/        payload.js (Zod-matching serializers), useTableSession.js
scripts/poker/  train.js, benchmark.js
api/trainers/poker/  sessions.js, hands.js, profile.js, stats.js
db/migrations/NNN_poker.sql
```

New npm scripts: `poker:train`, `poker:benchmark`.

## 10. Testing

- **Engine:**
  - Unit cases for blinds, button rotation, min-raise, short all-in not reopening betting, side pots with 3+ all-ins, split pots with odd chips, uncalled bet return.
  - A seeded property test over 100,000 random hands with random legal actions: chips are conserved, every action is legal and every hand terminates.
- **Evaluator:** a reference file of hands with known rankings, plus category counts over all 133,784,560 seven-card hands, run as an opt-in slow test.
- **Bots:** only legal actions over 10,000 random states, determinism under a fixed seed, and `decide` within its time budget.
- **Analysis:** a golden set of hand-built spots with known correct actions and grade bands, and explanation templates rendered for every spot type.
- **API:** Zod payload round-trip tests, idempotent duplicate hand inserts, `SESSION_NOT_FOUND` ordering, 401 without a session.
- **Outbox:** existing tests extended for poker payload shapes.
- **Benchmark gate:** section 5.

## 11. Build phases

Each phase gets its own implementation plan and ends in something usable.
1. **Engine + evaluator:** fully tested, no UI.
2. **Table UI + baseline bots:** a full local session with the pixel look and keyboard controls, nothing saved.
3. **Real bots:** preflop charts, ranges, equity, personas, adaptation hooks, training script, benchmark gate, `bots-v1.json`.
4. **Persistence:** migration, API, outbox integration, session lifecycle, adaptive profile endpoint wired into bots.
5. **Analysis:** grading in the worker, session review, hand replayer.
6. **Leak tracker:** Stats tab.
7. *(Later, separate spec)* Multiplayer server running the same engine.

## 12. Risks

- **Bot strength falls short of "actually good."** Mitigated by the benchmark gate and the pluggable brain interface. The fallback is an offline-computed CFR blueprint for preflop and common flop spots, shipped as data.
- **Grading accuracy in multiway pots.** Mitigated by the confidence flag and by excluding debatable grades from leaks.
- **Worker compute on slower laptops.** Monte Carlo is time-boxed, so strength degrades gracefully rather than stalling the table.
- **Preflop chart licensing.** Charts must come from sources whose terms permit reuse, or be generated by our own offline solver run.
