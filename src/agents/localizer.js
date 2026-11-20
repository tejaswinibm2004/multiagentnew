import { getRepoMap, getFile, windows } from '../github/repoReader.js';
import { strictJson } from '../ai/json.js';
import { PROMPTS } from '../ai/prompts.js';
import { step, setStatus } from './common.js';

export function scorePath(path, cases) {
  const p = path.toLowerCase();
  let score = 0;
  for (const c of cases) {
    const v = String(c.value).toLowerCase();
    if (c.key === 'stack_file' && p.endsWith(v.split(':')[0].toLowerCase())) score += 40;
    if (/typo|quoted|identifier/i.test(c.key) && v.length > 2 && p.includes(v.split('.')[0])) score += 8;
    if (/selector/i.test(c.key) && v.length > 2 && p.includes(v.replace(/^[.#]/, ''))) score += 6;
  }
  if (/\.(jsx?|tsx?|html|css|py|php|rb|go)$/.test(p)) score += 1;
  return score;
}

export async function localizer(ctx) {
  await setStatus(ctx, 'TRIAGING');
  let filePaths = Object.keys(ctx.files || {});
  if (!filePaths.length && ctx.website.repo_full_name) {
    const map = await getRepoMap(ctx.website.repo_full_name, ctx.website.branch || 'main');
    if (!map.ok) {
      await step(ctx, 'LOCALIZER', 'blocked', 'Source repository unavailable', { reason: map.reason });
      await setStatus(ctx, 'SOURCE_UNAVAILABLE');
      ctx.halted = true; return ctx;
    }
    ctx.repoMap = map.files;
    filePaths = map.files;
  }

  const ranked = filePaths
    .map((p) => ({ path: p, score: scorePath(p, ctx.cases || []) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  let chosen = ranked.slice(0, 5).map((r) => r.path);
  const ai = await strictJson(PROMPTS.localizer,
    `REPORT:\n${ctx.title}\n${ctx.description}\n\nRANKED CANDIDATES:\n${ranked.map((r) => r.path).join('\n')}`,
    { validate: (v) => Array.isArray(v.files) });
  if (ai.ok) {
    const valid = new Set(ranked.map((r) => r.path));
    const files = ai.value.files.filter((f) => valid.has(f)).slice(0, 5);
    if (files.length) chosen = files;
    await step(ctx, 'LOCALIZER', 'ok', ai.value.reason || `AI selected ${chosen.length} files`, { chosen, ranked, ai: true });
  } else {
    await step(ctx, 'LOCALIZER', 'ok', `Deterministic ranking selected ${chosen.length} files (AI: ${ai.reason})`, { chosen, ranked, ai: false });
  }

  const snippets = [];
  for (const path of chosen) {
    let content = ctx.files?.[path];
    if (content == null && ctx.website.repo_full_name) {
      const f = await getFile(ctx.website.repo_full_name, path, ctx.website.branch || 'main');
      if (f.ok) content = f.content;
    }
    if (content != null) {
      ctx.files = ctx.files || {};
      ctx.files[path] = content;
      const line = (ctx.cases || []).find((c) => c.key === 'stack_file')?.value?.split(':')[1];
      snippets.push({ path, text: windows(content, Number(line) || 0, 80) });
    }
  }
  if (!snippets.length) {
    await step(ctx, 'LOCALIZER', 'blocked', 'No file content could be read', {});
    await setStatus(ctx, 'SOURCE_UNAVAILABLE');
    ctx.halted = true; return ctx;
  }
  ctx.snippets = snippets;
  ctx.chosen = chosen;
  await setStatus(ctx, 'ANALYZING');
  return ctx;
}
