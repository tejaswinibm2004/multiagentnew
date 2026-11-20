export async function api(path, { method = 'GET', body, ...opts } = {}) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest', ...(opts.headers || {}) };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try {
    res = await fetch(path, {
      method, headers, credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
      ...opts,
    });
  } catch (e) {
    throw new Error('Network error: ' + e.message);
  }
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) {
    const err = new Error(data?.error || `HTTP ${res.status}`);
    err.status = res.status;
    if (res.status === 401) window.dispatchEvent(new CustomEvent('bs:unauthorized'));
    throw err;
  }
  return data;
}

export const post = (p, b) => api(p, { method: 'POST', body: b || {} });
