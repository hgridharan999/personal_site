import { describe, it, expect, vi } from 'vitest';
import { ApiError, request, getStats } from './api.js';

const jsonResponse = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('request', () => {
  it('returns parsed JSON on success and sends JSON bodies', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { saved: true }));
    await expect(request('/api/x', { method: 'POST', body: { a: 1 }, fetchImpl })).resolves.toEqual({ saved: true });
    expect(fetchImpl).toHaveBeenCalledWith('/api/x', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{"a":1}',
    });
  });
  it('throws ApiError with status/code/details on failure', async () => {
    const fetchImpl = async () => jsonResponse(400, { error: 'Bad', code: 'VALIDATION_ERROR', details: { x: 1 } });
    const err = await request('/api/x', { fetchImpl }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Bad', details: { x: 1 } });
  });
  it('handles non-JSON error bodies', async () => {
    const fetchImpl = async () => ({ ok: false, status: 502, json: async () => { throw new Error('no json'); } });
    const err = await request('/api/x', { fetchImpl }).catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_ERROR', message: 'Request failed (502)' });
  });
});

describe('getStats', () => {
  it('builds the query string', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, {}));
    await getStats({ trainer: 'zetamac', configKey: 'a'.repeat(64) }, { fetchImpl });
    expect(fetchImpl.mock.calls[0][0]).toBe(`/api/trainers/stats?trainer=zetamac&mode=standard&configKey=${'a'.repeat(64)}`);
  });
});
