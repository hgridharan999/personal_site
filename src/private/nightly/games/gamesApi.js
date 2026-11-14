import { request } from '../../trainers/lib/api.js';

// The Games section's calls to /api/nightly. Every games action answers `{ games: payload }`;
// each function here returns the payload. Errors throw ApiError from the shared request helper.

const PATH = '/api/nightly';

async function call(action, { method = 'GET', body, fetchImpl } = {}) {
  const res = await request(`${PATH}?action=${action}`, { method, body, fetchImpl });
  return res.games;
}

export const getGames = (opts) => call('games', opts);
export const makePuzzles = (opts) => call('puzzles', { ...opts, method: 'POST' });
export const solve = (night, puzzle, answer, opts) => call('solve', { ...opts, method: 'POST', body: { night, puzzle, answer } });
export const logScore = (night, game, score, opts) => call('log', { ...opts, method: 'POST', body: { night, game, score } });
