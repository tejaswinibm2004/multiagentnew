import { strictJson } from '../ai/json.js';
import { PROMPTS } from '../ai/prompts.js';
import { update } from '../db/db.js';
import { step, setStatus } from './common.js';

const TYPES = new Set(['typo_copy', 'layout_css', 'broken_asset', 'logic', 'runtime_error', 'security', 'accessibility', 'performance', 'config', 'data', 'api', 'auth', 'money_checkout', 'other']);

export function fallbackVerdict(ctx) {
  const text = `${ctx.title} ${ctx.description}`.toLowerCase();
  const quoted = (ctx.cases || []).filter((c) => c.key === 'quoted').map((c) => c.value.toLowerCase());
  let found = null;
  for (const q of quoted) {
    for (const s of ctx.snippets || []) {
      if (s.text.toLowerCase().includes(q)) { found = { path: s.path, q }; break; }
    }
    if (found) break;
  }
  const isDefect = Boolean(found) || /misspell|wrong text|not working|incorrect|does not|doesn't|broken (image|link|page|button)|runtime error/.test(text);
  const money = /price|checkout|billing|payment|money|\$|€/.test(text);
  return {
    is_defect: isDefect,
    confidence: isDefect ? 0.78 : 0.35,
    defect_type: money ? 'money_checkout' : (isDefect ? 'typo_copy' : 'other'),
    file: found?.path || ctx.chosen?.[0] || '',
    lines: '',
    explanation: isDefect
      ? (found ? `Reported text "${found.q}" appears in ${found.path}.` : 'Report describes a concrete defect in the reported area.')
      : 'Insufficient evidence that this is a real code defect.',
    impact: isDefect ? 'User-visible correctness/UX issue.' : 'None established.',
    __fallback: true,
  };
}

export async function analyzer(ctx) {
  const source = ctx.snippets.map((s) => `FILE ${s.path}\n${s.text}`).join('\n\n').slice(0, 26000);
  const res = await strictJson(PROMPTS.analyzer,
    `REPORT TITLE: ${ctx.title}\nREPORT BODY: ${ctx.description}\nPAGE: ${ctx.pagePath}\n\nSOURCE WINDOWS:\n${source}`,
    { maxTokens: 2000, validate: (v) => typeof v.is_defect === 'boolean' && typeof v.confidence === 'number' });

  let a;
  if (res.ok && TYPES.has(res.value.defect_type)) {
    a = { ...res.value, __fallback: false };
    await step(ctx, 'ANALYZER', 'ok', `AI verdict: is_defect=${a.is_defect}, confidence=${a.confidence}`, { analyzer: a, ai: true });
  } else {
    a = fallbackVerdict(ctx);
    await step(ctx, 'ANALYZER', a.is_defect ? 'ok' : 'blocked',
      `Deterministic fallback verdict (AI: ${res.reason || 'unavailable'}): is_defect=${a.is_defect}`,
      { analyzer: a, ai: false, fallback: true, aiReason: res.reason });
  }
  ctx.analysis = a;
  await update('issues', ctx.issue.id, {
    analyzer_json: JSON.stringify(a),
    defect_type: a.defect_type,
    summary: a.explanation?.slice(0, 500) || ctx.title,
  });

  if (!a.is_defect || a.confidence < 0.5) {
    await setStatus(ctx, 'INVALID_REPORT', { admin_note: a.explanation || 'Not a defect' });
    await step(ctx, 'ANALYZER', 'blocked', `Rejected: ${a.explanation}`, {});
    ctx.halted = true;
  }
  return ctx;
}
