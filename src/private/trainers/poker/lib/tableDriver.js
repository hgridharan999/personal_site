// Runs a table session over time: bot turns through an injected BotRunner with humanized delays,
// board deals and between-hand pauses through an injected scheduler, and the session callbacks.
import {
  nextStep, startHand, dealBoard, applyAction, botContext, finishHand, sessionStartInfo, sessionSummary,
  requestRebuy, requestGetUp, abandonSession,
} from './tableCore.js';
import { legalActions } from '../engine/handState.js';

/** Milliseconds. Bot think time is uniform in [botMin, botMax], x1.5 for big decisions. */
export const PACING = {
  fast: { botMin: 250, botMax: 600, board: 350, handPause: 1200 },
  normal: { botMin: 600, botMax: 1800, board: 700, handPause: 2500 },
};
export const BIG_DECISION_FACTOR = 1.5;
export const BIG_CALL_UNITS = 20; // 10 BB

const noop = () => {};

/** A big decision: calling at least 10 BB, or calling all-in. */
export function isBigDecision(ctx) {
  const { legal, view, seat } = ctx;
  if (!legal || legal.canCheck) return false;
  const me = view.players.find((p) => p.seat === seat);
  if (!me) return false;
  return legal.toCall >= BIG_CALL_UNITS || legal.toCall >= me.stack;
}

export function botDelayMs(speed, rng, big) {
  const { botMin, botMax } = PACING[speed];
  return Math.round((botMin + rng() * (botMax - botMin)) * (big ? BIG_DECISION_FACTOR : 1));
}

/** Applies a bot's choice; an illegal or missing choice becomes check (if possible) or fold. */
export function applyWithFallback(session, seat, choice, logger = console) {
  if (choice) {
    try {
      return applyAction(session, seat, choice);
    } catch (err) {
      logger.warn(`bot in seat ${seat} chose an illegal action`, choice, err);
    }
  }
  const legal = legalActions(session.hand.state);
  return applyAction(session, seat, { action: legal.canCheck ? 'check' : 'fold' });
}

/** Real-time scheduler for the browser. Tests pass one whose wait resolves immediately. */
export const realScheduler = { wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) };

/** How long a bot's `decide` gets before its choice is treated as missing (falls back to check/fold). */
export const DEFAULT_DECIDE_TIMEOUT_MS = 5000;

// ---- internals: `d` is the driver's mutable state (see createTableDriver) ----

/**
 * Calls an outside callback (onChange, onSessionStart, onHandComplete, onSessionEnd) without letting
 * a throw reach the driver's loop: a throwing callback used to freeze the table (the loop's own
 * try/catch would stop the pump and never deal again). Logs and swallows instead.
 */
function safeCall(name, fn, ...args) {
  try {
    return fn(...args);
  } catch (err) {
    console.warn(`poker table: ${name} failed`, err);
    return undefined;
  }
}

function set(d, next) {
  d.current = next;
  if (!d.disposed) safeCall('onChange', d.opts.onChange, next);
}

function endOnce(d) {
  if (d.ended || d.disposed) return;
  d.ended = true;
  safeCall('onSessionEnd', d.opts.onSessionEnd, sessionSummary(d.current, d.opts.now()));
}

const DECIDE_TIMED_OUT = Symbol('decide-timed-out');

async function botTurn(d, seat) {
  const { runner, scheduler, rng, speed, logger, decideTimeoutMs } = d.opts;
  const handNo = d.current.hand.no;
  const ctx = botContext(d.current, seat, d.profile);
  // Wrapped in Promise.resolve().then() so a runner that throws synchronously (instead of
  // returning a rejected promise) still lands in .catch instead of freezing the table.
  const decision = Promise.resolve().then(() => runner.decide(ctx)).catch((err) => {
    logger.warn(`bot in seat ${seat} failed to decide`, err);
    return null;
  });
  // A decide() that never settles is raced against a timeout through the injected scheduler
  // (so tests stay instant); the timeout treats the choice as missing, same as a rejection.
  const timedOut = scheduler.wait(decideTimeoutMs).then(() => DECIDE_TIMED_OUT);
  const pacing = scheduler.wait(botDelayMs(speed, rng, isBigDecision(ctx)));
  const [raced] = await Promise.all([Promise.race([decision, timedOut]), pacing]);
  if (d.disposed || d.current.phase !== 'playing' || d.current.hand?.no !== handNo) return;
  const choice = raced === DECIDE_TIMED_OUT ? null : raced;
  set(d, applyWithFallback(d.current, seat, choice, logger));
}

function settleHand(d) {
  const { botVersion, createId, accumulateProfile, onHandComplete, logger } = d.opts;
  const { session, record } = finishHand(d.current, { botVersion, createId });
  set(d, session);
  try {
    d.profile = accumulateProfile(d.profile, session.heroSeat, record.events);
  } catch (err) {
    logger.warn('could not update the hero profile', err);
  }
  // The optional second argument (analysis) arrives with Phase 5.
  safeCall('onHandComplete', onHandComplete, record);
}

const deal = (d) => set(d, startHand(d.current, { rng: d.opts.rng, now: d.opts.now(), personas: d.opts.personas }));

/** Advances until the hero must act, a rebuy decision is needed, or the session ends. */
async function pump(d) {
  const pace = PACING[d.opts.speed];
  while (!d.disposed) {
    const step = nextStep(d.current);
    const { phase } = d.current;
    if (step.type === 'hero') return;
    if (step.type === 'bot') {
      await botTurn(d, step.seat);
    } else if (step.type === 'board') {
      await d.opts.scheduler.wait(pace.board);
      if (!d.disposed && nextStep(d.current).type === 'board') set(d, dealBoard(d.current));
    } else if (step.type === 'complete') {
      settleHand(d);
    } else if (phase === 'ended') {
      endOnce(d);
      return;
    } else if (phase === 'between') {
      await d.opts.scheduler.wait(pace.handPause);
      if (!d.disposed && d.current.phase === 'between') deal(d);
    } else if (phase === 'idle') {
      deal(d);
    } else {
      return; // needsRebuy: wait for rebuy() or getUp()
    }
  }
}

// One pump at a time. A call that arrives while a pump is finishing sets `again`,
// so the loop runs once more instead of dropping the request.
function run(d) {
  if (d.running) {
    d.again = true;
    return d.pumping;
  }
  d.running = true;
  d.pumping = (async () => {
    try {
      do {
        d.again = false;
        await pump(d);
      } while (d.again && !d.disposed);
    } catch (err) {
      d.opts.logger.error('table driver stopped', err);
    } finally {
      d.running = false;
    }
  })();
  return d.pumping;
}

/**
 * @param {{
 *   session: object, runner: {decide:(ctx:object) => Promise<object>}, scheduler: {wait:(ms:number) => Promise<void>},
 *   rng: () => number, personas: object[], botVersion: string, speed?: 'fast'|'normal',
 *   createId?: () => string, now?: () => string, logger?: Pick<Console, 'warn'|'error'>,
 *   profile?: object|null, accumulateProfile?: (profile:object|null, heroSeat:number, events:object[]) => object|null,
 *   decideTimeoutMs?: number, onChange?: (session:object) => void, onSessionStart?: (info:object) => void,
 *   onHandComplete?: (record:object) => void, onSessionEnd?: (summary:object) => void,
 * }} options
 *   onChange and getSession() both expose the live TableSession, which carries every seat's hole
 *   cards (including bots') and the undealt board. UI code must never render it directly — filter
 *   it per seat first through `viewFor(state, HERO_SEAT)` (engine/view.js).
 */
export function createTableDriver({ session, profile = null, ...options }) {
  const opts = {
    speed: 'normal', createId: () => crypto.randomUUID(), now: () => new Date().toISOString(), logger: console,
    accumulateProfile: (p) => p, decideTimeoutMs: DEFAULT_DECIDE_TIMEOUT_MS,
    onChange: noop, onSessionStart: noop, onHandComplete: noop, onSessionEnd: noop,
    // An option passed as undefined keeps its default.
    ...Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)),
  };
  const d = { opts, current: session, profile, started: false, ended: false, disposed: false, running: false, again: false, pumping: null };

  return {
    /** The live TableSession — see the caveat above `createTableDriver` about hole cards and the board. */
    getSession: () => d.current,
    /** The hero profile bots currently receive. */
    getProfile: () => d.profile,
    /** Emits onSessionStart once and deals the first hand. */
    start() {
      if (!d.started) {
        d.started = true;
        safeCall('onSessionStart', opts.onSessionStart, sessionStartInfo(d.current, opts.botVersion));
      }
      return run(d);
    },
    /** The hero's action. Ignored unless the hero is due to act. */
    act(choice) {
      if (nextStep(d.current).type !== 'hero') return d.pumping ?? Promise.resolve();
      try {
        set(d, applyAction(d.current, d.current.heroSeat, choice));
      } catch (err) {
        opts.logger.warn('illegal hero action', choice, err);
      }
      return run(d);
    },
    rebuy() {
      if (!d.started) return Promise.resolve();
      set(d, requestRebuy(d.current));
      return run(d);
    },
    getUp() {
      if (!d.started) return Promise.resolve();
      set(d, requestGetUp(d.current));
      if (d.current.phase === 'ended') endOnce(d);
      return run(d);
    },
    /** Leaves at once (page closed or navigated away). Emits onSessionEnd if it has not been emitted. */
    abandon() {
      if (d.started && !d.ended) {
        d.current = abandonSession(d.current);
        endOnce(d);
      }
      d.disposed = true;
    },
    dispose() {
      d.disposed = true;
    },
  };
}
