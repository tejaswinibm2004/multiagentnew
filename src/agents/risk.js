import { update } from '../db/db.js';
import { step, setStatus } from './common.js';

const SENSITIVE = /auth|login|logout|session|token|password|passwd|crypto|payment|billing|checkout|money|price|cart/i;
const MONEY = /money|price|checkout|billing|payment|cart/i;

export function scoreRisk({ defectType = '', file = '', confidence = 1, changedLines = 0, diff = '', sensitivePath = null, moneyIdentifiers = null }) {
  const factors = [{ name: 'base', delta: 25 }];
  let score = 25;
  if (defectType === 'security') { score += 25; factors.push({ name: 'security defect', delta: 25 }); }
  if (defectType === 'typo_copy') { score -= 5; factors.push({ name: 'typo/copy', delta: -5 }); }

  const sens = sensitivePath == null ? SENSITIVE.test(file) : sensitivePath;
  if (sens) {
    const delta = Math.min(35, /auth|login|session|token|password|crypto|payment|billing|checkout|money|price/i.test(file) ? 15 : 8);
    score += delta; factors.push({ name: 'sensitive path', delta });
  }
  const money = moneyIdentifiers == null ? (MONEY.test(file) || MONEY.test(diff)) : moneyIdentifiers;
  if (money) { score += 20; factors.push({ name: 'money identifiers in diff', delta: 20 }); }

  const size = Math.min(12, Math.floor(changedLines / 4));
  if (size) { score += size; factors.push({ name: 'diff size', delta: size }); }
  if (confidence < 0.5) { score += 6; factors.push({ name: 'low confidence', delta: 6 }); }

  score = Math.max(0, Math.min(100, score));
  return { score, band: score >= 70 ? 'CRITICAL' : score >= 40 ? 'MEDIUM' : 'LOW', critical: score >= 70, money, sensitive: sens, factors };
}

export async function riskAgent(ctx) {
  const lines = ctx.changedLines || 0;
  const r = scoreRisk({
    defectType: ctx.analysis.defect_type,
    file: ctx.analysis.file || ctx.chosen?.[0] || '',
    confidence: ctx.analysis.confidence,
    changedLines: lines,
    diff: ctx.unifiedDiff || '',
  });
  ctx.risk = r;
  await update('issues', ctx.issue.id, { risk_score: r.score, risk_band: r.band });
  await step(ctx, 'RISK', 'ok', `Risk ${r.score}/100 (${r.band})`, { ...r });
  await setStatus(ctx, 'PATCHING');
  return ctx;
}
