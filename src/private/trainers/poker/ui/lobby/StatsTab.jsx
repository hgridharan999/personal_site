import PokerStats from '../stats/PokerStats';

/** Stats tab on /me/poker?tab=stats: the long-term leak tracker (spec §7.4, Phase 6). */
export default function StatsTab() {
  return <PokerStats />;
}
