import { getFile } from '../github/repoReader.js';
import { commitFiles } from '../github/committer.js';
import { withSiteLock } from '../queue/locks.js';
import { insertGetId, update } from '../db/db.js';
import { step, setStatus, audit } from './common.js';
import { nowIso } from '../util.js';

export function approvalReasons(ctx) {
  const reasons = [];
  if (ctx.risk.critical) reasons.push(`risk ${ctx.risk.score} >= 70`);
  if (ctx.risk.sensitive) reasons.push('security-sensitive path');
  if (ctx.risk.money) reasons.push('money/checkout identifiers in diff');
  if (ctx.website.always_approve) reasons.push('site set to always approve');
  if (!ctx.website.auto_deploy) reasons.push('auto-deploy disabled for site');
  if (ctx.safety?.hit) reasons.push('safety scanner hit');
  if (ctx.critic?.decision === 'concern') reasons.push('critic concern');
  if (ctx.validation && !ctx.validation.clean) reasons.push('validation not clean');
  if ((ctx.changedLines || 0) > 40) reasons.push('oversized diff');
  return reasons;
}

export async function deployer(ctx) {
  if (!ctx.approved) {
    const reasons = approvalReasons(ctx);
    if (reasons.length) {
      await setStatus(ctx, 'AWAITING_APPROVAL');
      await step(ctx, 'DEPLOYER', 'blocked', `Human gate: ${reasons.join('; ')}`, { reasons });
      await audit('system', 'approval_requested', ctx.issue.issue_key, { reasons });
      ctx.halted = true; return ctx;
    }
  }

  await setStatus(ctx, 'PUSHING');
  const repo = ctx.website.repo_full_name;
  const branch = ctx.website.branch || 'main';
  const commitMessage = `fix(bugshield): ${ctx.patchSummary || ctx.title} [${ctx.issue.issue_key}]\n\nrisk=${ctx.risk.score}/${ctx.risk.band}\nvalidators=${ctx.validation?.clean ? 'clean' : 'not-clean'}\napprover=${ctx.issue.approver || 'auto'}`;

  return withSiteLock(ctx.website.id, async () => {
    // Drift re-check: files we read must still match the remote before we commit.
    for (const [path, original] of Object.entries(ctx.originalFiles || ctx.files || {})) {
      const current = await getFile(repo, path, branch);
      if (!current.ok) {
        await step(ctx, 'DEPLOYER', 'blocked', `Drift check could not read ${path}`, { reason: current.reason });
        await setStatus(ctx, 'FAILED', { admin_note: 'Drift check failed' });
        ctx.halted = true; return ctx;
      }
      if (current.content !== original) {
        await step(ctx, 'DEPLOYER', 'blocked', `Drift detected in ${path}; refusing to overwrite`, { path });
        await setStatus(ctx, 'FAILED', { admin_note: 'Remote drift detected' });
        ctx.halted = true; return ctx;
      }
    }

    const files = Object.entries(ctx.editedFiles).map(([path, content]) => ({ path, content }));
    const committed = await commitFiles({ repo, branch, files, message: commitMessage });
    if (!committed.ok) {
      await step(ctx, 'DEPLOYER', 'failed', `Commit failed: ${committed.reason} ${committed.detail || ''}`, { committed });
      await setStatus(ctx, 'FAILED', { admin_note: `${committed.reason}: ${committed.detail || ''}` });
      ctx.halted = true; return ctx;
    }

    ctx.deploySha = committed.sha;
    const depId = await insertGetId('deployments', {
      issue_id: ctx.issue.id, website_id: ctx.website.id, sha: committed.sha,
      status: 'DEPLOYING', commit_url: committed.html_url, created_at: nowIso(),
    });
    ctx.deploymentId = depId;
    await step(ctx, 'DEPLOYER', 'ok', `Committed ${committed.sha.slice(0, 8)} atomically`, { sha: committed.sha, commit_url: committed.html_url });
    await update('issues', ctx.issue.id, { deploy_sha: committed.sha });
    await audit(ctx.issue.approver || 'bot', 'commit_pushed', ctx.issue.issue_key, { sha: committed.sha });
    await setStatus(ctx, 'DEPLOYING');
    return ctx;
  });
}
