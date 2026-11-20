import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function withTemp(content, ext, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bs-val-'));
  const file = path.join(dir, `check${ext}`);
  fs.writeFileSync(file, content);
  try { return fn(file, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

export function runCommand(cmd, args, { cwd, timeout = 15000 } = {}) {
  let r;
  try {
    r = spawnSync(cmd, args, { cwd, encoding: 'utf8', timeout, windowsHide: true });
  } catch (e) {
    return { status: 'NOT_PERFORMED', detail: `cannot launch ${cmd}: ${e.message}` };
  }
  if (r.error && /ENOENT/.test(String(r.error.code || r.error))) {
    return { status: 'NOT_PERFORMED', detail: `${cmd} not installed on host` };
  }
  if (r.error) return { status: 'NOT_PERFORMED', detail: String(r.error.message) };
  if (r.status === 0) return { status: 'ok', detail: (r.stdout || '').slice(0, 800) };
  return { status: 'failed', detail: ((r.stderr || r.stdout || '').slice(0, 1200)) || `exit ${r.status}` };
}

export function sanity(content) {
  if (/\u0000/.test(content)) return { status: 'failed', detail: 'NUL byte in source' };
  if (/<script[^>]*>\s*(?:eval|atob)\s*\(/i.test(content)) return { status: 'failed', detail: 'suspicious script' };
  return { status: 'ok', detail: 'basic sanity checks passed' };
}
