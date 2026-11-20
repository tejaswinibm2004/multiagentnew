import { strictJson } from '../ai/json.js';
import { PROMPTS } from '../ai/prompts.js';
import { scanDiff } from './safety.js';
import { step, setStatus } from './common.js';

export async function criticAndSafety(ctx) {
  const safety = scanDiff(ctx.unifiedDiff);
  ctx.safety = safety;
  await step(ctx, 'CRITIC', safety.hit ? 'blocked' : 'ok',
    safety.hit ? `Safety scanner hit: ${safety.findings.map((f) => f.name).join(', ')}` : 'Safety scanner clean',
    { safety });

  const res = await strictJson(PROMPTS.critic,
    `REPORT: ${ctx.title}\n${ctx.description}\n\nPATCH DIFF:\n${ctx.unifiedDiff}`,
    { maxTokens: 800, validate: (v) => ['approve', 'concern', 'reject'].includes(v.decision) });

  let decision, reason, fallback = false;
  if (res.ok) {
    decision = res.value.decision; reason = res.value.reason || '';
  } else {
    // Deterministic fallback: a minimal, safety-clean patch is provisionally approved.
    decision = safety.hit ? 'reject' : (ctx.changedLines <= 12 ? 'approve' : 'concern');
    reason = `Deterministic fallback (AI: ${res.reason || 'unavailable'}); minimal=${ctx.changedLines <= 12}, safety=${safety.hit ? 'hit' : 'clean'}`;
    fallback = true;
  }
  ctx.critic = { decision, reason, fallback };
  await step(ctx, 'CRITIC', 'ok', `Critic: ${decision}${fallback ? ' (fallback)' : ''} — ${reason}`, { critic: ctx.critic });

  if (safety.hit || decision === 'reject') {
    await setStatus(ctx, 'PATCH_FAILED', { admin_note: `Critic/safety blocked: ${reason}` });
    ctx.halted = true; return ctx;
  }
  return ctx;
}
