// What the action log's aria-live region should say after the log changes.

/**
 * @typedef {{ handNo:number, count:number }} AnnounceMark  the hand and how many of its log lines were announced
 */

/**
 * Every log line added since `prev`, joined with ". ". A new hand (or a log shorter than the mark)
 * starts over from its first line, so a burst of bot actions is announced in full, not only the last.
 * @param {AnnounceMark|null} prev
 * @param {string[]} lines the current hand's log lines
 * @param {number} handNo
 * @returns {{ text:string, mark:AnnounceMark }}
 */
export function newAnnouncement(prev, lines, handNo) {
  const sameHand = prev !== null && prev.handNo === handNo && prev.count <= lines.length;
  const start = sameHand ? prev.count : 0;
  return { text: lines.slice(start).join('. '), mark: { handNo, count: lines.length } };
}
