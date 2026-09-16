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
