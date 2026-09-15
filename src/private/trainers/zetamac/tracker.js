// Per-problem input tracking for a Zetamac game. Pure: the UI owns the clock
// (performance.now()) and passes it in.

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
  const corrections = state.corrections + (fullWrong && !state.wasFullWrong ? 1 : 0);
  return { state: { ...state, corrections, wasFullWrong: fullWrong }, attempt: null };
}

export function handleDeleteKey(state) {
  return { ...state, corrections: state.corrections + 1 };
}

export function unfinishedAttempt(state, value) {
  return toAttempt(state, value.trim() || null, false, null);
}

export function zetamacTotals(attempts) {
  const correct = attempts.filter((a) => a.isCorrect).length;
  return { correct, wrong: 0, unanswered: 0, score: correct };
}
