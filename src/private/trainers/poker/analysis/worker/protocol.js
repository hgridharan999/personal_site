// src/private/trainers/poker/analysis/worker/protocol.js
// Messages between the page and analysisWorker.js. The handler is pure given its dependencies, so it is
// tested in Node without a real Worker.
//   request:  { type:'grade', id:number, record:{ id, heroSeat, lineup, events }, budgetMs?:number }
//   response: { type:'graded', id, analysis:{ decisions, heroAllinEv } } | { type:'error', id, error:{ message } }

export const ANALYSIS_REQUEST = Object.freeze({ GRADE: 'grade' });
export const ANALYSIS_RESPONSE = Object.freeze({ GRADED: 'graded', ERROR: 'error' });

const isRecord = (r) => r !== null && typeof r === 'object' && typeof r.id === 'string'
  && Number.isInteger(r.heroSeat) && Array.isArray(r.lineup) && Array.isArray(r.events);

/** @param {{ gradeHand:(record:object, options:object) => object }} deps */
export function createAnalysisHandler({ gradeHand }) {
  return (message) => {
    const id = message && typeof message === 'object' && Number.isInteger(message.id) ? message.id : null;
    const fail = (text) => ({ type: ANALYSIS_RESPONSE.ERROR, id, error: { message: text } });
    if (id === null) return fail('malformed message');
    if (message.type !== ANALYSIS_REQUEST.GRADE) return fail(`unknown message type: ${message.type}`);
    if (!isRecord(message.record)) return fail('grade needs a record with id, heroSeat, lineup and events');
    const options = Number.isFinite(message.budgetMs) && message.budgetMs > 0 ? { budgetMs: message.budgetMs } : {};
    try {
      return { type: ANALYSIS_RESPONSE.GRADED, id, analysis: gradeHand(message.record, options) };
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  };
}
