# Nightly: design

Date: 2026-11-12. Source: Hari's PRD "Nightly: PRD for harigridharan.com" (Nov 11, 2026; its
substance is reproduced where it matters below), plus the conversation of 2026-11-12. Branch
`feat/nightly` in worktree `C:/Users/hgrid/jp-nightly`, based on `origin/main` 09662f3 (site v2,
Kilimanjaro ending). Local `main` is stale; do not branch from it.

Marked **[call]** = a decision made by Claude during design, not by Hari. Everything else is from the
PRD or Hari directly. Reviewed by a builder check and an architecture review; their findings are
folded in.

## 1. Intent

A private page, `/nightly`, that runs a nightly wind-down: read a short factual brief, answer three
thinking questions, write a three-to-five-sentence take, lock it, get graded, then optionally publish
the take to a public `/notes` feed. Goals (PRD): keep critical thinking sharp, build consulting
skills, produce raw material for one essay a week.

The four rules that keep the thinking Hari's own are hard requirements:

1. **Facts first.** The brief reports what happened and never says why it matters.
2. **Lock before feedback.** No model output about the answers appears until submit, and submit is
   irreversible.
3. **The model grades, Hari writes.** No model call ever drafts, edits or rewrites the take or the
   answers.
4. **Summarize and link.** Each story is described in original wording with its source URL.

Success for this build: Hari runs one real session end to end in production, and the "Next" and
"Later" features can be added afterwards without reshaping the data.

## 2. Scope of this build

In (PRD "Tonight" rows, plus the entrance Hari asked for in conversation):

- Private room: `/nightly` behind the passcode, not linked from navigation, not indexed.
- Brief generation once a day, saved to the database.
- Answer form: three answer fields + a take field, one submit, lock on submit.
- Grading: 1 to 5 per answer with one line of reasoning, one follow-up question, and a blind take.
- Publish: mark a take public so it shows on `/notes` with its date. Skip leaves it private.
- The hidden entrance on the homepage (section 6). Hari asked for it now, ahead of the PRD's "Next"
  slot.

Non-goals for this build (PRD "Next"/"Later"): daily games UI, missed-night marking and the public
"Missed" entry, makeup questions, streaks, the door's dark state, forecast log and Brier score,
history, weekly essay, editable niche-interest list, money stake. The data model is built ready for
them (section 4).

Anti-goals (would make this a failure even if it works):

- Model output about the answers reaching the browser before submit.
- Any way to change a submitted answer or take, or a published take.
- The homepage showing that a private page exists: a visible hint, a nav or sitemap entry, a focus
  stop, a crawlable link, or anything derived from private data.
- Breaking the homepage tests or the Kilimanjaro band's behaviour.

## 3. Architecture

Existing stack, no new frameworks: Vite + React 18 SPA, react-router v7, Vercel serverless functions
in `api/` (Node 22, ESM, plain JS), Neon Postgres via `@neondatabase/serverless` over HTTP, zod v4,
vitest (node environment). New dependency: `@anthropic-ai/sdk`.

### Functions (Vercel Hobby cap is 12; main has 8; `api/_lib/functionCount.test.js` enforces it)

The PRD's seven routes collapse into **two** functions, total 10 **[call]**.

| File | Called by | Actions |
|---|---|---|
| `api/nightly.js` | the `/nightly` and `/notes` pages | `?action=` `today` (GET), `generate` (POST), `submit` (POST), `grade` (POST), `publish` (POST), `notes` (GET, **public**) |
| `api/nightly-cron.js` | Vercel cron only | GET; bearer-token check; generates tonight's brief |

The cron gets its own plain path because Vercel's docs don't say whether a cron `path` may carry a
query string. `vite.api-dev.js` already maps `/api/<name>` to `api/<name>.js` and fills `req.query`,
so `?action=` works in dev and on Vercel. Shared logic lives in `api/_lib/nightly/*` (dates, type
picker, brief, grading, queries, schemas).

Follow the existing endpoint pattern (`api/trainers/poker/sessions.js`): a factory
`createNightlyHandler({ getSql, auth, model, now })` with `export default createNightlyHandler()`, so
tests inject `mockSql` (`api/_lib/testing.js`), a fake model client and a fixed clock. Errors go
through `sendError` (`{ error, code, details? }`). Dispatch through **one action table** of
`{ method, auth }` per action, so auth can't be skipped by accident. Every action except `notes`
requires `verifySession`. `guard()` in `api/_lib/http.js` currently always requires auth; give it
an option to skip auth, used only by `notes` **[call]**.

**Time limit.** Both functions need up to 300s (Hobby with Fluid compute). Configure it in
`vercel.json` `"functions": { "api/nightly*.js": { "maxDuration": 300 } }`, which is the documented
route for non-Next projects. Confirm on the first deploy that the limit applied (`routes.test.js`
only pins `rewrites`, so adding the block is safe).

**Cron secret.** If `CRON_SECRET` is missing or shorter than 16 characters, return 500 and generate
nothing (otherwise the header `Bearer undefined` would pass). Compare the header with the
hash-then-`timingSafeEqual` approach already in `api/_lib/session.js`. Test with the variable unset.

### Passcode **[call]**

Reuse the existing site session (`api/_lib/session.js`: cookie `hg_session`, env `ADMIN_PASSWORD` +
`SESSION_SECRET`, httpOnly, SameSite=Strict, 7 days) rather than adding a second passcode. Hari is the
only user and already uses this login for `/me`. On the client, wrap `/nightly` in the existing
`RequireAuth` (signed-out visitors go to `/login`, which returns them to `/nightly` via
`state.from`), inside `PrivateShell`, which sets the robots meta to `noindex, nofollow`. **Do not add
`/nightly` to `robots.txt`**: that file is public and would name the page. The PRD's "check it in
middleware" becomes "check it in the function", since this isn't Next.js.

How hidden is hidden **[call]**: the same bar as the existing `/me` area. Nothing on the page
reveals it, and nothing links to it with an `href`. The route string in the JS bundle, and the
public `notes` action's name, are acceptable.

### The night and its date

- All dates are America/New_York. A **night's date** is the Eastern calendar date of the evening it
  belongs to; a night runs until 3am Eastern the next morning (PRD).
- Compute it with one helper: read the Eastern wall-clock date and hour via `Intl`; if the hour is
  before 3, step back one calendar day. Do not subtract three hours from an instant; that gives the
  wrong night on both DST changeover days. Test across both DST days and around midnight and 3am.
- The cron uses this same helper, never the UTC date: it fires at 01:xx UTC, when the Eastern date is
  still the previous day.
- Read `date` columns as `date::text`. The Neon driver turns `date` into a JS Date at UTC midnight,
  which an Eastern browser would show as the previous day.
- Cron schedule `0 1 * * *` UTC (PRD): ready by 9pm EST in winter and 10pm EDT in summer. Hobby may
  fire it anywhere in the hour, never retries it, and occasionally delivers it twice.

### Session lifecycle

Status values: `generating` → `generated` → `submitted` → `grading` → `graded`; `complete` and
`missed` are reserved for the "Next" features and are never set by this build.

The database client is Neon over HTTP, whose `sql.transaction([...])` is a fixed batch: it can't
read and then branch. So every state change is **one conditional SQL statement** that only succeeds
from the expected state (a CTE where several rows change). A statement that touches zero rows means
the state was wrong, and the action returns 409.

- **generate** (cron, or the "Generate now" button): claim the night first with
  `INSERT ... (date, status='generating', generation_started_at=now()) ON CONFLICT (date) DO UPDATE ... WHERE status='generating' AND generation_started_at < now() - interval '6 minutes' RETURNING id`.
  - If the claim fails, another run owns the night: return 202 "in progress", and the client polls
    `today`.
  - If generation fails, delete the claim row so the button works again.
  - A stale claim (from a run killed at the time limit) is reclaimable after 6 minutes.
  - On success, one UPDATE fills stories, niche and questions and sets `generated`.
  - This pays for at most one brief per night, even when the cron and the button overlap.
- **submit**: takes the session id. One CTE moves the session from `generated` to `submitted`, but
  only if the session's date equals the current night (from the date helper), and inserts the three
  answers and the take from the same CTE.
  - Zero rows → 409. A 3:01am submit of the previous night is rejected; the page shows "This night
    closed" and keeps the draft so nothing is lost.
  - Validated with zod: each answer non-empty, the take non-empty, the story index valid. The 3-to-5
    sentence target is guidance in the UI, not enforced **[call]**.
- **grade**: a conditional UPDATE claims the session (`submitted` → `grading`, setting
  `grading_started_at`), with the same 6-minute stale-lease rule.
  - It runs the grader and the blind take as two separate model calls, then writes the scores,
    feedback, model take and follow-up, setting `graded` and `graded_at`, again gated on
    `status='grading'`.
  - On failure it sets the status back to `submitted` and records `grade_error`; the page offers
    Retry.
  - The client calls `grade` right after `submit` succeeds. A refresh mid-grade shows "Grading…"
    rather than Retry, so the grade can't run twice.
- **publish**: only from `graded`. Sets `published = true`, `published_at = now()`. Skip does
  nothing. Publishing is one-way; unpublish is out of scope (PRD).
- **today** (GET): returns tonight's session. **Until status is `graded`, the response must not
  include any grading field**: no score, feedback, model take or follow-up, not even as nulls.
  Build the response from an explicit allow-list per status, and test it.

Immutability is enforced in the database too: a trigger in the migration rejects changes to
`answers.answer`, `answers.prompt`, `takes.body` and `takes.story_index` after insert, and any
update to a take once `published` is true **[call]**.

## 4. Data model

New migration `db/migrations/004_nightly.sql` (plain SQL, `NNN_name.sql`, applied with
`npm run db:migrate`), plus a text-assertion test like `api/_lib/pokerMigration.test.js`. Every id
defaults to `gen_random_uuid()`. The PRD's five tables are all created now, with the `nightly_`
prefix to stay clear of the trainer tables **[call]**.

| Table | Fields | Notes |
|---|---|---|
| `nightly_sessions` | id, date date unique, stories jsonb, niche jsonb, questions jsonb, status text, generation_started_at, grading_started_at, grade_error text, submitted_at, graded_at, completed_at, created_at | status check: generating, generated, submitted, grading, graded, complete, missed. Check: `status IN ('generating','missed') OR (stories, niche and questions are not null)`, so a missed night with no brief can be stored later. |
| `nightly_answers` | session_id fk, idx smallint 0..2, question_type text, prompt text, answer text, score smallint check 1..5 null, feedback text, submitted_at | primary key (session_id, idx). Three rows per session. Makeup nights (Next) will need more than three, so check `idx >= 0` only, not `<= 2` **[call]**. |
| `nightly_takes` | id, session_id fk unique, story_index smallint, body text, model_take text, follow_up text, published bool default false, published_at | `/notes` reads published rows |
| `nightly_forecasts` | id, session_id fk, claim, probability numeric check 0..1, resolve_by date, outcome bool null, resolved_at | unused this build |
| `nightly_game_results` | id, session_id fk, game text, score numeric, logged_at; unique (session_id, game) | unused this build |

JSON shapes, validated with zod when the model returns them and again when read back:

- `stories`: array of 3 `{ headline, summary, url, source }`
- `niche`: `{ topic, headline, summary, url, source }`
- `questions`: array of 3 `{ type, story_index, prompt }`; `type` is one of the nine, all three
  distinct.

## 5. Question types and model calls

### The nine types (PRD, verbatim)

Store these as constants (`api/_lib/nightly/types.js`). The example prompt guides the model's
wording; it is not used as-is.

| Key | Type | Trains | Example prompt |
|---|---|---|---|
| second_order | Second-order effects | Thinking past the headline | Who quietly wins or loses if this plays out? |
| incentives | Incentives | Reading motives | Why is this company doing this now? |
| find_flaw | Find the flaw | Skepticism | What is the weakest claim in this announcement? |
| forecast | Forecast | Calibration | Give a probability and a date for the outcome. |
| base_rates | Base rates | The outside view | How often does this kind of deal or launch work? |
| estimate | Estimate | Quantitative sense | Size the one number that matters, by hand. |
| decide | Decide | Judgment under constraints | You run this company. What do you do tomorrow? |
| compress | Compress | Clarity | Explain the story in one sentence to an outsider. |
| case_rep | Case rep | Consulting structure | Build the issue tree for this company's problem. |

All answers use the same textarea. The grader judges the answer against what the type trains (for
example, a case rep is judged on the structure of its issue tree, and a compress on whether one
sentence would land with an outsider) **[call]**.

**Type picker (in code, not in the model) [call]:** before calling the model, pick three distinct
types at random. The week is a calendar week, Monday to Sunday, Eastern. Count case reps in this
week's sessions that have a brief (any status past `generating`). If the remaining nights this week,
including tonight, are only just enough to reach two, force a case rep in. This is a pure function
of (night date, this week's question types), tested in isolation.

### Model setup

- Key: `ANTHROPIC_API_KEY` env var. Hari has API credits; this does not use his Claude plan. Call the
  API only from server code, and never log or return the key.
- Model: `claude-sonnet-5-5` for all three calls **[call]**, in one constant. Cost is about $0.25 a
  night for the brief and 1 to 2 cents for grading.
- Load the `claude-api` skill before writing this code and follow its current guidance; it
  supersedes anything here that conflicts.
- **Time budget:** pass one deadline (an `AbortSignal`) through every call in a request. Allow at
  most one retry for any reason, and only if more than about 90s of the 300s remain. Set the SDK
  client to `maxRetries: 1` with a timeout of 120s or the remaining budget, whichever is less.
- **Handle in our code:** `pause_turn` (re-send with the assistant content appended), `refusal`,
  `max_tokens`, schema-validation failure, and in-band web-search errors (which arrive with HTTP
  200).

### Brief generator

- Tool: the web search server tool (current version per the skill), `max_uses` about 8.
- **Output:** Sonnet 5.5 rejects forced `tool_choice`, and structured outputs conflict with
  web-search citations. So define a client tool `submit_brief` with `strict: true` and the full
  schema, leave `tool_choice: auto`, and tell the model to call it once at the end. If it doesn't,
  make one no-tools formatting call with structured output.
- **URL check:** every story and niche URL must appear among the URLs in that run's web-search
  results. If any doesn't, reject the brief (and retry within the budget), so made-up links never
  reach the page.
- **Prompt rules (PRD):**
  - The three business or tech stories from the last 24 hours with the **largest consequences, not
    the most coverage**.
  - One niche item from the interests list.
  - Two or three sentences of fact each, in original wording, with the source URL.
  - **No analysis, predictions or opinion.**
  - Prompts for the three given types, each tied to one story.
- **Niche item (Hari: "anything interesting in a field I don't usually think about"):**
  - **Field list [call]:** a constant list of about 30 fields far from Hari's usual ground, in
    `api/_lib/nightly/interests.js`. Examples: materials science, linguistics, archaeology,
    mycology, maritime shipping, epidemiology, typography, soil science, astronomy, urban planning,
    music theory, insurance, cartography, beekeeping, glassmaking. His usual ground (business,
    tech, startups, VC and climate, consulting, hiking and mountains, poker) is excluded, and the
    prompt says so.
  - **Rotation:** code picks tonight's field and passes it to the model, skipping fields used in the
    last 14 nights (stored in `niche.topic`).
  - **What counts as the item:** something from roughly the last week to month that would surprise
    an outsider, written to the same facts-first rules.
  - An editable list comes "Later".

### Grader (in grade)

- Sees the stories, the questions, Hari's three answers **and the take** **[call]**: the take
  starts from something Hari saw or did firsthand, and that's what the PRD's "follow-up question
  only the writer could answer" needs.
- Scores each answer 1 to 5 **on the quality of reasoning, not on agreement with any view**, with
  one line naming the biggest gap.
- The take itself is not scored (PRD: a score per answer).
- Writes one follow-up question.
- Never rewrites or improves the text.
- Has no tools, so it uses structured output directly.

### Blind take (in grade, separate call)

- Receives **the chosen story only**: never the take, the answers or the grader's output.
- Writes three to five sentences with a committed view.
- The take form has a story picker, stored as `takes.story_index`, so the blind take covers the same
  story **[call]**.
- Test: assert the built request contains no answer or take text.

### Failure behaviour

- **Brief fails:** the claim row is deleted, and `/nightly` shows "No brief yet" with a Generate now
  button and the error.
- **Grading fails:** the submission stays locked, status returns to `submitted`, and the page offers
  Retry.

## 6. The hidden entrance: the door

Hari's words: "a little lift of a couple lines in the shape of a small door in the bottom left of the
kilimanjaro animation."

### What it looks like **[call, interpreting Hari's line]**

- At rest: nothing.
- On hover, a few thin lines rise out of the front plains lines of the drawing and stand up as a
  small doorway. Two jambs draw upward from the ground line, then a lintel (or shallow arch) joins
  them across the top. About 200 to 300ms in total, and the cursor becomes a pointer.
- On un-hover they settle back down.
- Stroke weight and colour match the front plains lines (about 1px, ochre `#AA9254`), so it reads as
  the drawing coming to life, not a widget on top.
- Roughly 14 to 18px wide by 22 to 28px tall, inside a 48px hit area.

### Behaviour (PRD)

- **Click** opens `/nightly` through `navigate()`. It is not an `<a href>`, so there's no crawlable
  link. `/nightly` still asks for the passcode via `/login` when signed out.
- **Touch:** the first tap plays the lift; a second tap within a few seconds opens the page; a tap
  elsewhere resets it.
- **Hidden:** no visible hint at rest, no nav or sitemap entry, no keyboard focus stop, no
  accessible name. It's decoration, like the rest of the band.
- **Reduced motion:** no lift. On hover the door is simply there, fully drawn.
- **Lit/dark:** always lit in this build. The dark state comes with the missed-night features. When
  it does, the homepage reads only one lit/dark boolean, nothing else.
- **Build:** an inline SVG with CSS transitions (`stroke-dashoffset` for the lift). No new library,
  no keyframes.

### Placement and the existing code (`src/home/kili/`)

- **Where it lives:** render the door **inside `.kili-band`**, tagged `data-kili="door"`.
  - The band is already `aria-hidden`.
  - The band is `display: none` when the terrain fails to load, which hides the door too.
  - The band stays blank until the drawing lazy-loads, so the door can't be found before the
    mountain exists.
- **How it's positioned:** in JS by `createLabels().place()` in `labels.js`, from `layout.sx0` (the
  stage's left edge) and the front line's y, the same way the legend is placed on the right.
  - CSS percentages or a CSS `max()` formula won't match. The stage width is
    `min(width - 96, 1180)` centred (`terrain.js:85-86`), and the drawing has a fixed pixel height
    (290/330/360px).
  - The door's foot sits on the front plains line, near the stage's left edge. On desktop that's in
    the drawing's faded left edge; on phones it's on full-strength lines. Check that it reads in
    both.
- **Pointer events:** the existing labels are `pointer-events: none` (a test enforces it). The door
  is the one element that takes pointer events; adjust that test to exempt exactly
  `data-kili="door"`.
- **Rules from `kili.test.js` and `homeCss.test.js` to respect:**
  - The component lives in `src/home/kili/`.
  - Every kili.css selector starts with `.hm`. No `@keyframes` or `:root`, and no `.kili` selectors
    in `home.css`.
  - Every class a kili component uses is defined in kili.css, and every `kili-*` class is used.
  - No `motion-` substring anywhere in kili files, and no em dashes.
  - All door transitions go inside the reduced-motion block that ends kili.css. No
    `transition: opacity` before it.
  - The band markup still starts with `<div className="kili-band" ref={bandRef} aria-hidden="true"`.
  - HomePage still matches `<NextClimb />` `</main>` `<KiliEnding />`.
  - Hover styles go behind `@media (hover: hover) and (pointer: fine)`.

## 7. Pages

### `/nightly` (private)

Lazy-loaded like the other private pages, inside `RequireAuth` + `PrivateShell`, styled with
`src/private/private.css` (`.prv-*`; add a textarea style, since none exists yet). One page that
follows the session's status:

1. **No session or `generating`:** "No brief yet" + Generate now, or "Generating…" while it polls
   (up to a few minutes).
2. **generated:**
   - the brief: three stories + the niche item, each with its source link;
   - the three questions with their type labels and three answer textareas;
   - a story picker and the take textarea;
   - one Submit with a confirm step ("This locks your answers").
3. **submitted / grading:** the answers and take, read-only, with "Grading…" or Retry.
4. **graded:**
   - each answer with its score and one line;
   - Hari's take and the blind take side by side;
   - the follow-up question;
   - Publish to /notes, or Skip.

Every fetch gets loading, empty and error states. Drafts are kept in `localStorage` (keyed by night
date) until submit, so a refresh or a closed night doesn't lose them **[call]**.

### `/notes` (public)

- Built on the site v2 pattern: `src/site/NotesPage.jsx` on `<SiteShell>`.
  - Add it to `ROUTED` in `src/site/structure.test.js`.
  - Add `notes` to `LIGHT_PATH` in `src/site/lightRoutes.js` and to the pre-paint regex in
    `index.html`, or it flashes dark.
  - `SubShell` and `AscentTheses` are not routed in site v2, and tests forbid them.
- Published takes, newest first. Each shows its date, the take, and the headline + source link of
  the story it answers **[call]**.
- The `notes` action returns only those columns (date as text, body, headline, url), only from
  published rows, with a limit. It never returns `model_take` or `follow_up`.
- Not in the nav or sitemap yet; it stays unlisted until it has a week of entries (PRD open
  question) **[call]**. Indexable.
- Empty state for zero takes.

## 8. Environment and deploy

- **New env vars** (names only; never print values): `ANTHROPIC_API_KEY`, `CRON_SECRET` (16+
  characters). Existing: `DATABASE_URL`, `ADMIN_PASSWORD`, `SESSION_SECRET`.
- **Docs:** add the new names to `.env.example`, and add a "Nightly" section to `DEPLOYMENT.md`
  covering the env vars, the migration, the cron, and that Fluid compute must be on.
- **`vercel.json`:** add `"crons": [{ "path": "/api/nightly-cron", "schedule": "0 1 * * *" }]` and the
  `functions` maxDuration block.
- **Before the first real session**, Hari sets the two new env vars in Vercel, and the migration runs
  against the production Neon database. Previews share the production database unless Neon branching
  is on.

## 9. Testing (quality gate: tests, lint, build all pass)

vitest runs in node, with no jsdom or testing-library. Logic goes in pure modules that are tested
directly; React components stay thin.

- **Handler auth and methods:** every action except `notes` returns 401 without a session; `notes`
  works without one; 405s; zod 400s.
- **State changes:** the second submit is a 409; submit of a closed night is a 409; grade only from
  `submitted`; publish only from `graded`; a stale lease can be reclaimed.
- **No early leaks:** `today` before `graded` has no grading fields (the allow-list test), and
  `notes` returns only whitelisted columns.
- **Cron:** 401 without the token; 500 when `CRON_SECRET` is unset or short; a second run while
  generating returns 202 and costs no second model call.
- **Pure helpers:**
  - night date across both DST days, midnight and 3am;
  - type picker: three distinct types, and the case-rep rule;
  - niche field rotation skips fields used in the last 14 nights;
  - URL verification rejects an unseen URL;
  - the blind-take request contains no answer or take text;
  - the deadline skips retries when time is short.
- **Migration:** a text test, plus the immutability trigger present. The function count stays at or
  under 12.
- **Homepage:** the kili and home tests stay green, with the one pointer-events exemption; add tests
  for the door's markup and CSS rules.

## 10. Build order (PRD, adapted)

1. Migration 004 + tests.
2. Brief library + `generate` action; run it by hand against the real API until the output reads
   well.
3. `/nightly` with auth, brief and form.
4. submit, then grade (grader + blind take).
5. `/notes` + publish.
6. The door.
7. Cron function + `vercel.json` last.

Merging to `main` ships the door publicly, so the door is reviewed before the merge. Then Hari runs
one real session before anything else is added.

## 11. Left to the builder

- Component breakdown, exact CSS and prompt wording (within section 5's rules).
- The exact shape of the `guard` option.
- The door's exact geometry and timing, within section 6.
- The randomness source for the type picker (seedable for tests).
