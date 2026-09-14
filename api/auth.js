import { authConfig, checkPassword, sessionCookie, clearedCookie, verifySession } from './_lib/session.js';

// GET    /api/auth → { authenticated }
// POST   /api/auth { password } → sets session cookie
// DELETE /api/auth → clears session cookie

// Best-effort throttle. Serverless instances don't share memory, so this slows
// brute force rather than guaranteeing a hard limit.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map();

function clientIp(req) {
  return String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
}

function isThrottled(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) return false;
  return entry.count >= MAX_ATTEMPTS;
}

function recordFailure(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.start > WINDOW_MS) attempts.set(ip, { start: now, count: 1 });
  else entry.count += 1;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const config = authConfig();

  if (req.method === 'GET') {
    return res.status(200).json({ authenticated: verifySession(req, config) });
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', clearedCookie());
    return res.status(200).json({ authenticated: false });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Method not allowed', code: 'METHOD_NOT_ALLOWED' });
  }

  if (!config) {
    console.error('Auth not configured: set ADMIN_PASSWORD (12+ chars) and SESSION_SECRET (32+ chars).');
    return res.status(500).json({ error: 'Login is not configured', code: 'AUTH_NOT_CONFIGURED' });
  }

  const ip = clientIp(req);
  if (isThrottled(ip)) {
    return res.status(429).json({ error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' });
  }

  const password = req.body?.password;
  if (!checkPassword(password, config)) {
    recordFailure(ip);
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ error: 'Incorrect password', code: 'INVALID_CREDENTIALS' });
  }

  attempts.delete(ip);
  res.setHeader('Set-Cookie', sessionCookie(config));
  return res.status(200).json({ authenticated: true });
}
