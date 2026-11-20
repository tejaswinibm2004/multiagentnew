import { strictJson } from '../ai/json.js';
import { PROMPTS } from '../ai/prompts.js';
import { insertGetId, update } from '../db/db.js';
import { unifiedDiff, changedLineCount } from '../util/diff.js';
import { step, setStatus } from './common.js';

export const FORBIDDEN = /(^|\/)(node_modules|\.git|dist|build|coverage)(\/|$)|\.env|secret|credential|package-lock\.json|yarn\.lock|pnpm-lock/i;
const TYPO_FIXES = {
  shoping: 'shopping', recieve: 'receive', seperate: 'separate', occured: 'occurred',
  definately: 'definitely', wich: 'which', teh: 'the', adress: 'address',
  lable: 'label', sumbit: 'submit', savve: 'save', checkoutt: 'checkout',
};

export function validateEdits(edits, files) {
  if (!Array.isArray(edits) || !edits.length) return { ok: false, reason: 'no edits' };
  const byFile = new Map();
  for (const e of edits) {
    if (!e || typeof e.file !== 'string' || typeof e.search !== 'string' || typeof e.replace !== 'string') return { ok: false, reason: 'malformed edit' };
    if (FORBIDDEN.test(e.file)) return { ok: false, reason: 'forbidden path' };
    if (e.search.length < 3) return { ok: false, reason: 'search too short' };
    const content = files[e.file];
    if (content == null) return { ok: false, reason: `unknown file ${e.file}` };
    const count = content.split(e.search).length - 1;
    if (count !== 1) return { ok: false, reason: `search must match exactly once (matched ${count}) in ${e.file}` };
    byFile.set(e.file, (byFile.get(e.file) || 0) + 1);
  }
  if (byFile.size > 3) return { ok: false, reason: 'too many files' };
  for (const n of byFile.values()) if (n > 5) return { ok: false, reason: 'too many edits in one file' };
  return { ok: true };
}

export function applyEdits(edits, files) {
  const next = { ...files };
  const diffs = [];
  for (const e of edits) {
    const before = next[e.file];
    next[e.file] = before.replace(e.search, e.replace);
    diffs.push({ path: e.file, before, after: next[e.file] });
  }
  return { files: next, diff: unifiedDiff(diffs) };
}

function fallbackEdits(ctx) {
  const edits = [];
  for (const c of ctx.cases || []) {
    if (c.key !== 'quoted') continue;
    const lower = c.value.toLowerCase();
    const corrected = TYPO_FIXES[lower];
    if (!corrected) continue;
    for (const [path, content] of Object.entries(ctx.files || {})) {
      if (content.includes(c.value)) {
        const re = new RegExp(c.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        if ((content.match(re) || []).length === 1) {
          edits.push({ file: path, search: c.value, replace: corrected });
          break;
        }
      }
    }
  }
  return edits;
}

export async function patcher(ctx) {
  const source = Object.entries(ctx.files).map(([p, c]) => `FILE ${p}\n${c}`).join('\n\n').slice(0, 30000);
  const res = await strictJson(PROMPTS.patcher,
    `REPORT: ${ctx.title}\n${ctx.description}\n\nANALYZER: ${JSON.stringify(ctx.analysis)}\n\nFILES:\n${source}`,
    { maxTokens: 4000, validate: (v) => Array.isArray(v.edits) });

  let edits = null, summary = '';
  if (res.ok) { edits = res.value.edits; summary = res.value.summary || ''; }
  let check = edits ? validateEdits(edits, ctx.files) : { ok: false, reason: res.reason || 'no edits' };
  let usedFallback = false;
  if (!check.ok) {
    edits = fallbackEdits(ctx);
    check = validateEdits(edits, ctx.files);
    usedFallback = true;
  }
  if (!check.ok) {
    await step(ctx, 'PATCHER', 'blocked', `Patch rejected: ${check.reason}`, { reason: check.reason });
    await setStatus(ctx, 'PATCH_FAILED', { admin_note: check.reason });
    ctx.halted = true; return ctx;
  }

  const applied = applyEdits(edits, ctx.files);
  const lines = changedLineCount(applied.diff);
  if (lines > 40) {
    await step(ctx, 'PATCHER', 'blocked', `Patch too large: ${lines} changed lines`, {});
    await setStatus(ctx, 'PATCH_FAILED', { admin_note: 'oversized diff' });
    ctx.halted = true; return ctx;
  }
  ctx.changedLines = lines;
  ctx.unifiedDiff = applied.diff;
  ctx.editedFiles = applied.files;
  ctx.edits = edits;
  ctx.patchSummary = summary || `Fix ${ctx.analysis.defect_type}: ${ctx.title}`.slice(0, 200);

  await step(ctx, 'PATCHER', 'ok', `Generated ${edits.length} edit(s) across ${new Set(edits.map((e) => e.file)).size} file(s)${usedFallback ? ' (deterministic fallback)' : ''}`, { edits, fallback: usedFallback });
  await insertGetId('patches', {
    issue_id: ctx.issue.id,
    files_json: JSON.stringify(edits.map((e) => ({ path: e.file, search: e.search, replace: e.replace }))),
    unified_diff: applied.diff, summary: ctx.patchSummary, created_at: new Date().toISOString(),
  });
  await update('issues', ctx.issue.id, { summary: ctx.patchSummary });
  await setStatus(ctx, 'VALIDATING');
  return ctx;
}
