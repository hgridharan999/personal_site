import { describe, it, expect, vi } from 'vitest';
import { ApiError } from '../trainers/lib/api.js';
import { getToday, generate, submit, grade, publish, pollToday } from './nightlyApi.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const stub = (status, body) => vi.fn(async () => jsonResponse(status, body));
const ID = '11111111-1111-4111-8111-111111111111';

describe('nightlyApi', () => {
  it('getToday reads the today action', async () => {
    const fetchImpl = stub(200, { night: '2026-11-12', session: null });
    await expect(getToday({ fetchImpl })).resolves.toEqual({ night: '2026-11-12', session: null });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/nightly?action=today');
    expect(fetchImpl.mock.calls[0][1].method).toBe('GET');
  });

  it('generate posts to the generate action and returns the session', async () => {
    const fetchImpl = stub(201, { session: { id: ID, status: 'generated' } });
    await expect(generate({ fetchImpl })).resolves.toEqual({ session: { id: ID, status: 'generated' } });
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/nightly?action=generate');
    expect(fetchImpl.mock.calls[0][1].method).toBe('POST');
  });

  it('generate sends a JSON content type even though it has no body', async () => {
    const fetchImpl = stub(201, { session: { id: ID, status: 'generated' } });
    await generate({ fetchImpl });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('getToday stays header- and body-less', async () => {
    const fetchImpl = stub(200, { night: '2026-11-12', session: null });
    await getToday({ fetchImpl });
    const init = fetchImpl.mock.calls[0][1];
    expect(init.headers).toBeUndefined();
    expect(init.body).toBeUndefined();
  });

  it('submit posts the body to /api/nightly?action=submit', async () => {
    const fetchImpl = stub(200, { session: { id: ID, status: 'submitted' } });
    const body = { sessionId: ID, answers: [{ idx: 0, answer: 'a' }], take: { storyIndex: 0, body: 't' } };
    await submit(body, { fetchImpl });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/nightly?action=submit');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it('grade and publish send only the session id', async () => {
    const fetchImpl = stub(200, { session: { id: ID, status: 'graded' } });
    await grade(ID, { fetchImpl });
    await publish(ID, { fetchImpl });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/api/nightly?action=grade', '/api/nightly?action=publish']);
    for (const [, init] of fetchImpl.mock.calls) expect(JSON.parse(init.body)).toEqual({ sessionId: ID });
  });

  it('returns a 202 from grade or generate as { inProgress: true }, without throwing', async () => {
    await expect(grade(ID, { fetchImpl: stub(202, { inProgress: true }) })).resolves.toEqual({ inProgress: true });
    // even if the body is empty or odd, the status decides
    await expect(generate({ fetchImpl: stub(202, {}) })).resolves.toEqual({ inProgress: true });
  });

  it('throws ApiError with the code on a 409', async () => {
    const fetchImpl = stub(409, { error: 'This night closed', code: 'NIGHT_CLOSED' });
    const err = await submit({ sessionId: ID }, { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'NIGHT_CLOSED' });
  });

  it('throws ApiError on a 502 from generate', async () => {
    const err = await generate({ fetchImpl: stub(502, { error: 'x', code: 'GENERATION_FAILED' }) }).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'GENERATION_FAILED' });
  });
});

describe('pollToday', () => {
  const at = (status) => ({ night: '2026-11-12', session: { id: ID, status } });

  /** A clock that moves forward by each sleep, so the 6-minute cap runs in no real time. */
  function fakeTime() {
    let t = 0;
    return { now: () => t, sleep: vi.fn(async (ms) => { t += ms; }) };
  }

  it('waits 5s between reads and stops once the session is no longer busy', async () => {
    const time = fakeTime();
    const fetchToday = vi.fn()
      .mockResolvedValueOnce(at('grading'))
      .mockResolvedValueOnce(at('grading'))
      .mockResolvedValueOnce(at('graded'));
    const result = await pollToday({ fetchToday, ...time });
    expect(result).toEqual({ today: at('graded'), timedOut: false });
    expect(fetchToday).toHaveBeenCalledTimes(3);
    expect(time.sleep.mock.calls.every(([ms]) => ms === 5000)).toBe(true);
  });

  it('stops after 6 minutes and reports the time-out', async () => {
    const time = fakeTime();
    const fetchToday = vi.fn(async () => at('generating'));
    const result = await pollToday({ fetchToday, ...time });
    expect(result).toEqual({ today: at('generating'), timedOut: true });
    expect(fetchToday).toHaveBeenCalledTimes(72);
  });

  it('stops quietly when cancelled', async () => {
    const time = fakeTime();
    let cancelled = false;
    const fetchToday = vi.fn(async () => { cancelled = true; return at('grading'); });
    await expect(pollToday({ fetchToday, ...time, cancelled: () => cancelled })).resolves.toBeNull();
    expect(fetchToday).toHaveBeenCalledTimes(1);
  });

  it('lets a failed read reject, so the page can show an error', async () => {
    const time = fakeTime();
    const fetchToday = vi.fn(async () => { throw new ApiError(500, 'X', 'boom'); });
    await expect(pollToday({ fetchToday, ...time })).rejects.toThrow('boom');
  });
});
