// Humanized think time for bot decisions (spec §5.6): fast 250-600 ms, normal 600-1800 ms, x1.6 for big decisions.
//
// NOTE: the Phase 2 UI table driver paces bots itself (it schedules bot decisions and their
// delays as part of its own turn loop) and does NOT wrap its BotRunner with `withPacing`.
// `withPacing` is provided here as an optional helper for other callers (e.g. CLI/arena tools).
// Do not wrap a runner with this AND let the table UI pace it too — that would double-pace.

export const PACE = Object.freeze({ fast: Object.freeze([250, 600]), normal: Object.freeze([600, 1800]) });
export const BIG_DECISION_FACTOR = 1.6;

export const BIG_DECISION_BB = 20;

/** A big decision: going all-in, or putting at least 20 BB into the pot with this action. */
export function isBigDecision(ctx, choice) {
  const me = ctx.view.players.find((p) => p.seat === ctx.seat);
  const aggressive = choice.action === 'bet' || choice.action === 'raise';
  if (aggressive && choice.amount >= ctx.legal.maxRaiseTo) return true;
  const chips = aggressive ? choice.amount - me.committed : choice.action === 'call' ? ctx.legal.toCall : 0;
  return chips >= me.stack || chips >= BIG_DECISION_BB * ctx.bb;
}

/** @returns {number} whole milliseconds */
export function thinkTimeMs({ speed, ctx, choice, rng }) {
  const [lo, hi] = PACE[speed] ?? PACE.normal;
  const ms = lo + rng() * (hi - lo);
  return Math.round(isBigDecision(ctx, choice) ? ms * BIG_DECISION_FACTOR : ms);
}

/**
 * Wraps a BotRunner so each decision takes at least its think time (compute time counts toward it).
 * Optional helper — see the module note above: the Phase 2 UI table already paces bots itself
 * and does not use this wrapper.
 * @param {{ decide:(ctx:object) => Promise<object>, dispose:() => void }} runner
 * @param {{ speed?:'fast'|'normal', rng?:() => number, now?:() => number, sleep?:(ms:number) => Promise<void> }} [options]
 */
export function withPacing(runner, { speed = 'normal', rng = Math.random, now = () => performance.now(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  return {
    async decide(ctx) {
      const started = now();
      const choice = await runner.decide(ctx);
      const wait = thinkTimeMs({ speed, ctx, choice, rng }) - (now() - started);
      if (wait > 0) await sleep(wait);
      return choice;
    },
    dispose: () => runner.dispose(),
  };
}
