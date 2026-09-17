// scripts/poker/lib/evolve.slow.test.js
// Opt-in (POKER_SLOW=1): each archetype, measured in mixed tables like training's, lands in its own style niche.
import { describe, it, expect } from 'vitest';
import { ARCHETYPES, defaultDials } from '../../../src/private/trainers/poker/bots/dials.js';
import { emptyProfile } from '../../../src/private/trainers/poker/bots/contract.js';
import { ANCHORS, mergeProfiles, nicheOf } from './evolve.js';
import { runTableJob } from './tableJob.js';
import { TRAIN_DEFAULTS } from './trainLoop.js';

const DEALS_PER_ANCHOR = 100; // 6 anchors x 100 duplicate deals x 6 rotations = 3,600 hands per archetype

describe.skipIf(!process.env.POKER_SLOW)('style niches', () => {
  it('measures every archetype in its own niche', () => {
    const niches = Object.keys(ARCHETYPES);
    // The four archetypes plus a default-dials player, with the anchor in the hero chair as in training tables.
    const players = [...niches.map((n) => ({ kind: 'dials', dials: ARCHETYPES[n] })), { kind: 'dials', dials: defaultDials() }];
    let profiles = niches.map(() => emptyProfile());
    ANCHORS.forEach((anchor, a) => {
      const result = runTableJob({
        players: [...players, { kind: 'brain', name: anchor }], seed: 20260916, firstDeal: a * DEALS_PER_ANCHOR, deals: DEALS_PER_ANCHOR,
        equityIterations: TRAIN_DEFAULTS.equityIterations, subject: players.length, trackStyles: true,
      });
      profiles = profiles.map((p, k) => mergeProfiles(p, result.styles[k]));
    });
    const measured = niches.map((n, k) => ({
      archetype: n, niche: nicheOf(profiles[k]), vpip: profiles[k].stats.vpip.value, aggFreq: profiles[k].stats.aggFreq.value,
    }));
    for (const m of measured) expect(m.niche, JSON.stringify(measured)).toBe(m.archetype);
  }, 120_000);
});
