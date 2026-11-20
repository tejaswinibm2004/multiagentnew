import { config } from '../config.js';

// Headers are built in one place so callers can never swap the token and options.
// (Regression: a swapped call produced "Bearer [object Object]" and a 404 on blob POST.)
export function buildHeaders(headers = {}) {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'bugshield/1.0',
    ...(config.github.token ? { Authorization: `Bearer ${config.github.token}` } : {}),
    ...headers,
  };
}

// Single hardened GitHub fetch. Options are explicit; token is always applied here.
export async function ghFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const url = path.startsWith('http') ? path : `${config.github.api.replace(/\/$/, '')}${path}`;
  const finalHeaders = buildHeaders(headers);
  if (body !== undefined && typeof body !== 'string') {
    finalHeaders['Content-Type'] = 'application/json';
  }
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: body === undefined ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
    });
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e), data: null };
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

export function configured() { return Boolean(config.github.token); }
