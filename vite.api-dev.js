import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

// Vite re-imports this module when env/config files change, so the snapshot of genuine
// OS environment keys must survive re-evaluation: capture it once per process on globalThis.
const OS_ENV_SNAPSHOT = Symbol.for('journal_portfolio.apiDev.osEnvKeys');
globalThis[OS_ENV_SNAPSHOT] ??= new Set(Object.keys(process.env));
const OS_ENV_KEYS = globalThis[OS_ENV_SNAPSHOT];

// Keys this plugin copied from env files into process.env (also kept across re-imports).
const APPLIED_ENV = Symbol.for('journal_portfolio.apiDev.appliedEnvKeys');
globalThis[APPLIED_ENV] ??= new Set();
const APPLIED_KEYS = globalThis[APPLIED_ENV];

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
      // loadEnv reads every env file for the mode, but lets values already in process.env win.
      // Drop the file values applied on the previous load first, so edits to .env.local take
      // effect on reload. Real OS env vars and values set by other code are never touched.
      for (const k of APPLIED_KEYS) delete process.env[k];
      APPLIED_KEYS.clear();
      const env = loadEnv(config.mode, config.root, '');
      for (const [k, v] of Object.entries(env)) {
        if (OS_ENV_KEYS.has(k) || process.env[k] !== undefined) continue;
        process.env[k] = v;
        APPLIED_KEYS.add(k);
      }
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
