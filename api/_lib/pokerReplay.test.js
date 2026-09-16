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

  it('rejects a lineup with a seat that is not seated', () => {
    const record = pokerHandRecord({ seatIds: [0, 1, 2, 3, 4], heroSeat: 0 });
    record.lineup[0] = { ...record.lineup[0], seat: 5 };
    expect(replayHandRecord(record)).toEqual({ error: 'lineup does not match the seated bots' });
  });

  it('rejects a lineup missing a seated bot', () => {
    const record = pokerHandRecord({ seatIds: [0, 1, 2, 3, 4], heroSeat: 0 });
    record.lineup.pop();
    expect(replayHandRecord(record)).toEqual({ error: 'lineup does not match the seated bots' });
  });

  it('rejects a lineup that contains the hero seat', () => {
    const record = pokerHandRecord({ heroSeat: 0 });
    record.lineup[0] = { ...record.lineup[0], seat: record.heroSeat };
    expect(replayHandRecord(record)).toEqual({ error: 'lineup does not match the seated bots' });
  });

  it('never throws on logs that cannot be replayed', () => {
    const record = pokerHandRecord();
    expect(replayHandRecord({ ...record, events: [] })).toEqual({ error: 'events do not describe a complete hand' });
    expect(replayHandRecord({ ...record, events: [null] }).error).toMatch(/^events are not a legal hand \(BAD_EVENT: /);
    expect(replayHandRecord({ ...record, events: 'nope' })).toEqual({ error: 'events could not be replayed' });
  });
});
