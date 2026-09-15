export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function request(path, { method = 'GET', body, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.code || 'HTTP_ERROR', data.error || `Request failed (${res.status})`, data.details);
  }
  return data;
}

export const saveSession = (payload, opts) =>
  request('/api/trainers/sessions', { method: 'POST', body: payload, ...opts });

export const getSession = (id, opts) =>
  request(`/api/trainers/sessions?id=${encodeURIComponent(id)}`, opts);

export function getStats({ trainer, mode = 'standard', configKey }, opts) {
  const query = new URLSearchParams({ trainer, mode });
  if (configKey) query.set('configKey', configKey);
  return request(`/api/trainers/stats?${query}`, opts);
}

export const getDrill = (opts) => request('/api/trainers/drill', opts);
