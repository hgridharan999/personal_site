// Tonight's brief, shared by the "Generate now" action and the cron. Claim first, so the cron and the
// button can overlap and still pay for at most one brief a night.
import { addDays, nightDate, weekStart } from './dates.js';
import { createDeadline, createModel } from './model.js';
import { pickField, pickTypes } from './picker.js';
import {
  claimGeneration, getSessionByDate, recentNicheTopics, releaseClaim, saveBrief, weekTypes,
} from './queries.js';

/** Under Vercel's 300s, so the function answers before it is killed. */
export const REQUEST_BUDGET_MS = 280_000;
const NICHE_LOOKBACK_DAYS = 14;
const NOT_CONFIGURED = Symbol('model not configured');

/**
 * The model, built on first use by generate or grade, so a missing ANTHROPIC_API_KEY never breaks
 * the other actions (or module load). The SDK constructs happily without a key and only fails on
 * the first request, so the key is checked here, by name only.
 */
export function lazyModel(model) {
  let built = model ?? null;
  return () => {
    if (built) return built;
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      console.error('nightly: ANTHROPIC_API_KEY is not set');
      return NOT_CONFIGURED;
    }
    try {
      built = createModel();
      return built;
    } catch {
      console.error('nightly: the model client could not be created');
      return NOT_CONFIGURED;
    }
  };
}

export const isModelMissing = (model) => model === NOT_CONFIGURED;

/**
 * @returns {Promise<{ status: 'created'|'exists'|'in_progress', night: string, session: object|null }>}
 *   `session` is the raw nightly_sessions row (or null while another run holds the claim).
 *   On failure after claiming, the claim is released and the error rethrown.
 */
export async function runGenerate({ sql, model, now = () => new Date(), deadline, rand = Math.random }) {
  const night = nightDate(now());
  const existing = await getSessionByDate(sql, night);
  if (existing && existing.status !== 'generating') return { status: 'exists', night, session: existing };

  const id = await claimGeneration(sql, night);
  if (!id) return { status: 'in_progress', night, session: null };

  try {
    const [week, recent] = await Promise.all([
      weekTypes(sql, weekStart(night), night),
      recentNicheTopics(sql, addDays(night, -NICHE_LOOKBACK_DAYS)),
    ]);
    const types = pickTypes({ night, weekTypes: week, rand });
    const field = pickField({ recentTopics: recent, rand });
    const brief = await model.generateBrief({
      night, types, field, deadline: deadline ?? createDeadline(REQUEST_BUDGET_MS),
    });
    const session = await saveBrief(sql, id, brief);
    if (!session) throw new Error('the generation claim was lost before the brief was saved');
    return { status: 'created', night, session };
  } catch (err) {
    try {
      await releaseClaim(sql, id);
    } catch (releaseErr) {
      console.error('nightly: releasing the generation claim failed:', releaseErr);
    }
    throw err;
  }
}
