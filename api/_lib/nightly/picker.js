import { daysSinceMonday } from './dates.js';
import { CASE_REP, TYPE_KEYS } from './types.js';
import { FIELDS } from './interests.js';

const WEEKLY_CASE_REPS = 2;

/** n distinct random members of items (partial Fisher-Yates). */
export function sample(items, n, rand) {
  const pool = [...items];
  const out = [];
  for (let i = 0; i < n && pool.length; i++) {
    const j = Math.min(pool.length - 1, Math.floor(rand() * pool.length));
    out.push(pool.splice(j, 1)[0]);
  }
  return out;
}

/** Three distinct question types, forcing a case rep when the week would otherwise miss two. */
export function pickTypes({ night, weekTypes, rand = Math.random }) {
  const count = weekTypes.flat().filter((k) => k === CASE_REP).length;
  const nightsLeft = 7 - daysSinceMonday(night); // tonight through Sunday, inclusive
  const forced = count < WEEKLY_CASE_REPS && nightsLeft <= WEEKLY_CASE_REPS - count;
  if (!forced) return sample(TYPE_KEYS, 3, rand);
  const others = sample(TYPE_KEYS.filter((k) => k !== CASE_REP), 2, rand);
  return sample([CASE_REP, ...others], 3, rand);
}

/** A niche field not used recently; falls back to the full list if all are excluded. */
export function pickField({ recentTopics, rand = Math.random }) {
  const recent = new Set(recentTopics);
  const open = FIELDS.filter((f) => !recent.has(f));
  return sample(open.length ? open : FIELDS, 1, rand)[0];
}
