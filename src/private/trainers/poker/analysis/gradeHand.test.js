import { describe, it, expect } from 'vitest';
import { buildLog } from '../bots/testHands.js';
import { callingStation } from '../bots/baselines.js';
import { GRADES } from './grade.js';
import { createRolloutWorld } from './rollout.js';
import { MIN_ROLLOUTS } from './evOptions.js';
import {
  HAND_BUDGET_MS, EQUITY_ITERATIONS, MAX_GRADED_DECISIONS, OVERTIME_MIN_ROLLOUTS, gradeHand,
} from './gradeHand.js';

const FAST = { budgetMs: Infinity, minRollouts: 2, maxRollouts: 2, allinSamples: 200 };
const stationWorld = (args) => createRolloutWorld({ ...args, createBrainImpl: () => callingStation });
const HU = { holes: ['AhKh', '9c9d'] };
const HU_LINEUP = [{ seat: 1, personaId: 'moss' }];
// SB raises to 6, the hero (BB, AhKh) 3-bets to 18, SB 4-bets to 40, the hero calls; a royal flush on the flop.
const TO_RIVER = ['r 1 6', 'r 0 18', 'r 1 40', 'c 0', 'B QhJhTh', 'k 0', 'k 1', 'B 2c', 'k 0', 'k 1', 'B 3d'];
const SIX_LINEUP = (hero) => [0, 1, 2, 3, 4, 5].filter((s) => s !== hero)
  .map((seat, i) => ({ seat, personaId: ['moss', 'viper', 'duchess', 'rook', 'ink'][i] }));

describe('gradeHand golden spots', () => {
  it('uses the documented budget constants', () => {
    expect([HAND_BUDGET_MS, EQUITY_ITERATIONS, MAX_GRADED_DECISIONS]).toEqual([2000, 2000, 40]);
  });

  it('returns no decisions for a walk', () => {
    const events = buildLog(['f 2', 'f 3', 'f 4', 'f 5', 'f 0']);
    expect(gradeHand({ id: 'walk', heroSeat: 1, lineup: SIX_LINEUP(1), events }, FAST)).toEqual({ decisions: [], heroAllinEv: null });
  });

  it('passes an under-the-gun AA open by the chart, with no rollouts', () => {
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1']);
    const { decisions, heroAllinEv } = gradeHand({ id: 'aa', heroSeat: 2, lineup: SIX_LINEUP(2), events }, FAST);
    expect(heroAllinEv).toBeNull();
    expect(decisions).toEqual([{
      idx: 7, street: 'preflop', position: 'UTG', spot: 'pf.open', action: 'raise', size: 5, pot: 3, toCall: 2,
      equity: null, neededEquity: 0.4, recommended: { action: 'raise', size: 5, evByOption: {} },
      evLoss: 0, grade: 'good', confident: true, analysisVersion: 1,
    }]);
  });

  it('calls checking the nuts on the river a blunder and recommends all-in against a station', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'k 1'], HU);
    const { decisions } = gradeHand({ id: 'nuts-check', heroSeat: 0, lineup: HU_LINEUP, events }, { ...FAST, createWorld: stationWorld });
    const river = decisions.find((d) => d.street === 'river');
    expect(river).toEqual({
      idx: river.idx, street: 'river', position: 'BB', spot: 'river.no_bet.oop', action: 'check', size: null, pot: 80, toCall: 0,
      equity: 1, neededEquity: null,
      recommended: { action: 'bet', size: 160, evByOption: { check: 80, 'bet:27': 107, 'bet:40': 120, 'bet:60': 140, 'bet:80': 160, 'bet:160': 240 } },
      evLoss: 160, grade: 'blunder', confident: true, analysisVersion: 1,
    });
  });

  it('calls folding the nuts to a river bet a blunder', () => {
    const events = buildLog([...TO_RIVER, 'k 0', 'b 1 40', 'f 0'], HU);
    const { decisions } = gradeHand({ id: 'nuts-fold', heroSeat: 0, lineup: HU_LINEUP, events }, { ...FAST, createWorld: stationWorld });
    expect(decisions.at(-1)).toMatchObject({
      spot: 'river.facing_bet.oop', action: 'fold', pot: 120, toCall: 40, equity: 1, neededEquity: 0.25,
      recommended: { action: 'raise', size: 160, evByOption: { fold: 0, call: 120, 'raise:93': 173, 'raise:120': 200, 'raise:160': 240 } },
      evLoss: 240, grade: 'blunder', confident: true,
    });
  });

  it('grades an off-chart preflop raise by rollouts, deterministically', () => {
    const holes = ['2c3d', '7h2s', '7c2d', 'KdQd', 'JcTc', '9s9h'];
    const events = buildLog(['r 2 5', 'f 3', 'f 4', 'f 5', 'f 0', 'f 1'], { holes });
    const record = { id: 'seven-deuce', heroSeat: 2, lineup: SIX_LINEUP(2), events };
    const first = gradeHand(record, FAST);
    const [d] = first.decisions;
    expect(d.spot).toBe('pf.open');
    expect(Object.keys(d.recommended.evByOption)).toEqual(['fold', 'call', 'raise:5', 'raise:200']);
    expect(d.recommended.evByOption.fold).toBe(0);
    expect(d.evLoss).toBeGreaterThanOrEqual(0);
    expect(GRADES).toContain(d.grade);
    expect(typeof d.confident).toBe('boolean');
    expect(gradeHand(record, FAST)).toEqual(first);
  });
});

describe('gradeHand budget floor', () => {
  it('grades a decision that starts after the hand deadline with OVERTIME_MIN_ROLLOUTS rounds', () => {
    // BB calls an open with 72o (off-chart, so it's graded by rollouts) then checks the flop.
    const events = buildLog(['r 1 6', 'c 0', 'B 9c4d2s', 'k 0'], { holes: ['7c2d', 'AsKs'] });
    const record = { id: 'overtime', heroSeat: 0, lineup: HU_LINEUP, events };
    let pastDeadline = false;
    const now = () => (pastDeadline ? 1e9 : 0);
    const roundsByIdx = {};
    const createWorld = (args) => ({ ...createRolloutWorld(args), _dec: args.point.idx });
    const rollout = (world, option, seed) => {
      pastDeadline = true; // the hand's deadline passes the instant the first rollout runs
      (roundsByIdx[world._dec] ??= new Set()).add(seed);
      return 0;
    };
    const { decisions } = gradeHand(record, { budgetMs: 1000, now, rollout, createWorld });
    expect(decisions).toHaveLength(2);
    const [preflop, flop] = decisions;
    expect(roundsByIdx[preflop.idx].size).toBe(MIN_ROLLOUTS);
    expect(roundsByIdx[flop.idx].size).toBe(OVERTIME_MIN_ROLLOUTS);
  });

  it('carries unused budget from a fast decision over to the next', () => {
    // Preflop AA 3-bet is a chart hit (instant, no rollouts); the flop check then inherits nearly the
    // whole hand budget instead of a naive equal split across the hand's two decisions.
    const events = buildLog(['r 1 6', 'r 0 20', 'c 1', 'B 9c4d2s', 'k 0'], { holes: ['AhAs', 'KdQd'] });
    const record = { id: 'carryover', heroSeat: 0, lineup: HU_LINEUP, events };
    let clock = 0;
    const now = () => clock;
    const roundsByIdx = {};
    const createWorld = (args) => ({ ...createRolloutWorld(args), _dec: args.point.idx });
    const rollout = (world, option, seed) => {
      clock += 1;
      (roundsByIdx[world._dec] ??= new Set()).add(seed);
      return 0;
    };
    const { decisions } = gradeHand(record, {
      budgetMs: 200, now, minRollouts: 1, maxRollouts: 1000, rollout, createWorld,
    });
    expect(decisions).toHaveLength(2);
    expect(decisions[0].recommended.evByOption).toEqual({});
    const flopIdx = decisions[1].idx;
    // A naive equal split (budgetMs / 2 decisions, i.e. a 100 ms deadline) caps the flop decision at 17
    // rounds on this seed; carryover lets it use the full 200 ms since the preflop decision spent none of
    // it, comfortably clearing a threshold a non-carryover implementation could never reach.
    expect(roundsByIdx[flopIdx].size).toBeGreaterThan(25);
  });

  it('returns no decisions when a hand has more than MAX_GRADED_DECISIONS hero decisions', () => {
    // Heads-up min-raise war: both seats keep reopening action by the minimum increment, so the hero
    // alone racks up 41 raises without either stack running out.
    const steps = [];
    let amount = 2;
    for (let i = 0; i < 82; i += 1) {
      amount += 2;
      steps.push(`r ${i % 2 === 0 ? 1 : 0} ${amount}`);
    }
    const events = buildLog(steps, { holes: ['7c2d', 'AsKs'], stack: 5000 });
    const record = { id: 'raise-war', heroSeat: 0, lineup: HU_LINEUP, events };
    const { decisions, heroAllinEv } = gradeHand(record, FAST);
    expect(decisions).toEqual([]);
    expect(heroAllinEv).toBeNull();
  });

  it('throws on a malformed record', () => {
    expect(() => gradeHand({ id: 'bad', heroSeat: 0, lineup: [] })).toThrow();
  });
});
