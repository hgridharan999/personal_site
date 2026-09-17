// What the save status's hidden live region should say when a save has been stuck "saving" for a
// while (e.g. offline). Announced once per stretch, not once per hand: PokerSaveStatus.jsx no
// longer marks the saving/saved states as role="status", since that queued a polite announcement
// on every hand, competing with the table's own ActionLog announcements (lib/announce.js).

/** How long a save must stay pending before the stretch is worth announcing. */
export const ANNOUNCE_AFTER_MS = 10_000;

export const STILL_SAVING_TEXT = 'Still trying to save. Your hands are kept on this device and will sync automatically.';

/**
 * @typedef {{ pendingSince: number|null, announced: boolean }} SaveAnnounceMark
 */

/**
 * Pure decision: whether `nowMs` is the moment to announce a stuck save, and the mark to keep for
 * next time. Leaving the 'saving' status resets the mark, so the next stretch of syncing gets its
 * own announcement.
 * @param {SaveAnnounceMark|null} prev
 * @param {'saving'|'saved'|'failed'} status
 * @param {number} nowMs
 * @returns {{ text: string, mark: SaveAnnounceMark }}
 */
export function nextSaveAnnouncement(prev, status, nowMs) {
  if (status !== 'saving') return { text: '', mark: { pendingSince: null, announced: false } };
  const pendingSince = prev?.pendingSince ?? nowMs;
  const already = prev?.announced ?? false;
  const due = !already && nowMs - pendingSince >= ANNOUNCE_AFTER_MS;
  return { text: due ? STILL_SAVING_TEXT : '', mark: { pendingSince, announced: already || due } };
}
