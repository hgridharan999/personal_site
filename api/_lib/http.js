import { verifySession } from './session.js';

export function sendError(res, status, code, error, details) {
  return res.status(status).json(details === undefined ? { error, code } : { error, code, details });
}

const isJson = (req) => /^application\/json\s*(;|$)/i.test(String(req.headers?.['content-type'] ?? ''));

/**
 * Common preamble for API routes. Returns the sql client, or null after responding.
 * Auth is on unless a route opts out with `requireAuth: false` (only the public nightly notes do).
 */
export function guard(req, res, { methods, auth, getSql, requireAuth = true }) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return null;
  }
  if (requireAuth !== false && !verifySession(req, auth())) {
    sendError(res, 401, 'UNAUTHORIZED', 'Sign in required');
    return null;
  }
  if (req.method === 'POST' && !isJson(req)) {
    sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return null;
  }
  const sql = getSql();
  if (!sql) {
    sendError(res, 500, 'DB_NOT_CONFIGURED', 'Database is not configured');
    return null;
  }
  return sql;
}
