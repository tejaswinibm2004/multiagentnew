import express from 'express';
import { config, sha256 } from '../config.js';
import { get, all, query, insertGetId, update, dialect } from '../db/db.js';
import { asyncRoute, jsonError, issueKey, nowIso, clamp, parseJson } from '../util.js';
import { hashPassword, verifyPassword, strongEnough, createSession, destroySession, requireRole, isApprover } from './auth.js';
import { makeRateLimiter } from './rateLimit.js';
import { scrubPayload } from './redact.js';
import { enqueue } from '../queue/jobQueue.js';
import { randomToken } from '../config.js';
import { broadcast } from '../realtime.js';
import { runPipeline, approveIssue, rejectIssue, retryIssue, revertIssue } from '../agents/orchestrator.js';
import { getRepoMap } from '../github/repoReader.js';
import { aiAvailable } from '../ai/provider.js';
import { configured as ghConfigured } from '../github/client.js';

const limiter = makeRateLimiter();
setInterval(() => limiter.prune(), 60_000).unref?.();
const ROLES = ['viewer', 'reviewer', 'admin', 'owner'];

function originsOf(site) { try { return JSON.parse(site.allowed_origins || '[]'); } catch { return []; } }

export function createRouter() {
  const api = express.Router();

  // ---------- public ingestion (only CORS-open endpoint) ----------
  api.use('/api/v1/issues', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');
    if (req.method === 'OPTIONS') return res.status(204).end();
    return next();
  });

  api.post('/api/v1/issues', asyncRoute(async (req, res) => {
    const len = Number(req.headers['content-length'] || 0);
    if (len > 256 * 1024) return jsonError(res, 413, 'Payload too large');

    const key = String(req.headers['x-bugshield-key'] || req.body?.key || '');
    if (!key) return jsonError(res, 401, 'Missing ingestion key');
    const kh = sha256(key);
    const keyRow = await get('SELECT * FROM ingestion_keys WHERE key_hash = ?', [kh]);
    if (!keyRow) return jsonError(res, 401, 'Invalid ingestion key');

    const origin = req.headers.origin;
    const site = await get('SELECT * FROM websites WHERE id = ?', [keyRow.website_id]);
    if (!site) return jsonError(res, 403, 'Unknown website');
    if (origin && !originsOf(site).includes(origin)) return jsonError(res, 403, 'Origin not allowed');

    const rl = limiter.keyLimit(kh);
    const rip = limiter.ipLimit(req.ip || 'unknown');
    if (!rl.allow || !rip.allow) {
      res.setHeader('Retry-After', String(Math.max(rl.retryAfter, rip.retryAfter)));
      return jsonError(res, 429, 'Rate limit exceeded');
    }
    await query('UPDATE ingestion_keys SET last_used_at = ? WHERE id = ?', [nowIso(), keyRow.id]);

    const b = req.body || {};
    const title = clamp(typeof b.title === 'string' ? b.title : '', 300);
    const description = clamp(typeof b.description === 'string' ? b.description : '', 4000);
    const steps = clamp(typeof b.steps === 'string' ? b.steps : '', 2000);
    if (!title.trim() || !description.trim()) return jsonError(res, 400, 'title and description are required');

    const fingerprint = sha256([kh, title.toLowerCase(), String(b.page || '').toLowerCase(), clamp(String((b.errors || [])[0]?.message || ''), 200)].join('|'));
    const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
    const existing = await get(
      `SELECT id, occurrences FROM issues WHERE website_id = ? AND fingerprint = ? AND created_at >= ?`,
      [site.id, fingerprint, cutoff]
    );
    if (existing) {
      await query('UPDATE issues SET occurrences = occurrences + 1, updated_at = ? WHERE id = ?', [nowIso(), existing.id]);
      broadcast('issue', { issue: { id: existing.id, occurrences: existing.occurrences + 1 } });
      return res.status(202).json({ ok: true, deduplicated: true, issueId: existing.id });
    }

    const payload = scrubPayload({
      title, description, steps,
      page: b.page,
      selector: b.selector,
      outerHTML: clamp(b.outerHTML, 2000),
      text: clamp(b.text, 500),
      box: b.box,
      styles: b.styles,
      errors: Array.isArray(b.errors) ? b.errors.slice(0, 20).map((e) => ({ message: clamp(e?.message, 8000), stack: clamp(e?.stack, 8000) })) : [],
      console: Array.isArray(b.console) ? b.console.slice(0, 50) : [],
      network: Array.isArray(b.network) ? b.network.slice(0, 20) : [],
      reporter: b.reporter,
    });

    const issueKeyValue = issueKey();
    const id = await insertGetId('issues', {
      issue_key: issueKeyValue, website_id: site.id, title, description,
      page_path: String(b.page || ''), status: 'RECEIVED',
      fingerprint, occurrences: 1, reporter: String(b.reporter || 'visitor'),
      payload: JSON.stringify(payload), created_at: nowIso(), updated_at: nowIso(),
    });
    broadcast('issue', { issue: { id, issue_key: issueKeyValue, status: 'RECEIVED', title, website_id: site.id } });
    await enqueue(id, 'pipeline');
    return res.status(202).json({ ok: true, issueId: id, issueKey: issueKeyValue });
  }));

  // ---------- auth ----------
  api.post('/auth/login', asyncRoute(async (req, res) => {
    const ip = req.ip || 'unknown';
    if (!limiter.loginLimit(ip).allow) {
      res.setHeader('Retry-After', '900');
      return jsonError(res, 429, 'Too many login attempts');
    }
    const { email, password } = req.body || {};
    const user = await get('SELECT * FROM users WHERE email = ?', [String(email || '').toLowerCase()]);
    if (!user || !verifyPassword(String(password || ''), user.password_hash)) return jsonError(res, 401, 'Invalid credentials');
    const token = await createSession(user.id);
    res.cookie('bs_session', token, { httpOnly: true, sameSite: 'strict', secure: config.isProd, maxAge: config.sessionTtlMs, path: '/' });
    return res.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
  }));

  api.post('/auth/logout', asyncRoute(async (req, res) => {
    await destroySession(req.token);
    res.clearCookie('bs_session', { path: '/' });
    return res.json({ ok: true });
  }));

  api.get('/auth/me', (req, res) => res.json({ user: req.user || null }));

  // ---------- websites ----------
  api.get('/api/websites', requireRole('viewer'), asyncRoute(async (req, res) => {
    const rows = await all('SELECT * FROM websites ORDER BY id');
    res.json({ websites: rows.map((w) => ({ ...w, health_urls: parseJson(w.health_urls, []), allowed_origins: parseJson(w.allowed_origins, []) })) });
  }));

  api.post('/api/websites', requireRole('admin'), asyncRoute(async (req, res) => {
    const b = req.body || {};
    if (!b.name || !b.repo_full_name) return jsonError(res, 400, 'name and repo_full_name required');
    const id = await insertGetId('websites', {
      name: b.name, slug: String(b.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      repo_full_name: b.repo_full_name, branch: b.branch || 'main',
      live_url: b.live_url || '', version_json_url: b.version_json_url || '',
      health_urls: JSON.stringify(b.health_urls || []), allowed_origins: JSON.stringify(b.allowed_origins || []),
      always_approve: b.always_approve ? 1 : 0, auto_deploy: b.auto_deploy === false ? 0 : 1,
      created_by: req.user.id,
    });
    broadcast('website', { action: 'created', id });
    res.status(201).json({ ok: true, id });
  }));

  api.get('/api/websites/:id', requireRole('viewer'), asyncRoute(async (req, res) => {
    const w = await get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!w) return jsonError(res, 404, 'Not found');
    const keyCount = (await get('SELECT COUNT(*) AS n FROM ingestion_keys WHERE website_id = ?', [w.id]))?.n || 0;
    const stats = await get(`SELECT COUNT(*) AS issues, SUM(CASE WHEN status='RESOLVED_AND_DEPLOYED' THEN 1 ELSE 0 END) AS fixed FROM issues WHERE website_id = ?`, [w.id]);
    res.json({ website: { ...w, health_urls: parseJson(w.health_urls, []), allowed_origins: parseJson(w.allowed_origins, []), keyCount, stats } });
  }));

  api.patch('/api/websites/:id', requireRole('admin'), asyncRoute(async (req, res) => {
    const b = req.body || {};
    const fields = {};
    for (const k of ['name', 'repo_full_name', 'branch', 'live_url', 'version_json_url', 'always_approve', 'auto_deploy']) {
      if (b[k] !== undefined) fields[k] = ['always_approve', 'auto_deploy'].includes(k) ? (b[k] ? 1 : 0) : b[k];
    }
    if (b.health_urls !== undefined) fields.health_urls = JSON.stringify(b.health_urls);
    if (b.allowed_origins !== undefined) fields.allowed_origins = JSON.stringify(b.allowed_origins);
    await update('websites', req.params.id, fields);
    broadcast('website', { action: 'updated', id: Number(req.params.id) });
    res.json({ ok: true });
  }));

  api.post('/api/websites/:id/test', requireRole('reviewer'), asyncRoute(async (req, res) => {
    const w = await get('SELECT * FROM websites WHERE id = ?', [req.params.id]);
    if (!w) return jsonError(res, 404, 'Not found');
    const map = await getRepoMap(w.repo_full_name, w.branch || 'main');
    res.json({ ok: map.ok, reason: map.reason || null, fileCount: map.files.length, liveUrl: w.live_url });
  }));

  api.get('/api/websites/:id/keys', requireRole('admin'), asyncRoute(async (req, res) => {
    const rows = await all('SELECT id, label, created_at, last_used_at, key_hash FROM ingestion_keys WHERE website_id = ? ORDER BY id', [req.params.id]);
    res.json({ keys: rows });
  }));

  api.post('/api/websites/:id/keys', requireRole('admin'), asyncRoute(async (req, res) => {
    const key = `bs_live_${randomToken(18)}`;
    await insertGetId('ingestion_keys', { website_id: req.params.id, key_hash: sha256(key), label: req.body?.label || 'Widget key', created_at: nowIso() });
    res.status(201).json({ key, note: 'Shown once. Store it in your client config.' });
  }));

  // ---------- issues ----------
  api.get('/api/issues', requireRole('viewer'), asyncRoute(async (req, res) => {
    const { status, website_id, risk, search, cursor, limit } = req.query;
    const where = []; const params = [];
    if (status && status !== 'all') { where.push('i.status = ?'); params.push(status); }
    if (website_id && website_id !== 'all') { where.push('i.website_id = ?'); params.push(website_id); }
    if (risk === 'critical') { where.push('i.risk_score >= 70'); }
    if (search) { where.push('(i.title LIKE ? OR i.issue_key LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (cursor) { where.push('i.id < ?'); params.push(cursor); }
    const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const rows = await all(`SELECT i.*, w.name AS website_name FROM issues i LEFT JOIN websites w ON w.id=i.website_id ${w} ORDER BY i.id DESC LIMIT ?`, [...params, Math.min(Number(limit) || 30, 100)]);
    res.json({ issues: rows, nextCursor: rows.length ? rows[rows.length - 1].id : null });
  }));

  api.get('/api/issues/:id', requireRole('viewer'), asyncRoute(async (req, res) => {
    const issue = await get('SELECT i.*, w.name AS website_name, w.repo_full_name, w.live_url FROM issues i LEFT JOIN websites w ON w.id=i.website_id WHERE i.id = ?', [req.params.id]);
    if (!issue) return jsonError(res, 404, 'Not found');
    const [steps, patches, validations, approvals, deployments, cases, audit] = await Promise.all([
      all('SELECT * FROM pipeline_steps WHERE issue_id = ? ORDER BY id', [issue.id]),
      all('SELECT * FROM patches WHERE issue_id = ? ORDER BY id DESC', [issue.id]),
      all('SELECT * FROM validation_runs WHERE issue_id = ? ORDER BY id DESC', [issue.id]),
      all('SELECT * FROM approvals WHERE issue_id = ? ORDER BY id DESC', [issue.id]),
      all('SELECT * FROM deployments WHERE issue_id = ? ORDER BY id DESC', [issue.id]),
      all('SELECT * FROM issue_cases WHERE issue_id = ? ORDER BY id', [issue.id]),
      all('SELECT * FROM audit_log WHERE target = ? ORDER BY id DESC', [issue.issue_key]),
    ]);
    res.json({
      issue: { ...issue, payload: parseJson(issue.payload, {}), analyzer: parseJson(issue.analyzer_json, {}), localizer: parseJson(issue.localizer_json, {}), proposed_files: parseJson(issue.proposed_files, []) },
      steps, patches: patches.map((p) => ({ ...p, files: parseJson(p.files_json, []), critic: parseJson(p.critic, {}), safety: parseJson(p.safety, {}) })),
      validations: validations.map((v) => ({ ...v, results: parseJson(v.results_json, []) })),
      approvals, deployments, cases, audit,
    });
  }));

  const action = (kind, fn) => asyncRoute(async (req, res) => {
    if (kind !== 'retry' && !isApprover(req.user)) return jsonError(res, 403, 'Approver role required');
    try {
      const result = await fn(req);
      res.json({ ok: true, ...result });
    } catch (e) { return jsonError(res, 400, e.message); }
  });

  api.post('/api/issues/:id/approve', action('approve', async (req) => {
    await approveIssue(req.params.id, req.user, req.body?.reason, broadcast);
    return {};
  }));
  api.post('/api/issues/:id/reject', action('reject', async (req) => {
    await rejectIssue(req.params.id, req.user, req.body?.reason, broadcast);
    return {};
  }));
  api.post('/api/issues/:id/retry', action('retry', async (req) => {
    if (!isApprover(req.user)) return jsonError(res, 403, 'Approver role required');
    await retryIssue(req.params.id, broadcast);
    return {};
  }));
  api.post('/api/issues/:id/revert', action('revert', async (req) => {
    await revertIssue(req.params.id, req.user, broadcast);
    return {};
  }));

  // ---------- settings / audit / stats / members ----------
  api.get('/api/settings/policy', requireRole('viewer'), asyncRoute(async (req, res) => {
    const rows = await all('SELECT key, value FROM settings');
    const s = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    res.json({ policy: { autoDeploy: s.autoDeploy !== 'false', riskThreshold: Number(s.riskThreshold || 70), org: s.org || '', alwaysApproveSite: s.alwaysApproveSite === 'true' } });
  }));

  api.post('/api/settings/policy', requireRole('owner'), asyncRoute(async (req, res) => {
    const b = req.body || {};
    for (const k of ['autoDeploy', 'riskThreshold', 'org', 'alwaysApproveSite']) {
      if (b[k] !== undefined) {
        const sql = dialect === 'postgres' ? `INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT (key) DO UPDATE SET value=excluded.value` : `INSERT INTO settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`;
        await query(sql, [k, String(b[k])]);
      }
    }
    res.json({ ok: true });
  }));

  api.get('/api/settings/integrations-status', requireRole('viewer'), (req, res) => {
    res.json({ integrations: { ai: aiAvailable() ? 'connected' : 'not configured', github: ghConfigured() ? 'connected' : 'not configured', database: dialect === 'postgres' ? 'postgres' : 'sqlite', hosting: 'Render free tier' } });
  });

  api.get('/api/audit', requireRole('viewer'), asyncRoute(async (req, res) => {
    const rows = await all('SELECT * FROM audit_log ORDER BY id DESC LIMIT 200');
    res.json({ audit: rows });
  }));

  api.get('/api/stats/overview', requireRole('viewer'), asyncRoute(async (req, res) => {
    const counts = await all('SELECT status, COUNT(*) AS n FROM issues GROUP BY status');
    const byStatus = Object.fromEntries(counts.map((r) => [r.status, r.n]));
    const totals = await get(`SELECT COUNT(*) AS total, COALESCE(AVG(risk_score),0) AS avgRisk, SUM(CASE WHEN risk_score>=70 THEN 1 ELSE 0 END) AS critical FROM issues`);
    const sites = await get('SELECT COUNT(*) AS n FROM websites');
    res.json({
      stats: {
        total: totals.total, fixed: byStatus.RESOLVED_AND_DEPLOYED || 0,
        awaiting: byStatus.AWAITING_APPROVAL || 0, investigating: (byStatus.TRIAGING || 0) + (byStatus.ANALYZING || 0) + (byStatus.VALIDATING || 0),
        critical: totals.critical || 0, avgRisk: Math.round(totals.avgRisk), sites: sites.n,
        byStatus,
      },
    });
  }));

  api.get('/api/members', requireRole('viewer'), asyncRoute(async (req, res) => {
    const rows = await all('SELECT id, email, name, role, created_at FROM users ORDER BY id');
    res.json({ members: rows });
  }));

  api.post('/api/members', requireRole('admin'), asyncRoute(async (req, res) => {
    const { email, name, role } = req.body || {};
    if (!email || !ROLES.includes(role)) return jsonError(res, 400, 'email and valid role required');
    const pw = randomToken(12);
    const id = await insertGetId('users', { email: String(email).toLowerCase(), name: name || String(email), password_hash: hashPassword(pw), role });
    res.status(201).json({ ok: true, id, tempPassword: pw, note: 'Shown once.' });
  }));

  api.get('/api/health', (req, res) => res.json({ ok: true, service: 'bugshield', env: config.env, ts: nowIso() }));

  return api;
}

export function mountApp(app) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/v1/issues')) return next();
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    return next();
  });
  app.use(express.json({ limit: '256kb' }));
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    return next(err);
  });
  const router = createRouter();
  app.use(router);
  return app;
}
