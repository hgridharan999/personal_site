// Folds each finished hand into the hero's running profile (contracts §4.1).
// Phase 3 owns the stat definitions in bots/profileStats.js. The optional glob picks that module up
// once it is merged, and until then the profile passes through unchanged.
import { emptyProfile } from '../bots/contract.js';

const phase3 = Object.values(import.meta.glob('../bots/profileStats.js', { eager: true }))[0];

/** Phase 3's accumulateProfile when present, otherwise identity. */
export const accumulateProfile = phase3?.accumulateProfile ?? ((profile) => profile);

/** @returns {import('../bots/contract.js').PlayerProfile} */
export function foldHandIntoProfile(profile, heroSeat, events, accumulate = accumulateProfile) {
  return accumulate(profile ?? emptyProfile(), heroSeat, events);
}
