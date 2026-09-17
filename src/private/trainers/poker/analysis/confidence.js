// Spec §7.1 confidence: not confident when the top two options are within the Monte Carlo standard error,
// or when the dominant opponent's range is still wide open (more than 60% of combos live, near-uniform).
import { COMBO_COUNT, COMBO_CARDS } from '../bots/handClass.js';
import { pairedStderr } from './evOptions.js';

export const VAGUE_LIVE_SHARE = 0.6;
export const VAGUE_EVENNESS = 0.85;
export const LIVE_WEIGHT_FLOOR = 0.05;

/**
 * Over combos not touching dead cards: liveShare = share with weight ≥ 5% of the max weight;
 * evenness = exp(entropy of the normalized weights) / combos (1 for a uniform range).
 */
export function rangeSpread(weights, dead) {
  let combos = 0;
  let max = 0;
  let total = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    if (dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    combos += 1;
    const w = weights[i] > 0 ? weights[i] : 0;
    total += w;
    if (w > max) max = w;
  }
  if (combos === 0 || total <= 0) return { liveShare: 0, evenness: 0 };
  let live = 0;
  let entropy = 0;
  for (let i = 0; i < COMBO_COUNT; i += 1) {
    if (dead[COMBO_CARDS[2 * i]] || dead[COMBO_CARDS[2 * i + 1]]) continue;
    const w = weights[i] > 0 ? weights[i] : 0;
    if (w <= 0) continue;
    if (w >= LIVE_WEIGHT_FLOOR * max) live += 1;
    const p = w / total;
    entropy -= p * Math.log(p);
  }
  return { liveShare: live / combos, evenness: Math.exp(entropy) / combos };
}

export function isVagueRange(weights, dead) {
  const { liveShare, evenness } = rangeSpread(weights, dead);
  return liveShare > VAGUE_LIVE_SHARE && evenness >= VAGUE_EVENNESS;
}

/**
 * The live opponent who made the latest bet or raise in `events`; otherwise the live opponent with the largest
 * contribution (lowest seat on ties); null without live opponents.
 */
export function dominantOpponent(state, events, heroSeat) {
  const live = new Set(state.players.filter((p) => !p.folded && p.seat !== heroSeat).map((p) => p.seat));
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (e.type === 'act' && (e.action === 'bet' || e.action === 'raise') && live.has(e.seat)) return e.seat;
  }
  let best = null;
  for (const p of state.players) {
    if (live.has(p.seat) && (best === null || p.total > best.total)) best = p;
  }
  return best ? best.seat : null;
}

/** @param {{ mean:number, samples:Float64Array }[]} ranked best first */
export function isConfident(ranked, { vagueRange = false } = {}) {
  if (vagueRange) return false;
  if (ranked.length < 2) return true;
  const [first, second] = ranked;
  return Math.abs(first.mean - second.mean) >= pairedStderr(first.samples, second.samples);
}
