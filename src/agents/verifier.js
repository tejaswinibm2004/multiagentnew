import { revertCommit } from '../github/committer.js';
import { update } from '../db/db.js';
import { step, setStatus, audit } from './common.js';
import { nowIso } from '../util.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function extractSha(data) {
  if (!data || typeof data !== 'object') return '';
  return String(data.commit || data.sha || data.gitCommit || data.RENDER_GIT_COMMIT || data.version || '');
}

async function probe(url) {
  if (!url) return true;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

export async function verifier(ctx) {
  const attempts = ctx.verifyAttempts ?? 3;
  const interval = ctx.verifyIntervalMs ?? 10_000;
  const url = ctx.website.version_json_url;
  let checked = '';

  for (let i = 0; i < Math.max(1, attempts); i++) {
    if (i > 0) await sleep(interval);
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (r.ok) checked = extractSha(await r.json());
    } catch { /* keep checking */ }
    if (checked && checked === ctx.deploySha) break;
  }

  await step(ctx, 'VERIFIER', 'info', `version.json reports ${checked || 'no SHA'} (expected ${ctx.deploySha?.slice(0, 8)})`, { checked, expected: ctx.deploySha });

  if (checked !== ctx.deploySha) {
    if (ctx.deploymentId) await update('deployments', ctx.deploymentId, { status: 'UNVERIFIED', checked_sha: checked, verified_at: nowIso() });
    await setStatus(ctx, 'DEPLOY_TIMEOUT', { admin_note: 'Deploy marker not observed in time; UNVERIFIED' });
    return ctx;
  }

  const healthUrls = (() => { try { return JSON.parse(ctx.website.health_urls || '[]'); } catch { return []; } })();
  const list = healthUrls.length ? healthUrls : [ctx.website.live_url].filter(Boolean);
  const results = [];
  for (const u of list) results.push({ url: u, ok: await probe(u) });
  const healthy = results.every((r) => r.ok);

  if (!healthy) {
    const reverted = await revertCommit({
      repo: ctx.website.repo_full_name, branch: ctx.website.branch || 'main',
      targetSha: ctx.deploySha, message: `post-deploy health failed [${ctx.issue.issue_key}]`,
    });
    if (ctx.deploymentId) await update('deployments', ctx.deploymentId, { status: 'ROLLED_BACK', checked_sha: checked, reverted_by: reverted.sha || 'attempted', verified_at: nowIso() });
    await step(ctx, 'VERIFIER', 'failed', 'Post-deploy health failed; revert attempted', { results, reverted });
    await setStatus(ctx, reverted.ok ? 'ROLLED_BACK' : 'FAILED', { admin_note: 'Post-deploy health check failed' });
    await audit('system', 'auto_revert', ctx.issue.issue_key, { results, reverted });
    return ctx;
  }

  if (ctx.deploymentId) await update('deployments', ctx.deploymentId, { status: 'VERIFIED', checked_sha: checked, verified_at: nowIso() });
  await step(ctx, 'VERIFIER', 'ok', 'SHA observed in version.json; health probes passed', { checked, results });
  await setStatus(ctx, 'RESOLVED_AND_DEPLOYED', { deploy_sha: ctx.deploySha, resolved_at: nowIso() });
  await audit('bot', 'resolved', ctx.issue.issue_key, { sha: ctx.deploySha });
  return ctx;
}
