import { describe, it, expect, vi } from 'vitest';
import { getGames, makePuzzles, solve, logScore } from './gamesApi.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const stub = (status, body) => vi.fn(async () => jsonResponse(status, body));

describe('gamesApi', () => {
  it('getGames reads the games action and unwraps the payload', async () => {
    const fetchImpl = stub(200, { games: { night: '2026-11-13' } });
    await expect(getGames({ fetchImpl })).resolves.toEqual({ night: '2026-11-13' });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/nightly?action=games');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });

  it('makePuzzles posts to the puzzles action with no body', async () => {
    const fetchImpl = stub(200, { games: { night: 'n' } });
    await expect(makePuzzles({ fetchImpl })).resolves.toEqual({ night: 'n' });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/nightly?action=puzzles');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
    expect(fetchImpl.mock.calls[0][1].body).toBeUndefined();
  });

  it('solve posts { night, puzzle, answer } to the solve action', async () => {
    const fetchImpl = stub(200, { games: { ok: 1 } });
    await expect(solve('2026-11-13', 'sprint', [1, 2], { fetchImpl })).resolves.toEqual({ ok: 1 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/nightly?action=solve');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ night: '2026-11-13', puzzle: 'sprint', answer: [1, 2] });
  });

  it('logScore posts { night, game, score } to the log action', async () => {
    const fetchImpl = stub(200, { games: { ok: 2 } });
    await expect(logScore('2026-11-13', 'krillion', 540, { fetchImpl })).resolves.toEqual({ ok: 2 });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/nightly?action=log');
    expect(JSON.parse(init.body)).toEqual({ night: '2026-11-13', game: 'krillion', score: 540 });
  });
});
