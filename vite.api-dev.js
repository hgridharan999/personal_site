import fs from 'node:fs';
import path from 'node:path';

// Vite re-imports this module when env/config files change, so the snapshot of genuine
// OS environment keys must survive re-evaluation: capture it once per process on globalThis.
const OS_ENV_SNAPSHOT = Symbol.for('journal_portfolio.apiDev.osEnvKeys');
globalThis[OS_ENV_SNAPSHOT] ??= new Set(Object.keys(process.env));
const OS_ENV_KEYS = globalThis[OS_ENV_SNAPSHOT];

// Parse .env file contents directly (bypasses Vite's loadEnv cache which doesn't update within process)
function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf-8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [k, ...rest] = trimmed.split('=');
    env[k.trim()] = rest.join('=').trim();
  }
  return env;
}

/**
 * Dev-only: serve the Vercel functions in /api from the Vite dev server, so
 * `npm run dev` works without `vercel dev`. Shims the bits of Vercel's
 * req/res helpers the handlers use (req.body, res.status, res.json).
 * Production is unaffected — Vercel runs /api natively.
 */
export default function apiDevServer() {
  return {
    name: 'api-dev-server',
    apply: 'serve',
    configResolved(config) {
      // Load .env.local directly to bypass Vite's loadEnv cache (survives process restart)
      const envFile = path.resolve(config.root, '.env.local');
      const env = parseEnvFile(envFile);
      // Only set env vars that didn't come from the OS environment. This allows file
      // values to refresh on reload while preserving OS-set values as permanent overrides.
      for (const [k, v] of Object.entries(env)) if (!OS_ENV_KEYS.has(k)) process.env[k] = v;
    },
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost');
        const name = url.pathname.replace(/^\/+|\/+$/g, '');
        // Segments of [a-z0-9-] only: blocks '..', '_lib', dotted files like '*.test'.
        if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/i.test(name)) return next();
        const file = path.resolve(server.config.root, 'api', `${name}.js`);
        if (!fs.existsSync(file)) return next();
        req.query = Object.fromEntries(url.searchParams);

        try {
          const chunks = [];
          for await (const chunk of req) chunks.push(chunk);
          const raw = Buffer.concat(chunks).toString();
          const mediaType = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
          req.body = raw && mediaType === 'application/json' ? JSON.parse(raw) : undefined;

          res.status = (code) => { res.statusCode = code; return res; };
          res.json = (obj) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(obj)); return res; };

          const mod = await server.ssrLoadModule(file);
          await mod.default(req, res);
        } catch (err) {
          console.error(`[api-dev] /api/${name} failed:`, err);
          if (!res.headersSent) { res.statusCode = 500; res.end(JSON.stringify({ error: 'Internal server error', code: 'INTERNAL' })); }
        }
      });
    },
  };
}
