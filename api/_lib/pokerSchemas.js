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

const decision = z.object({
  idx: z.int().min(0).max(MAX_HAND_EVENTS - 1),
  street: z.enum(STREETS),
  position: z.enum(POSITIONS),
  spot: freeText(1, 64).regex(/^[a-z0-9_.]+$/),
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
