// The games payload, built from an explicit allow-list so an unsolved puzzle never leaks its answer.
import { GAMES, PUZZLE_GAMES } from './games.js';
import { sprintProblems } from './sprint.js';

const catalogEntry = ({ key, name, unit, min, max, decimals, lowerIsBetter, url }) =>
  ({ key, name, unit, min, max, decimals, lowerIsBetter, url });

function sprintView(night, result) {
  const problems = sprintProblems(night);
  return {
    problems: problems.map((p) => ({ prompt: p.prompt })),
    result: result && {
      score: Number(result.score),
      seconds: result.detail?.seconds,
      correct: result.detail?.correct,
      answers: problems.map((p) => p.answer),
      given: result.detail?.answers ?? null, // what Hari typed; null where blank
    },
  };
}

function flawView(puzzlesRow, result) {
  const f = puzzlesRow?.flaw;
  if (!f) return null;
  return {
    setting: f.setting,
    argument: f.argument,
    choices: f.choices,
    result: result && {
      score: Number(result.score),
      choice: result.detail?.choice,
      answerIndex: f.answer_index,
      flawName: f.choices?.[f.answer_index], // stored with the row, so a renamed key cannot throw
      explanation: f.explanation,
    },
  };
}

export function gamesPayload({ night, puzzlesRow, results, history }) {
  const byGame = new Map(results.map((r) => [r.game, r]));
  const logged = {};
  for (const g of GAMES) {
    const r = byGame.get(g.key);
    if (r) logged[g.key] = Number(r.score);
  }
  return {
    night,
    catalog: GAMES.map(catalogEntry),
    puzzles: {
      sprint: sprintView(night, byGame.get(PUZZLE_GAMES.sprint) ?? null),
      flaw: flawView(puzzlesRow, byGame.get(PUZZLE_GAMES.flaw) ?? null),
    },
    logged,
    history: history.map((h) => ({ night: h.night, game: h.game, score: Number(h.score) })),
  };
}
