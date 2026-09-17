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
export const SPOT_PATTERN = /^[a-z0-9_.]{1,64}$/;

export const MIN_YEAR = 2000;
export const MAX_YEAR = 2100;

// Postgres rejects NUL in text and jsonb and years it can't store, which would surface as a
// 500 the outbox retries; reject them here as 400 instead.
const noNul = (s) => !s.includes(String.fromCharCode(0));
const freeText = (min, max) => z.string().min(min).max(max).refine(noNul, { message: 'must not contain NUL characters' });
const datetime = z.iso.datetime().refine((s) => {
  const year = Number(s.slice(0, 4));
  return year >= MIN_YEAR && year <= MAX_YEAR;
}, { message: `must be between the years ${MIN_YEAR} and ${MAX_YEAR}` });

const uuid = z.uuid().transform((id) => id.toLowerCase());
const seat = z.int().min(0).max(5);
const name = freeText(1, 64);
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
    startedAt: datetime,
    botVersion: name,
    tableMode: z.enum(TABLE_MODES),
    lineup,
    heroSeat: seat,
  })
  .superRefine((s, ctx) => checkLineup(s.lineup, s.heroSeat, issuesFor(ctx), ['lineup']));

// Extra summary keys (id, hands, net, rebuys) are stripped: the server owns those totals.
export const pokerSessionClose = z.object({ endedAt: datetime.nullable() });

export const openSessionsQuery = z.object({ status: z.literal('open') });

const handRecord = z.object({
  v: z.literal(1),
  id: uuid,
  sessionId: uuid,
  handNo: z.int().min(1).max(MAX_HAND_NO),
  playedAt: datetime,
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

export const decision = z.object({
  idx: z.int().min(0).max(MAX_HAND_EVENTS - 1),
  street: z.enum(STREETS),
  position: z.enum(POSITIONS),
  spot: freeText(1, 64).regex(SPOT_PATTERN),
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
      evByOption: z.record(freeText(1, 32), z.number()),
    })
    .refine((r) => JSON.stringify(r).length <= MAX_RECOMMENDED_CHARS, {
      message: `recommended must serialize to at most ${MAX_RECOMMENDED_CHARS} characters`,
    }),
  evLoss: z.number().min(0).max(MAX_POT),
  grade: z.enum(GRADES),
  confident: z.boolean(),
  analysisVersion: z.int().min(1).max(1000),
});

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
    decisionProblems(decisions, hand.events, hand.heroSeat)
      .forEach(({ index, message }) => issue(message, ['decisions', index, 'idx']));
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

// GET sessions?id=&afterHandNo= (review page) and GET sessions?status=recent (lobby).
export const pokerReviewQuery = z.object({ id: uuid, afterHandNo: queryInt(0, MAX_HAND_NO).default(0) });
export const recentSessionsQuery = z.object({ status: z.literal('recent') });

// GET /api/trainers/poker/stats[?spot=]. A repeated ?spot= arrives as an array and is rejected.
export const pokerStatsQuery = z.object({ spot: z.string().regex(SPOT_PATTERN).optional() });
