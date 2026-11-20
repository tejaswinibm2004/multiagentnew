import { query } from '../db/db.js';
import { stripHtml, nowIso } from '../util.js';
import { step, setStatus } from './common.js';

export function extractCases(r = {}) {
  const cases = [];
  const push = (key, value) => { if (value && !cases.some((c) => c.key === key && c.value === value)) cases.push({ key, value: String(value).slice(0, 400) }); };
  for (const m of String(r.description || '').matchAll(/["'`]([^"'`]{2,80})["'`]/g)) push('quoted', m[1]);
  for (const m of String(r.description || '').matchAll(/([.#][\w-]{2,40})/g)) push('selector', m[1]);
  for (const m of String(r.description || '').matchAll(/\b([\w.-]+\.(?:js|ts|tsx|jsx|py|php|rb|go|html|css|json)):(\d+)\b/g)) push('stack_file', `${m[1]}:${m[2]}`);
  for (const m of String(r.description || '').matchAll(/https?:\/\/[^\s)]+/g)) push('url', m[0]);
  for (const m of String(r.description || '').matchAll(/\b([a-zA-Z_$][\w$]{3,30})\b/g)) push('identifier', m[1]);
  return cases;
}

export async function intake(ctx) {
  const r = ctx.report;
  ctx.title = stripHtml(r.title);
  ctx.description = stripHtml(r.description);
  ctx.pagePath = String(r.page || r.pagePath || '');

  const cases = extractCases(r);

  if (cases.length) {
    await query('DELETE FROM issue_cases WHERE issue_id = ?', [ctx.issue.id]);
    for (const c of cases.slice(0, 60)) {
      await query('INSERT INTO issue_cases (issue_id, key, value) VALUES (?, ?, ?)', [ctx.issue.id, c.key, c.value]);
    }
  }
  ctx.cases = cases.slice(0, 60);
  await step(ctx, 'INTAKE', 'ok', `Normalized report; extracted ${ctx.cases.length} evidence items`, { cases: ctx.cases.slice(0, 20) });
  await setStatus(ctx, 'DEDUPLICATED');
  return ctx;
}
