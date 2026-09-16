import { openEntry, handEntry, closeEntry } from './pokerOutbox.js';

/**
 * The table's lifecycle props (contracts §4). Each handler only queues a save and returns;
 * play never waits on the network.
 * @param {{ outbox: { enqueue:(payload:object) => void }, kick?: () => void }} deps
 */
export function createPokerPersistence({ outbox, kick = () => {} }) {
  const queue = (payload) => {
    outbox.enqueue(payload);
    kick();
  };
  return {
    onSessionStart: (session) => queue(openEntry(session)),
    /** `analysis` ({ decisions, heroAllinEv }) is filled by Phase 5 grading. */
    onHandComplete: (record, analysis = {}) => queue(handEntry({
      hand: record,
      decisions: analysis.decisions ?? [],
      heroAllinEv: analysis.heroAllinEv ?? null,
    })),
    onSessionEnd: (summary) => queue(closeEntry(summary)),
  };
}
