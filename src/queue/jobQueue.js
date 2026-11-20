import { get, query, insertGetId, update } from '../db/db.js';

let handler = null;
let running = false;
let timer = null;

export function setHandler(fn) { handler = fn; }

export async function enqueue(issueId, kind = 'pipeline') {
  const id = await insertGetId('jobs', { issue_id: issueId, kind, status: 'queued', run_at: Date.now() });
  setImmediate(drain);
  return id;
}

export async function recoverStuck() {
  // Jobs left 'locked' by a previous process are re-queued on boot.
  await query(`UPDATE jobs SET status='queued', locked_at=NULL WHERE status='locked'`);
}

async function claim() {
  const row = await get(`SELECT * FROM jobs WHERE status='queued' AND run_at <= ? ORDER BY id LIMIT 1`, [Date.now()]);
  if (!row) return null;
  await query(`UPDATE jobs SET status='locked', locked_at=?, attempts=attempts+1 WHERE id=? AND status='queued'`, [Date.now(), row.id]);
  // sqlite result has changes; pg result has rowCount. Re-read to be safe.
  const fresh = await get('SELECT * FROM jobs WHERE id = ?', [row.id]);
  if (!fresh || fresh.status !== 'locked') return null;
  return fresh;
}

export async function drain() {
  if (running || !handler) return;
  running = true;
  try {
    for (let i = 0; i < 20; i++) {
      const job = await claim();
      if (!job) break;
      try {
        await handler(job);
        await update('jobs', job.id, { status: 'done', locked_at: null, error: '' });
      } catch (e) {
        const attempts = job.attempts + 1;
        await update('jobs', job.id, {
          status: attempts < 3 ? 'queued' : 'failed',
          locked_at: null,
          run_at: Date.now() + attempts * 2000,
          error: String(e.message || e).slice(0, 500),
        });
      }
    }
  } finally {
    running = false;
  }
}

export function startQueue() {
  if (timer) return;
  timer = setInterval(() => { drain(); }, 1000);
  timer.unref?.();
}
