import test from 'node:test';
import assert from 'node:assert/strict';
import { extractCases } from '../src/agents/intake.js';
import { scorePath } from '../src/agents/localizer.js';
import { fallbackVerdict } from '../src/agents/analyzer.js';
import { extractSha } from '../src/agents/verifier.js';
import { applyEdits } from '../src/agents/patcher.js';
import { summarize, validateFile } from '../src/validators/index.js';
import { normalizeStoredEdits } from '../src/agents/orchestrator.js';
import { runCommand } from '../src/validators/base.js';

test('intake: extracts quoted strings, selectors and stack files', () => {
  const c = extractCases({ description: 'The "Shoping Cart" text near #cartHeader at app.js:42 is wrong.' });
  assert.ok(c.some((x) => x.key === 'quoted' && x.value === 'Shoping Cart'));
  assert.ok(c.some((x) => x.key === 'selector'));
  assert.ok(c.some((x) => x.key === 'stack_file' && x.value === 'app.js:42'));
});

test('localizer: stack-trace file ranks above unrelated files', () => {
  const cases = [{ key: 'stack_file', value: 'app.js:42' }];
  assert.ok(scorePath('src/app.js', cases) > scorePath('README.md', cases));
});

test('analyzer: deterministic fallback detects a known typo with evidence', () => {
  const v = fallbackVerdict({
    title: 'Shoping Cart typo', description: 'The "Shoping Cart" label is misspelled.',
    cases: [{ key: 'quoted', value: 'Shoping Cart' }],
    snippets: [{ path: 'index.html', text: '<span>Shoping Cart</span>' }],
    chosen: ['index.html'],
  });
  assert.equal(v.is_defect, true);
  assert.equal(v.defect_type, 'typo_copy');
  assert.equal(v.__fallback, true);
});

test('analyzer: vague report is not a defect', () => {
  const v = fallbackVerdict({ title: 'Broken', description: 'Nothing specific', cases: [], snippets: [], chosen: [] });
  assert.equal(v.is_defect, false);
});

test('orchestrator: legacy stored edits using `path` are normalized for applyEdits', () => {
  const edits = normalizeStoredEdits([{ path: 'index.html', search: 'Shoping Cart', replace: 'Shopping Cart' }]);
  assert.equal(edits[0].file, 'index.html');
  const files = { 'index.html': '<span>Shoping Cart</span>' };
  assert.ok(applyEdits(edits, files).files['index.html'].includes('Shopping Cart'));
});

test('verifier: extractSha handles all version.json shapes', () => {
  assert.equal(extractSha({ commit: 'abc' }), 'abc');
  assert.equal(extractSha({ sha: 'def' }), 'def');
  assert.equal(extractSha({ RENDER_GIT_COMMIT: 'ghi' }), 'ghi');
  assert.equal(extractSha(null), '');
});

test('validators: js syntax error is failed', () => {
  const r = validateFile('x.mjs', 'const = ;');
  assert.equal(r.status, 'failed');
});

test('validators: missing runtime is NOT_PERFORMED, never green', () => {
  const r = runCommand('bugshield-nonexistent-binary-xyz', []);
  assert.equal(r.status, 'NOT_PERFORMED');
  assert.equal(summarize([r]).clean, false);
});

test('validators: json parses', () => {
  assert.equal(validateFile('x.json', '{"a":1}').status, 'ok');
  assert.equal(validateFile('x.json', '{').status, 'failed');
});
