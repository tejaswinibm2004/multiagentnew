// CSRF: mutations require X-Requested-With plus a matching Origin/Host when present.
export function csrfGuard(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'CSRF header missing' });
  }
  const origin = req.headers.origin;
  if (origin) {
    let host;
    try { host = new URL(origin).host; } catch { return res.status(403).json({ error: 'Bad origin' }); }
    const expected = req.headers['x-forwarded-host'] || req.headers.host;
    if (host !== expected) return res.status(403).json({ error: 'Origin mismatch' });
  }
  return next();
}
