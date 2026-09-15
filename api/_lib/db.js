import { neon } from '@neondatabase/serverless';

// One HTTP query function per function instance. Null when the DB isn't configured,
// so handlers can answer 500 DB_NOT_CONFIGURED instead of crashing.
let sql = null;

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  sql ??= neon(process.env.DATABASE_URL);
  return sql;
}
