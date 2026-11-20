import crypto from 'node:crypto';
import { config, sha256 } from '../config.js';
import { get, query, insertGetId, update } from '../db/db.js';

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 };

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, SCRYPT.keylen, SCRYPT).toString('hex');
  return `scrypt$${SCRYPT.N}$${salt}$${derived}`;
}

export function verifyPassword(password, stored) {
  try {
    const [tag, n, salt, derived] = String(stored).split('$');
    if (tag !== 'scrypt') return false;
    const actual = crypto.scryptSync(password, salt, SCRYPT.keylen, { ...SCRYPT, N: Number(n) });
    const expected = Buffer.from(derived, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

export function strongEnough(pw) { return typeof pw === 'string' && pw.length >= 12; }

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const id = sha256(token);
  await insertGetId('sessions', { id, user_id: userId, expires_at: Date.now() + config.sessionTtlMs });
  return token;
}

export async function destroySession(token) {
  if (token) await query('DELETE FROM sessions WHERE id = ?', [sha256(token)]);
}

export async function destroyUserSessions(userId) {
  await query('DELETE FROM sessions WHERE user_id = ?', [userId]);
}

// Change password: verify current, require a strong new one, and invalidate all
// other sessions for this user (the current session stays signed in).
export async function changePassword(userId, current, next, currentToken) {
  const user = await get('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!user) throw new Error('User not found');
  if (!verifyPassword(String(current || ''), user.password_hash)) throw new Error('Current password is incorrect');
  if (!strongEnough(next)) throw new Error('New password must be at least 12 characters');
  if (String(current) === String(next)) throw new Error('New password must be different');
  await query('UPDATE users SET password_hash = ? WHERE id = ?', [hashPassword(next), userId]);
  const keep = sha256(currentToken || '');
  await query('DELETE FROM sessions WHERE user_id = ? AND id != ?', [userId, keep]);
  return { ok: true };
}

export async function userFromToken(token) {
  if (!token) return null;
  const row = await get(
    `SELECT u.id, u.email, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?`,
    [sha256(token)]
  );
  if (!row) return null;
  if (row.expires_at < Date.now()) { await destroySession(token); return null; }
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.isProd,
    maxAge: config.sessionTtlMs,
    path: '/',
  };
}

const RANK = { viewer: 0, reviewer: 1, admin: 2, owner: 3 };
export function requireRole(...roles) {
  const min = Math.min(...roles.map((r) => RANK[r] ?? 99));
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if ((RANK[req.user.role] ?? 0) < min) return res.status(403).json({ error: 'Insufficient role' });
    return next();
  };
}
export const isOwner = (u) => u?.role === 'owner';
export const isApprover = (u) => ['owner', 'admin', 'reviewer'].includes(u?.role);

export function attachAuth(app) {
  return async (req, res, next) => {
    const raw = req.headers.cookie || '';
    const match = raw.match(/(?:^|;\s*)bs_session=([^;]+)/);
    req.token = match ? decodeURIComponent(match[1]) : null;
    req.user = await userFromToken(req.token);
    next();
  };
}

export async function ensureSeedUser() {
  const existing = await get('SELECT id FROM users WHERE email = ?', [config.seed.email]);
  if (existing) return;
  await insertGetId('users', {
    email: config.seed.email,
    name: config.seed.name,
    password_hash: hashPassword(config.seed.password),
    role: 'owner',
  });
  console.log('[auth] seeded owner user:', config.seed.email);
}
