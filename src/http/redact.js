// Central redactor. Report text is untrusted; never persist secrets or input values.
const SECRET_KEYS = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|card|cvv|otp/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+)/g;

export function redactString(s) {
  if (typeof s !== 'string') return s;
  return s.replace(SECRET_VALUE, '[REDACTED]');
}

export function redactObject(input, depth = 0) {
  if (depth > 8) return '[TRUNCATED]';
  if (input == null) return input;
  if (typeof input === 'string') return redactString(input);
  if (typeof input !== 'object') return input;
  if (Array.isArray(input)) return input.slice(0, 50).map((x) => redactObject(x, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(input)) {
    if (SECRET_KEYS.test(k) || /value|input/i.test(k)) { out[k] = '[REDACTED]'; continue; }
    out[k] = redactObject(v, depth + 1);
  }
  return out;
}

export function scrubPayload(payload) {
  const p = redactObject(payload || {});
  if (Array.isArray(p.console)) p.console = p.console.slice(0, 50);
  if (Array.isArray(p.network)) p.network = p.network.slice(0, 20).map((n) => ({ url: n?.url, status: n?.status }));
  return p;
}
