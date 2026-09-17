// Seeded multi-hand sessions through the real driver, bots and engine, checking whole-session invariants:
// chip conservation (including rebuys and bot refills), hand numbering, the summary net, hidden hole
// cards in every snapshot and log line, and that the bots' own decisions (raises) reach the table.
import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createLocalRunner } from '../bots/runner.js';
import { createSession, canRebuy, nextStep } from './tableCore.js';
import { createTableDriver, DEFAULT_DECIDE_TIMEOUT_MS } from './tableDriver.js';
import { tableSnapshot } from './tableSnapshot.js';
import { randomLineup } from './lineup.js';
import { cardText } from './format.js';
import { BUY_IN, SEAT_COUNT } from './constants.js';

const SESSIONS = 30;
const personas = listPersonas();
const sum = (list, pick) => list.reduce((total, x) => total + pick(x), 0);
const quietLogger = { warn: () => {}, error: () => {} };
// Fixed small equity budgets keep real-persona sessions fast and deterministic.
const FAST_BRAINS = { iterations: 150, budgetMs: Infinity };
// Every wait resolves at once except the decide timeout, so bot decisions are always applied.
const scheduler = { wait: (ms) => (ms === DEFAULT_DECIDE_TIMEOUT_MS ? new Promise(() => {}) : Promise.resolve()) };
const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));

/** Checks every emitted session against the running chip total; collects problems instead of throwing mid-driver. */
function createChecker(problems) {
  let prev = null;
  let expected = SEAT_COUNT * BUY_IN;
  const stats = { refills: 0 };
  const check = (next) => {
    if (prev && next.buyIns !== prev.buyIns) expected += next.buyIns - prev.buyIns;
    if (prev && next.hand && next.hand.no !== prev.hand?.no) {
      for (const seat of next.seats) {
        const before = prev.seats.find((s) => s.seat === seat.seat);
        if (seat.stack === before.stack) continue;
        if (seat.kind !== 'bot' || before.stack !== 0 || seat.stack !== BUY_IN) problems.push(`seat ${seat.seat} changed stack at a deal`);
        expected += seat.stack - before.stack;
        stats.refills += 1;
      }
    }
    const state = next.hand?.state;
    if (state && next.handsCompleted < next.hand.no && state.street !== 'complete') {
      const chips = sum(state.players, (p) => p.stack + p.total);
      if (chips !== expected) problems.push(`hand ${next.hand.no}: ${chips} chips in play, expected ${expected}`);
    } else if (sum(next.seats, (s) => s.stack) !== expected) {
      problems.push(`hand ${next.hand?.no}: ${sum(next.seats, (s) => s.stack)} chips seated, expected ${expected}`);
    }
    checkHidden(next, problems);
    prev = next;
  };
  return { check, stats };
}

/** No unrevealed bot hole card in the snapshot's players, and none in its log text. */
function checkHidden(session, problems) {
  if (!session.hand) return;
  const snap = tableSnapshot(session);
  const raw = session.hand.state;
  const shown = raw.street === 'complete' ? raw.result.shown : [];
  const hiddenSeat = (seat) => seat !== session.heroSeat && !shown.includes(seat);
  for (const p of snap.hand.state.players) if (hiddenSeat(p.seat) && p.hole) problems.push(`snapshot shows seat ${p.seat} hole cards`);
  if ('events' in snap.hand || 'boardEvent' in snap.hand) problems.push('snapshot keeps raw events');
  const logText = snap.hand.log.join('\n');
  const hidden = raw.players.filter((p) => hiddenSeat(p.seat)).flatMap((p) => p.hole);
  for (const card of hidden) if (logText.includes(cardText(card))) problems.push(`log reveals ${cardText(card)}`);
}

function heroChoice(state, rng) {
  const legal = legalActions(state);
  const r = rng();
  if (legal.canRaise && r < 0.2) {
    return { action: legal.raiseKind, amount: legal.minRaiseTo + Math.floor(rng() * (legal.maxRaiseTo - legal.minRaiseTo + 1)) };
  }
  if (r < 0.35 && !legal.canCheck) return { action: 'fold' };
  return { action: legal.canCheck ? 'check' : 'call' };
}

async function playSession(seed) {
  const rng = mulberry32(seed * 7919);
  const heroRng = mulberry32(seed + 99);
  const problems = [];
  const records = [];
  let summary = null;
  const checker = createChecker(problems);
  let clock = Date.UTC(2026, 8, 16, 12);
  const driver = createTableDriver({
    session: createSession({ id: `s${seed}`, tableMode: 'random', lineup: randomLineup(personas, rng), startedAt: 'start' }),
    runner: createLocalRunner({ rng: mulberry32(seed), brainOptions: FAST_BRAINS }),
    scheduler, rng, personas, botVersion: 'test', speed: 'fast', logger: quietLogger,
    createId: () => `h${records.length + 1}`,
    now: () => new Date((clock += 1000)).toISOString(),
    onChange: checker.check,
    onHandComplete: (record) => records.push(record),
    onSessionEnd: (s) => { summary = s; },
  });
  await driver.start();
  const leaveAt = 15 + Math.floor(heroRng() * 20);
  for (let guard = 0; driver.getSession().phase !== 'ended' && guard < 20000; guard += 1) {
    const current = driver.getSession();
    if (current.phase === 'needsRebuy') {
      await (heroRng() < 0.8 ? driver.rebuy() : driver.getUp());
    } else if (current.handsCompleted >= leaveAt && !current.getUpPending && current.phase === 'playing') {
      driver.getUp();
    } else if (canRebuy(current) && heroRng() < 0.5) {
      await driver.rebuy();
    } else if (nextStep(current).type === 'hero') {
      await driver.act(heroChoice(current.hand.state, heroRng));
    } else {
      await nextMacrotask();
    }
  }
  return { problems, records, summary, session: driver.getSession(), refills: checker.stats.refills };
}

describe('seeded table sessions', () => {
  it('conserve chips, number hands, match the summary, hide hole cards and apply bot raises', async () => {
    let botRaises = 0;
    let rebuys = 0;
    let refills = 0;
    for (let seed = 1; seed <= SESSIONS; seed += 1) {
      const { problems, records, summary, session, refills: sessionRefills } = await playSession(seed);
      expect(problems, `seed ${seed}`).toEqual([]);
      expect(session.phase, `seed ${seed}`).toBe('ended');
      expect(records.map((r) => r.handNo), `seed ${seed}`).toEqual(records.map((_, i) => i + 1));
      expect(summary, `seed ${seed}`).toMatchObject({ hands: records.length, rebuys: session.rebuys });
      expect(summary.net, `seed ${seed}`).toBe(sum(records, (r) => r.heroNet));
      botRaises += records.flatMap((r) => r.events)
        .filter((e) => e.type === 'act' && e.seat !== 0 && (e.action === 'raise' || e.action === 'bet')).length;
      rebuys += session.rebuys;
      refills += sessionRefills;
    }
    expect(botRaises).toBeGreaterThan(0);
    // The seeds exercise the rebuy and refill paths that chip conservation must account for.
    expect(rebuys).toBeGreaterThan(0);
    expect(refills).toBeGreaterThan(0);
  });
});
