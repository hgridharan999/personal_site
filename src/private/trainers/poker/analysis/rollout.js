// One Monte Carlo rollout of a hero option (spec §7.1): opponents' hole cards come from their weighted ranges
// as the hero saw them, folded seats get random live cards, the runout is shuffled, and the rest of the hand
// is played by the engine with each bot's persona brain (the hero's later actions by HERO_MODEL).
import { applyEvent, legalActions } from '../engine/handState.js';
import { viewFor, eventsFor } from '../engine/view.js';
import { shuffle } from '../engine/cards.js';
import { mulberry32 } from '../../core/rng.js';
import { COMBO_COUNT, COMBO_CARDS, classWeightsToCombos } from '../bots/handClass.js';
import { createRangeTracker, DEFAULT_TYPE } from '../bots/ranges.js';
import { createBrain } from '../bots/index.js';
import { getPersona } from '../bots/personas.js';

export const ROLLOUT_BRAIN_OPTIONS = Object.freeze({ iterations: 24, budgetMs: Infinity });

/** The hero's own later decisions in a rollout: a sound default player. */
export const HERO_MODEL = Object.freeze({
  id: 'hero-model', name: 'Hero model', tag: 'HRO', style: 'tight-aggressive', brain: 'heuristic', dials: Object.freeze({}),
});

const DEAL_ATTEMPTS = 64;
const MAX_ROLLOUT_STEPS = 400;
const BOARD_CARDS = { flop: 3, turn: 1, river: 1 };

/** @returns {import('../bots/contract.js').Persona} */
export function personaFor(personaId) {
  try {
    return getPersona(personaId);
  } catch {
    return { id: personaId, name: String(personaId), tag: '???', style: 'unknown', brain: 'heuristic', dials: {} };
  }
}

/**
 * Opponents' 1,326-combo ranges from the hero's view at a decision (Phase 3 tracker, default player type).
 * If the tracker throws (a spot no chart covers), every live opponent gets a uniform range instead.
 */
export function heroRanges(point, heroSeat) {
  const out = new Map();
  let tracked;
  try {
    tracked = createRangeTracker().track(point.view, point.seatEvents, heroSeat, () => DEFAULT_TYPE);
  } catch {
    for (const p of point.before.players) {
      if (p.seat !== heroSeat && !p.folded) out.set(p.seat, new Float32Array(COMBO_COUNT).fill(1));
    }
    return out;
  }
  const { classWeights, comboRanges } = tracked;
  for (const [seat, weights] of classWeights) {
    const combos = comboRanges.get(seat);
    out.set(seat, combos ? Float32Array.from(combos) : classWeightsToCombos(weights));
  }
  return out;
}

/** Live combos of a range with cumulative weights; every live combo when the range is empty. */
export function prepareRange(weights, dead) {
  const combos = [];
  const cumulative = [];
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    const w = weights[i];
    if (!(w > 0) || dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    total += w;
    combos.push(i);
    cumulative.push(total);
  }
  if (combos.length === 0) return prepareRange(new Float32Array(COMBO_COUNT).fill(1), dead);
  return { combos: Int16Array.from(combos), cumulative: Float64Array.from(cumulative), total };
}

function pickCards(range, rng) {
  const target = rng() * range.total;
  let lo = 0;
  let hi = range.combos.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (range.cumulative[mid] > target) hi = mid;
    else lo = mid + 1;
  }
  const combo = range.combos[lo];
  return [COMBO_CARDS[2 * combo], COMBO_CARDS[2 * combo + 1]];
}

function randomLiveCard(used, rng) {
  for (;;) {
    const card = Math.floor(rng() * 52);
    if (!used[card]) return card;
  }
}

/**
 * Deals every ranged seat a combo from its range with no shared cards (whole-set rejection, then seat by seat,
 * then random cards), and every folded seat two random live cards.
 */
export function sampleHoles(prepared, folded, dead, rng) {
  const seats = [...prepared.keys()];
  const used = new Uint8Array(52);
  const holes = new Map();
  let dealt = false;
  for (let attempt = 0; attempt < DEAL_ATTEMPTS && !dealt; attempt += 1) {
    used.set(dead);
    holes.clear();
    dealt = true;
    for (const seat of seats) {
      const [a, b] = pickCards(prepared.get(seat), rng);
      if (used[a] || used[b]) {
        dealt = false;
        break;
      }
      used[a] = 1;
      used[b] = 1;
      holes.set(seat, [a, b]);
    }
  }
  if (!dealt) {
    used.set(dead);
    holes.clear();
    for (const seat of seats) {
      let cards = null;
      for (let k = 0; k < DEAL_ATTEMPTS && !cards; k += 1) {
        const [a, b] = pickCards(prepared.get(seat), rng);
        if (!used[a] && !used[b]) cards = [a, b];
      }
      if (!cards) {
        const a = randomLiveCard(used, rng);
        used[a] = 1;
        cards = [a, randomLiveCard(used, rng)];
      }
      used[cards[0]] = 1;
      used[cards[1]] = 1;
      holes.set(seat, cards);
    }
  }
  for (const seat of folded) {
    const a = randomLiveCard(used, rng);
    used[a] = 1;
    const b = randomLiveCard(used, rng);
    used[b] = 1;
    holes.set(seat, [a, b]);
  }
  return { holes, used };
}

/**
 * Everything the rollouts of one decision share.
 * @param {{ events:object[], point:object, heroSeat:number, lineup:{seat:number, personaId:string}[],
 *   brainOptions?:object, createBrainImpl?:(persona:object, options:object) => object }} input
 */
export function createRolloutWorld({ events, point, heroSeat, lineup, brainOptions = ROLLOUT_BRAIN_OPTIONS, createBrainImpl = createBrain }) {
  const { before } = point;
  const hero = before.players.find((p) => p.seat === heroSeat);
  const dead = new Uint8Array(52);
  for (const c of hero.hole) dead[c] = 1;
  for (const c of before.board) dead[c] = 1;
  const ranges = heroRanges(point, heroSeat);
  const prepared = new Map([...ranges].map(([seat, weights]) => [seat, prepareRange(weights, dead)]));
  const folded = before.players.filter((p) => p.seat !== heroSeat && !ranges.has(p.seat)).map((p) => p.seat);
  const personaIds = new Map(lineup.map((entry) => [entry.seat, entry.personaId]));
  const personas = new Map();
  const brains = new Map();
  for (const p of before.players) {
    const persona = p.seat === heroSeat ? HERO_MODEL : personaFor(personaIds.get(p.seat) ?? 'unknown');
    personas.set(p.seat, persona);
    brains.set(p.seat, createBrainImpl(persona, brainOptions));
  }
  return {
    prefix: events.slice(0, point.idx),
    heroSeat,
    heroStack: hero.stack,
    dead,
    ranges,
    prepared,
    folded,
    personas,
    brains,
    boardLength: before.board.length,
  };
}

/** Plays `option` for the hero and the rest of the hand once. Deterministic for a seed. */
export function rolloutOnce(world, option, seed) {
  if (option.action === 'fold') return 0;
  const dealRng = mulberry32(seed);
  const actRng = mulberry32((seed ^ 0x5bd1e995) >>> 0);
  const { holes, used } = sampleHoles(world.prepared, world.folded, world.dead, dealRng);
  const live = [];
  for (let c = 0; c < 52; c += 1) if (!used[c]) live.push(c);
  const runout = shuffle(live, dealRng).slice(0, 5 - world.boardLength);

  const events = [];
  let state = null;
  const push = (event) => {
    state = applyEvent(state, event);
    events.push(event);
  };
  // A fresh start object per rollout also resets every brain's per-hand range cache.
  for (const event of world.prefix) {
    if (event.type === 'start') push({ ...event, seats: event.seats.map((s) => ({ ...s })) });
    else if (event.type === 'hole' && event.seat !== world.heroSeat) push({ type: 'hole', seat: event.seat, cards: holes.get(event.seat) });
    else push(event);
  }
  const aggressive = option.action === 'bet' || option.action === 'raise';
  push(aggressive
    ? { type: 'act', seat: world.heroSeat, action: option.action, amount: option.size }
    : { type: 'act', seat: world.heroSeat, action: option.action });

  let next = 0;
  for (let step = 0; state.street !== 'complete'; step += 1) {
    if (step > MAX_ROLLOUT_STEPS) throw new Error('rollout did not finish');
    if (state.needsBoard) {
      const count = BOARD_CARDS[state.needsBoard];
      push({ type: 'board', cards: runout.slice(next, next + count) });
      next += count;
      continue;
    }
    const seat = state.toAct;
    const legal = legalActions(state);
    const ctx = {
      view: viewFor(state, seat), seat, legal, events: eventsFor(events, seat),
      persona: world.personas.get(seat), profile: null, heroSeat: null, bb: state.bb,
    };
    try {
      push({ type: 'act', seat, ...world.brains.get(seat).decide(ctx, actRng) });
    } catch {
      push({ type: 'act', seat, action: legal.canCheck ? 'check' : 'fold' });
    }
  }
  return state.players.find((p) => p.seat === world.heroSeat).stack - world.heroStack;
}
