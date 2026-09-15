import { verifySession } from './session.js';

export function sendError(res, status, code, error, details) {
  return res.status(status).json(details === undefined ? { error, code } : { error, code, details });
}

/** Common preamble for private API routes. Returns the sql client, or null after responding. */
export function guard(req, res, { methods, auth, getSql }) {
  res.setHeader('Cache-Control', 'no-store');
  if (!methods.includes(req.method)) {
    res.setHeader('Allow', methods.join(', '));
    sendError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
    return null;
  }
  if (!verifySession(req, auth())) {
    sendError(res, 401, 'UNAUTHORIZED', 'Sign in required');
    return null;
  }
  const sql = getSql();
  if (!sql) {
    sendError(res, 500, 'DB_NOT_CONFIGURED', 'Database is not configured');
    return null;
  }
  return sql;
}
