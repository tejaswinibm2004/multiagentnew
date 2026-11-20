import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { config } from './src/config.js';
import { runMigrations } from './src/db/migrations.js';
import { close } from './src/db/db.js';
import { ensureSeedUser, userFromToken, attachAuth } from './src/http/auth.js';
import { csrfGuard } from './src/http/csrf.js';
import { mountApp } from './src/http/router.js';
import { seedDemoData, ensureDemoSites } from './src/seed.js';
import { attachWebSocket, broadcast } from './src/realtime.js';
import { setHandler, startQueue, recoverStuck } from './src/queue/jobQueue.js';
import { jobHandler } from './src/agents/orchestrator.js';

async function main() {
  await runMigrations();
  await ensureSeedUser();
  if (config.env !== 'production') {
    await seedDemoData();
    await ensureDemoSites();
  }

  const app = express();
  app.use(attachAuth(app));
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/issues') || req.path === '/auth/login') return next();
    return csrfGuard(req, res, next);
  });
  app.use((req, res, next) => { req.broadcast = broadcast; next(); });
  mountApp(app);

  const publicDir = path.join(process.cwd(), 'public');
  app.use(express.static(publicDir, { index: false, maxAge: config.isProd ? '1h' : 0 }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/auth') || req.path === '/ws') return next();
    return res.sendFile(path.join(publicDir, 'index.html'));
  });
  app.use((err, req, res, next) => {
    console.error('[http]', err);
    if (res.headersSent) return next(err);
    return res.status(err.status || 500).json({ error: err.message || 'Internal error' });
  });

  const server = http.createServer(app);
  await attachWebSocket(server, userFromToken);
  await recoverStuck();
  setHandler((job) => jobHandler(job, broadcast));
  startQueue();

  server.listen(config.port, config.host, () => {
    console.log(`[bugshield] listening on http://${config.host}:${config.port} (${config.env})`);
  });

  const shutdown = async () => {
    server.close(async () => { await close(); process.exit(0); });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => { console.error('[fatal]', e); process.exit(1); });
