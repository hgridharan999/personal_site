// Per-problem input tracking for a Zetamac game. Pure: the UI owns the clock
// (performance.now()) and passes it in.

// The server caps attempt.corrections at this value. Holding Backspace on one
// problem for long enough (or a full-length-wrong retype loop) would otherwise
// exceed the server's limit and get the whole game rejected with a 400,
// permanently failing an otherwise-valid save.
export const MAX_CORRECTIONS = 1000;

export function startProblem(problem, idx, now) {
  return { problem, idx, shownAt: now, corrections: 0, wasFullWrong: false };
}

function toAttempt(state, response, isCorrect, timeMs) {
  const { problem } = state;
  return {
    idx: state.idx,
    qtype: problem.qtype,
    factKey: problem.factKey,
    prompt: problem.prompt,
    answer: String(problem.answer),
    response,
    isCorrect,
    timeMs,
    corrections: state.corrections,
  };
}

export function handleInput(state, value, now) {
  const answer = String(state.problem.answer);
  const trimmed = value.trim();
  if (trimmed === answer) {
    return { state, attempt: toAttempt(state, trimmed, true, Math.round(now - state.shownAt)) };
  }
  const fullWrong = trimmed.length >= answer.length;
  const corrections = Math.min(MAX_CORRECTIONS, state.corrections + (fullWrong && !state.wasFullWrong ? 1 : 0));
  return { state: { ...state, corrections, wasFullWrong: fullWrong }, attempt: null };
}

export function handleDeleteKey(state) {
  return { ...state, corrections: Math.min(MAX_CORRECTIONS, state.corrections + 1) };
}

// The server caps attempt.response at this length. The input itself stays
// uncapped (faithful to Zetamac); only the stored leftover is truncated, so a
// key held down at the buzzer can never make the whole game unsaveable.
export const MAX_RESPONSE_CHARS = 32;

export function unfinishedAttempt(state, value) {
  return toAttempt(state, value.trim().slice(0, MAX_RESPONSE_CHARS) || null, false, null);
}

export function zetamacTotals(attempts) {
  const correct = attempts.filter((a) => a.isCorrect).length;
  return { correct, wrong: 0, unanswered: 0, score: correct };
}
