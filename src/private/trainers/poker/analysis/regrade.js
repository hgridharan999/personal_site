// Grades stored hands that have no decisions at the current analysis version (hands saved before Phase 5,
// or whose grading timed out at the table) and saves them with PATCH hands.
import { ANALYSIS_VERSION } from './version.js';

export const REGRADE_PAGE = 10;
export const REGRADE_BATCH = 5;

const recordOf = (hand) => ({ id: hand.id, heroSeat: hand.heroSeat, lineup: hand.lineup, events: hand.events });

async function gradeOne(analyze, hand) {
  try {
    const analysis = await analyze(recordOf(hand));
    return analysis && Array.isArray(analysis.decisions) && analysis.decisions.length > 0 ? analysis : null;
  } catch {
    return null;
  }
}

const gradeEntry = (hand, analysis) => ({
  handId: hand.id, analysisVersion: ANALYSIS_VERSION, decisions: analysis.decisions, heroAllinEv: analysis.heroAllinEv ?? null,
});

/**
 * @param {{ sessionId:string, api:{ listUngradedPokerHands:Function, savePokerHandGrades:Function },
 *   analyze:(record:object) => Promise<object>, isCancelled?:() => boolean,
 *   onProgress?:(progress:{ graded:number, failed:number }) => void }} input
 * @returns {Promise<{ graded:number, failed:number, cancelled:boolean }>}
 */
export async function regradeSession({ sessionId, api, analyze, isCancelled = () => false, onProgress = () => {} }) {
  let afterHandNo = 0;
  let graded = 0;
  let failed = 0;
  let batch = [];
  const report = () => onProgress({ graded, failed });
  const flush = async () => {
    if (batch.length === 0) return;
    const grades = batch;
    batch = [];
    const result = await api.savePokerHandGrades({ grades });
    graded += result.updated.length + result.skipped.length;
    report();
  };

  while (!isCancelled()) {
    const page = await api.listUngradedPokerHands({ sessionId, belowVersion: ANALYSIS_VERSION, afterHandNo, limit: REGRADE_PAGE });
    for (const hand of page.hands) {
      if (isCancelled()) break;
      const analysis = await gradeOne(analyze, hand);
      if (!analysis) {
        failed += 1;
        report();
        continue;
      }
      batch.push(gradeEntry(hand, analysis));
      if (batch.length >= REGRADE_BATCH) await flush();
    }
    if (page.nextAfterHandNo === null) break;
    afterHandNo = page.nextAfterHandNo;
  }
  await flush();
  return { graded, failed, cancelled: isCancelled() };
}

/** Grades and saves one stored hand (the replayer). @returns {Promise<boolean>} whether it is graded now */
export async function regradeHand(hand, { api, analyze }) {
  const analysis = await gradeOne(analyze, hand);
  if (!analysis) return false;
  const result = await api.savePokerHandGrades({ grades: [gradeEntry(hand, analysis)] });
  return result.updated.length + result.skipped.length > 0;
}
