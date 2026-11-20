import crypto from 'node:crypto';

export const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function jsonError(res, status, error, extra = {}) {
  return res.status(status).json({ error, ...extra });
}

export const issueKey = () => `ISSUE-${crypto.randomBytes(4).toString('hex')}`;
export const nowIso = () => new Date().toISOString();

export function parseJson(s, fallback) {
  try { return JSON.parse(s); } catch { return fallback; }
}

export function stripHtml(s) {
  return String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function clamp(s, n) { return String(s || '').slice(0, n); }

export function stageDetail(stage, status, detail, data = {}) {
  return { stage, status, detail, data: JSON.stringify(data) };
}
