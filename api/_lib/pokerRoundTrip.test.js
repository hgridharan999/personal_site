// api/_lib/pokerRoundTrip.test.js
import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { handItem, pokerSessionOpen, pokerSessionClose } from './pokerSchemas.js';
import { replayHandRecord } from './pokerReplay.js';
import { buildHandRecord } from '../../src/private/trainers/poker/lib/handRecord.js';
import { playHand, randomPolicy } from '../../src/private/trainers/poker/engine/simulate.js';
import { legalActions } from '../../src/private/trainers/poker/engine/handState.js';
import { mulberry32 } from '../../src/private/trainers/core/rng.js';
import { BOT_VERSION } from '../../src/private/trainers/poker/bots/index.js';
import { listPersonas } from '../../src/private/trainers/poker/bots/personas.js';
import { createLocalRunner } from '../../src/private/trainers/poker/bots/runner.js';
import { createSession, canRebuy, nextStep } from '../../src/private/trainers/poker/lib/tableCore.js';
import { createTableDriver, DEFAULT_DECIDE_TIMEOUT_MS } from '../../src/private/trainers/poker/lib/tableDriver.js';
import { randomLineup } from '../../src/private/trainers/poker/lib/lineup.js';

// A HandRecord the table builds must always pass the server schema: a rejected hand is
// marked failed in the outbox and is never saved.

const SESSION_ID = randomUUID();
const LINEUP = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: 'moss' }));

/** What the outbox stores and sends: a localStorage-style JSON round trip of the payload. */
const viaStorage = (value) => JSON.parse(JSON.stringify(value));

function expectSavable(record, label) {
  const result = handItem.safeParse(viaStorage({ hand: record }));
  expect(result.error?.issues ?? [], label).toEqual([]);
  expect(replayHandRecord(viaStorage(record)).error, label).toBeUndefined();
}

describe('Phase 2 HandRecords round-trip through handItem', () => {
  it('accepts 200 random engine hands with rotating buttons and uneven stacks', () => {
    for (let n = 1; n <= 200; n += 1) {
      const seats = [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, stack: 40 + ((seat * 37 + n) % 400) }));
      const button = n % 6;
      const { events, state } = playHand({ seats, button, sb: 1, bb: 2, rng: mulberry32(n), policy: randomPolicy });
      const record = buildHandRecord({
        id: randomUUID(),
        sessionId: SESSION_ID,
        handNo: n,
        playedAt: new Date(Date.UTC(2026, 8, 16, 18, 0, n)).toISOString(),
        botVersion: 'placeholder',
        heroSeat: 0,
        lineup: LINEUP,
        events,
        state,
      });
      expectSavable(record, `hand ${n}`);
    }
  });
});

// The same check through the real table driver, bots and session callbacks, so hand numbering,
// the lineup after bot refills, rebuy stacks and the open/close payloads are the ones the page sends.
const scheduler = { wait: (ms) => (ms === DEFAULT_DECIDE_TIMEOUT_MS ? new Promise(() => {}) : Promise.resolve()) };
const quietLogger = { warn: () => {}, error: () => {} };
const nextMacrotask = () => new Promise((resolve) => setImmediate(resolve));

function heroChoice(state, rng) {
  const legal = legalActions(state);
  const r = rng();
  if (legal.canRaise && r < 0.2) {
    return { action: legal.raiseKind, amount: legal.minRaiseTo + Math.floor(rng() * (legal.maxRaiseTo - legal.minRaiseTo + 1)) };
  }
  if (r < 0.35 && !legal.canCheck) return { action: 'fold' };
  return { action: legal.canCheck ? 'check' : 'call' };
}

async function playTableSession(seed) {
  const personas = listPersonas();
  const rng = mulberry32(seed * 7919);
  const heroRng = mulberry32(seed + 99);
  const out = { start: null, records: [], summary: null };
  let clock = Date.UTC(2026, 8, 16, 12);
  const now = () => new Date((clock += 1000)).toISOString();
  const driver = createTableDriver({
    session: createSession({ id: randomUUID(), tableMode: 'random', lineup: randomLineup(personas, rng), startedAt: now() }),
    runner: createLocalRunner({ rng: mulberry32(seed) }),
    scheduler, rng, personas, botVersion: BOT_VERSION, speed: 'fast', logger: quietLogger, now,
    onSessionStart: (info) => { out.start = viaStorage(info); },
    onHandComplete: (record) => out.records.push(viaStorage(record)),
    onSessionEnd: (summary) => { out.summary = viaStorage(summary); },
  });
  await driver.start();
  const leaveAt = 20 + Math.floor(heroRng() * 20);
  for (let guard = 0; driver.getSession().phase !== 'ended' && guard < 20000; guard += 1) {
    const current = driver.getSession();
    if (current.phase === 'needsRebuy') {
      await driver.rebuy();
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
  return out;
}

describe('table driver sessions round-trip through the save schemas', () => {
  it('accepts the open, every hand and the close of seeded sessions', async () => {
    let hands = 0;
    for (let seed = 1; seed <= 5; seed += 1) {
      const { start, records, summary } = await playTableSession(seed);
      const open = pokerSessionOpen.safeParse(start);
      expect(open.error?.issues ?? [], `seed ${seed} open`).toEqual([]);
      records.forEach((record) => {
        expect(record.sessionId).toBe(start.id);
        expectSavable(record, `seed ${seed} hand ${record.handNo}`);
      });
      const close = pokerSessionClose.safeParse(summary);
      expect(close.error?.issues ?? [], `seed ${seed} close`).toEqual([]);
      hands += records.length;
    }
    expect(hands).toBeGreaterThanOrEqual(100);
  });
});
