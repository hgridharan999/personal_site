// The games actions of /api/nightly: games (GET), puzzles, solve, log (POST). Each returns
// { games: payload }, built from the allow-listed view so an unsolved puzzle never leaks its answer.
import { addDays, nightDate } from './dates.js';
import { PUZZLE_GAMES } from './games.js';
import { gamesPayload } from './gamesView.js';
import * as gq from './gamesQueries.js';
import { isModelMissing } from './generate.js';
import { ModelError } from './model.js';
import { parseBody } from './parse.js';
import { runPuzzles } from './puzzleGen.js';
import { LogBody, SolveBody } from './schemas.js';
import { scoreSprint } from './sprint.js';
import { sendError } from '../http.js';

export const GAMES_ACTIONS = {
  games: { method: 'GET', auth: true },
  puzzles: { method: 'POST', auth: true },
  solve: { method: 'POST', auth: true },
  log: { method: 'POST', auth: true },
};

async function respond(ctx, night, puzzlesRow) {
  const { sql, res } = ctx;
  const [row, results, history] = await Promise.all([
    puzzlesRow === undefined ? gq.getPuzzles(sql, night) : puzzlesRow,
    gq.getResults(sql, night),
    gq.getHistory(sql, addDays(night, -13), night),
  ]);
  return res.status(200).json({ games: gamesPayload({ night, puzzlesRow: row, results, history }) });
}

async function games(ctx) {
  return respond(ctx, nightDate(ctx.now()));
}

async function puzzles(ctx) {
  const { sql, res } = ctx;
  const night = nightDate(ctx.now());
  const model = ctx.getModel();
  if (isModelMissing(model)) return sendError(res, 500, 'MODEL_NOT_CONFIGURED', 'The model is not configured');
  let row;
  try {
    row = await runPuzzles({ sql, model, night, deadline: ctx.deadline() });
  } catch (err) {
    console.error('nightly puzzles failed:', err instanceof ModelError ? `${err.code}: ${err.message}` : err);
    const details = err instanceof ModelError ? { reason: err.code } : undefined;
    return sendError(res, 502, 'PUZZLES_FAILED', 'The puzzles could not be generated', details);
  }
  return respond(ctx, night, row);
}

/** Build the stored result for a solve body, or an error to send. */
async function solveResult(sql, body) {
  if (body.puzzle === 'sprint') {
    const { answers, seconds } = body.answer;
    const { score, correct } = scoreSprint(body.night, answers);
    return { game: PUZZLE_GAMES.sprint, score, detail: { seconds, correct, answers } };
  }
  const row = await gq.getPuzzles(sql, body.night);
  if (!row?.flaw) return { error: ['NO_PUZZLES', 'Tonight\'s puzzles have not been generated'] };
  const { choice } = body.answer;
  return { game: PUZZLE_GAMES.flaw, score: choice === row.flaw.answer_index ? 1 : 0, detail: { choice } };
}

async function solve(ctx) {
  const { sql, req, res } = ctx;
  const body = parseBody(SolveBody, req, res);
  if (!body) return undefined;
  const night = nightDate(ctx.now());
  if (body.night !== night) return sendError(res, 409, 'NIGHT_CLOSED', 'This night has closed');
  const result = await solveResult(sql, body);
  if (result.error) return sendError(res, 409, ...result.error);
  const { game, score, detail } = result;
  if (!(await gq.insertPuzzleResult(sql, { night, game, score, detail }))) {
    return sendError(res, 409, 'ALREADY_SOLVED', 'This puzzle was already solved');
  }
  return respond(ctx, night);
}

async function log(ctx) {
  const { sql, req, res } = ctx;
  const body = parseBody(LogBody, req, res);
  if (!body) return undefined;
  const night = nightDate(ctx.now());
  if (body.night !== night) return sendError(res, 409, 'NIGHT_CLOSED', 'This night has closed');
  await gq.upsertGameScore(sql, { night, game: body.game, score: body.score });
  return respond(ctx, night);
}

export const GAMES_HANDLERS = { games, puzzles, solve, log };
