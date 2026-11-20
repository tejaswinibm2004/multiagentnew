import { get, query, update, insertGetId } from '../db/db.js';
import { nowIso, parseJson } from '../util.js';
import { getFile } from '../github/repoReader.js';
import { applyEdits } from './patcher.js';
import { intake } from './intake.js';
import { localizer } from './localizer.js';
import { analyzer } from './analyzer.js';
import { scoreRisk, riskAgent } from './risk.js';
import { patcher } from './patcher.js';
import { criticAndSafety } from './critic.js';
import { validatorAgent } from './validator.js';
import { deployer } from './deployer.js';
import { verifier } from './verifier.js';
import { step, setStatus, audit } from './common.js';
import { revertCommit } from '../github/committer.js';

// Older patch rows stored the key as `path`; the applier expects `file`.
export function normalizeStoredEdits(edits = []) {
  return edits.map((e) => ({ ...e, file: e.file || e.path }));
}

export async function loadCtx(issueId, broadcast) {
  const issue = await get('SELECT * FROM issues WHERE id = ?', [issueId]);
  if (!issue) throw new Error('issue not found');
  const website = await get('SELECT * FROM websites WHERE id = ?', [issue.website_id]);
  const report = parseJson(issue.payload, {});
  const cases = (await query('SELECT key, value FROM issue_cases WHERE issue_id = ?', [issueId])).map((c) => ({ key: c.key, value: c.value }));
  return {
    issue, website, report, cases,
    files: {}, originalFiles: {}, snippets: [], chosen: [],
    broadcast,
  };
}

async function rebuildPatch(ctx) {
  const patch = await get('SELECT * FROM patches WHERE issue_id = ? ORDER BY id DESC LIMIT 1', [ctx.issue.id]);
  if (!patch) throw new Error('no patch stored');
  const edits = normalizeStoredEdits(parseJson(patch.files_json, []));
  const files = {};
  for (const e of edits) {
    if (files[e.path] != null) continue;
    const f = await getFile(ctx.website.repo_full_name, e.path, ctx.website.branch || 'main');
    if (!f.ok) throw new Error(`cannot re-read ${e.path}: ${f.reason}`);
    files[e.path] = f.content;
  }
  const applied = applyEdits(edits, files);
  ctx.files = files;
  ctx.originalFiles = { ...files };
  ctx.editedFiles = applied.files;
  ctx.unifiedDiff = patch.unified_diff || applied.diff;
  ctx.edits = edits;
  ctx.patchSummary = patch.summary;
  ctx.analysis = parseJson(issueJson(ctx.issue), {});
  ctx.changedLines = ctx.unifiedDiff.split('\n').filter((l) => (l.startsWith('+') && !l.startsWith('+++')) || (l.startsWith('-') && !l.startsWith('---'))).length;
  ctx.risk = scoreRisk({ defectType: ctx.analysis.defect_type || '', file: ctx.analysis.file || '', confidence: ctx.analysis.confidence ?? 1, changedLines: ctx.changedLines, diff: ctx.unifiedDiff });
  ctx.safety = { hit: false, findings: [] };
  ctx.critic = { decision: 'approve', reason: 'previously reviewed' };
  ctx.validation = { clean: true, results: [], total: 0, notPerformed: 0, failed: 0 };
  return ctx;
}
const issueJson = (issue) => issue.analyzer_json || '{}';

export async function runPipeline(issueId, broadcast) {
  const ctx = await loadCtx(issueId, broadcast);
  await step(ctx, 'PIPELINE', 'info', 'Pipeline started', {});
  // Risk is computed before patch size is known, then re-scored after patching.
  await intake(ctx);
  if (ctx.halted) return finalize(ctx);
  await localizer(ctx);
  if (ctx.halted) return finalize(ctx);
  await analyzer(ctx);
  if (ctx.halted) return finalize(ctx);
  await riskAgent(ctx);
  if (ctx.halted) return finalize(ctx);
  await patcher(ctx);
  if (ctx.halted) return finalize(ctx);
  // Re-score with actual diff size (size factor).
  ctx.risk = scoreRisk({
    defectType: ctx.analysis.defect_type, file: ctx.analysis.file || ctx.chosen?.[0] || '',
    confidence: ctx.analysis.confidence, changedLines: ctx.changedLines, diff: ctx.unifiedDiff,
  });
  await update('issues', issueId, { risk_score: ctx.risk.score, risk_band: ctx.risk.band });
  await criticAndSafety(ctx);
  if (ctx.halted) return finalize(ctx);
  await validatorAgent(ctx);
  if (ctx.halted) return finalize(ctx);
  await deployer(ctx);
  if (ctx.halted) return finalize(ctx);
  await verifier(ctx);
  return finalize(ctx);
}

function finalize(ctx) {
  return { status: ctx.issue.status, halted: Boolean(ctx.halted), issueId: ctx.issue.id };
}

export async function approveIssue(issueId, user, reason, broadcast) {
  await insertGetId('approvals', { issue_id: issueId, decision: 'approve', approver: user?.email || 'unknown', reason: reason || '', created_at: nowIso() });
  const ctx = await loadCtx(issueId, broadcast);
  await rebuildPatch(ctx);
  ctx.approved = true;
  ctx.issue.approver = user?.email || 'unknown';
  await update('issues', issueId, { approver: ctx.issue.approver });
  await setStatus(ctx, 'APPROVED');
  await audit(user?.email || 'unknown', 'approved', ctx.issue.issue_key, { reason });
  // Recheck criticality after approval; approved means explicit human consent.
  await deployer(ctx);
  if (ctx.halted) return finalize(ctx);
  await verifier(ctx);
  return finalize(ctx);
}

export async function rejectIssue(issueId, user, reason, broadcast) {
  const ctx = await loadCtx(issueId, broadcast);
  await insertGetId('approvals', { issue_id: issueId, decision: 'reject', approver: user?.email || 'unknown', reason: reason || '', created_at: nowIso() });
  await setStatus(ctx, 'REJECTED_BY_ADMIN', { admin_note: reason || 'Rejected by reviewer' });
  await audit(user?.email || 'unknown', 'rejected', ctx.issue.issue_key, { reason });
  return finalize(ctx);
}

export async function retryIssue(issueId, broadcast) {
  const ctx = await loadCtx(issueId, broadcast);
  await setStatus(ctx, 'RECEIVED', { admin_note: '' });
  await audit('system', 'retry', ctx.issue.issue_key, {});
  return runPipeline(issueId, broadcast);
}

export async function revertIssue(issueId, user, broadcast) {
  const ctx = await loadCtx(issueId, broadcast);
  const sha = ctx.issue.deploy_sha;
  if (!sha) throw new Error('no deployed SHA to revert');
  const reverted = await revertCommit({
    repo: ctx.website.repo_full_name, branch: ctx.website.branch || 'main',
    targetSha: sha, message: `manual revert [${ctx.issue.issue_key}]`,
  });
  if (!reverted.ok) throw new Error(`revert failed: ${reverted.reason}`);
  await query('UPDATE deployments SET status = ?, reverted_by = ? WHERE issue_id = ? AND sha = ?', ['ROLLED_BACK', reverted.sha, issueId, sha]);
  await setStatus(ctx, 'ROLLED_BACK', { admin_note: `Reverted by ${user?.email || 'unknown'} in ${reverted.sha}` });
  await step(ctx, 'VERIFIER', 'ok', `Reverted in ${reverted.sha.slice(0, 8)}`, { sha: reverted.sha });
  await audit(user?.email || 'unknown', 'manual_revert', ctx.issue.issue_key, { sha: reverted.sha });
  return finalize(ctx);
}

export async function jobHandler(job, broadcast) {
  if (job.kind === 'pipeline') return runPipeline(job.issue_id, broadcast);
  return { skipped: true };
}
