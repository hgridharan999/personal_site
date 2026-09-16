import { describe, it, expect, vi } from 'vitest';
import { mulberry32 } from '../../core/rng.js';
import { legalActions } from '../engine/handState.js';
import { listPersonas } from '../bots/personas.js';
import { createSession, nextStep, startHand } from './tableCore.js';
import {
  PACING, BIG_DECISION_FACTOR, DEFAULT_DECIDE_TIMEOUT_MS, isBigDecision, botDelayMs, applyWithFallback, createTableDriver,
} from './tableDriver.js';

const personas = listPersonas();
const lineup = [1, 2, 3, 4, 5].map((seat) => ({ seat, personaId: personas[seat - 1].id }));
const NOW = '2026-09-16T12:00:00.000Z';
const passive = (legal) => (legal.canCheck ? { action: 'check' } : { action: 'call' });
const quietLogger = { warn: vi.fn(), error: vi.fn() };

const passiveRunner = () => ({ decide: vi.fn(async (ctx) => passive(ctx.legal)), dispose: vi.fn() });
/**
 * Resolves every wait at once, except the decide timeout, which never fires. A timeout that resolved
 * immediately would win the race against runner.decide (it settles in fewer microtasks), so every
 * bot would silently fall back to check/fold. `gates` maps a delay in ms to the promise to return.
 */
const instantScheduler = (gates = {}) => ({
  wait: vi.fn((ms) => {
    if (ms in gates) return gates[ms];
    return ms === DEFAULT_DECIDE_TIMEOUT_MS ? new Promise(() => {}) : Promise.resolve();
  }),
});

function setup(overrides = {}) {
  let n = 0;
  const callbacks = { onChange: vi.fn(), onSessionStart: vi.fn(), onHandComplete: vi.fn(), onSessionEnd: vi.fn() };
  const { runner = passiveRunner(), scheduler = instantScheduler(), ...rest } = overrides;
  const driver = createTableDriver({
    session: createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW }),
    runner, scheduler, rng: mulberry32(21), personas, botVersion: 'test-bots', speed: 'fast',
    createId: () => `hand-${(n += 1)}`, now: () => NOW, logger: quietLogger, ...callbacks, ...rest,
  });
  return { driver, runner, scheduler, ...callbacks };
}

/** Resolves once the driver is waiting on the hero, paused between hands, or stopped. */
const settle = (driver) => vi.waitFor(() => {
  const s = driver.getSession();
  if (s.phase === 'playing' && nextStep(s).type !== 'hero') throw new Error('driver still running');
}, { interval: 5 });

async function heroPlaysUntil(driver, handsCompleted) {
  for (let guard = 0; guard < 100 && driver.getSession().handsCompleted < handsCompleted; guard += 1) {
    const s = driver.getSession();
    if (nextStep(s).type === 'hero') driver.act(passive(legalActions(s.hand.state)));
    await settle(driver);
  }
}

/** A freshly-dealt session whose first seat to act is a bot, not the hero (deterministic search over seeds). */
function dealtWithBotFirst() {
  for (let seed = 1; seed < 50; seed += 1) {
    const dealt = startHand(createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW }), {
      rng: mulberry32(seed), now: NOW, personas,
    });
    if (nextStep(dealt).seat !== 0) return dealt;
  }
  throw new Error('could not find a seed dealing to a bot first');
}

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('pacing helpers', () => {
  it('draws bot think time from the speed range, longer for big decisions', () => {
    expect(botDelayMs('fast', () => 0, false)).toBe(250);
    expect(botDelayMs('fast', () => 0.5, false)).toBe(425);
    expect(botDelayMs('normal', () => 0, false)).toBe(600);
    expect(botDelayMs('normal', () => 0.999999, false)).toBe(1800);
    expect(botDelayMs('normal', () => 0, true)).toBe(600 * BIG_DECISION_FACTOR);
  });

  it('treats calls of 10 BB or more, and all-in calls, as big decisions', () => {
    const view = { players: [{ seat: 1, stack: 50 }] };
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: true, toCall: 0 } })).toBe(false);
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: false, toCall: 4 } })).toBe(false);
    expect(isBigDecision({ seat: 1, view, legal: { canCheck: false, toCall: 20 } })).toBe(true);
    expect(isBigDecision({ seat: 1, view: { players: [{ seat: 1, stack: 6 }] }, legal: { canCheck: false, toCall: 6 } })).toBe(true);
  });

  it('is never a big decision when the seat is missing from view.players', () => {
    expect(isBigDecision({ seat: 9, view: { players: [] }, legal: { canCheck: false, toCall: 40 } })).toBe(false);
  });
});

describe('applyWithFallback', () => {
  it('replaces an illegal or missing bot choice with check or fold', () => {
    const s = startHand(createSession({ id: 's', tableMode: 'random', lineup, startedAt: NOW }), { rng: mulberry32(4), now: NOW, personas });
    const { seat } = nextStep(s);
    const folded = applyWithFallback(s, seat, { action: 'raise', amount: 1 }, quietLogger);
    expect(folded.hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'fold' });
    expect(applyWithFallback(s, seat, null, quietLogger).hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'fold' });
    expect(applyWithFallback(s, seat, { action: 'call' }, quietLogger).hand.events.at(-1)).toEqual({ type: 'act', seat, action: 'call' });
  });
});

describe('createTableDriver', () => {
  it('announces the session, deals and stops on the hero’s turn', async () => {
    const { driver, onSessionStart, onChange, runner } = setup();
    driver.start();
    await settle(driver);
    expect(onSessionStart).toHaveBeenCalledTimes(1);
    expect(onSessionStart).toHaveBeenCalledWith({
      id: 's1', startedAt: NOW, botVersion: 'test-bots', tableMode: 'random', lineup, heroSeat: 0,
    });
    expect(nextStep(driver.getSession()).type).toBe('hero');
    expect(onChange).toHaveBeenCalled();
    for (const [ctx] of runner.decide.mock.calls) {
      expect(ctx.view.players.find((p) => p.seat === 0).hole).toBeNull();
      // Contracts §4.1: every BotContext carries the hero's seat alongside its profile.
      expect(ctx.heroSeat).toBe(0);
    }
  });

  it('plays hands in a loop, emits a record per hand and pauses between hands', async () => {
    const { driver, onHandComplete, scheduler } = setup();
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 2);
    expect(onHandComplete).toHaveBeenCalledTimes(2);
    expect(onHandComplete.mock.calls.map(([r]) => [r.handNo, r.id, r.sessionId])).toEqual([[1, 'hand-1', 's1'], [2, 'hand-2', 's1']]);
    expect(scheduler.wait).toHaveBeenCalledWith(PACING.fast.handPause);
    expect(scheduler.wait).toHaveBeenCalledWith(PACING.fast.board);
    expect(driver.getSession().hand.no).toBe(3);
  });

  it('gets up after the current hand when asked mid-hand', async () => {
    const { driver, onSessionEnd, onHandComplete } = setup();
    driver.start();
    await settle(driver);
    driver.getUp();
    expect(driver.getSession().getUpPending).toBe(true);
    expect(onSessionEnd).not.toHaveBeenCalled();
    driver.act({ action: 'fold' });
    await vi.waitFor(() => expect(driver.getSession().phase).toBe('ended'));
    expect(onHandComplete).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd.mock.calls[0][0]).toMatchObject({ id: 's1', endedAt: NOW, hands: 1, rebuys: 0 });
  });

  it('gets up at once during the between-hands pause and never deals again', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const scheduler = instantScheduler({ [PACING.fast.handPause]: gate });
    const { driver, onSessionEnd } = setup({ scheduler });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    expect(driver.getSession().phase).toBe('between');
    driver.getUp();
    expect(driver.getSession().phase).toBe('ended');
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    release();
    await driver.getUp();
    expect(driver.getSession().hand.no).toBe(1);
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
  });

  it('abandons mid-hand with a summary of completed hands only', async () => {
    const { driver, onSessionEnd, onChange } = setup();
    driver.start();
    await settle(driver);
    driver.abandon();
    expect(onSessionEnd).toHaveBeenCalledWith({ id: 's1', endedAt: NOW, hands: 0, net: 0, rebuys: 0 });
    const changes = onChange.mock.calls.length;
    driver.act({ action: 'fold' });
    expect(onChange.mock.calls.length).toBe(changes);
  });

  it('applies the bot runner’s decisions (an always-raise runner raises)', async () => {
    const aggressive = (legal) => (legal.canRaise ? { action: legal.raiseKind, amount: legal.minRaiseTo } : passive(legal));
    const runner = { decide: vi.fn(async (ctx) => aggressive(ctx.legal)), dispose: vi.fn() };
    const { driver, onHandComplete } = setup({ runner });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 2);
    const botRaises = onHandComplete.mock.calls
      .flatMap(([record]) => record.events)
      .filter((e) => e.type === 'act' && e.seat !== 0 && (e.action === 'raise' || e.action === 'bet'));
    expect(botRaises.length).toBeGreaterThan(0);
  });

  it('ignores a decision that arrives after the decide timeout and keeps the fallback', async () => {
    const dealt = dealtWithBotFirst();
    const { seat } = nextStep(dealt);
    let releaseTimeout;
    let resolveLate;
    const timeoutGate = new Promise((resolve) => { releaseTimeout = resolve; });
    // The first decide hangs until after its timeout fires; later bots decide passively.
    const runner = {
      decide: vi.fn((ctx) => (ctx.seat === seat && !resolveLate
        ? new Promise((resolve) => { resolveLate = resolve; })
        : Promise.resolve(passive(ctx.legal)))),
      dispose: vi.fn(),
    };
    let timeouts = 0;
    const scheduler = {
      wait: vi.fn((ms) => {
        if (ms !== 12345) return Promise.resolve();
        timeouts += 1;
        return timeouts === 1 ? timeoutGate : new Promise(() => {});
      }),
    };
    const { driver } = setup({ runner, session: dealt, scheduler, decideTimeoutMs: 12345 });
    driver.start();
    await vi.waitFor(() => expect(resolveLate).toBeDefined(), { interval: 5 });
    releaseTimeout();
    await settle(driver);
    const actsOf = () => driver.getSession().hand.events.filter((e) => e.type === 'act' && e.seat === seat);
    expect(actsOf()[0]).toEqual({ type: 'act', seat, action: 'fold' });
    const eventsBefore = driver.getSession().hand.events.length;
    resolveLate({ action: 'raise', amount: 6 });
    await flushMicrotasks();
    expect(driver.getSession().hand.events.length).toBe(eventsBefore);
    expect(actsOf()).toHaveLength(1);
  });

  it('falls back to check or fold when the runner rejects', async () => {
    const runner = { decide: vi.fn(async () => { throw new Error('worker crashed'); }), dispose: vi.fn() };
    const { driver } = setup({ runner });
    driver.start();
    await settle(driver);
    const acts = driver.getSession().hand.events.filter((e) => e.type === 'act' && e.seat !== 0);
    for (const e of acts) expect(['check', 'fold']).toContain(e.action);
  });

  it('passes the running hero profile to bots and folds each finished hand into it', async () => {
    const accumulateProfile = vi.fn((profile, heroSeat, events) => ({ hands: profile.hands + 1, stats: {}, lastEvents: events.length, heroSeat }));
    const { driver, runner, onHandComplete } = setup({ profile: { hands: 10, stats: {} }, accumulateProfile });
    driver.start();
    await settle(driver);
    expect(runner.decide.mock.calls.every(([ctx]) => ctx.profile.hands === 10)).toBe(true);
    await heroPlaysUntil(driver, 1);
    expect(accumulateProfile).toHaveBeenCalledTimes(1);
    expect(accumulateProfile.mock.calls[0][1]).toBe(0);
    expect(accumulateProfile.mock.calls[0][2]).toEqual(onHandComplete.mock.calls[0][0].events);
    expect(driver.getProfile()).toMatchObject({ hands: 11, heroSeat: 0 });
    await heroPlaysUntil(driver, 2);
    const lastCtx = runner.decide.mock.calls.at(-1)[0];
    expect(lastCtx.profile.hands).toBeGreaterThanOrEqual(11);
  });

  it('keeps playing when the profile accumulator throws', async () => {
    const accumulateProfile = vi.fn(() => { throw new Error('bad stats'); });
    const { driver, onHandComplete } = setup({ accumulateProfile });
    driver.start();
    await settle(driver);
    await heroPlaysUntil(driver, 1);
    expect(onHandComplete).toHaveBeenCalledTimes(1);
    expect(driver.getProfile()).toBeNull();
  });

  it('ignores hero actions, rebuys and get up before the session starts', async () => {
    const { driver, onSessionEnd, onChange } = setup();
    await driver.act({ action: 'fold' });
    await driver.rebuy();
    await driver.getUp();
    expect(driver.getSession().phase).toBe('idle');
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  describe('a throwing callback does not freeze the table', () => {
    it('keeps dealing when onSessionStart throws', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const onSessionStart = vi.fn(() => { throw new Error('boom'); });
      const { driver } = setup({ onSessionStart, logger });
      driver.start();
      await settle(driver);
      expect(onSessionStart).toHaveBeenCalledTimes(1);
      expect(nextStep(driver.getSession()).type).toBe('hero');
      expect(logger.warn).toHaveBeenCalledWith('poker table: onSessionStart failed', expect.any(Error));
    });

    it('deals the next hand when onHandComplete throws', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const onHandComplete = vi.fn(() => { throw new Error('boom'); });
      const { driver } = setup({ onHandComplete, logger });
      driver.start();
      await settle(driver);
      await heroPlaysUntil(driver, 2);
      expect(onHandComplete).toHaveBeenCalledTimes(2);
      expect(driver.getSession().hand.no).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith('poker table: onHandComplete failed', expect.any(Error));
    });

    it('keeps the session progressing when onChange throws on every change', async () => {
      const logger = { warn: vi.fn(), error: vi.fn() };
      const onChange = vi.fn(() => { throw new Error('boom'); });
      const { driver } = setup({ onChange, logger });
      driver.start();
      await settle(driver);
      await heroPlaysUntil(driver, 1);
      expect(driver.getSession().handsCompleted).toBe(1);
      expect(onChange).toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith('poker table: onChange failed', expect.any(Error));
    });
  });

  describe('a bot that never decides, or decides badly', () => {
    it('falls back to check or fold when decide() never resolves', async () => {
      const runner = { decide: vi.fn(() => new Promise(() => {})), dispose: vi.fn() };
      // This test needs the decide timeout to fire, so every wait resolves at once.
      const { driver } = setup({ runner, scheduler: { wait: vi.fn(async () => {}) } });
      driver.start();
      await settle(driver);
      const acts = driver.getSession().hand.events.filter((e) => e.type === 'act' && e.seat !== 0);
      for (const e of acts) expect(['check', 'fold']).toContain(e.action);
    });

    it('falls back to check or fold when decide() throws synchronously', async () => {
      const runner = { decide: vi.fn(() => { throw new Error('sync boom'); }), dispose: vi.fn() };
      const { driver } = setup({ runner });
      driver.start();
      await settle(driver);
      const acts = driver.getSession().hand.events.filter((e) => e.type === 'act' && e.seat !== 0);
      for (const e of acts) expect(['check', 'fold']).toContain(e.action);
    });
  });

  describe('async guards', () => {
    it('does not emit onSessionEnd from a late call once disposed', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const scheduler = instantScheduler({ [PACING.fast.handPause]: gate });
      const { driver, onSessionEnd } = setup({ scheduler });
      driver.start();
      await settle(driver);
      await heroPlaysUntil(driver, 1);
      expect(driver.getSession().phase).toBe('between');
      driver.dispose();
      driver.getUp();
      expect(driver.getSession().phase).toBe('ended');
      expect(onSessionEnd).not.toHaveBeenCalled();
      release();
    });

    it('ignores a bot decision that resolves after abandon() (no event applied, no onChange)', async () => {
      const dealt = dealtWithBotFirst();
      let resolveDecide;
      const runner = {
        decide: vi.fn(() => new Promise((resolve) => { resolveDecide = resolve; })),
        dispose: vi.fn(),
      };
      const scheduler = instantScheduler({ 12345: new Promise(() => {}) });
      const { driver, onChange } = setup({ runner, session: dealt, scheduler, decideTimeoutMs: 12345 });
      driver.start();
      await vi.waitFor(() => expect(runner.decide).toHaveBeenCalled());
      const eventsBefore = driver.getSession().hand.events.length;
      const changesBefore = onChange.mock.calls.length;
      driver.abandon();
      resolveDecide({ action: 'call' });
      await flushMicrotasks();
      expect(driver.getSession().hand.events.length).toBe(eventsBefore);
      expect(onChange.mock.calls.length).toBe(changesBefore);
    });

    it('ignores a bot decision that resolves after dispose() (no event applied, no onChange)', async () => {
      const dealt = dealtWithBotFirst();
      let resolveDecide;
      const runner = {
        decide: vi.fn(() => new Promise((resolve) => { resolveDecide = resolve; })),
        dispose: vi.fn(),
      };
      const scheduler = instantScheduler({ 12345: new Promise(() => {}) });
      const { driver, onChange } = setup({ runner, session: dealt, scheduler, decideTimeoutMs: 12345 });
      driver.start();
      await vi.waitFor(() => expect(runner.decide).toHaveBeenCalled());
      const eventsBefore = driver.getSession().hand.events.length;
      const changesBefore = onChange.mock.calls.length;
      driver.dispose();
      resolveDecide({ action: 'call' });
      await flushMicrotasks();
      expect(driver.getSession().hand.events.length).toBe(eventsBefore);
      expect(onChange.mock.calls.length).toBe(changesBefore);
    });

    it('deals the next hand once rebuy() clears a needsRebuy session', async () => {
      const base = createSession({ id: 's1', tableMode: 'random', lineup, startedAt: NOW });
      const bustedSession = {
        ...base,
        phase: 'needsRebuy',
        handsCompleted: 1,
        button: 1,
        seats: base.seats.map((s) => (s.seat === 0 ? { ...s, stack: 0 } : s)),
      };
      const { driver } = setup({ session: bustedSession });
      driver.start();
      expect(driver.getSession().phase).toBe('needsRebuy');
      // Await the pump directly: right after rebuy() the phase is already 'between' synchronously,
      // so settle() (which treats 'between' as settled) could resolve before the deal happens.
      await driver.rebuy();
      expect(driver.getSession().phase).toBe('playing');
      expect(driver.getSession().hand.no).toBe(2);
    });

    it('dispose() while the scheduler is waiting between hands stops further dealing', async () => {
      let release;
      const gate = new Promise((resolve) => { release = resolve; });
      const scheduler = instantScheduler({ [PACING.fast.handPause]: gate });
      const { driver } = setup({ scheduler });
      driver.start();
      await settle(driver);
      await heroPlaysUntil(driver, 1);
      expect(driver.getSession().phase).toBe('between');
      driver.dispose();
      release();
      await flushMicrotasks();
      expect(driver.getSession().phase).toBe('between');
      expect(driver.getSession().hand.no).toBe(1);
    });
  });
});
