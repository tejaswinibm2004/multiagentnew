// Fixed-window rate limiter with Retry-After. Keyed by key hash and IP.
class Window {
  constructor() { this.map = new Map(); }
  hit(key, limit, windowMs) {
    const now = Date.now();
    let e = this.map.get(key);
    if (!e || now >= e.reset) { e = { count: 0, reset: now + windowMs }; this.map.set(key, e); }
    e.count += 1;
    const allow = e.count <= limit;
    return { allow, retryAfter: Math.max(1, Math.ceil((e.reset - now) / 1000)), remaining: Math.max(0, limit - e.count) };
  }
}

export function makeRateLimiter() {
  const w = new Window();
  return {
    keyLimit: (keyHash) => w.hit(`k:${keyHash}`, 30, 60_000),
    ipLimit: (ip) => w.hit(`ip:${ip}`, 60, 60_000),
    loginLimit: (ip) => w.hit(`login:${ip}`, 10, 15 * 60_000),
    prune() {
      const now = Date.now();
      for (const [k, e] of w.map) if (now >= e.reset) w.map.delete(k);
    },
  };
}
