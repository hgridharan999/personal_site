import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

// Files under api/_lib are not exposed as routes by Vercel (leading underscore).
// Session = "<expiryMs>.<hmac>" in an HttpOnly cookie; stateless, no DB needed.

export const COOKIE_NAME = 'hg_session';
const MAX_AGE_S = 60 * 60 * 24 * 7; // 7 days

// The password hash is mixed into the signature, so changing ADMIN_PASSWORD
// invalidates every existing session. Rotating SESSION_SECRET does the same.
function sign(exp, config) {
  const pwHash = createHash('sha256').update(config.password).digest('base64url');
  return createHmac('sha256', config.secret).update(`${exp}.${pwHash}`).digest('base64url');
}

function safeEqual(a, b) {
  // Hash first so both buffers are equal length — timingSafeEqual requires it.
  const ha = createHash('sha256').update(String(a)).digest();
  const hb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ha, hb);
}

export function authConfig() {
  const password = process.env.ADMIN_PASSWORD;
  const secret = process.env.SESSION_SECRET;
  if (!password || password.length < 12 || !secret || secret.length < 32) return null;
  return { password, secret };
}

export function checkPassword(candidate, config) {
  return typeof candidate === 'string' && safeEqual(candidate, config.password);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k !== name) continue;
    try {
      return decodeURIComponent(v.join('='));
    } catch {
      return null; // malformed cookie → treat as no session, not a 500
    }
  }
  return null;
}

function cookieAttrs(maxAge) {
  const secure = process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export function sessionCookie(config) {
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  const token = `${exp}.${sign(exp, config)}`;
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; ${cookieAttrs(MAX_AGE_S)}`;
}

export function clearedCookie() {
  return `${COOKIE_NAME}=; ${cookieAttrs(0)}`;
}

/** True when the request carries a valid, unexpired session. Use in any private API route. */
export function verifySession(req, config) {
  const token = readCookie(req, COOKIE_NAME);
  if (!token || !config) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, sign(exp, config));
}
