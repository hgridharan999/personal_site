// Choosing which personas sit in the five bot seats. Pure: personas and rng are passed in.
import { shuffle } from '../engine/cards.js';
import { BOT_SEATS } from './constants.js';

/** @typedef {{ seat:number, personaId:string }} LineupEntry */

/** Five distinct random personas, one per bot seat. */
export function randomLineup(personas, rng) {
  if (personas.length < BOT_SEATS.length) throw new Error(`need at least ${BOT_SEATS.length} personas`);
  const ids = shuffle(personas.map((p) => p.id), rng);
  return BOT_SEATS.map((seat, i) => ({ seat, personaId: ids[i] }));
}

/** The first five personas in list order; the starting point of the table builder. */
export function defaultLineup(personas) {
  return BOT_SEATS.map((seat, i) => ({ seat, personaId: personas[i]?.id ?? null }));
}

/** Null when valid, otherwise a message for the table builder. */
export function validateLineup(lineup, personas) {
  if (!Array.isArray(lineup) || lineup.some((x) => !x || typeof x !== 'object')) return 'Choose a bot for every seat.';
  const known = new Set(personas.map((p) => p.id));
  const seats = lineup.map((x) => x.seat);
  if (lineup.length !== BOT_SEATS.length || BOT_SEATS.some((seat) => !seats.includes(seat))) {
    return 'Choose a bot for every seat.';
  }
  if (lineup.some((x) => !known.has(x.personaId))) return 'Choose a bot for every seat.';
  if (new Set(lineup.map((x) => x.personaId)).size !== lineup.length) return 'Each bot can sit in only one seat.';
  return null;
}

/**
 * A persona for a refilled seat: random among personas not currently seated.
 * Falls back to `fallbackId` (the busted seat's persona) when every persona is seated.
 */
export function refillPersonaId(seatedIds, personas, rng, fallbackId) {
  const free = personas.map((p) => p.id).filter((id) => !seatedIds.includes(id));
  if (free.length === 0) return fallbackId;
  return free[Math.floor(rng() * free.length)];
}

/**
 * Validates the router state the lobby passes to the table page.
 * @returns {{ tableMode:'random'|'custom', speed:'fast'|'normal', lineup:LineupEntry[] } | null}
 */
export function parseTableConfig(state, personas) {
  if (!state || typeof state !== 'object') return null;
  const { tableMode, speed, lineup } = state;
  if (tableMode !== 'random' && tableMode !== 'custom') return null;
  if (speed !== 'fast' && speed !== 'normal') return null;
  if (validateLineup(lineup, personas) !== null) return null;
  return { tableMode, speed, lineup: lineup.map(({ seat, personaId }) => ({ seat, personaId })) };
}
