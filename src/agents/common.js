import { insertGetId, update } from '../db/db.js';
import { nowIso } from '../util.js';

export async function step(ctx, stage, status = 'ok', detail = '', data = {}) {
  await insertGetId('pipeline_steps', {
    issue_id: ctx.issue.id, stage, status, detail,
    data: JSON.stringify(data || {}), created_at: nowIso(),
  });
  ctx.broadcast?.('step', { issueId: ctx.issue.id, stage, status, detail, at: nowIso() });
}

export async function setStatus(ctx, status, extra = {}) {
  ctx.issue.status = status;
  const fields = { status, updated_at: nowIso(), ...extra };
  await update('issues', ctx.issue.id, fields);
  ctx.broadcast?.('issue', { issue: { id: ctx.issue.id, issue_key: ctx.issue.issue_key, status, ...extra } });
}

export async function audit(actor, action, target, detail = {}) {
  const { insertGetId: ins } = await import('../db/db.js');
  await ins('audit_log', { actor, action, target, detail: JSON.stringify(detail), created_at: nowIso() });
}
