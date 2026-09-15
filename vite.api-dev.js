import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';

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
      const env = loadEnv(config.mode, config.root, '');
      for (const [k, v] of Object.entries(env)) if (process.env[k] === undefined) process.env[k] = v;
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
          req.body = raw && (req.headers['content-type'] || '').includes('application/json') ? JSON.parse(raw) : undefined;

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
