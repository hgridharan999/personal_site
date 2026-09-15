import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool, neonConfig } from '@neondatabase/serverless';

// Applies db/migrations/NNN_name.sql in order, once each, each in its own transaction.
// Usage: npm run db:migrate   (reads DATABASE_URL from env or .env.local)

export const MIGRATION_NAME = /^\d{3}_[a-z0-9_]+\.sql$/;

export function pendingMigrations(files, applied) {
  const done = new Set(applied);
  return files.filter((f) => MIGRATION_NAME.test(f) && !done.has(f)).sort();
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is not set (add it to .env.local).');
    process.exit(1);
  }
  if (!neonConfig.webSocketConstructor && globalThis.WebSocket) {
    neonConfig.webSocketConstructor = globalThis.WebSocket;
  }

  const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations');
  const pool = new Pool({ connectionString: url });
  const client = await pool.connect();
  try {
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const pending = pendingMigrations(fs.readdirSync(dir), rows.map((r) => r.name));
    if (pending.length === 0) console.log('Database is up to date.');

    for (const name of pending) {
      const sqlText = fs.readFileSync(path.join(dir, name), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sqlText);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
        console.log(`Applied ${name}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw new Error(`Migration ${name} failed: ${err.message}`);
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
