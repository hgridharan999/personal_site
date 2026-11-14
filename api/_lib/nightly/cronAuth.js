import { createHash, timingSafeEqual } from 'node:crypto';

// Vercel cron sends `Authorization: Bearer <CRON_SECRET>`. With the secret unset the expected header
// would be "Bearer undefined", which anyone can send, so a missing or short secret is a config error.
const MIN_SECRET_LENGTH = 16;

const digest = (value) => createHash('sha256').update(String(value)).digest();

/** @returns {'ok'|'misconfigured'|'denied'} */
export function cronAuthorized(req, secret = process.env.CRON_SECRET) {
  const header = req?.headers?.authorization;
  // Check for a presented bearer first, so an anonymous probe learns nothing about the config.
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return 'denied';
  if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) return 'misconfigured';
  // Hash first so both buffers are the same length, as timingSafeEqual requires.
  return timingSafeEqual(digest(header), digest(`Bearer ${secret}`)) ? 'ok' : 'denied';
}
