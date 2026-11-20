import { insertGetId } from '../db/db.js';
import { validateFile, summarize } from '../validators/index.js';
import { step, setStatus } from './common.js';
import { nowIso } from '../util.js';

export async function validatorAgent(ctx) {
  await setStatus(ctx, 'VALIDATING');
  const results = [];
  for (const [path, content] of Object.entries(ctx.editedFiles)) {
    const r = validateFile(path, content);
    results.push({ path, ...r });
  }
  const summary = summarize(results);
  ctx.validation = { ...summary, results };
  await insertGetId('validation_runs', {
    issue_id: ctx.issue.id, results_json: JSON.stringify(results),
    clean: summary.clean ? 1 : 0, created_at: nowIso(),
  });
  await step(ctx, 'VALIDATOR', summary.clean ? 'ok' : (summary.failed ? 'failed' : 'skipped'),
    `Validation: ${results.filter((r) => r.status === 'ok').length}/${results.length} clean, ${summary.notPerformed} not performed, ${summary.failed} failed`,
    { summary, results });
  if (!summary.clean) {
    await setStatus(ctx, 'VALIDATION_FAILED', {
      admin_note: `Validation not clean: ${summary.failed} failed, ${summary.notPerformed} not performed`,
    });
    ctx.halted = true; return ctx;
  }
  return ctx;
}
