# Mental-Math Trainers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a faithful Zetamac trainer and an Optiver 80-in-8 trainer under `/me`. Every game is stored in Neon Postgres, with progress, weak-spot, speed and readiness statistics, plus Zetamac targeted drills.

**Architecture:** Game logic is pure, unit-tested JS in `src/private/trainers/` (generators, exact rational grading, stats math). Games post finished sessions through a localStorage outbox to Vercel functions in `api/trainers/`, which validate with Zod and write to Postgres. Stats pages read aggregates from SQL and render hand-written SVG charts. All trainer UI is lazy-loaded behind the existing `RequireAuth`.

**Tech Stack:** React 18, react-router-dom 7, Vite 6.4, Vercel Node functions (ESM), `@neondatabase/serverless` 1.1.0, `zod` 4.6.5, `vitest` 5.0.0 (Node ≥ 22.12).

**Spec:** `docs/superpowers/specs/2026-09-14-trainers-design.md`. Read it before starting any task.

## Global Constraints

- JavaScript (`.js`/`.jsx`), matching the repo. No TypeScript files.
- Styling uses the existing `.asc` tokens in `src/ascent/ascent.css` (`--bone`, `--muted`, `--faint`, `--line`, `--line-2`, `--amber`, `--mono`, `--display`, `--serif`, `--ease`). Trainer CSS goes in `src/private/trainers/trainers.css`, with classes prefixed `trn-`.
- Every `api/trainers/*` handler calls `verifySession(req, authConfig())` first and returns `401 { error, code: 'UNAUTHORIZED' }` on failure. Set `Cache-Control: no-store`. Errors use `{ error, code, details? }`.
- Server-only env: `DATABASE_URL`. Never prefix it with `VITE_`.
- Zetamac rules exactly as in spec §2. Optiver rules as in spec §2 and §5 (80 questions, 480000 ms, +1/−1/0, no skip, hidden timer, typed answers, exact rational grading).
- Never use floating point to decide correctness. Answers are BigInt rationals (`core/rational.js`).
- Generators take an injected `rng: () => number` in `[0,1)`. Production passes `Math.random`, and tests use `mulberry32(seed)`.
- Timing uses `performance.now()`. Timestamps sent to the server are ISO strings from `new Date().toISOString()`.
- Tests sit next to their source as `*.test.js`. `npm test` runs `vitest run`.
- Stats always filter on trainer + `mode` + `config_key`.
- Commit after every task. Commit messages end with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Never stage the unrelated user changes in `src/ascent/*` or `.claude/`; stage explicit paths only.
- Quality gate at the end: `npm test` and `npm run build` both pass.

## Shared data shapes (used across tasks)

```js
// Attempt: one question inside a game (client → API → attempts table)
{
  idx: 0,                    // int ≥ 0
  qtype: 'z.mul',            // 'z.add'|'z.sub'|'z.mul'|'z.div'|'o.int.add'|'o.int.sub'|'o.int.mul'|'o.int.div'|'o.dec.addsub'|'o.dec.mul'|'o.dec.div'|'o.frac.of'|'o.frac.addsub'|'o.frac.muldiv'
  factKey: 'mul:7x83',       // string | null
  prompt: '7 × 83',
  answer: '581',             // canonical answer string
  response: '581',           // string | null
  isCorrect: true,
  timeMs: 2140,              // int | null (null = unfinished/unreached)
  corrections: 0,            // int ≥ 0 (Optiver: always 0)
}

// Session payload: POST /api/trainers/sessions body
{
  session: {
    id: '<uuid v4 from crypto.randomUUID()>',
    trainer: 'zetamac' | 'optiver',
    mode: 'standard' | 'custom' | 'drill',
    config: { /* zetamac options or optiver rules */ },
    configKey: '<64 hex chars>',
    profileVersion: 1 | null,
    startedAt: '2026-09-14T18:00:00.000Z',
    durationMs: 120000,
    correct: 41, wrong: 0, unanswered: 0, score: 41,
  },
  attempts: [ /* Attempt[] , max 1000 */ ],
}
```

## File map

| File | Responsibility | Task |
|---|---|---|
| `vitest.config.js`, `package.json` (scripts, deps) | test runner + deps | 1 |
| `src/private/trainers/core/rational.js` | exact BigInt rationals, parse, format | 1 |
| `src/private/trainers/core/rng.js` | seeded RNG + sampling helpers | 2 |
| `src/private/trainers/core/stats.js` | median, percentile, std dev, rolling avg, trend/week | 2 |
| `src/private/trainers/core/configKey.js` | canonical JSON + SHA-256 key | 3 |
| `src/private/trainers/zetamac/generator.js` | port of Zetamac generators, defaults, validation | 4 |
| `src/private/trainers/zetamac/tracker.js` | per-problem input tracking (time, corrections) | 5 |
| `src/private/trainers/optiver/profile-v1.js` | difficulty profile v1 templates | 6 |
| `src/private/trainers/optiver/generator.js` | builds 80-question tests from a profile | 6 |
| `src/private/trainers/optiver/grade.js` | parse typed answers, grade, score | 7 |
| `db/migrations/001_trainers.sql`, `scripts/migrate.js`, `api/_lib/db.js` | schema + migration runner + DB client | 8 |
| `api/_lib/trainerSchemas.js`, `api/_lib/http.js`, `api/trainers/sessions.js` | validation, handler helpers, save/read games | 9 |
| `api/trainers/stats.js`, `api/trainers/drill.js`, `vite.api-dev.js` | aggregates, weak facts, nested dev routes | 10 |
| `src/private/trainers/lib/api.js`, `lib/outbox.js` | fetch wrappers, durable retrying outbox | 11 |
| `src/App.jsx`, `src/private/PrivateHome.jsx`, `src/private/trainers/TrainerPage.jsx`, `trainers.css` | routes, hub links, Play/Stats tabs | 12 |
| `src/private/trainers/zetamac/ZetamacSetup.jsx`, `ZetamacGame.jsx`, `ZetamacResults.jsx`, `ZetamacPlay.jsx` | Zetamac UI | 13 |
| `src/private/trainers/optiver/OptiverGame.jsx`, `OptiverResults.jsx`, `OptiverPlay.jsx` | Optiver UI | 14 |
| `src/private/trainers/stats/charts/*.jsx` | SVG charts | 15 |
| `src/private/trainers/stats/ZetamacStats.jsx`, `OptiverStats.jsx`, `GameDetail.jsx`, `useStats.js` | stats pages | 16 |
| `src/private/trainers/zetamac/drill.js` + drill hookup | targeted drills | 17 |
| — | end-to-end verification | 18 |

## Phases

1. [01-core.md](01-core.md) — Tasks 1–3: test runner, rationals, RNG + stats math, config key
2. [02a-zetamac-logic.md](02a-zetamac-logic.md) — Tasks 4–5: Zetamac generator and tracker
   [02b-optiver-logic.md](02b-optiver-logic.md) — Tasks 6–7: Optiver profile and generator, grading and scoring
3. [03a-backend-sessions.md](03a-backend-sessions.md) — Tasks 8–9: schema, migrations, sessions API
   [03b-backend-stats.md](03b-backend-stats.md) — Task 10: fact helpers, stats and drill APIs, nested dev routes
4. [04a-client-plumbing.md](04a-client-plumbing.md) — Tasks 11–12: API client, durable outbox, routes, Play/Stats shell
   [04b-game-uis.md](04b-game-uis.md) — Tasks 13–14: Zetamac UI, Optiver UI
5. [05a-stats-ui.md](05a-stats-ui.md) — Tasks 15–16: SVG charts, stats pages, game detail
   [05b-drills-verify.md](05b-drills-verify.md) — Tasks 17–18: targeted drills, end-to-end verification

Tasks run in numeric order. Exceptions: Phase 3 (Tasks 8–10) depends only on Tasks 1–2 and may run in parallel with Phase 2, and Task 10 also needs Task 2's `core/stats.js`.
