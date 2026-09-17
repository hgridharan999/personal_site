// src/private/trainers/poker/bots/brain.test.js
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { applyEvent, legalActions } from '../engine/handState.js';
import { dealHand } from '../engine/dealer.js';
import { randomPolicy } from '../engine/simulate.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { emptyProfile } from './contract.js';
import { ARCHETYPES } from './dials.js';
import { createHeuristicBrain } from './brain.js';
import { createBrain, BRAIN_KEYS } from './index.js';
import { contextAfter } from './testHands.js';

const DECISIONS = Number(process.env.POKER_BRAIN_DECISIONS ?? 10000);
const personas = Object.values(ARCHETYPES).map((dials, i) => ({ id: `p${i}`, name: 'P', tag: 'PPP', style: 's', brain: 'heuristic', dials }));

// Walks random hands with random legal actions; at every decision the brain is asked too and its choice is
// applied to a copy of the state, which throws if the choice is illegal.
function checkLegality(total, seed) {
  const rng = mulberry32(seed);
  const brain = createHeuristicBrain({ iterations: 60, budgetMs: Infinity });
  let decisions = 0;
  let hand = 0;
  const actions = new Set();
  while (decisions < total) {
    const n = 2 + Math.floor(rng() * 5);
    const seats = Array.from({ length: n }, (_, seat) => ({ seat, stack: rng() < 0.3 ? 1 + Math.floor(rng() * 30) : 200 }));
    const deal = dealHand({ seats, button: hand % n, sb: 1, bb: 2, rng });
    const events = [];
    let state = null;
    const push = (e) => {
      state = applyEvent(state, e);
      events.push(e);
    };
    deal.events.forEach(push);
    const heroSeat = Math.floor(rng() * n);
    const profile = emptyProfile();
    for (const k of Object.keys(profile.stats)) profile.stats[k] = { value: rng(), n: 40 };
    while (state.street !== 'complete') {
      if (state.needsBoard) {
        push(deal.boardEvent(state.needsBoard));
        continue;
      }
      const legal = legalActions(state);
      const ctx = {
        view: viewFor(state, legal.seat), seat: legal.seat, legal, events: eventsFor(events, legal.seat),
        persona: personas[decisions % personas.length], profile, heroSeat, bb: 2,
      };
      const choice = brain.decide(ctx, rng);
      actions.add(choice.action);
      applyEvent(state, { type: 'act', seat: legal.seat, ...choice }); // throws on an illegal choice
      decisions += 1;
      const next = randomPolicy(state, legal, rng);
      push({ type: 'act', seat: legal.seat, ...next });
    }
    hand += 1;
  }
  return actions;
}

describe('heuristic brain', () => {
  it(`makes only legal choices over ${DECISIONS} random states`, () => {
    const actions = checkLegality(DECISIONS, 20260916);
    expect([...actions].sort()).toEqual(['bet', 'call', 'check', 'fold', 'raise']);
  }, 120_000);

  it('is deterministic for a seed', () => {
    const cx = contextAfter(['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s', 'k 2']);
    const ctx = { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: personas[1], profile: null, bb: 2 };
    const run = () => createHeuristicBrain({ iterations: 400, budgetMs: Infinity }).decide(ctx, mulberry32(9));
    expect(run()).toEqual(run());
  });

  it('never reads hidden cards: the full log and the seat-filtered log give the same choice', () => {
    const steps = ['r 2 5', 'f 3', 'c 4', 'f 5', 'f 0', 'f 1', 'B Kh8d4s', 'b 2 8'];
    const cx = contextAfter(steps);
    const base = { view: cx.view, seat: cx.seat, legal: cx.legal, persona: personas[0], profile: null, bb: 2 };
    const a = createHeuristicBrain({ iterations: 300, budgetMs: Infinity }).decide({ ...base, events: cx.events }, mulberry32(3));
    const b = createHeuristicBrain({ iterations: 300, budgetMs: Infinity }).decide({ ...base, events: cx.seatEvents }, mulberry32(3));
    expect(a).toEqual(b);
  });

  it('respects its time budget', () => {
    const cx = contextAfter(['r 2 5', 'c 3', 'c 4', 'c 5', 'c 0', 'c 1', 'B Kh8d4s', 'k 0', 'k 1']);
    const ctx = { view: cx.view, seat: cx.seat, legal: cx.legal, events: cx.seatEvents, persona: personas[2], profile: null, bb: 2 };
    const brain = createHeuristicBrain({ iterations: 1e9, budgetMs: 40 });
    const started = performance.now();
    brain.decide(ctx, mulberry32(1));
    expect(performance.now() - started).toBeLessThan(400);
  });
});

describe('createBrain registry', () => {
  it('knows the heuristic brain, baselines and probes, and caches heuristic brains per persona', () => {
    expect(BRAIN_KEYS).toEqual(expect.arrayContaining(['heuristic', 'randomLegal', 'callingStation', 'rawEquity', 'tightPassive', 'always3Bet', 'alwaysCbet', 'alwaysOverbetRiver']));
    for (const key of BRAIN_KEYS) expect(typeof createBrain({ brain: key }).decide).toBe('function');
    expect(createBrain(personas[0])).toBe(createBrain(personas[0]));
    expect(createBrain(personas[0], { iterations: 10 })).not.toBe(createBrain(personas[0]));
  });
});
