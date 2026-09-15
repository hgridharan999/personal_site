import { neon } from '@neondatabase/serverless';

// One HTTP query function per function instance. Null when the DB isn't configured,
// so handlers can answer 500 DB_NOT_CONFIGURED instead of crashing.
let sql = null;

export function getSql() {
  if (!process.env.DATABASE_URL) return null;
  if (!sql) {
    try {
      sql = neon(process.env.DATABASE_URL);
    } catch {
      // neon() puts the full connection string (password included) in its error
      // message, so log neither the URL nor the error.
      console.error('DATABASE_URL is malformed; database disabled');
      return null;
    }
  }
  return sql;
}
